import type { DaemonLocallyPersistedState } from '@/persistence';

export function createDaemonHeartbeatState(options: {
  initialState: DaemonLocallyPersistedState;
  pid: number;
  httpPort: number;
  piExtensionToken: string;
  cliVersion: string;
  heartbeat: string;
}): DaemonLocallyPersistedState {
  return {
    pid: options.pid,
    httpPort: options.httpPort,
    piExtensionToken: options.piExtensionToken,
    startTime: options.initialState.startTime,
    startedWithCliVersion: options.cliVersion,
    ...(options.initialState.startedWithReleaseId
      ? { startedWithReleaseId: options.initialState.startedWithReleaseId }
      : {}),
    lastHeartbeat: options.heartbeat,
    daemonLogPath: options.initialState.daemonLogPath,
  };
}
