export type PiRemoteAction =
  | { kind: 'prompt'; text: string }
  | { kind: 'followUp'; text: string }
  | { kind: 'steer'; text: string }
  | { kind: 'abort'; reason: 'user_requested_stop' }
  | { kind: 'empty' }
  | { kind: 'localOnlySlash'; command: string; reason: 'local_only' | 'unsupported' };

export interface PiRemoteActionInput {
  text: string;
  isStreaming: boolean;
  supportedSlashCommands: readonly string[];
  localOnlySlashCommands: readonly string[];
}

export class PiCommandLedger {
  private claimedKeys = new Set<string>();

  claim(key: string | undefined): boolean {
    if (!key) {
      return true;
    }
    if (this.claimedKeys.has(key)) {
      return false;
    }
    this.claimedKeys.add(key);
    return true;
  }
}

const STOP_COMMANDS = new Set(['/stop', '/abort', '/interrupt']);
const REDIRECT_COMMANDS = new Set(['/redirect', '/steer']);
const FOLLOW_UP_COMMANDS = new Set(['/follow-up', '/followup', '/queue']);

function firstToken(text: string): string {
  return text.split(/\s+/, 1)[0] ?? '';
}

function stripCommand(text: string): string {
  return text.replace(/^\S+\s*/, '').trim();
}

export function resolvePiRemoteAction(input: PiRemoteActionInput): PiRemoteAction {
  const text = input.text.trim();
  if (!text) {
    return { kind: 'empty' };
  }

  const command = firstToken(text);
  if (STOP_COMMANDS.has(command)) {
    return { kind: 'abort', reason: 'user_requested_stop' };
  }

  if (input.isStreaming && REDIRECT_COMMANDS.has(command)) {
    const redirectedText = stripCommand(text);
    return redirectedText ? { kind: 'steer', text: redirectedText } : { kind: 'empty' };
  }

  if (input.isStreaming && FOLLOW_UP_COMMANDS.has(command)) {
    const followUpText = stripCommand(text);
    return followUpText ? { kind: 'followUp', text: followUpText } : { kind: 'empty' };
  }

  if (command.startsWith('/')) {
    if (input.localOnlySlashCommands.includes(command)) {
      return { kind: 'localOnlySlash', command, reason: 'local_only' };
    }
    if (!input.supportedSlashCommands.includes(command)) {
      return { kind: 'localOnlySlash', command, reason: 'unsupported' };
    }
  }

  if (input.isStreaming) {
    return { kind: 'followUp', text };
  }
  return { kind: 'prompt', text };
}
