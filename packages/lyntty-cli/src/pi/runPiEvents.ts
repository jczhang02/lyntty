import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';

import type { ACPMessageData } from '@/api/apiSession';

const PI_TURN_ID = 'pi-turn';

export function mapPiSessionEventToAgentMessages(event: AgentSessionEvent): ACPMessageData[] {
  switch (event.type) {
    case 'message_update':
      if (event.assistantMessageEvent.type === 'text_delta') {
        return [{ type: 'message', message: event.assistantMessageEvent.delta, streaming: true }];
      }
      if (event.assistantMessageEvent.type === 'thinking_delta') {
        return [{ type: 'reasoning', message: event.assistantMessageEvent.delta, streaming: true }];
      }
      return [];
    case 'tool_execution_start':
      return [{
        type: 'tool-call',
        callId: event.toolCallId,
        id: event.toolCallId,
        name: event.toolName,
        input: event.args,
      }];
    case 'tool_execution_update':
      return [{
        type: 'terminal-output',
        callId: event.toolCallId,
        data: typeof event.partialResult === 'string' ? event.partialResult : JSON.stringify(event.partialResult),
      }];
    case 'tool_execution_end':
      return [{
        type: 'tool-result',
        callId: event.toolCallId,
        id: event.toolCallId,
        output: event.result,
        isError: event.isError,
      }];
    case 'agent_start':
      return [{ type: 'task_started', id: PI_TURN_ID }];
    case 'agent_end':
      return [{ type: 'task_complete', id: PI_TURN_ID }];
    case 'queue_update':
      return [{
        type: 'message',
        message: `Queue updated: ${event.steering.length} steering, ${event.followUp.length} follow-up`,
      }];
    case 'compaction_start':
      return [{ type: 'message', message: `Compaction started: ${event.reason}` }];
    case 'compaction_end':
      return [{ type: 'message', message: `Compaction ended: ${event.reason}${event.aborted ? ' (aborted)' : ''}` }];
    case 'auto_retry_start':
      return [{ type: 'message', message: `Retry ${event.attempt}/${event.maxAttempts}: ${event.errorMessage}` }];
    case 'auto_retry_end':
      return [{ type: 'message', message: event.success ? `Retry ${event.attempt} succeeded` : `Retry ${event.attempt} failed` }];
    default:
      return [];
  }
}
