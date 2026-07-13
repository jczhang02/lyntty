export type PiCommandQueueStatus = 'queued' | 'accepted_by_pi' | 'failed';

export type PiCommandQueueEntry = {
  seq: number;
  status: PiCommandQueueStatus;
  failureCount: number;
  command: { type: string };
};

export function shouldReplayExistingPiCommands(metadata: { sharedControlEnabled?: boolean }): boolean {
  return metadata.sharedControlEnabled === true;
}

export function isStalePiCommandAck(options: {
  commandQueueEpoch: string;
  ackQueueEpoch?: string;
  commandDeliveryToken: string;
  ackDeliveryToken?: string;
}): boolean {
  return (options.ackQueueEpoch !== undefined && options.ackQueueEpoch !== options.commandQueueEpoch)
    || options.ackDeliveryToken !== options.commandDeliveryToken;
}

export function resolvePiCommandAdmission(options: {
  queuedCount: number;
  maxQueuedCount: number;
  duplicate: boolean;
}): 'accepted' | 'duplicate' | 'full' {
  if (options.duplicate) return 'duplicate';
  return options.queuedCount >= options.maxQueuedCount ? 'full' : 'accepted';
}

function isUrgentCommand(command: PiCommandQueueEntry): boolean {
  return command.command.type === 'abort' || command.command.type === 'internal_shutdown';
}

export function selectNextQueuedPiCommand<T extends PiCommandQueueEntry>(commands: T[]): T | undefined {
  return commands.find((command) => command.status === 'queued' && isUrgentCommand(command))
    ?? commands.find((command) => command.status === 'queued');
}

export function applyPiCommandFailure(
  command: PiCommandQueueEntry,
  maxFailureCount: number,
): 'retry' | 'failed' {
  command.failureCount += 1;
  if (command.failureCount < maxFailureCount) {
    return 'retry';
  }

  return 'failed';
}

export function removeTerminalPiCommandPrefix(commands: PiCommandQueueEntry[]): void {
  while (commands.length > 0 && commands[0].status !== 'queued') {
    commands.shift();
  }
}
