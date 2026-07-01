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

  it('imports tool results as thinking text so historical tool output is visible', () => {
    const envelopes = mapPiSessionHistoryToEnvelopes([
      {
        type: 'message',
        id: 't1',
        parentId: null,
        timestamp: '2026-07-01T09:00:00.000Z',
        message: {
          role: 'toolResult',
          toolName: 'bash',
          content: [{ type: 'text', text: 'stdout' }],
        },
      },
    ] as any);

    expect(envelopes[1]).toMatchObject({
      role: 'agent',
      ev: { t: 'text', text: 'bash result:\nstdout', thinking: true },
    });
  });
});
