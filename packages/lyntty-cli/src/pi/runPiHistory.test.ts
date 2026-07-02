import { describe, expect, it } from 'vitest';

import { mapPiSessionHistoryPageToEnvelopes, mapPiSessionHistoryToEnvelopes } from './runPiHistory';

describe('mapPiSessionHistoryToEnvelopes', () => {
  it('imports Pi user and assistant JSONL messages as session protocol content', () => {
    const envelopes = mapPiSessionHistoryToEnvelopes([
      {
        type: 'message',
        id: 'u1',
        parentId: null,
        timestamp: '2026-07-01T09:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'calculate 1+1' }] },
      },
      {
        type: 'message',
        id: 'a1',
        parentId: 'u1',
        timestamp: '2026-07-01T09:00:01.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: '2' }] },
      },
    ] as any);

    expect(envelopes.map((envelope) => [envelope.role, envelope.ev.t])).toEqual([
      ['user', 'text'],
      ['agent', 'turn-start'],
      ['agent', 'text'],
      ['agent', 'turn-end'],
    ]);
    expect(envelopes[0]).toMatchObject({ role: 'user', ev: { t: 'text', text: 'calculate 1+1' } });
    expect(envelopes[2]).toMatchObject({ role: 'agent', ev: { t: 'text', text: '2' } });
  });

  it('imports thinking and tool calls with the same visible session-protocol shapes as live Pi events', () => {
    const envelopes = mapPiSessionHistoryToEnvelopes([
      {
        type: 'message',
        id: 'a1',
        parentId: 'u1',
        timestamp: '2026-07-01T09:00:01.000Z',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'Need inspect files' },
            { type: 'toolCall', id: 'call-1', name: 'find', arguments: { pattern: '*.ts' } },
            { type: 'text', text: 'Found files' },
          ],
        },
      },
      {
        type: 'message',
        id: 't1',
        parentId: 'a1',
        timestamp: '2026-07-01T09:00:02.000Z',
        message: {
          role: 'toolResult',
          toolCallId: 'call-1',
          toolName: 'find',
          content: [{ type: 'text', text: 'a.ts' }],
          isError: false,
        },
      },
    ] as any);

    expect(envelopes.map((envelope) => envelope.ev.t)).toEqual([
      'turn-start',
      'text',
      'tool-call-start',
      'text',
      'text',
      'tool-call-end',
      'turn-end',
    ]);
    expect(envelopes[1]).toMatchObject({ role: 'agent', ev: { t: 'text', text: 'Need inspect files', thinking: true } });
    expect(envelopes[2]).toMatchObject({ role: 'agent', ev: { t: 'tool-call-start', call: 'call-1', name: 'find', args: { pattern: '*.ts' } } });
    expect(envelopes[5]).toMatchObject({ role: 'agent', ev: { t: 'tool-call-end', call: 'call-1' } });
    expect(envelopes[2].turn).toBe(envelopes[5].turn);
    expect(envelopes.filter((envelope) => envelope.ev.t === 'tool-call-start')).toHaveLength(1);
  });

  it('keeps one shared turn open until all historical tool results arrive', () => {
    const envelopes = mapPiSessionHistoryToEnvelopes([
      {
        type: 'message',
        id: 'a1',
        parentId: 'u1',
        timestamp: '2026-07-01T09:00:01.000Z',
        message: {
          role: 'assistant',
          content: [
            { type: 'toolCall', id: 'call-1', name: 'read', arguments: { path: 'a.ts' } },
            { type: 'toolCall', id: 'call-2', name: 'grep', arguments: { pattern: 'foo' } },
          ],
        },
      },
      {
        type: 'message',
        id: 't1',
        parentId: 'a1',
        timestamp: '2026-07-01T09:00:02.000Z',
        message: { role: 'toolResult', toolCallId: 'call-1', toolName: 'read', content: 'read output' },
      },
      {
        type: 'message',
        id: 't2',
        parentId: 'a1',
        timestamp: '2026-07-01T09:00:03.000Z',
        message: { role: 'toolResult', toolCallId: 'call-2', toolName: 'grep', content: 'grep output' },
      },
    ] as any);

    const events = envelopes.map((envelope) => envelope.ev.t);
    expect(events).toEqual([
      'turn-start',
      'tool-call-start',
      'tool-call-start',
      'text',
      'tool-call-end',
      'text',
      'tool-call-end',
      'turn-end',
    ]);
    expect(envelopes.filter((envelope) => envelope.ev.t === 'turn-end')).toHaveLength(1);
    const turnIds = new Set(envelopes.map((envelope) => envelope.turn).filter(Boolean));
    expect(turnIds.size).toBe(1);
  });

  it('caps oversized single-entry history pages', () => {
    const page = mapPiSessionHistoryPageToEnvelopes([
      {
        type: 'message',
        id: 'a1',
        parentId: 'u1',
        timestamp: '2026-07-01T09:00:01.000Z',
        message: {
          role: 'assistant',
          content: Array.from({ length: 80 }, (_, index) => ({
            type: 'text',
            text: `chunk ${index} ${'x'.repeat(20_000)}`,
          })),
        },
      },
    ] as any, { limit: 1, maxBytes: 16_000 });

    expect(Buffer.byteLength(JSON.stringify(page.envelopes), 'utf8')).toBeLessThanOrEqual(16_000);
    expect(page.envelopes.some((envelope) => (
      envelope.ev.t === 'text' && envelope.ev.text.includes('truncated')
    ))).toBe(true);
  });

  it('paginates historical Pi messages from the tail with an older cursor', () => {
    const entries = Array.from({ length: 5 }, (_, index) => ({
      type: 'message',
      id: `u${index + 1}`,
      parentId: index === 0 ? null : `u${index}`,
      timestamp: `2026-07-01T09:00:0${index}.000Z`,
      message: { role: 'user', content: [{ type: 'text', text: `message ${index + 1}` }] },
    })) as any;

    const tail = mapPiSessionHistoryPageToEnvelopes(entries, { limit: 2 });
    expect(tail.hasMore).toBe(true);
    expect(tail.nextCursor).toBe('u4');
    expect(tail.totalMessages).toBe(5);
    expect(tail.envelopes.map((envelope) => envelope.ev.t === 'text' ? envelope.ev.text : '')).toEqual(['message 4', 'message 5']);

    const older = mapPiSessionHistoryPageToEnvelopes(entries, { beforeEntryId: tail.nextCursor, limit: 2 });
    expect(older.hasMore).toBe(true);
    expect(older.nextCursor).toBe('u2');
    expect(older.envelopes.map((envelope) => envelope.ev.t === 'text' ? envelope.ev.text : '')).toEqual(['message 2', 'message 3']);
  });
});
