import { describe, expect, it } from 'bun:test';

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

  it('can flush live text before agent_end without ending the turn', () => {
    const mapper = new PiSessionProtocolMapper();

    expect(mapper.mapEvent(event({ type: 'agent_start' })).map((envelope) => envelope.ev.t)).toEqual(['turn-start']);
    expect(mapper.mapEvent(event({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: '后续' },
    }))).toEqual([]);
    expect(mapper.hasPendingText()).toBe(true);

    const liveFlush = mapper.flushPendingText();
    expect(liveFlush.map((envelope) => envelope.ev.t)).toEqual(['text']);
    expect(liveFlush[0]).toMatchObject({ role: 'agent', ev: { t: 'text', text: '后续' } });
    expect(mapper.hasPendingText()).toBe(false);

    mapper.mapEvent(event({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: '文本' },
    }));
    const end = mapper.mapEvent(event({ type: 'agent_end' }));
    expect(end.map((envelope) => envelope.ev.t)).toEqual(['text', 'turn-end']);
    expect(end[0]).toMatchObject({ role: 'agent', ev: { t: 'text', text: '文本' } });
    expect(end[0].turn).toBe(liveFlush[0].turn);
    expect(end[1].turn).toBe(liveFlush[0].turn);
  });

  it('uses assistant message_end as a final text fallback without duplicating flushed text', () => {
    const mapper = new PiSessionProtocolMapper();
    mapper.mapEvent(event({ type: 'agent_start' }));
    mapper.mapEvent(event({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: 'partial ' },
    }));

    const liveFlush = mapper.flushPendingText();
    expect(liveFlush.map((envelope) => envelope.ev)).toEqual([{ t: 'text', text: 'partial ' }]);

    const final = mapper.mapEvent(event({
      type: 'message_end',
      message: { role: 'assistant', content: [{ type: 'text', text: 'partial final' }] },
    }));
    expect(final.map((envelope) => envelope.ev)).toEqual([{ t: 'text', text: 'final' }]);

    const duplicateEnd = mapper.mapEvent(event({
      type: 'message_end',
      message: { role: 'assistant', content: [{ type: 'text', text: 'partial final' }] },
    }));
    expect(duplicateEnd).toEqual([]);
  });

  it('uses assistant message_end when message_update events were dropped', () => {
    const mapper = new PiSessionProtocolMapper();
    mapper.mapEvent(event({ type: 'agent_start' }));

    const final = mapper.mapEvent(event({
      type: 'message_end',
      message: { role: 'assistant', content: [{ type: 'text', text: 'full answer' }] },
    }));
    expect(final.map((envelope) => envelope.ev)).toEqual([{ t: 'text', text: 'full answer' }]);
  });

  it('flushes text before tool envelopes and emits only Pi session envelopes', () => {
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
      args: { command: 'bun test' },
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
        args: { command: 'bun test' },
      },
    });

    const toolEnd = mapper.mapEvent(event({
      type: 'tool_execution_end',
      toolCallId: 'tool-1',
      result: 'ok',
      isError: false,
    }));
    expect(toolEnd.map((envelope) => envelope.ev.t)).toEqual(['tool-call-end']);
    expect(toolEnd[0].ev).toMatchObject({
      t: 'tool-call-end',
      call: toolStart[1].ev.t === 'tool-call-start' ? toolStart[1].ev.call : '',
      result: 'ok',
    });
  });

  it('does not turn Pi debug/status events into chat-visible service messages', () => {
    const mapper = new PiSessionProtocolMapper();

    expect(mapper.mapEvent(event({ type: 'queue_update', steering: [], followUp: [] }))).toEqual([]);
    expect(mapper.mapEvent(event({ type: 'compaction_start', reason: 'manual' }))).toEqual([]);
    expect(mapper.mapEvent(event({ type: 'compaction_end', reason: 'manual', aborted: false }))).toEqual([]);
    expect(mapper.mapEvent(event({ type: 'auto_retry_start', attempt: 1, maxAttempts: 3, errorMessage: 'timeout' }))).toEqual([]);
    expect(mapper.mapEvent(event({ type: 'auto_retry_end', attempt: 1, success: true }))).toEqual([]);
  });

  it('keeps partial tool output out of chat text and uses the final tool result', () => {
    const mapper = new PiSessionProtocolMapper();
    mapper.mapEvent(event({ type: 'agent_start' }));
    const start = mapper.mapEvent(event({
      type: 'tool_execution_start',
      toolCallId: 'tool-raw',
      toolName: 'bash',
      args: { command: 'git status' },
    }));
    const startEnvelope = start.find((envelope) => envelope.ev.t === 'tool-call-start');
    expect(startEnvelope?.ev.t).toBe('tool-call-start');
    const call = startEnvelope?.ev.t === 'tool-call-start' ? startEnvelope.ev.call : undefined;

    expect(mapper.mapEvent(event({
      type: 'tool_execution_update',
      toolCallId: 'tool-raw',
      partialResult: { content: [{ type: 'text', text: ' M file.ts' }], details: {} },
    }))).toEqual([]);

    const end = mapper.mapEvent(event({
      type: 'tool_execution_end',
      toolCallId: 'tool-raw',
      result: { content: [{ type: 'text', text: ' M file.ts' }], details: {} },
      isError: false,
    }));

    expect(end.map((envelope) => envelope.ev.t)).toEqual(['tool-call-end']);
    expect(end[0].ev).toMatchObject({
      t: 'tool-call-end',
      call,
      result: '{"content":[{"type":"text","text":" M file.ts"}],"details":{}}',
    });
  });
});
