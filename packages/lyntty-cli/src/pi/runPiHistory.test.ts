import { describe, expect, it } from 'bun:test';

import {
  analyzePiHistoryEnvelopeGroups,
  mapPiSessionHistoryPageToEnvelopes,
  mapPiSessionHistoryToEnvelopeGroups,
  mapPiSessionHistoryToEnvelopes,
  partitionPiHistoryEnvelopes,
} from './runPiHistory';
import { PiSessionProtocolMapper } from './runPiSessionProtocol';

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

    const live = new PiSessionProtocolMapper();
    const liveEnvelopes = [
      ...live.mapEvent({ type: 'agent_start' } as any),
      ...live.mapEvent({ type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: 'Need inspect files' } } as any),
      ...live.mapEvent({ type: 'tool_execution_start', toolCallId: 'call-1', toolName: 'find', args: { pattern: '*.ts' } } as any),
      ...live.mapEvent({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Found files' } } as any),
      ...live.mapEvent({ type: 'tool_execution_end', toolCallId: 'call-1', toolName: 'find', result: 'a.ts', isError: false } as any),
      ...live.mapEvent({ type: 'agent_end' } as any),
    ];

    const visibleShape = (items: typeof envelopes) => items.map((envelope) => ({
      event: envelope.ev.t,
      thinking: envelope.ev.t === 'text' ? envelope.ev.thinking === true : undefined,
      name: envelope.ev.t === 'tool-call-start' ? envelope.ev.name : undefined,
      hasResult: envelope.ev.t === 'tool-call-end' ? envelope.ev.result !== undefined : undefined,
    }));

    expect(visibleShape(envelopes)).toEqual(visibleShape(liveEnvelopes));
    expect(envelopes.map((envelope) => envelope.ev.t)).toEqual([
      'turn-start',
      'text',
      'tool-call-start',
      'text',
      'tool-call-end',
      'turn-end',
    ]);
    expect(envelopes[1]).toMatchObject({ role: 'agent', ev: { t: 'text', text: 'Need inspect files', thinking: true } });
    expect(envelopes[2]).toMatchObject({ role: 'agent', ev: { t: 'tool-call-start', call: 'call-1', name: 'find', args: { pattern: '*.ts' } } });
    expect(envelopes[4]).toMatchObject({ role: 'agent', ev: { t: 'tool-call-end', call: 'call-1', result: 'a.ts' } });
    expect(envelopes[2].turn).toBe(envelopes[4].turn);
    expect(envelopes.filter((envelope) => envelope.ev.t === 'tool-call-start')).toHaveLength(1);
    expect(envelopes).not.toContainEqual(expect.objectContaining({
      ev: expect.objectContaining({ t: 'text', text: 'a.ts' }),
    }));
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
      'tool-call-end',
      'tool-call-end',
      'turn-end',
    ]);
    expect(envelopes).not.toContainEqual(expect.objectContaining({
      ev: expect.objectContaining({ t: 'text', text: expect.stringContaining('output') }),
    }));
    expect(envelopes.filter((envelope) => envelope.ev.t === 'tool-call-end').map((envelope) => (
      envelope.ev.t === 'tool-call-end' ? envelope.ev.result : undefined
    ))).toEqual(['read output', 'grep output']);
    expect(envelopes.filter((envelope) => envelope.ev.t === 'turn-end')).toHaveLength(1);
    const turnIds = new Set(envelopes.map((envelope) => envelope.turn).filter(Boolean));
    expect(turnIds.size).toBe(1);
  });

  it('keeps paged envelope content identical to the canonical full-history mapping', () => {
    const entries = [{
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
    }] as any[];
    const canonicalById = new Map(
      mapPiSessionHistoryToEnvelopes(entries).map((envelope) => [envelope.id, envelope]),
    );

    const page = mapPiSessionHistoryPageToEnvelopes(entries, { limit: 1, maxBytes: 256_000 });

    expect(page.envelopes.every((envelope) => (
      JSON.stringify(envelope) === JSON.stringify(canonicalById.get(envelope.id))
    ))).toBe(true);
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
    ] as any, { limit: 1, maxBytes: 256_000 });

    expect(Buffer.byteLength(JSON.stringify(page.envelopes), 'utf8')).toBeLessThanOrEqual(256_000);
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

  it('reports history_gap instead of replaying the tail for an unknown cursor', () => {
    const entries = [
      { type: 'message', id: 'u1', parentId: null, timestamp: '2026-07-01T09:00:00.000Z', message: { role: 'user', content: 'one' } },
      { type: 'message', id: 'u2', parentId: 'u1', timestamp: '2026-07-01T09:00:01.000Z', message: { role: 'user', content: 'two' } },
    ] as any[];

    const page = mapPiSessionHistoryPageToEnvelopes(entries, { beforeEntryId: 'missing-entry', limit: 1 });

    expect(page.historyGap).toEqual({
      code: 'history_gap',
      missingCursor: 'missing-entry',
      reason: 'requested Pi history cursor is not present in local JSONL',
    });
    expect(page.envelopes).toEqual([]);
    expect(page.hasMore).toBe(false);
  });

  it('partitions canonical replay into missing, matching, and conflicting envelopes', () => {
    const envelopes = mapPiSessionHistoryToEnvelopes([
      { type: 'message', id: 'u1', parentId: null, timestamp: '2026-07-01T09:00:00.000Z', message: { role: 'user', content: 'missing' } },
      { type: 'message', id: 'u2', parentId: 'u1', timestamp: '2026-07-01T09:00:01.000Z', message: { role: 'user', content: 'matching' } },
      { type: 'message', id: 'u3', parentId: 'u2', timestamp: '2026-07-01T09:00:02.000Z', message: { role: 'user', content: 'conflict' } },
    ] as any[]);
    const statuses = new Map([
      [envelopes[0].id, 'missing'],
      [envelopes[1].id, 'matching'],
      [envelopes[2].id, 'conflict'],
    ] as const);

    const result = partitionPiHistoryEnvelopes(envelopes, (envelope) => statuses.get(envelope.id) ?? 'missing');

    expect(result.missing.map((envelope) => envelope.id)).toEqual([envelopes[0].id]);
    expect(result.matching.map((envelope) => envelope.id)).toEqual([envelopes[1].id]);
    expect(result.conflicting.map((envelope) => envelope.id)).toEqual([envelopes[2].id]);
  });

  it('sends missing entries after a conflict but advances only through the matching prefix', () => {
    const groups = mapPiSessionHistoryToEnvelopeGroups([
      { type: 'message', id: 'u1', parentId: null, timestamp: '2026-07-01T09:00:00.000Z', message: { role: 'user', content: 'matching' } },
      { type: 'message', id: 'u2', parentId: 'u1', timestamp: '2026-07-01T09:00:01.000Z', message: { role: 'user', content: 'conflict' } },
      { type: 'message', id: 'u3', parentId: 'u2', timestamp: '2026-07-01T09:00:02.000Z', message: { role: 'user', content: 'missing after conflict' } },
    ] as any[]);
    const statuses = new Map([
      [groups[0].envelopes[0].id, 'matching'],
      [groups[1].envelopes[0].id, 'conflict'],
      [groups[2].envelopes[0].id, 'missing'],
    ] as const);

    const result = analyzePiHistoryEnvelopeGroups(
      groups,
      (envelope) => statuses.get(envelope.id) ?? 'missing',
    );

    expect(result.missing.map((envelope) => envelope.id)).toEqual([groups[2].envelopes[0].id]);
    expect(result.conflicting.map((envelope) => envelope.id)).toEqual([groups[1].envelopes[0].id]);
    expect(result.contiguousWatermarkEntryId).toBe('u1');
  });
});
