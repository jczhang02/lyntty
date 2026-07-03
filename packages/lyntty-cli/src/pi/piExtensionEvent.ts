import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';

export type LynttyPiExtensionSession = {
  piSessionId: string;
  sessionFile?: string;
  cwd?: string;
  name?: string;
};

export type LynttyPiExtensionPayload = {
  session: LynttyPiExtensionSession;
  event: Record<string, unknown>;
  timestamp?: number;
};

export function toPiAgentSessionEvent(event: Record<string, unknown>): AgentSessionEvent | null {
  switch (event.type) {
    case 'agent_start':
    case 'agent_end':
      return event as unknown as AgentSessionEvent;
    case 'message_update':
      if (event.assistantMessageEvent && typeof event.assistantMessageEvent === 'object') {
        return event as unknown as AgentSessionEvent;
      }
      return null;
    case 'tool_execution_start':
      if (typeof event.toolCallId === 'string' && typeof event.toolName === 'string') {
        return event as unknown as AgentSessionEvent;
      }
      return null;
    case 'tool_execution_update':
      if (typeof event.toolCallId === 'string' && typeof event.toolName === 'string') {
        return event as unknown as AgentSessionEvent;
      }
      return null;
    case 'tool_execution_end':
      if (typeof event.toolCallId === 'string' && typeof event.toolName === 'string') {
        return event as unknown as AgentSessionEvent;
      }
      return null;
    default:
      return null;
  }
}

export function isLifecyclePiExtensionEvent(event: Record<string, unknown>): boolean {
  return event.type === 'session_start'
    || event.type === 'session_info_changed'
    || event.type === 'session_shutdown';
}
