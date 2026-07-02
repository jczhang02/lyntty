import { describe, expect, it } from 'vitest';

import { PiSessionProtocolMapper } from './runPiSessionProtocol';

function event(input: Record<string, unknown>) {
  return input as any;
}

describe('PiSessionProtocolMapper', () => {
  it('coalesces Pi text deltas into one session-protocol text envelope', () => {
    const mapper = new PiSessionProtocolMapper();

    expect(mapper.mapEvent(event({ type: 'agent_start' })).map((envelope) => envelope.ev.t)).toEqual(['turn-start']);
    expect(mapper.mapEvent(event({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: '当前' },
    }))).toEqual([]);
    expect(mapper.mapEvent(event({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: '目录' },
    }))).toEqual([]);

    const end = mapper.mapEvent(event({ type: 'agent_end' }));
    expect(end.map((envelope) => envelope.ev.t)).toEqual(['text', 'turn-end']);
    expect(end[0]).toMatchObject({
      role: 'agent',
      ev: { t: 'text', text: '当前目录' },
    });
    expect(end[0].turn).toBe(end[1].turn);
  });

  it('flushes text before tool envelopes and never emits ACP messages', () => {
    const mapper = new PiSessionProtocolMapper();
    mapper.mapEvent(event({ type: 'agent_start' }));
    mapper.mapEvent(event({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: 'running ' },
    }));

    const toolStart = mapper.mapEvent(event({
      type: 'tool_execution_start',
      toolCallId: 'tool-1',
      toolName: 'bash',
      args: { command: 'pnpm test' },
    }));

    expect(toolStart.map((envelope) => envelope.ev.t)).toEqual(['text', 'tool-call-start']);
    expect(toolStart[0]).toMatchObject({ role: 'agent', ev: { t: 'text', text: 'running ' } });
    expect(toolStart[1]).toMatchObject({
      role: 'agent',
      ev: {
        t: 'tool-call-start',
        name: 'bash',
        title: 'bash',
        description: 'Running bash',
        args: { command: 'pnpm test' },
      },
    });

    const toolEnd = mapper.mapEvent(event({
      type: 'tool_execution_end',
      toolCallId: 'tool-1',
      result: 'ok',
      isError: false,
    }));
    expect(toolEnd.map((envelope) => envelope.ev.t)).toEqual(['tool-call-end']);
    expect(toolEnd[0].ev).toMatchObject({ t: 'tool-call-end', call: toolStart[1].ev.t === 'tool-call-start' ? toolStart[1].ev.call : '' });
  });

  it('does not turn Pi debug/status events into chat-visible service messages', () => {
    const mapper = new PiSessionProtocolMapper();

    expect(mapper.mapEvent(event({ type: 'queue_update', steering: [], followUp: [] }))).toEqual([]);
    expect(mapper.mapEvent(event({ type: 'compaction_start', reason: 'manual' }))).toEqual([]);
    expect(mapper.mapEvent(event({ type: 'compaction_end', reason: 'manual', aborted: false }))).toEqual([]);
    expect(mapper.mapEvent(event({ type: 'auto_retry_start', attempt: 1, maxAttempts: 3, errorMessage: 'timeout' }))).toEqual([]);
    expect(mapper.mapEvent(event({ type: 'auto_retry_end', attempt: 1, success: true }))).toEqual([]);
  });
});
