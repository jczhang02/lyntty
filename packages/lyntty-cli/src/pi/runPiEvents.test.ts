import { describe, expect, it } from 'vitest';

import { mapPiSessionEventToAgentMessages } from './runPiEvents';

describe('mapPiSessionEventToAgentMessages', () => {
  it('maps text deltas to Pi agent messages', () => {
    expect(mapPiSessionEventToAgentMessages({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: 'hello' },
    } as any)).toEqual([{ type: 'message', message: 'hello', streaming: true }]);
  });

  it('maps thinking deltas to reasoning messages', () => {
    expect(mapPiSessionEventToAgentMessages({
      type: 'message_update',
      assistantMessageEvent: { type: 'thinking_delta', delta: 'thinking' },
    } as any)).toEqual([{ type: 'reasoning', message: 'thinking', streaming: true }]);
  });

  it('maps tool lifecycle events', () => {
    expect(mapPiSessionEventToAgentMessages({
      type: 'tool_execution_start',
      toolCallId: 'tool-1',
      toolName: 'bash',
      args: { command: 'pwd' },
    } as any)).toEqual([{ type: 'tool-call', callId: 'tool-1', id: 'tool-1', name: 'bash', input: { command: 'pwd' } }]);

    expect(mapPiSessionEventToAgentMessages({
      type: 'tool_execution_end',
      toolCallId: 'tool-1',
      toolName: 'bash',
      result: { stdout: '/tmp' },
      isError: false,
    } as any)).toEqual([{ type: 'tool-result', callId: 'tool-1', id: 'tool-1', output: { stdout: '/tmp' }, isError: false }]);
  });

  it('maps lifecycle events once', () => {
    expect(mapPiSessionEventToAgentMessages({ type: 'agent_start' } as any)).toEqual([{ type: 'task_started', id: 'pi-turn' }]);
    expect(mapPiSessionEventToAgentMessages({ type: 'agent_end', willRetry: false } as any)).toEqual([{ type: 'task_complete', id: 'pi-turn' }]);
  });
});
