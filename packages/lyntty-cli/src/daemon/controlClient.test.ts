import { beforeEach, describe, expect, it, vi } from 'vitest';

const { readDaemonState } = vi.hoisted(() => ({
  readDaemonState: vi.fn(),
}));

vi.mock('@/persistence', () => ({
  clearDaemonState: vi.fn(),
  readDaemonState,
}));

vi.mock('@/ui/logger', () => ({
  logger: { debug: vi.fn() },
}));

import { listDaemonSessions } from './controlClient';

describe('daemon control client authentication', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    readDaemonState.mockResolvedValue({
      pid: process.pid,
      httpPort: 43210,
      piExtensionToken: 'control-secret',
      startTime: 'now',
      startedWithCliVersion: '1.0.0',
    });
    vi.spyOn(process, 'kill').mockImplementation(() => true);
  });

  it('authenticates every daemon HTTP request with the state token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ children: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listDaemonSessions()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:43210/list', expect.objectContaining({
      headers: expect.objectContaining({
        'X-Lyntty-Extension-Token': 'control-secret',
      }),
    }));
  });
});
