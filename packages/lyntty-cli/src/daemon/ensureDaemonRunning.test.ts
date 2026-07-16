import { beforeEach, describe, expect, it, mock, spyOn, jest } from 'bun:test'

const mocks = {
  mockLoggerDebug: mock(),
  mockIsDaemonRunningCurrentlyInstalledLynttyVersion: mock(),
  mockCheckIfDaemonRunningAndCleanupStaleState: mock(),
  mockSpawnLynttyCLI: mock(),
}

mock.module('@/ui/logger', () => ({
  logger: {
    debug: mocks.mockLoggerDebug,
  },
}))

mock.module('./controlClient', () => ({
  isDaemonRunningCurrentlyInstalledLynttyVersion: mocks.mockIsDaemonRunningCurrentlyInstalledLynttyVersion,
  checkIfDaemonRunningAndCleanupStaleState: mocks.mockCheckIfDaemonRunningAndCleanupStaleState,
}))

mock.module('@/utils/spawnLynttyCLI', () => ({
  spawnLynttyCLI: mocks.mockSpawnLynttyCLI,
}))

import { ensureDaemonRunning } from './ensureDaemonRunning'

describe('ensureDaemonRunning', () => {
  beforeEach(() => {
    mock.clearAllMocks()
    mocks.mockSpawnLynttyCLI.mockReturnValue({
      unref: mock(),
    })
    mocks.mockCheckIfDaemonRunningAndCleanupStaleState.mockResolvedValue(true)
  })

  it('returns without spawning when the daemon is already running', async () => {
    mocks.mockIsDaemonRunningCurrentlyInstalledLynttyVersion.mockResolvedValue(true)

    await ensureDaemonRunning()

    expect(mocks.mockSpawnLynttyCLI).not.toHaveBeenCalled()
    expect(mocks.mockCheckIfDaemonRunningAndCleanupStaleState).not.toHaveBeenCalled()
    expect(mocks.mockLoggerDebug).toHaveBeenCalledWith(
      'Ensuring Lyntty background service is running & matches our version...',
    )
  })

  it('starts the daemon and waits for readiness when the installed version is not running', async () => {
    const mockUnref = mock()
    mocks.mockIsDaemonRunningCurrentlyInstalledLynttyVersion.mockResolvedValue(false)
    mocks.mockSpawnLynttyCLI.mockReturnValue({
      unref: mockUnref,
    })
    mocks.mockCheckIfDaemonRunningAndCleanupStaleState
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)

    await ensureDaemonRunning()

    expect(mocks.mockSpawnLynttyCLI).toHaveBeenCalledWith(['daemon', 'start-sync'], {
      detached: true,
      stdio: 'ignore',
      env: process.env,
    })
    expect(mockUnref).toHaveBeenCalled()
    expect(mocks.mockCheckIfDaemonRunningAndCleanupStaleState).toHaveBeenCalledTimes(2)
    expect(mocks.mockLoggerDebug).toHaveBeenCalledWith('Starting Lyntty background service...')
    expect(mocks.mockLoggerDebug).toHaveBeenCalledWith('Lyntty background service is ready')
  })
})
