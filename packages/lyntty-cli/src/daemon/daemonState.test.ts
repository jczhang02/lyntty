import { describe, expect, it } from 'bun:test';

import { createDaemonHeartbeatState } from './daemonState';

describe('daemon heartbeat state', () => {
  it('preserves the exact compiled release identity across heartbeat writes', () => {
    expect(createDaemonHeartbeatState({
      initialState: {
        pid: 1,
        httpPort: 1000,
        startTime: 'start',
        startedWithCliVersion: '2.0.0',
        startedWithReleaseId: 'lyntty-cli-2.0.0-linux-x64',
        daemonLogPath: '/isolated/log',
      },
      pid: 2,
      httpPort: 2000,
      piExtensionToken: 'private-token',
      cliVersion: '2.0.0',
      heartbeat: 'later',
    })).toEqual({
      pid: 2,
      httpPort: 2000,
      piExtensionToken: 'private-token',
      startTime: 'start',
      startedWithCliVersion: '2.0.0',
      startedWithReleaseId: 'lyntty-cli-2.0.0-linux-x64',
      lastHeartbeat: 'later',
      daemonLogPath: '/isolated/log',
    });
  });
});
