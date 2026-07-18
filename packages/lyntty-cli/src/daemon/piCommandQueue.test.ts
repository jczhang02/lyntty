import { describe, expect, it } from 'bun:test';

import { applyPiCommandFailure, isStalePiCommandAck, removeTerminalPiCommandPrefix, resolvePiCommandAdmission, selectNextQueuedPiCommand, shouldReplayExistingPiCommands, type PiCommandQueueEntry } from './piCommandQueue';

function queued(seq: number, type: 'send_user_message' | 'abort'): PiCommandQueueEntry {
  return {
    seq,
    status: 'queued' as const,
    failureCount: 0,
    command: { type },
  };
}

describe('Pi command queue ordering', () => {
  it('lets abort bypass FIFO without permanently hiding the older command', () => {
    const commands = [queued(1, 'send_user_message'), queued(2, 'abort')];

    const urgent = selectNextQueuedPiCommand(commands);
    expect(urgent?.seq).toBe(2);
    urgent!.status = 'accepted_by_pi';

    expect(selectNextQueuedPiCommand(commands)?.seq).toBe(1);
  });

  it('turns the third Pi API failure into a terminal failure', () => {
    const command = queued(1, 'send_user_message');

    expect(applyPiCommandFailure(command, 3)).toBe('retry');
    expect(applyPiCommandFailure(command, 3)).toBe('retry');
    expect(applyPiCommandFailure(command, 3)).toBe('failed');
    expect(command.status).toBe('queued');
  });

  it('treats a legacy no-epoch ack with a replaced delivery token as stale', () => {
    expect(isStalePiCommandAck({
      commandQueueEpoch: 'new-epoch',
      commandDeliveryToken: 'new-token',
      ackDeliveryToken: 'old-token',
    })).toBe(true);
    expect(isStalePiCommandAck({
      commandQueueEpoch: 'new-epoch',
      ackQueueEpoch: 'old-epoch',
      commandDeliveryToken: 'same-token',
      ackDeliveryToken: 'same-token',
    })).toBe(true);
    expect(isStalePiCommandAck({
      commandQueueEpoch: 'new-epoch',
      ackQueueEpoch: 'new-epoch',
      commandDeliveryToken: 'same-token',
      ackDeliveryToken: 'same-token',
    })).toBe(false);
  });

  it('replays relay user commands when reconstructing a shared-control mirror after daemon restart', () => {
    expect(shouldReplayExistingPiCommands({ sharedControlEnabled: true })).toBe(true);
    expect(shouldReplayExistingPiCommands({ sharedControlEnabled: false })).toBe(false);
    expect(shouldReplayExistingPiCommands({})).toBe(false);
  });

  it('rejects the 201st command explicitly instead of admitting it for silent drop', () => {
    expect(resolvePiCommandAdmission({ queuedCount: 200, maxQueuedCount: 200, duplicate: false })).toBe('full');
    expect(resolvePiCommandAdmission({ queuedCount: 199, maxQueuedCount: 200, duplicate: false })).toBe('accepted');
    expect(resolvePiCommandAdmission({ queuedCount: 0, maxQueuedCount: 200, duplicate: true })).toBe('duplicate');
  });

  it('removes accepted and failed commands only after the FIFO prefix is terminal', () => {
    const first = queued(1, 'send_user_message');
    const second = queued(2, 'abort');
    second.status = 'accepted_by_pi';
    const commands = [first, second];

    removeTerminalPiCommandPrefix(commands);
    expect(commands).toHaveLength(2);

    first.status = 'failed';
    removeTerminalPiCommandPrefix(commands);
    expect(commands).toEqual([]);
  });
});
