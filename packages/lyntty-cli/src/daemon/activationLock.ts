import type { SpawnSessionOptions } from '@/modules/common/registerCommonHandlers';
import type { TrackedSession } from './types';

export type PiTakeoverChoice = 'wait' | 'stop' | 'interrupt';

export function resolveActivePiSessionReuse(piSessionId: string | undefined, sessions: readonly TrackedSession[]): TrackedSession | null {
  if (!piSessionId) {
    return null;
  }
  return sessions.find((session) => (
    session.agent === 'pi'
    && !!session.lynttySessionId
    && session.lynttySessionMetadataFromLocalWebhook?.piSessionId === piSessionId
  )) ?? null;
}

export type PiActivationLockResult =
  | { type: 'allow' }
  | { type: 'takeover'; activeSessionId: string; activePid: number; choice: Extract<PiTakeoverChoice, 'stop' | 'interrupt'> }
  | { type: 'blocked'; activeSessionId: string; activePid: number; errorMessage: string };

function normalizeDirectory(directory: string): string {
  return directory.replace(/\/+$/, '') || '/';
}

function isActivePiSession(session: TrackedSession, directory: string): boolean {
  if (session.agent !== 'pi') return false;
  if (!session.directory) return false;
  if (!session.pid) return false;
  return normalizeDirectory(session.directory) === normalizeDirectory(directory);
}

export function resolvePiActivationLock(
  options: Pick<SpawnSessionOptions, 'directory' | 'agent' | 'takeoverChoice'>,
  sessions: readonly TrackedSession[],
): PiActivationLockResult {
  if (options.agent !== 'pi') {
    return { type: 'allow' };
  }

  const active = sessions.find((session) => isActivePiSession(session, options.directory));
  if (!active) {
    return { type: 'allow' };
  }

  const activeSessionId = active.lynttySessionId ?? `PID-${active.pid}`;
  if (options.takeoverChoice === 'stop' || options.takeoverChoice === 'interrupt') {
    return { type: 'takeover', activeSessionId, activePid: active.pid, choice: options.takeoverChoice };
  }

  const queueMessage = options.takeoverChoice === 'wait'
    ? 'wait queue is not implemented yet'
    : 'choose stop or interrupt to take over';
  return {
    type: 'blocked',
    activeSessionId,
    activePid: active.pid,
    errorMessage: `active runtime already holds lease for ${normalizeDirectory(options.directory)}; ${queueMessage}`,
  };
}
