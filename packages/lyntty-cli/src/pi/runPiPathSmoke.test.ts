import { describe, expect, it } from 'vitest';

import { PiCommandLedger, resolvePiRemoteAction } from './runPiControl';
import { mapPiSessionEventToAgentMessages } from './runPiEvents';

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

  it('simulates Pi SDK events returning as Session Remote agent messages', () => {
    expect(mapPiSessionEventToAgentMessages({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: 'done' },
    } as any)).toEqual([{ type: 'message', message: 'done', streaming: true }]);

    expect(mapPiSessionEventToAgentMessages({
      type: 'tool_execution_start',
      toolCallId: 'tool-1',
      toolName: 'bash',
      args: { command: 'pnpm test' },
    } as any)).toEqual([{ type: 'tool-call', callId: 'tool-1', id: 'tool-1', name: 'bash', input: { command: 'pnpm test' } }]);

    expect(mapPiSessionEventToAgentMessages({
      type: 'tool_execution_end',
      toolCallId: 'tool-1',
      result: 'ok',
      isError: false,
    } as any)).toEqual([{ type: 'tool-result', callId: 'tool-1', id: 'tool-1', output: 'ok', isError: false }]);
  });
});
