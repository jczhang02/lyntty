import { describe, expect, it } from 'vitest';

import { mapPiSessionHistoryToEnvelopes } from './runPiHistory';

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
      'turn-end',
      'turn-start',
      'text',
      'tool-call-end',
      'turn-end',
    ]);
    expect(envelopes[1]).toMatchObject({ role: 'agent', ev: { t: 'text', text: 'Need inspect files', thinking: true } });
    expect(envelopes[2]).toMatchObject({ role: 'agent', ev: { t: 'tool-call-start', call: 'call-1', name: 'find', args: { pattern: '*.ts' } } });
    expect(envelopes[7]).toMatchObject({ role: 'agent', ev: { t: 'tool-call-end', call: 'call-1' } });
    expect(envelopes.filter((envelope) => envelope.ev.t === 'tool-call-start')).toHaveLength(1);
  });
});
