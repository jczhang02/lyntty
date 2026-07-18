import { logger } from '@/ui/logger'
import { checkIfDaemonRunningAndCleanupStaleState, isDaemonRunningCurrentlyInstalledLynttyVersion } from './controlClient'
import { spawnLynttyCLI } from '@/utils/spawnLynttyCLI'
import { runtimeLayout } from '@/distribution/runtimeLayout'
import { createDaemonServiceManager } from './service'

const DAEMON_READY_TIMEOUT_MS = 5000
const DAEMON_READY_POLL_INTERVAL_MS = 100

export async function ensureDaemonRunning(): Promise<void> {
  logger.debug('Ensuring Lyntty background service is running & matches our version...')

  if (await isDaemonRunningCurrentlyInstalledLynttyVersion()) {
    return
  }

  logger.debug('Starting Lyntty background service...')

  if (runtimeLayout().compiled) {
    const manager = createDaemonServiceManager()
    const state = await manager.status()
    if (state === 'not-installed') {
      throw new Error('lynttyd user service is not installed. Run `lyntty daemon install` after authentication.')
    }
    if (state === 'running') await manager.restart()
    else await manager.start()
  } else {
    const daemonProcess = spawnLynttyCLI(['daemon', 'start-sync'], {
      detached: true,
      stdio: 'ignore',
      env: process.env,
    })
    daemonProcess.unref()
  }

  // Wait for the spawned daemon to be fully ready: it must write daemon.state.json,
  // bind its HTTP port, and respond to a health ping. Without this, early callers
  // (e.g. notifyDaemonSessionStarted) race the daemon startup and the webhook is
  // silently lost — which later breaks resume-lyntty-session.
  const deadline = Date.now() + DAEMON_READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (await checkIfDaemonRunningAndCleanupStaleState()) {
      logger.debug('Lyntty background service is ready')
      return
    }
    await new Promise(resolve => setTimeout(resolve, DAEMON_READY_POLL_INTERVAL_MS))
  }

  logger.debug(`Lyntty background service did not become ready within ${DAEMON_READY_TIMEOUT_MS}ms; continuing anyway`)
}
