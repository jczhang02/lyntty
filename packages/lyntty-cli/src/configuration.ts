/**
 * Global configuration for lyntty CLI
 *
 * Centralizes all configuration including environment variables and paths
 * Standalone binaries do not auto-load environment files.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import packageJson from '../package.json'

class Configuration {
  public readonly serverUrl: string
  public readonly isDaemonProcess: boolean

  // Directories and paths (from persistence)
  public readonly lynttyHomeDir: string
  public readonly logsDir: string
  public readonly settingsFile: string
  public readonly privateKeyFile: string
  public readonly daemonStateFile: string
  public readonly daemonLockFile: string
  public readonly sessionsFile: string
  public readonly piCommandLedgerDir: string
  public readonly piCommandBoundaryDir: string
  public readonly piHistoryAppendCheckpointDir: string
  public readonly piSessionIndexFile: string
  public readonly currentCliVersion: string

  public readonly isExperimentalEnabled: boolean
  public readonly disableCaffeinate: boolean

  constructor() {
    // Check if we're running as daemon based on process args
    const args = process.argv.slice(2)
    this.isDaemonProcess = process.env.LYNTTY_DAEMON_PROCESS === '1'
      || (args.length >= 2 && args[0] === 'daemon' && args[1] === 'start-sync')

    // Directory configuration - Priority: LYNTTY_HOME_DIR env > default home dir
    if (process.env.LYNTTY_HOME_DIR) {
      // Expand ~ to home directory if present
      const expandedPath = process.env.LYNTTY_HOME_DIR.replace(/^~/, homedir())
      this.lynttyHomeDir = expandedPath
    } else {
      this.lynttyHomeDir = join(homedir(), '.lyntty')
    }

    this.logsDir = join(this.lynttyHomeDir, 'logs')
    this.settingsFile = join(this.lynttyHomeDir, 'settings.json')
    this.privateKeyFile = join(this.lynttyHomeDir, 'access.key')
    this.daemonStateFile = join(this.lynttyHomeDir, 'daemon.state.json')
    this.daemonLockFile = join(this.lynttyHomeDir, 'daemon.state.json.lock')
    this.sessionsFile = join(this.lynttyHomeDir, 'sessions.json')
    this.piCommandLedgerDir = join(this.lynttyHomeDir, 'pi-command-ledger')
    this.piCommandBoundaryDir = join(this.lynttyHomeDir, 'pi-command-boundary')
    // Keep the legacy directory name so upgrades reuse existing checkpoints.
    this.piHistoryAppendCheckpointDir = join(this.lynttyHomeDir, 'pi-history-watermark')
    this.piSessionIndexFile = join(this.lynttyHomeDir, 'pi-session-index.json')

    // The relay URL is the only persisted network endpoint used by the CLI.
    // Settings are read sync here (avoid circular import with persistence.ts).
    this.serverUrl =
      process.env.LYNTTY_SERVER_URL ||
      readSettingsStringSync(this.settingsFile) ||
      'https://relay.jczhang.cc'

    this.isExperimentalEnabled = ['true', '1', 'yes'].includes(process.env.LYNTTY_EXPERIMENTAL?.toLowerCase() || '');
    this.disableCaffeinate = ['true', '1', 'yes'].includes(process.env.LYNTTY_DISABLE_CAFFEINATE?.toLowerCase() || '');

    this.currentCliVersion = packageJson.version

    // Visual indicator on CLI startup (only if not daemon process to avoid log clutter)
    const variant = process.env.LYNTTY_VARIANT || 'stable'
    if (!this.isDaemonProcess && variant === 'dev') {
      console.log('\x1b[33m🔧 DEV MODE\x1b[0m - Data: ' + this.lynttyHomeDir)
    }

    mkdirSync(this.lynttyHomeDir, { recursive: true, mode: 0o700 })
    mkdirSync(this.logsDir, { recursive: true, mode: 0o700 })
    try {
      chmodSync(this.lynttyHomeDir, 0o700)
      chmodSync(this.logsDir, 0o700)
    } catch {
      // Best-effort hardening for platforms without POSIX permissions.
    }
  }
}

function readSettingsStringSync(settingsFile: string): string | undefined {
  try {
    if (!existsSync(settingsFile)) return undefined
    const raw = JSON.parse(readFileSync(settingsFile, 'utf8'))
    const value = raw?.serverUrl
    return typeof value === 'string' && value.length > 0 ? value : undefined
  } catch {
    return undefined
  }
}

export const configuration: Configuration = new Configuration()
