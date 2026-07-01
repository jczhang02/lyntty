import { describe, expect, it } from 'vitest';

import { PiCommandLedger, resolvePiRemoteAction } from './runPiControl';
import { PiSessionProtocolMapper } from './runPiSessionProtocol';

function deliverRemoteText(input: {
  text: string;
  localKey?: string;
  isStreaming: boolean;
  ledger: PiCommandLedger;
}) {
  if (!input.ledger.claim(input.localKey)) {
    return { delivered: false, action: 'duplicate' as const };
  }
  const action = resolvePiRemoteAction({
    text: input.text,
    isStreaming: input.isStreaming,
    supportedSlashCommands: ['/lyntty', '/review'],
    localOnlySlashCommands: ['/model', '/settings', '/session', '/theme', '/help'],
  });
  return { delivered: true, action };
}

describe('Pi command/event path smoke', () => {
  it('simulates Session Remote command delivery into Pi SDK actions', () => {
    const ledger = new PiCommandLedger();

    expect(deliverRemoteText({ text: 'build feature', localKey: 'm1', isStreaming: false, ledger })).toEqual({
      delivered: true,
      action: { kind: 'prompt', text: 'build feature' },
    });
    expect(deliverRemoteText({ text: 'also test it', localKey: 'm2', isStreaming: true, ledger })).toEqual({
      delivered: true,
      action: { kind: 'followUp', text: 'also test it' },
    });
    expect(deliverRemoteText({ text: '/redirect focus on bug', localKey: 'm3', isStreaming: true, ledger })).toEqual({
      delivered: true,
      action: { kind: 'steer', text: 'focus on bug' },
    });
    expect(deliverRemoteText({ text: '/model sonnet', localKey: 'm4', isStreaming: false, ledger })).toEqual({
      delivered: true,
      action: { kind: 'localOnlySlash', command: '/model', reason: 'local_only' },
    });
    expect(deliverRemoteText({ text: 'build feature', localKey: 'm1', isStreaming: false, ledger })).toEqual({
      delivered: false,
      action: 'duplicate',
    });
  });

  it('simulates Pi SDK events returning as Session Remote session envelopes', () => {
    const mapper = new PiSessionProtocolMapper();
    expect(mapper.mapEvent({ type: 'agent_start' } as any).map((envelope) => envelope.ev.t)).toEqual(['turn-start']);
    expect(mapper.mapEvent({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: 'done' },
    } as any)).toEqual([]);

    const toolStart = mapper.mapEvent({
      type: 'tool_execution_start',
      toolCallId: 'tool-1',
      toolName: 'bash',
      args: { command: 'pnpm test' },
    } as any);
    expect(toolStart.map((envelope) => envelope.ev.t)).toEqual(['text', 'tool-call-start']);
    expect(toolStart[0]).toMatchObject({ ev: { t: 'text', text: 'done' } });
    expect(toolStart[1]).toMatchObject({ ev: { t: 'tool-call-start', name: 'bash', args: { command: 'pnpm test' } } });

    expect(mapper.mapEvent({
      type: 'tool_execution_end',
      toolCallId: 'tool-1',
      result: 'ok',
      isError: false,
    } as any).map((envelope) => envelope.ev.t)).toEqual(['tool-call-end']);
  });
});
