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
  eventId?: number;
  timestamp?: number;
};

export type LynttyPiRemoteCommand =
  | { type: 'send_user_message'; text: string }
  | { type: 'follow_up'; text: string }
  | { type: 'steer'; text: string }
  | { type: 'abort' }
  | { type: 'compact'; instructions?: string }
  | { type: 'reload' }
  | { type: 'set_session_name'; name: string }
  | { type: 'get_commands' }
  | { type: 'set_label'; entryId: string; label?: string };

export type LynttyPiRemoteCommandEnvelope = {
  seq: number;
  deliveryToken: string;
  command: LynttyPiRemoteCommand;
};

export type LynttyPiRemoteCommandAck = {
  seq: number;
  status: 'delivered_to_pi_extension' | 'accepted_by_pi' | 'failed';
  deliveryToken?: string;
  error?: string;
};

const REMOTE_PI_TEXT_MAX = 50_000;
const REMOTE_PI_LABEL_MAX = 512;

function capText(value: string, max = REMOTE_PI_TEXT_MAX): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

export function parseLynttyPiRemoteCommand(text: string, options: { isStreaming: boolean }): LynttyPiRemoteCommand | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const [rawCommand = ''] = trimmed.split(/\s+/, 1);
  const command = rawCommand.toLowerCase();
  const rest = trimmed.slice(rawCommand.length).trim();

  if (command === '/stop' || command === '/abort' || command === '/interrupt') {
    return { type: 'abort' };
  }
  if (command === '/redirect' || command === '/steer') {
    const text = capText(rest);
    return text ? { type: 'steer', text } : null;
  }
  if (command === '/follow-up' || command === '/followup' || command === '/queue') {
    const text = capText(rest);
    return text ? { type: 'follow_up', text } : null;
  }
  if (command === '/compact') {
    const instructions = capText(rest);
    return rest ? instructions ? { type: 'compact', instructions } : null : { type: 'compact' };
  }
  if (command === '/reload') {
    return { type: 'reload' };
  }
  if (command === '/name') {
    const name = capText(rest, REMOTE_PI_LABEL_MAX);
    return name ? { type: 'set_session_name', name } : null;
  }
  if (command === '/commands') {
    return { type: 'get_commands' };
  }
  if (command === '/label') {
    const [entryId = '', ...labelParts] = rest.split(/\s+/);
    if (!entryId) return null;
    const label = capText(labelParts.join(' '), REMOTE_PI_LABEL_MAX);
    if (labelParts.length > 0 && !label) return null;
    return label ? { type: 'set_label', entryId, label } : { type: 'set_label', entryId };
  }
  if (command.startsWith('/')) {
    return null;
  }

  const messageText = capText(trimmed);
  if (!messageText) return null;
  return options.isStreaming
    ? { type: 'follow_up', text: messageText }
    : { type: 'send_user_message', text: messageText };
}

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
    || event.type === 'session_shutdown'
    || event.type === 'remote_heartbeat';
}
