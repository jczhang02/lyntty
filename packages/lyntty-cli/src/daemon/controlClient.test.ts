import { beforeEach, describe, expect, it, mock, spyOn, jest } from 'bun:test';

const { readDaemonState } = {
  readDaemonState: mock(),
};

mock.module('@/persistence', () => ({
  clearDaemonState: mock(),
  readDaemonState,
}));

mock.module('@/ui/logger', () => ({
  logger: { debug: mock() },
}));

import { isDaemonRunningExpectedRelease, listDaemonSessions } from './controlClient';

describe('daemon control client authentication', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    readDaemonState.mockResolvedValue({
      pid: process.pid,
      httpPort: 43210,
      piExtensionToken: 'control-secret',
      startTime: 'now',
      startedWithCliVersion: '1.0.0',
    });
    spyOn(process, 'kill').mockImplementation(() => true);
  });

  it('requires the exact embedded release identity for update health gates', async () => {
    readDaemonState.mockResolvedValue({
      pid: process.pid,
      httpPort: 43210,
      piExtensionToken: 'control-secret',
      startTime: 'now',
      startedWithCliVersion: '2.0.0',
      startedWithReleaseId: 'release-exact',
    });
    spyOn(globalThis, 'fetch').mockResolvedValue(new Response('OK'));

    await expect(isDaemonRunningExpectedRelease('release-exact')).resolves.toBe(true);
    await expect(isDaemonRunningExpectedRelease('same-version-different-build')).resolves.toBe(false);
  });

  it('authenticates every daemon HTTP request with the state token', async () => {
    const fetchMock = mock().mockResolvedValue(new Response(JSON.stringify({ children: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    spyOn(globalThis, 'fetch').mockImplementation(fetchMock as unknown as typeof fetch);

    await expect(listDaemonSessions()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:43210/list', expect.objectContaining({
      headers: expect.objectContaining({
        'X-Lyntty-Extension-Token': 'control-secret',
      }),
    }));
  });
});
