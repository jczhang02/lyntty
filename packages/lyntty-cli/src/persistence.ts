/**
 * Minimal persistence functions for lyntty CLI
 *
 * Handles settings and private key storage in ~/.lyntty/ or local .lyntty/
 */

import { createHash } from 'node:crypto';
import { FileHandle } from 'node:fs/promises'
import { readFile, writeFile, mkdir, open, unlink, rename, stat } from 'node:fs/promises'
import { chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, writeFileSync, readFileSync, unlinkSync, renameSync } from 'node:fs'
import { constants } from 'node:fs'
import { join } from 'node:path';
import { configuration } from '@/configuration'
import * as z from 'zod';
import { encodeBase64, decodeBase64 } from '@/api/encryption';
import type { Metadata } from '@/api/types';
import { logger } from '@/ui/logger';

function fsyncFile(path: string): void {
  const fd = openSync(path, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function fsyncPath(path: string): void {
  try {
    const fd = openSync(path, 'r');
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch {
    // Best-effort on filesystems/platforms that do not support directory fsync.
  }
}

function restrictFileToOwner(path: string): void {
  try {
    chmodSync(path, 0o600);
  } catch {
    // Best-effort hardening for platforms without POSIX permissions.
  }
}

export const SandboxConfigSchema = z.object({
  enabled: z.boolean().default(false),
  workspaceRoot: z.string().optional(),
  sessionIsolation: z.enum(['strict', 'workspace', 'custom']).default('workspace'),
  customWritePaths: z.array(z.string()).default([]),
  denyReadPaths: z.array(z.string()).default(['~/.ssh', '~/.aws', '~/.gnupg']),
  extraWritePaths: z.array(z.string()).default(['/tmp']),
  denyWritePaths: z.array(z.string()).default(['.env']),
  networkMode: z.enum(['blocked', 'allowed', 'custom']).default('allowed'),
  allowedDomains: z.array(z.string()).default([]),
  deniedDomains: z.array(z.string()).default([]),
  allowLocalBinding: z.boolean().default(true),
});

export type SandboxConfig = z.infer<typeof SandboxConfigSchema>;

// Settings schema version: Integer for overall Settings structure compatibility
// Incremented when Settings structure changes (e.g., adding profiles array was v1→v2)
// Used for migration logic in readSettings()
export const SUPPORTED_SCHEMA_VERSION = 2;

interface Settings {
  schemaVersion: number
  onboardingCompleted: boolean
  machineId?: string
  machineIdConfirmedByServer?: boolean
  daemonAutoStartWhenRunningLyntty?: boolean
  chromeMode?: boolean
  sandboxConfig?: SandboxConfig
  serverUrl?: string
}

const defaultSettings: Settings = {
  schemaVersion: SUPPORTED_SCHEMA_VERSION,
  onboardingCompleted: false,
  sandboxConfig: undefined,
}

/**
 * Migrate settings from old schema versions to current
 * Always backwards compatible - preserves all data
 */
function migrateSettings(raw: any, fromVersion: number): any {
  let migrated = { ...raw };

  // Future migrations go here:
  // if (fromVersion < 3) { ... }

  return migrated;
}

/**
 * Daemon state persisted locally (different from API DaemonState)
 * This is written to disk by the daemon to track its local process state
 */
export interface DaemonLocallyPersistedState {
  pid: number;
  httpPort: number;
  piExtensionToken?: string;
  startTime: string;
  startedWithCliVersion: string;
  startedWithReleaseId?: string;
  lastHeartbeat?: string;
  daemonLogPath?: string;
}

export async function readSettings(): Promise<Settings> {
  if (!existsSync(configuration.settingsFile)) {
    return { ...defaultSettings }
  }

  try {
    // Read raw settings
    const content = await readFile(configuration.settingsFile, 'utf8')
    const raw = JSON.parse(content)

    // Check schema version (default to 1 if missing)
    const schemaVersion = raw.schemaVersion ?? 1;

    // Warn if schema version is newer than supported
    if (schemaVersion > SUPPORTED_SCHEMA_VERSION) {
      logger.warn(
        `⚠️ Settings schema v${schemaVersion} > supported v${SUPPORTED_SCHEMA_VERSION}. ` +
        'Update lyntty-cli for full functionality.'
      );
    }

    // Migrate if needed
    const migrated = migrateSettings(raw, schemaVersion);

    if (migrated.sandboxConfig !== undefined) {
      try {
        migrated.sandboxConfig = SandboxConfigSchema.parse(migrated.sandboxConfig);
      } catch (error: any) {
        logger.warn(`⚠️ Invalid sandbox config - skipping. Error: ${error.message}`);
        migrated.sandboxConfig = undefined;
      }
    }

    // Merge with defaults to ensure all required fields exist
    return { ...defaultSettings, ...migrated };
  } catch (error: any) {
    logger.warn(`Failed to read settings: ${error.message}`);
    // Return defaults on any error
    return { ...defaultSettings }
  }
}

export async function writeSettings(settings: Settings): Promise<void> {
  if (!existsSync(configuration.lynttyHomeDir)) {
    await mkdir(configuration.lynttyHomeDir, { recursive: true })
  }

  // Ensure schema version is set before writing
  const settingsWithVersion = {
    ...settings,
    schemaVersion: settings.schemaVersion ?? SUPPORTED_SCHEMA_VERSION
  };

  await writeFile(configuration.settingsFile, JSON.stringify(settingsWithVersion, null, 2))
}

/**
 * Atomically update settings with multi-process safety via file locking
 * @param updater Function that takes current settings and returns updated settings
 * @returns The updated settings
 */
export async function updateSettings(
  updater: (current: Settings) => Settings | Promise<Settings>
): Promise<Settings> {
  // Timing constants
  const LOCK_RETRY_INTERVAL_MS = 100;  // How long to wait between lock attempts
  const MAX_LOCK_ATTEMPTS = 50;        // Maximum number of attempts (5 seconds total)
  const STALE_LOCK_TIMEOUT_MS = 10000; // Consider lock stale after 10 seconds

  const lockFile = configuration.settingsFile + '.lock';
  const tmpFile = configuration.settingsFile + '.tmp';
  let fileHandle;
  let attempts = 0;

  // Acquire exclusive lock with retries
  while (attempts < MAX_LOCK_ATTEMPTS) {
    try {
      // O_CREAT | O_EXCL | O_WRONLY = create exclusively, fail if exists
      fileHandle = await open(lockFile, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
      break;
    } catch (err: any) {
      if (err.code === 'EEXIST') {
        // Lock file exists, wait and retry
        attempts++;
        await new Promise(resolve => setTimeout(resolve, LOCK_RETRY_INTERVAL_MS));

        // Check for stale lock
        try {
          const stats = await stat(lockFile);
          if (Date.now() - stats.mtimeMs > STALE_LOCK_TIMEOUT_MS) {
            await unlink(lockFile).catch(() => { });
          }
        } catch { }
      } else {
        throw err;
      }
    }
  }

  if (!fileHandle) {
    throw new Error(`Failed to acquire settings lock after ${MAX_LOCK_ATTEMPTS * LOCK_RETRY_INTERVAL_MS / 1000} seconds`);
  }

  try {
    // Read current settings with defaults
    const current = await readSettings() || { ...defaultSettings };

    // Apply update
    const updated = await updater(current);

    // Ensure directory exists
    if (!existsSync(configuration.lynttyHomeDir)) {
      await mkdir(configuration.lynttyHomeDir, { recursive: true });
    }

    // Write atomically using rename
    await writeFile(tmpFile, JSON.stringify(updated, null, 2));
    await rename(tmpFile, configuration.settingsFile); // Atomic on POSIX

    return updated;
  } finally {
    // Release lock
    await fileHandle.close();
    await unlink(lockFile).catch(() => { }); // Remove lock file
  }
}

//
// Authentication
//

const credentialsSchema = z.object({
  token: z.string(),
  secret: z.string().base64().nullish(), // Legacy
  encryption: z.object({
    publicKey: z.string().base64(),
    machineKey: z.string().base64()
  }).nullish()
})

export type Credentials = {
  token: string,
  encryption: {
    type: 'legacy', secret: Uint8Array
  } | {
    type: 'dataKey', publicKey: Uint8Array, machineKey: Uint8Array
  }
}

export async function readCredentials(): Promise<Credentials | null> {
  if (!existsSync(configuration.privateKeyFile)) {
    return null
  }
  try {
    const keyBase64 = (await readFile(configuration.privateKeyFile, 'utf8'));
    const credentials = credentialsSchema.parse(JSON.parse(keyBase64));
    if (credentials.secret) {
      return {
        token: credentials.token,
        encryption: {
          type: 'legacy',
          secret: new Uint8Array(Buffer.from(credentials.secret, 'base64'))
        }
      };
    } else if (credentials.encryption) {
      return {
        token: credentials.token,
        encryption: {
          type: 'dataKey',
          publicKey: new Uint8Array(Buffer.from(credentials.encryption.publicKey, 'base64')),
          machineKey: new Uint8Array(Buffer.from(credentials.encryption.machineKey, 'base64'))
        }
      }
    }
  } catch {
    return null
  }
  return null
}

export async function writeCredentialsLegacy(credentials: { secret: Uint8Array, token: string }): Promise<void> {
  if (!existsSync(configuration.lynttyHomeDir)) {
    await mkdir(configuration.lynttyHomeDir, { recursive: true })
  }
  await writeFile(configuration.privateKeyFile, JSON.stringify({
    secret: encodeBase64(credentials.secret),
    token: credentials.token
  }, null, 2), { mode: 0o600 });
  restrictFileToOwner(configuration.privateKeyFile);
}

export async function writeCredentialsDataKey(credentials: { publicKey: Uint8Array, machineKey: Uint8Array, token: string }): Promise<void> {
  if (!existsSync(configuration.lynttyHomeDir)) {
    await mkdir(configuration.lynttyHomeDir, { recursive: true })
  }
  await writeFile(configuration.privateKeyFile, JSON.stringify({
    encryption: { publicKey: encodeBase64(credentials.publicKey), machineKey: encodeBase64(credentials.machineKey) },
    token: credentials.token
  }, null, 2), { mode: 0o600 });
  restrictFileToOwner(configuration.privateKeyFile);
}

export async function clearCredentials(): Promise<void> {
  if (existsSync(configuration.privateKeyFile)) {
    await unlink(configuration.privateKeyFile);
  }
}

export async function clearMachineId(): Promise<void> {
  await updateSettings(settings => ({
    ...settings,
    machineId: undefined
  }));
}

/**
 * Read daemon state from local file
 */
export async function readDaemonState(): Promise<DaemonLocallyPersistedState | null> {
  try {
    if (!existsSync(configuration.daemonStateFile)) {
      return null;
    }
    const content = await readFile(configuration.daemonStateFile, 'utf-8');
    return JSON.parse(content) as DaemonLocallyPersistedState;
  } catch (error) {
    // State corrupted somehow :(
    console.error(`[PERSISTENCE] Daemon state file corrupted: ${configuration.daemonStateFile}`, error);
    return null;
  }
}

/**
 * Write daemon state to local file (synchronously for atomic operation)
 */
export function writeDaemonState(state: DaemonLocallyPersistedState): void {
  writeFileSync(configuration.daemonStateFile, JSON.stringify(state, null, 2), { encoding: 'utf-8', mode: 0o600 });
  try {
    chmodSync(configuration.daemonStateFile, 0o600);
  } catch {
    // Best-effort hardening for existing state files on platforms without chmod.
  }
}

/**
 * Clean up daemon state file and lock file
 */
export async function clearDaemonState(): Promise<void> {
  if (existsSync(configuration.daemonStateFile)) {
    await unlink(configuration.daemonStateFile);
  }
  // Also clean up lock file if it exists (for stale cleanup)
  if (existsSync(configuration.daemonLockFile)) {
    try {
      await unlink(configuration.daemonLockFile);
    } catch {
      // Lock file might be held by running daemon, ignore error
    }
  }
}

/**
 * Acquire an exclusive lock file for the daemon.
 * The lock file proves the daemon is running and prevents multiple instances.
 * Returns the file handle to hold for the daemon's lifetime, or null if locked.
 */
export async function acquireDaemonLock(
  maxAttempts: number = 5,
  delayIncrementMs: number = 200
): Promise<FileHandle | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // O_EXCL ensures we only create if it doesn't exist (atomic lock acquisition)
      const fileHandle = await open(
        configuration.daemonLockFile,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        0o600,
      );
      // Write PID to lock file for debugging
      await fileHandle.writeFile(String(process.pid));
      return fileHandle;
    } catch (error: any) {
      if (error.code === 'EEXIST') {
        // Lock file exists, check if process is still running
        try {
          const lockPid = readFileSync(configuration.daemonLockFile, 'utf-8').trim();
          if (lockPid && !isNaN(Number(lockPid))) {
            try {
              process.kill(Number(lockPid), 0); // Check if process exists
            } catch {
              // Process doesn't exist, remove stale lock
              unlinkSync(configuration.daemonLockFile);
              continue; // Retry acquisition
            }
          }
        } catch {
          // Can't read lock file, might be corrupted
        }
      }

      if (attempt === maxAttempts) {
        return null;
      }
      const delayMs = attempt * delayIncrementMs;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return null;
}

/**
 * Release daemon lock by closing handle and deleting lock file
 */
export async function releaseDaemonLock(lockHandle: FileHandle): Promise<void> {
  try {
    await lockHandle.close();
  } catch { }

  try {
    if (existsSync(configuration.daemonLockFile)) {
      unlinkSync(configuration.daemonLockFile);
    }
  } catch { }
}

// ─── Session persistence (survives daemon restarts) ───

export type PersistedSession = {
  encryptionKey: string;
  encryptionVariant: 'legacy' | 'dataKey';
  seq: number;
  metadataVersion: number;
  agentStateVersion: number;
  metadata: Metadata;
  savedAt: number;
};

type SessionsFile = {
  sessions: Record<string, PersistedSession>;
};

const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export function readPersistedSessions(): Record<string, PersistedSession> {
  try {
    if (!existsSync(configuration.sessionsFile)) return {};
    const data = JSON.parse(readFileSync(configuration.sessionsFile, 'utf-8')) as SessionsFile;
    if (!data?.sessions || typeof data.sessions !== 'object') return {};

    const now = Date.now();
    const sessions: Record<string, PersistedSession> = {};
    for (const [id, session] of Object.entries(data.sessions)) {
      if (now - session.savedAt < SESSION_MAX_AGE_MS) {
        sessions[id] = session;
      }
    }
    return sessions;
  } catch {
    return {};
  }
}

export type PersistedPiCommandOutcome = 'executing' | 'accepted_by_pi' | 'failed';

type PiCommandLedgerFile = {
  version: 1;
  outcomes: Record<string, PersistedPiCommandOutcome>;
};

export function piCommandLedgerPath(piSessionId: string): string {
  const fileName = `${createHash('sha256').update(piSessionId).digest('hex')}.json`;
  return join(configuration.piCommandLedgerDir, fileName);
}

function readPiCommandLedgerFile(piSessionId: string): PiCommandLedgerFile {
  try {
    const path = piCommandLedgerPath(piSessionId);
    if (!existsSync(path)) return { version: 1, outcomes: {} };
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<PiCommandLedgerFile>;
    if (parsed.version !== 1 || !parsed.outcomes || typeof parsed.outcomes !== 'object') {
      return { version: 1, outcomes: {} };
    }
    return { version: 1, outcomes: parsed.outcomes };
  } catch {
    return { version: 1, outcomes: {} };
  }
}

export function readPersistedPiCommandOutcomes(piSessionId: string): {
  acceptedLocalKeys: string[];
  failedLocalKeys: string[];
  uncertainLocalKeys: string[];
} {
  const outcomes = readPiCommandLedgerFile(piSessionId).outcomes;
  const acceptedLocalKeys: string[] = [];
  const failedLocalKeys: string[] = [];
  const uncertainLocalKeys: string[] = [];
  for (const [localKey, outcome] of Object.entries(outcomes)) {
    if (outcome === 'accepted_by_pi') acceptedLocalKeys.push(localKey);
    if (outcome === 'failed') failedLocalKeys.push(localKey);
    if (outcome === 'executing') uncertainLocalKeys.push(localKey);
  }
  return { acceptedLocalKeys, failedLocalKeys, uncertainLocalKeys };
}

export function persistPiCommandOutcome(
  piSessionId: string,
  localKey: string,
  outcome: PersistedPiCommandOutcome,
): void {
  const ledger = readPiCommandLedgerFile(piSessionId);
  ledger.outcomes[localKey] = outcome;
  mkdirSync(configuration.piCommandLedgerDir, { recursive: true, mode: 0o700 });
  const path = piCommandLedgerPath(piSessionId);
  const tmpFile = `${path}.${process.pid}.tmp`;
  writeFileSync(tmpFile, JSON.stringify(ledger), { encoding: 'utf-8', mode: 0o600 });
  restrictFileToOwner(tmpFile);
  fsyncFile(tmpFile);
  renameSync(tmpFile, path);
  restrictFileToOwner(path);
  fsyncPath(configuration.piCommandLedgerDir);
}

export function piCommandBoundaryPath(piSessionId: string): string {
  const fileName = `${createHash('sha256').update(piSessionId).digest('hex')}.json`;
  return join(configuration.piCommandBoundaryDir, fileName);
}

export function readPersistedPiCommandBoundary(piSessionId: string): number | null {
  try {
    const parsed = JSON.parse(readFileSync(piCommandBoundaryPath(piSessionId), 'utf-8')) as { version?: unknown; relaySeq?: unknown };
    return parsed.version === 1 && typeof parsed.relaySeq === 'number' && Number.isSafeInteger(parsed.relaySeq) && parsed.relaySeq >= 0
      ? parsed.relaySeq
      : null;
  } catch {
    return null;
  }
}

export function persistPiCommandBoundary(piSessionId: string, relaySeq: number): void {
  mkdirSync(configuration.piCommandBoundaryDir, { recursive: true, mode: 0o700 });
  const path = piCommandBoundaryPath(piSessionId);
  const tmpFile = `${path}.${process.pid}.tmp`;
  writeFileSync(tmpFile, JSON.stringify({ version: 1, relaySeq }), { encoding: 'utf-8', mode: 0o600 });
  restrictFileToOwner(tmpFile);
  fsyncFile(tmpFile);
  renameSync(tmpFile, path);
  restrictFileToOwner(path);
  fsyncPath(configuration.piCommandBoundaryDir);
}

export function piHistoryWatermarkPath(piSessionId: string): string {
  const fileName = `${createHash('sha256').update(piSessionId).digest('hex')}.json`;
  return join(configuration.piHistoryWatermarkDir, fileName);
}

export function readPersistedPiHistoryWatermark(piSessionId: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(piHistoryWatermarkPath(piSessionId), 'utf-8')) as { version?: unknown; entryId?: unknown };
    return parsed.version === 1 && typeof parsed.entryId === 'string' ? parsed.entryId : null;
  } catch {
    return null;
  }
}

export function persistPiHistoryWatermark(piSessionId: string, entryId: string): void {
  mkdirSync(configuration.piHistoryWatermarkDir, { recursive: true, mode: 0o700 });
  const path = piHistoryWatermarkPath(piSessionId);
  const tmpFile = `${path}.${process.pid}.tmp`;
  writeFileSync(tmpFile, JSON.stringify({ version: 1, entryId }), { encoding: 'utf-8', mode: 0o600 });
  restrictFileToOwner(tmpFile);
  fsyncFile(tmpFile);
  renameSync(tmpFile, path);
  restrictFileToOwner(path);
  fsyncPath(configuration.piHistoryWatermarkDir);
}

export function persistSession(sessionId: string, session: PersistedSession): void {
  try {
    const existing = readPersistedSessions();
    existing[sessionId] = session;
    const tmpFile = configuration.sessionsFile + '.tmp';
    writeFileSync(tmpFile, JSON.stringify({ sessions: existing }, null, 2), { encoding: 'utf-8', mode: 0o600 });
    restrictFileToOwner(tmpFile);
    renameSync(tmpFile, configuration.sessionsFile);
    restrictFileToOwner(configuration.sessionsFile);
  } catch (error) {
    logger.debug(`[PERSISTENCE] Failed to persist session ${sessionId}:`, error);
  }
}
