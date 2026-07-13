import type { SpawnSessionOptions } from '@/modules/common/registerCommonHandlers';
import type { TrackedSession } from './types';

export type PiTakeoverChoice = 'wait' | 'stop' | 'interrupt';

function sessionMatchesPiLease(session: TrackedSession, machineId: string | undefined, piSessionId: string | undefined): boolean {
  if (!piSessionId) {
    return false;
  }
  if (session.agent !== 'pi') {
    return false;
  }
  const metadata = session.lynttySessionMetadataFromLocalWebhook;
  if (metadata?.piSessionId !== piSessionId) {
    return false;
  }
  if (machineId && metadata.machineId && metadata.machineId !== machineId) {
    return false;
  }
  return true;
}

export function resolveActivePiSessionReuse(
  piSessionId: string | undefined,
  sessions: readonly TrackedSession[],
  machineId?: string,
): TrackedSession | null {
  if (!piSessionId) {
    return null;
  }
  return sessions.find((session) => (
    !!session.lynttySessionId
    && sessionMatchesPiLease(session, machineId, piSessionId)
  )) ?? null;
}

export type PiActivationLockResult =
  | { type: 'allow' }
  | { type: 'takeover'; activeSessionId: string; activePid: number; choice: Extract<PiTakeoverChoice, 'stop' | 'interrupt'> }
  | { type: 'wait'; activeSessionId: string; activePid: number }
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

function describePiLease(options: Pick<SpawnSessionOptions, 'directory' | 'machineId' | 'sessionId'>): string {
  if (options.sessionId) {
    return `${options.machineId ?? 'local'}:${options.sessionId}`;
  }
  return normalizeDirectory(options.directory);
}

export function resolvePiActivationLock(
  options: Pick<SpawnSessionOptions, 'directory' | 'agent' | 'takeoverChoice' | 'machineId' | 'sessionId'>,
  sessions: readonly TrackedSession[],
): PiActivationLockResult {
  if (options.agent && options.agent !== 'pi') {
    return { type: 'allow' };
  }

  const active = options.sessionId
    ? sessions.find((session) => session.pid && sessionMatchesPiLease(session, options.machineId, options.sessionId))
    : sessions.find((session) => isActivePiSession(session, options.directory));
  if (!active) {
    return { type: 'allow' };
  }

  const activeSessionId = active.lynttySessionId ?? `PID-${active.pid}`;
  if (options.takeoverChoice === 'stop' || options.takeoverChoice === 'interrupt') {
    return { type: 'takeover', activeSessionId, activePid: active.pid, choice: options.takeoverChoice };
  }
  if (options.takeoverChoice === 'wait') {
    return { type: 'wait', activeSessionId, activePid: active.pid };
  }

  return {
    type: 'blocked',
    activeSessionId,
    activePid: active.pid,
    errorMessage: `active runtime already holds lease for ${describePiLease(options)}; choose stop or interrupt to take over`,
  };
}
