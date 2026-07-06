/**
 * Global configuration for lyntty CLI
 *
 * Centralizes all configuration including environment variables and paths
 * Environment files should be loaded using Node's --env-file flag
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import packageJson from '../package.json'

class Configuration {
  public readonly serverUrl: string
  public readonly webappUrl: string
  public readonly isDaemonProcess: boolean

  // Directories and paths (from persistence)
  public readonly lynttyHomeDir: string
  public readonly logsDir: string
  public readonly settingsFile: string
  public readonly privateKeyFile: string
  public readonly daemonStateFile: string
  public readonly daemonLockFile: string
  public readonly sessionsFile: string
  public readonly currentCliVersion: string

  public readonly isExperimentalEnabled: boolean
  public readonly disableCaffeinate: boolean

  constructor() {
    // Check if we're running as daemon based on process args
    const args = process.argv.slice(2)
    this.isDaemonProcess = args.length >= 2 && args[0] === 'daemon' && (args[1] === 'start-sync')

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

    // URL precedence (both): LYNTTY_*_URL env > settings.<key> > default.
    // Settings are read sync here (avoid circular import with persistence.ts).
    // webappUrl must follow the same chain as serverUrl, otherwise `lyntty server`
    // self-host points the API at localhost but auth still opens the prod webapp.
    this.serverUrl =
      process.env.LYNTTY_SERVER_URL ||
      readSettingsStringSync(this.settingsFile, 'serverUrl') ||
      'https://relay.jczhang.cc'
    this.webappUrl =
      process.env.LYNTTY_WEBAPP_URL ||
      readSettingsStringSync(this.settingsFile, 'webappUrl') ||
      'https://app.lyntty.engineering'

    this.isExperimentalEnabled = ['true', '1', 'yes'].includes(process.env.LYNTTY_EXPERIMENTAL?.toLowerCase() || '');
    this.disableCaffeinate = ['true', '1', 'yes'].includes(process.env.LYNTTY_DISABLE_CAFFEINATE?.toLowerCase() || '');

    this.currentCliVersion = packageJson.version

    // Visual indicator on CLI startup (only if not daemon process to avoid log clutter)
    const variant = process.env.LYNTTY_VARIANT || 'stable'
    if (!this.isDaemonProcess && variant === 'dev') {
      console.log('\x1b[33m🔧 DEV MODE\x1b[0m - Data: ' + this.lynttyHomeDir)
    }

    if (!existsSync(this.lynttyHomeDir)) {
      mkdirSync(this.lynttyHomeDir, { recursive: true })
    }
    // Ensure directories exist
    if (!existsSync(this.logsDir)) {
      mkdirSync(this.logsDir, { recursive: true })
    }
  }
}

function readSettingsStringSync(settingsFile: string, key: 'serverUrl' | 'webappUrl'): string | undefined {
  try {
    if (!existsSync(settingsFile)) return undefined
    const raw = JSON.parse(readFileSync(settingsFile, 'utf8'))
    const value = raw?.[key]
    return typeof value === 'string' && value.length > 0 ? value : undefined
  } catch {
    return undefined
  }
}

export const configuration: Configuration = new Configuration()
