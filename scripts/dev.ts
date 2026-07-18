#!/usr/bin/env bun

import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
import {
  chmod,
  mkdir,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

type CommandName = 'up' | 'check' | 'verify' | 'down';
type SupervisorRole = 'relay' | 'daemon' | 'metro' | 'android';
type StateStatus = 'starting' | 'running' | 'stopped' | 'failed';
type AllocationStatus = 'provisional' | 'active';

interface ParsedArgs {
  command: CommandName;
  json: boolean;
  android: boolean;
}

interface DevLayout {
  canonicalRoot: string;
  worktreeHash: string;
  stateDir: string;
  homeDir: string;
  lynttyHomeDir: string;
  relayDataDir: string;
  pgliteDir: string;
  logsDir: string;
  evidenceDir: string;
  stateFile: string;
  accessFile: string;
  settingsFile: string;
  masterSecretFile: string;
  commonGitDir: string;
  coordinationFile: string;
  lockDir: string;
  launchDir: string;
  lifecycleLockDir: string;
  scriptPath: string;
  relaySource: string;
  cliSource: string;
  daemonSource: string;
  appDir: string;
  expoCli: string;
}

interface SupervisorRecord {
  pid: number;
  role: SupervisorRole;
  processStartToken?: string;
}

interface LaunchIntent {
  schemaVersion: 1;
  instanceId: string;
  canonicalRoot: string;
  worktreeHash: string;
  role: SupervisorRole;
  launchId: string;
  createdAt: string;
  expiresAt: string;
}

interface SupervisorReceipt {
  schemaVersion: 1;
  instanceId: string;
  canonicalRoot: string;
  worktreeHash: string;
  role: SupervisorRole;
  launchId: string;
  pid: number;
  processStartToken: string;
  createdAt: string;
}

interface DevState {
  schemaVersion: 1;
  status: StateStatus;
  canonicalRoot: string;
  worktreeHash: string;
  instanceId: string;
  ports: {
    relay: number;
    metro: number;
  };
  startedAt: string;
  stoppedAt?: string;
  supervisors: SupervisorRecord[];
  androidRequested: boolean;
}

interface AccessFile {
  secret: string;
  token: string;
}

interface SettingsFile {
  schemaVersion: number;
  onboardingCompleted: boolean;
  machineId: string;
  serverUrl: string;
}

interface CoordinationAllocation {
  schemaVersion: 1;
  status: AllocationStatus;
  canonicalRoot: string;
  worktreeHash: string;
  instanceId: string;
  relayPort: number;
  metroPort: number;
  relayPid: number;
  relayStartToken?: string;
  leaseExpiresAt?: string;
  startedAt: string;
}

interface CoordinationFile {
  schemaVersion: 1;
  allocations: CoordinationAllocation[];
}

interface LockOwner {
  schemaVersion: 1;
  id: string;
  pid: number;
  processStartToken: string;
}

interface CoordinationLock {
  release(): Promise<void>;
}

interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface OwnershipResult {
  pid: number;
  role: SupervisorRole;
  alive: boolean;
  owned: boolean;
  reason?: string;
}

interface ProcessIdentity {
  cwd: string;
  command: string;
  argv: string[];
  environment: string[];
}

interface ProcessGroupMember {
  pid: number;
  ppid: number;
  pgid: number;
  stat: string;
}

interface OwnedProcessGroup {
  pgid: number;
  members: ProcessGroupMember[];
}

interface PublicState {
  schemaVersion: 1;
  status: StateStatus;
  canonicalRoot: string;
  worktreeHash: string;
  stateDir: string;
  ports: DevState['ports'];
  startedAt: string;
  stoppedAt?: string;
  supervisors: SupervisorRecord[];
  androidRequested: boolean;
  instanceIdPresent: boolean;
}

interface HealthResult {
  healthy: boolean;
  status: number | null;
}

interface MachineResult {
  ok: boolean;
  status: number | null;
  count: number;
  machines: unknown[];
}

const INTERNAL_SUPERVISOR = '__supervisor';
const STATE_SCHEMA_VERSION = 1 as const;
const POLL_INTERVAL_MS = 50;
const DEFAULT_TIMEOUT_MS = 30_000;
const LOCK_TIMEOUT_MS = 15_000;
const LIFECYCLE_LOCK_TIMEOUT_MS = 120_000;
const PROVISIONAL_LEASE_MS = 60_000;
const LAUNCH_INTENT_TTL_MS = 30_000;
const LAUNCH_RECEIPT_TIMEOUT_MS = 10_000;
const PORT_MIN = 41_000;
const PORT_MAX = 60_000;
const PORT_BLOCK_SIZE = 2;
const ROLE_VALUES: readonly SupervisorRole[] = ['relay', 'daemon', 'metro', 'android'];

// Every development artifact lives under an isolated mode-0700 state root.
// Keep files private even when a child uses default create modes.
process.umask(0o077);

class ReportedCommandError extends Error {
  readonly reported = true;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isErrno(error: unknown, code: string): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === code;
}

function copyEnvironment(): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) environment[key] = value;
  }
  return environment;
}

function assertSupportedPlatform(): void {
  if (process.platform !== 'linux' && process.platform !== 'darwin') {
    throw new Error(`bun dev is supported only on Linux and macOS (received ${process.platform})`);
  }
}

function usage(command?: CommandName): string {
  if (command === 'up') return 'Usage: bun dev:up [--android] [--json]';
  if (command) return `Usage: bun dev:${command} [--json]`;
  return 'Usage: bun dev:up [--android] [--json] | bun dev:check [--json] | bun dev:verify [--json] | bun dev:down [--json]';
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const command = argv[0] as CommandName | undefined;
  if (command !== 'up' && command !== 'check' && command !== 'verify' && command !== 'down') {
    throw new Error(usage());
  }

  let json = false;
  let android = false;
  for (const arg of argv.slice(1)) {
    if (arg === '--json') {
      if (json) throw new Error(`Duplicate --json\n${usage(command)}`);
      json = true;
      continue;
    }
    if (arg === '--android' && command === 'up') {
      if (android) throw new Error(`Duplicate --android\n${usage(command)}`);
      android = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n${usage(command)}`);
  }

  return { command, json, android };
}

async function runCaptured(
  cmd: string[],
  options: { cwd: string; env: Record<string, string> },
): Promise<ProcessResult> {
  const child = Bun.spawn({
    cmd,
    cwd: options.cwd,
    env: options.env,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

async function runGit(args: string[], cwd: string): Promise<string> {
  const result = await runCaptured(['git', ...args], { cwd, env: copyEnvironment() });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim() || result.stdout.trim() || 'unknown error'}`);
  }
  return result.stdout.trim();
}

async function resolveLayout(): Promise<DevLayout> {
  const invocationCwd = resolve(process.cwd());
  const gitRootText = await runGit(['rev-parse', '--show-toplevel'], invocationCwd);
  const commonDirText = await runGit(['rev-parse', '--git-common-dir'], invocationCwd);
  const canonicalRoot = await realpath(resolve(gitRootText));
  const commonGitDir = await realpath(resolve(canonicalRoot, commonDirText));
  const scriptPath = await realpath(resolve(import.meta.dir, 'dev.ts'));
  const testNamespace = process.env.LYNTTY_DEV_TEST_NAMESPACE;
  if (testNamespace !== undefined) {
    if (process.env.LYNTTY_DEV_ALLOW_TEST_HOOKS !== '1') {
      throw new Error('Development test namespace requires explicit test hooks');
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(testNamespace)) {
      throw new Error('Development test namespace is invalid');
    }
  }
  const worktreeIdentity = testNamespace === undefined
    ? canonicalRoot
    : `${canonicalRoot}\0test:${testNamespace}`;
  const worktreeHash = createHash('sha256').update(worktreeIdentity).digest('hex').slice(0, 16);
  const stateDir = join(canonicalRoot, 'dist', 'dev', worktreeHash);
  const homeDir = join(stateDir, 'home');
  const lynttyHomeDir = join(stateDir, 'lyntty');
  const relayDataDir = join(stateDir, 'relay');
  const pgliteDir = join(relayDataDir, 'pglite');
  const logsDir = join(stateDir, 'logs');
  const evidenceDir = join(stateDir, 'evidence');
  const stateFile = join(stateDir, 'state.json');
  const accessFile = join(lynttyHomeDir, 'access.key');
  const settingsFile = join(lynttyHomeDir, 'settings.json');
  const masterSecretFile = join(stateDir, 'secrets', 'relay-master.secret');
  const appDir = join(canonicalRoot, 'packages', 'lyntty-app');

  return {
    canonicalRoot,
    worktreeHash,
    stateDir,
    homeDir,
    lynttyHomeDir,
    relayDataDir,
    pgliteDir,
    logsDir,
    evidenceDir,
    stateFile,
    accessFile,
    settingsFile,
    masterSecretFile,
    commonGitDir,
    coordinationFile: join(commonGitDir, 'lyntty-dev-ports.json'),
    lockDir: join(commonGitDir, 'lyntty-dev.lock'),
    launchDir: join(stateDir, 'launches'),
    lifecycleLockDir: join(stateDir, 'lifecycle.lock'),
    scriptPath,
    relaySource: join(canonicalRoot, 'packages', 'lyntty-relay', 'sources', 'standalone.ts'),
    cliSource: join(canonicalRoot, 'packages', 'lyntty-cli', 'src', 'index.ts'),
    daemonSource: join(canonicalRoot, 'packages', 'lyntty-cli', 'src', 'daemon', 'entry.ts'),
    appDir,
    expoCli: join(appDir, 'node_modules', 'expo', 'bin', 'cli'),
  };
}

async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  try {
    await chmod(path, 0o700);
  } catch {
    // chmod is best-effort on filesystems without POSIX permissions.
  }
}

async function writeJsonAtomically(path: string, value: unknown, mode = 0o600): Promise<void> {
  await ensureDirectory(dirname(path));
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode });
    try {
      await chmod(temporaryPath, mode);
    } catch {
      // chmod is best-effort on filesystems without POSIX permissions.
    }
    await rename(temporaryPath, path);
    try {
      await chmod(path, mode);
    } catch {
      // chmod is best-effort on filesystems without POSIX permissions.
    }
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function readJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return null;
    throw error;
  }
}

function launchIntentPath(layout: DevLayout, launchId: string): string {
  return join(layout.launchDir, `intent-${launchId}.json`);
}

function launchClaimPath(layout: DevLayout, launchId: string): string {
  return join(layout.launchDir, `claim-${launchId}.json`);
}

function launchReceiptPath(layout: DevLayout, launchId: string): string {
  return join(layout.launchDir, `receipt-${launchId}.json`);
}

function parseLaunchIntent(value: unknown): LaunchIntent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Development launch intent is corrupted');
  }
  const raw = value as Record<string, unknown>;
  const createdAt = typeof raw.createdAt === 'string' ? Date.parse(raw.createdAt) : Number.NaN;
  const expiresAt = typeof raw.expiresAt === 'string' ? Date.parse(raw.expiresAt) : Number.NaN;
  if (
    raw.schemaVersion !== 1
    || typeof raw.instanceId !== 'string'
    || raw.instanceId.length === 0
    || typeof raw.canonicalRoot !== 'string'
    || raw.canonicalRoot.length === 0
    || typeof raw.worktreeHash !== 'string'
    || raw.worktreeHash.length === 0
    || !isSupervisorRole(raw.role)
    || typeof raw.launchId !== 'string'
    || raw.launchId.length === 0
    || !Number.isFinite(createdAt)
    || !Number.isFinite(expiresAt)
    || expiresAt <= createdAt
    || expiresAt - createdAt > LAUNCH_INTENT_TTL_MS + 1_000
  ) {
    throw new Error('Development launch intent is corrupted');
  }
  return {
    schemaVersion: 1,
    instanceId: raw.instanceId,
    canonicalRoot: raw.canonicalRoot,
    worktreeHash: raw.worktreeHash,
    role: raw.role,
    launchId: raw.launchId,
    createdAt: raw.createdAt as string,
    expiresAt: raw.expiresAt as string,
  };
}

function parseSupervisorReceipt(value: unknown): SupervisorReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Development supervisor receipt is corrupted');
  }
  const raw = value as Record<string, unknown>;
  if (
    raw.schemaVersion !== 1
    || typeof raw.instanceId !== 'string'
    || raw.instanceId.length === 0
    || typeof raw.canonicalRoot !== 'string'
    || raw.canonicalRoot.length === 0
    || typeof raw.worktreeHash !== 'string'
    || raw.worktreeHash.length === 0
    || !isSupervisorRole(raw.role)
    || typeof raw.launchId !== 'string'
    || raw.launchId.length === 0
    || !Number.isSafeInteger(raw.pid)
    || (raw.pid as number) <= 0
    || typeof raw.processStartToken !== 'string'
    || raw.processStartToken.length === 0
    || typeof raw.createdAt !== 'string'
    || !Number.isFinite(Date.parse(raw.createdAt))
  ) {
    throw new Error('Development supervisor receipt is corrupted');
  }
  return {
    schemaVersion: 1,
    instanceId: raw.instanceId,
    canonicalRoot: raw.canonicalRoot,
    worktreeHash: raw.worktreeHash,
    role: raw.role,
    launchId: raw.launchId,
    pid: raw.pid as number,
    processStartToken: raw.processStartToken,
    createdAt: raw.createdAt,
  };
}

interface LaunchMetadataEntry<T> {
  path: string;
  value: T;
}

async function readLaunchMetadata(layout: DevLayout): Promise<{
  intents: LaunchMetadataEntry<LaunchIntent>[];
  claims: LaunchMetadataEntry<LaunchIntent>[];
  receipts: LaunchMetadataEntry<SupervisorReceipt>[];
}> {
  let names: string[];
  try {
    names = await readdir(layout.launchDir);
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return { intents: [], claims: [], receipts: [] };
    throw error;
  }
  const intents: LaunchMetadataEntry<LaunchIntent>[] = [];
  const claims: LaunchMetadataEntry<LaunchIntent>[] = [];
  const receipts: LaunchMetadataEntry<SupervisorReceipt>[] = [];
  for (const name of names) {
    const path = join(layout.launchDir, name);
    if (name.startsWith('intent-') && name.endsWith('.json')) {
      const value = await readJson(path);
      if (value === null) throw new Error('Development launch metadata changed during reconciliation; retry');
      const parsed = parseLaunchIntent(value);
      if (path !== launchIntentPath(layout, parsed.launchId)) throw new Error('Development launch intent filename is corrupted');
      intents.push({ path, value: parsed });
    } else if (name.startsWith('claim-') && name.endsWith('.json')) {
      const value = await readJson(path);
      if (value === null) throw new Error('Development launch metadata changed during reconciliation; retry');
      const parsed = parseLaunchIntent(value);
      if (path !== launchClaimPath(layout, parsed.launchId)) throw new Error('Development launch claim filename is corrupted');
      claims.push({ path, value: parsed });
    } else if (name.startsWith('receipt-') && name.endsWith('.json')) {
      const value = await readJson(path);
      if (value === null) throw new Error('Development launch metadata changed during reconciliation; retry');
      const parsed = parseSupervisorReceipt(value);
      if (path !== launchReceiptPath(layout, parsed.launchId)) throw new Error('Development supervisor receipt filename is corrupted');
      receipts.push({ path, value: parsed });
    }
  }
  return { intents, claims, receipts };
}

async function removeLaunchMetadata(paths: readonly string[]): Promise<void> {
  await Promise.all(paths.map(path => rm(path, { force: true })));
}

async function cancelLaunchIntent(path: string): Promise<string> {
  const cancelledPath = `${path}.cancelled-${randomUUID()}`;
  try {
    await rename(path, cancelledPath);
  } catch (error) {
    if (isErrno(error, 'ENOENT')) throw new Error('Development launch intent was claimed concurrently; retry');
    throw error;
  }
  return cancelledPath;
}

function isSupervisorRole(value: unknown): value is SupervisorRole {
  return typeof value === 'string' && ROLE_VALUES.includes(value as SupervisorRole);
}

function parseState(value: unknown): DevState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Development state is corrupted');
  const raw = value as Record<string, unknown>;
  const ports = raw.ports;
  const supervisors = raw.supervisors;
  if (
    raw.schemaVersion !== STATE_SCHEMA_VERSION
    || (raw.status !== 'starting' && raw.status !== 'running' && raw.status !== 'stopped' && raw.status !== 'failed')
    || typeof raw.canonicalRoot !== 'string'
    || typeof raw.worktreeHash !== 'string'
    || typeof raw.instanceId !== 'string'
    || raw.instanceId.length === 0
    || typeof raw.startedAt !== 'string'
    || !ports
    || typeof ports !== 'object'
    || Array.isArray(ports)
    || !Number.isSafeInteger((ports as Record<string, unknown>).relay)
    || !Number.isSafeInteger((ports as Record<string, unknown>).metro)
    || !Array.isArray(supervisors)
    || typeof raw.androidRequested !== 'boolean'
  ) {
    throw new Error('Development state is corrupted');
  }

  const parsedSupervisors: SupervisorRecord[] = [];
  for (const item of supervisors) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Development state is corrupted');
    const record = item as Record<string, unknown>;
    if (
      !Number.isSafeInteger(record.pid)
      || (record.pid as number) <= 0
      || !isSupervisorRole(record.role)
      || (record.processStartToken !== undefined
        && (typeof record.processStartToken !== 'string' || record.processStartToken.length === 0))
    ) {
      throw new Error('Development state is corrupted');
    }
    parsedSupervisors.push({
      pid: record.pid as number,
      role: record.role,
      ...(typeof record.processStartToken === 'string' ? { processStartToken: record.processStartToken } : {}),
    });
  }

  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    status: raw.status as StateStatus,
    canonicalRoot: raw.canonicalRoot,
    worktreeHash: raw.worktreeHash,
    instanceId: raw.instanceId,
    ports: {
      relay: (ports as Record<string, unknown>).relay as number,
      metro: (ports as Record<string, unknown>).metro as number,
    },
    startedAt: raw.startedAt,
    ...(typeof raw.stoppedAt === 'string' ? { stoppedAt: raw.stoppedAt } : {}),
    supervisors: parsedSupervisors,
    androidRequested: raw.androidRequested,
  };
}

async function loadState(layout: DevLayout): Promise<DevState | null> {
  const value = await readJson(layout.stateFile);
  return value === null ? null : parseState(value);
}

async function writeState(layout: DevLayout, state: DevState): Promise<void> {
  await writeJsonAtomically(layout.stateFile, state, 0o600);
}

function publicState(layout: DevLayout, state: DevState): PublicState {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    status: state.status,
    canonicalRoot: state.canonicalRoot,
    worktreeHash: state.worktreeHash,
    stateDir: layout.stateDir,
    ports: state.ports,
    startedAt: state.startedAt,
    ...(state.stoppedAt ? { stoppedAt: state.stoppedAt } : {}),
    supervisors: state.supervisors.map(({ pid, role }) => ({ pid, role })),
    androidRequested: state.androidRequested,
    instanceIdPresent: state.instanceId.length > 0,
  };
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isErrno(error, 'EPERM');
  }
}

async function processStartToken(pid: number): Promise<string | null> {
  if (process.platform === 'linux') {
    try {
      const statLine = await readFile(`/proc/${pid}/stat`, 'utf8');
      const fields = statLine.slice(statLine.lastIndexOf(')') + 2).trim().split(/\s+/);
      const startTime = fields[19];
      return startTime ? `linux:${startTime}` : null;
    } catch {
      return null;
    }
  }
  if (process.platform === 'darwin') return readDarwinProcessStartToken(pid);
  return null;
}

function parseLockOwner(value: unknown): LockOwner | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (
    raw.schemaVersion !== 1
    || typeof raw.id !== 'string'
    || raw.id.length === 0
    || !Number.isSafeInteger(raw.pid)
    || (raw.pid as number) <= 0
    || typeof raw.processStartToken !== 'string'
    || raw.processStartToken.length === 0
  ) return null;
  return {
    schemaVersion: 1,
    id: raw.id,
    pid: raw.pid as number,
    processStartToken: raw.processStartToken,
  };
}

async function lockOwnerIsDemonstrablyDead(path: string): Promise<boolean> {
  let owner: LockOwner | null;
  try {
    owner = parseLockOwner(JSON.parse(await readFile(join(path, 'owner.json'), 'utf8')) as unknown);
  } catch {
    // An incomplete or corrupted lock is not proof that its owner is dead.
    return false;
  }
  if (!owner) return false;
  if (!processIsAlive(owner.pid)) return true;
  const actualStartToken = await processStartToken(owner.pid);
  return actualStartToken !== null && actualStartToken !== owner.processStartToken;
}

async function acquireAtomicLock(
  lockPath: string,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<CoordinationLock> {
  const deadline = Date.now() + timeoutMs;
  const currentProcessStartToken = await processStartToken(process.pid);
  if (!currentProcessStartToken) throw new Error('Unable to prove the development lock owner process identity');
  const owner: LockOwner = {
    schemaVersion: 1,
    id: randomUUID(),
    pid: process.pid,
    processStartToken: currentProcessStartToken,
  };
  await mkdir(dirname(lockPath), { recursive: true, mode: 0o700 });

  while (true) {
    const stagingPath = `${lockPath}.${owner.id}.candidate`;
    await rm(stagingPath, { recursive: true, force: true });
    await mkdir(stagingPath, { recursive: false, mode: 0o700 });
    await writeJsonAtomically(join(stagingPath, 'owner.json'), owner, 0o600);
    try {
      await rename(stagingPath, lockPath);
      return {
        async release(): Promise<void> {
          try {
            const current = parseLockOwner(JSON.parse(await readFile(join(lockPath, 'owner.json'), 'utf8')) as unknown);
            if (current?.id === owner.id && current.processStartToken === owner.processStartToken) {
              await rm(lockPath, { recursive: true, force: true });
            }
          } catch (error) {
            if (!isErrno(error, 'ENOENT')) throw error;
          }
        },
      };
    } catch (error) {
      await rm(stagingPath, { recursive: true, force: true });
      if (!isErrno(error, 'EEXIST') && !isErrno(error, 'ENOTEMPTY')) throw error;
    }

    // Condition first: inspect and reclaim only an owner whose process identity
    // is demonstrably gone, then check the deadline before sleeping. A
    // malformed owner is deliberately not treated as stale.
    if (await lockOwnerIsDemonstrablyDead(lockPath)) {
      const stalePath = `${lockPath}.${owner.id}.stale`;
      try {
        await rename(lockPath, stalePath);
        await rm(stalePath, { recursive: true, force: true });
      } catch (error) {
        if (!isErrno(error, 'ENOENT')) throw error;
      }
      continue;
    }
    if (Date.now() >= deadline) throw new Error(timeoutMessage);
    await Bun.sleep(Math.min(POLL_INTERVAL_MS, deadline - Date.now()));
  }
}

async function acquireCoordinationLock(layout: DevLayout): Promise<CoordinationLock> {
  return acquireAtomicLock(
    layout.lockDir,
    LOCK_TIMEOUT_MS,
    'Timed out waiting for the shared Lyntty development coordination lock',
  );
}

async function acquireLifecycleLock(layout: DevLayout): Promise<CoordinationLock> {
  return acquireAtomicLock(
    layout.lifecycleLockDir,
    LIFECYCLE_LOCK_TIMEOUT_MS,
    'Timed out waiting for the worktree development lifecycle lock',
  );
}

function parseCoordination(value: unknown): CoordinationFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Shared development port metadata is corrupted');
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== 1 || !Array.isArray(raw.allocations)) {
    throw new Error('Shared development port metadata is corrupted');
  }
  const allocations: CoordinationAllocation[] = [];
  for (const item of raw.allocations) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Shared development port metadata is corrupted');
    const record = item as Record<string, unknown>;
    const status = record.status === undefined ? 'active' : record.status;
    const relayPid = record.relayPid;
    if (
      record.schemaVersion !== 1
      || (status !== 'provisional' && status !== 'active')
      || typeof record.canonicalRoot !== 'string'
      || typeof record.worktreeHash !== 'string'
      || typeof record.instanceId !== 'string'
      || !Number.isSafeInteger(record.relayPort)
      || !Number.isSafeInteger(record.metroPort)
      || !Number.isSafeInteger(relayPid)
      || (status === 'active' && (relayPid as number) <= 0)
      || (status === 'provisional' && (relayPid as number) < 0)
      || typeof record.startedAt !== 'string'
      || (record.leaseExpiresAt !== undefined && typeof record.leaseExpiresAt !== 'string')
      || (record.relayStartToken !== undefined && typeof record.relayStartToken !== 'string')
    ) throw new Error('Shared development port metadata is corrupted');
    if (status === 'provisional' && typeof record.leaseExpiresAt !== 'string') {
      throw new Error('Shared development port metadata is corrupted');
    }
    allocations.push({
      schemaVersion: 1,
      status,
      canonicalRoot: record.canonicalRoot,
      worktreeHash: record.worktreeHash,
      instanceId: record.instanceId,
      relayPort: record.relayPort as number,
      metroPort: record.metroPort as number,
      relayPid: relayPid as number,
      ...(typeof record.relayStartToken === 'string' ? { relayStartToken: record.relayStartToken } : {}),
      ...(typeof record.leaseExpiresAt === 'string' ? { leaseExpiresAt: record.leaseExpiresAt } : {}),
      startedAt: record.startedAt,
    });
  }
  return { schemaVersion: 1, allocations };
}

async function readCoordination(layout: DevLayout): Promise<CoordinationFile> {
  const value = await readJson(layout.coordinationFile);
  return value === null ? { schemaVersion: 1, allocations: [] } : parseCoordination(value);
}

async function writeCoordination(layout: DevLayout, value: CoordinationFile): Promise<void> {
  await writeJsonAtomically(layout.coordinationFile, value, 0o600);
}

async function probePortBlock(relayPort: number, metroPort: number): Promise<boolean> {
  let relayListener: ReturnType<typeof Bun.listen> | null = null;
  let metroListener: ReturnType<typeof Bun.listen> | null = null;
  try {
    relayListener = Bun.listen({ hostname: '127.0.0.1', port: relayPort, socket: { data() {} } });
    metroListener = Bun.listen({ hostname: '127.0.0.1', port: metroPort, socket: { data() {} } });
    return true;
  } catch {
    return false;
  } finally {
    relayListener?.stop(true);
    metroListener?.stop(true);
  }
}

function hashNumber(hash: string): number {
  return Number.parseInt(hash.slice(0, 12), 16);
}

async function allocationPortsAreAvailable(allocation: CoordinationAllocation): Promise<boolean> {
  return probePortBlock(allocation.relayPort, allocation.metroPort);
}

async function reconcileCoordinationAllocations(
  coordination: CoordinationFile,
): Promise<CoordinationFile> {
  const retained: CoordinationAllocation[] = [];
  for (const allocation of coordination.allocations) {
    if (allocation.status === 'provisional') {
      const leaseUntil = Date.parse(allocation.leaseExpiresAt ?? '');
      // An unexpired provisional is a hard reservation, even when the process
      // which created it has disappeared. This is the crash gap protection.
      if (Number.isFinite(leaseUntil) && leaseUntil > Date.now()) {
        retained.push(allocation);
        continue;
      }
      // Recycle an expired provisional only after proving that neither port is
      // occupied. An occupied block remains conservatively reserved.
      if (!(await allocationPortsAreAvailable(allocation))) retained.push(allocation);
      continue;
    }

    let relayStillMatches = processIsAlive(allocation.relayPid);
    if (relayStillMatches && allocation.relayStartToken) {
      const actualStartToken = await processStartToken(allocation.relayPid);
      relayStillMatches = actualStartToken === null || actualStartToken === allocation.relayStartToken;
    }
    if (relayStillMatches || !(await allocationPortsAreAvailable(allocation))) retained.push(allocation);
  }
  return { schemaVersion: 1, allocations: retained };
}

async function choosePortBlock(layout: DevLayout, coordination: CoordinationFile): Promise<{ relay: number; metro: number }> {
  const blockCount = Math.floor((PORT_MAX - PORT_MIN) / PORT_BLOCK_SIZE);
  const firstBlock = hashNumber(layout.worktreeHash) % blockCount;
  const reservedAllocations = coordination.allocations;
  for (let offset = 0; offset < blockCount; offset += 1) {
    const block = (firstBlock + offset) % blockCount;
    const relay = PORT_MIN + block * PORT_BLOCK_SIZE;
    const metro = relay + 1;
    const reserved = reservedAllocations.some(item => item.relayPort === relay || item.metroPort === relay || item.relayPort === metro || item.metroPort === metro);
    if (reserved) continue;
    if (await probePortBlock(relay, metro)) return { relay, metro };
  }
  throw new Error('No available aligned Relay/Metro development port block was found');
}

function baseRuntimeEnvironment(layout: DevLayout, state: DevState): Record<string, string> {
  const env = copyEnvironment();
  const isolatedConfig = join(layout.homeDir, '.config');
  const isolatedData = join(layout.homeDir, '.local', 'share');
  const isolatedCache = join(layout.homeDir, '.cache');
  env.HOME = layout.homeDir;
  env.USERPROFILE = layout.homeDir;
  env.LYNTTY_HOME_DIR = layout.lynttyHomeDir;
  env.LYNTTY_SERVER_URL = `http://127.0.0.1:${state.ports.relay}`;
  env.LYNTTY_DISABLE_CAFFEINATE = '1';
  env.LYNTTY_DAEMON_PROCESS = '1';
  env.LYNTTY_VARIANT = 'dev';
  env.PI_CODING_AGENT_DIR = join(layout.homeDir, '.pi', 'agent');
  env.XDG_CONFIG_HOME = isolatedConfig;
  env.XDG_DATA_HOME = isolatedData;
  env.XDG_CACHE_HOME = isolatedCache;
  env.LYNTTY_DEV_INSTANCE_ID = state.instanceId;
  env.LYNTTY_DEV_STATE_DIR = layout.stateDir;
  env.LYNTTY_DEV_RELAY_PORT = String(state.ports.relay);
  env.LYNTTY_DEV_METRO_PORT = String(state.ports.metro);
  env.LYNTTY_DEV_ROOT = layout.canonicalRoot;
  env.LYNTTY_DEV_WORKTREE_HASH = layout.worktreeHash;
  return env;
}

function relayEnvironment(layout: DevLayout, state: DevState, masterSecret: string): Record<string, string> {
  const env = baseRuntimeEnvironment(layout, state);
  delete env.DATABASE_URL;
  delete env.REDIS_URL;
  env.DATA_DIR = layout.relayDataDir;
  env.PGLITE_DIR = layout.pgliteDir;
  env.DB_PROVIDER = 'pglite';
  env.LYNTTY_MASTER_SECRET = masterSecret;
  env.HOST = '127.0.0.1';
  env.PORT = String(state.ports.relay);
  env.NODE_ENV = 'development';
  env.LYNTTY_DEV_ROLE = 'relay-supervisor';
  return env;
}

function daemonEnvironment(layout: DevLayout, state: DevState): Record<string, string> {
  const env = baseRuntimeEnvironment(layout, state);
  env.LYNTTY_DEV_ROLE = 'daemon-supervisor';
  return env;
}

function androidEnvironment(
  layout: DevLayout,
  state: DevState,
  access: AccessFile,
  role: 'metro-supervisor' | 'android-supervisor',
): Record<string, string> {
  const env = baseRuntimeEnvironment(layout, state);
  const emulatorRelayUrl = `http://10.0.2.2:${state.ports.relay}`;
  env.EXPO_PUBLIC_SERVER_URL = emulatorRelayUrl;
  env.EXPO_PUBLIC_LYNTTY_SERVER_URL = emulatorRelayUrl;
  env.EXPO_PUBLIC_DEV_TOKEN = access.token;
  env.EXPO_PUBLIC_DEV_SECRET = access.secret;
  env.APP_ENV = 'development';
  env.RCT_METRO_PORT = String(state.ports.metro);
  env.LYNTTY_DEV_ANDROID_REQUESTED = '1';
  env.LYNTTY_DEV_ROLE = role;
  return env;
}

function logPath(layout: DevLayout, role: SupervisorRole): string {
  return join(layout.logsDir, `${role}.log`);
}

interface SupervisorLaunch {
  child: Bun.Subprocess;
  record: SupervisorRecord;
  intentPath: string;
  claimPath: string;
  receiptPath: string;
}

async function writeLaunchIntent(
  layout: DevLayout,
  state: DevState,
  role: SupervisorRole,
): Promise<LaunchIntent> {
  const launchId = randomUUID();
  const createdAt = new Date();
  const intent: LaunchIntent = {
    schemaVersion: 1,
    instanceId: state.instanceId,
    canonicalRoot: layout.canonicalRoot,
    worktreeHash: layout.worktreeHash,
    role,
    launchId,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + LAUNCH_INTENT_TTL_MS).toISOString(),
  };
  await writeJsonAtomically(launchIntentPath(layout, launchId), intent, 0o600);
  return intent;
}

async function writeSupervisorReceipt(layout: DevLayout, role: SupervisorRole): Promise<SupervisorReceipt> {
  const instanceId = process.env.LYNTTY_DEV_INSTANCE_ID;
  const stateDir = process.env.LYNTTY_DEV_STATE_DIR;
  const launchId = process.env.LYNTTY_DEV_LAUNCH_ID;
  if (!instanceId || stateDir !== layout.stateDir || !launchId) {
    throw new Error('Internal development supervisors require a launch intent');
  }
  if (process.env.LYNTTY_DEV_ROOT !== layout.canonicalRoot
    || process.env.LYNTTY_DEV_WORKTREE_HASH !== layout.worktreeHash
    || process.env.LYNTTY_DEV_ROLE !== `${role}-supervisor`) {
    throw new Error('Internal development supervisor launch identity is corrupted');
  }
  const intentPath = launchIntentPath(layout, launchId);
  const claimPath = launchClaimPath(layout, launchId);
  try {
    await rename(intentPath, claimPath);
  } catch (error) {
    if (isErrno(error, 'ENOENT')) throw new Error('Internal development supervisor lost its launch-intent claim');
    throw error;
  }
  const intentValue = await readJson(claimPath);
  if (intentValue === null) throw new Error('Internal development supervisor launch claim is missing');
  const intent = parseLaunchIntent(intentValue);
  if (
    intent.launchId !== launchId
    || intent.instanceId !== instanceId
    || intent.canonicalRoot !== layout.canonicalRoot
    || intent.worktreeHash !== layout.worktreeHash
    || intent.role !== role
  ) {
    throw new Error('Internal development supervisor launch intent does not match its environment');
  }
  if (process.env.LYNTTY_DEV_ALLOW_TEST_HOOKS === '1'
    && process.env.LYNTTY_DEV_TEST_CLAIM_DELAY_ROLE === role) {
    const delayMs = Number(process.env.LYNTTY_DEV_TEST_CLAIM_DELAY_MS);
    if (!Number.isInteger(delayMs) || delayMs < 1 || delayMs > 10_000) {
      throw new Error('Invalid development claim-delay test hook');
    }
    await Bun.sleep(delayMs);
  }
  const processStartTokenValue = await processStartToken(process.pid);
  if (!processStartTokenValue) throw new Error('Unable to prove internal development supervisor process identity');
  const receipt: SupervisorReceipt = {
    schemaVersion: 1,
    instanceId,
    canonicalRoot: layout.canonicalRoot,
    worktreeHash: layout.worktreeHash,
    role,
    launchId,
    pid: process.pid,
    processStartToken: processStartTokenValue,
    createdAt: new Date().toISOString(),
  };
  await writeJsonAtomically(launchReceiptPath(layout, launchId), receipt, 0o600);
  return receipt;
}

async function waitForSupervisorReceipt(
  layout: DevLayout,
  state: DevState,
  intent: LaunchIntent,
): Promise<SupervisorReceipt> {
  return waitFor(`the ${intent.role} supervisor receipt`, async () => {
    const value = await readJson(launchReceiptPath(layout, intent.launchId));
    if (value === null) return false;
    const receipt = parseSupervisorReceipt(value);
    if (
      receipt.launchId !== intent.launchId
      || receipt.instanceId !== state.instanceId
      || receipt.canonicalRoot !== layout.canonicalRoot
      || receipt.worktreeHash !== layout.worktreeHash
      || receipt.role !== intent.role
    ) {
      throw new Error(`Supervisor receipt identity mismatch for ${intent.role}`);
    }
    if (!processIsAlive(receipt.pid)) return false;
    const actualStartToken = await processStartToken(receipt.pid);
    if (!actualStartToken) return false;
    if (actualStartToken !== receipt.processStartToken) {
      throw new Error(`Supervisor receipt PID/start-token mismatch for ${intent.role}`);
    }
    const ownership = await supervisorOwnership(layout, state, {
      pid: receipt.pid,
      role: receipt.role,
      processStartToken: receipt.processStartToken,
    });
    if (!ownership.owned) {
      throw new Error(`Unable to validate ${intent.role} supervisor receipt: ${ownership.reason ?? 'ownership not proven'}`);
    }
    return receipt;
  }, LAUNCH_RECEIPT_TIMEOUT_MS);
}

function crashAfterReceiptForTest(role: SupervisorRole): void {
  if (process.env.LYNTTY_DEV_ALLOW_TEST_HOOKS !== '1') return;
  const requestedRole = process.env.LYNTTY_DEV_TEST_CRASH_ROLE
    ?? process.env.LYNTTY_DEV_TEST_CRASH_AFTER_RECEIPT_ROLE;
  if (requestedRole === role) process.exit(97);
}

async function spawnSupervisor(
  layout: DevLayout,
  state: DevState,
  role: SupervisorRole,
  env: Record<string, string>,
): Promise<SupervisorLaunch> {
  const intent = await writeLaunchIntent(layout, state, role);
  const supervisorEnv = {
    ...env,
    LYNTTY_DEV_ROLE: `${role}-supervisor`,
    LYNTTY_DEV_LAUNCH_ID: intent.launchId,
  };
  const child = Bun.spawn({
    cmd: [process.execPath, layout.scriptPath, INTERNAL_SUPERVISOR, role],
    cwd: layout.canonicalRoot,
    env: supervisorEnv,
    stdin: 'ignore',
    stdout: Bun.file(logPath(layout, role)),
    stderr: Bun.file(logPath(layout, role)),
    detached: true,
  });
  (child as unknown as { unref?: () => void }).unref?.();
  const receipt = await waitForSupervisorReceipt(layout, state, intent);
  // This hook is deliberately after receipt validation and before the caller
  // can make the state durable. It is inert unless explicitly enabled for a
  // test process and an exact role value is supplied.
  crashAfterReceiptForTest(role);
  return {
    child,
    record: { pid: receipt.pid, role, processStartToken: receipt.processStartToken },
    intentPath: launchIntentPath(layout, intent.launchId),
    claimPath: launchClaimPath(layout, intent.launchId),
    receiptPath: launchReceiptPath(layout, intent.launchId),
  };
}

async function runSupervisorChild(
  cmd: string[],
  layout: DevLayout,
  role: SupervisorRole,
): Promise<void> {
  const env = copyEnvironment();
  env.LYNTTY_DEV_ROLE = role;
  const child = Bun.spawn({
    cmd,
    cwd: layout.canonicalRoot,
    env,
    stdin: 'ignore',
    stdout: 'inherit',
    stderr: 'inherit',
    // The detached supervisor owns the process group; children deliberately
    // stay in that group so shutdown can prove and reap the whole instance.
    detached: false,
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`${role} child exited with status ${exitCode}`);
}

async function runSupervisor(layout: DevLayout, role: SupervisorRole): Promise<void> {
  // Receipt creation is intentionally the first supervisor action. No relay
  // migration, daemon startup, or app child can happen before the parent has
  // a durable identity it can recover after a caller crash.
  await writeSupervisorReceipt(layout, role);
  if ((role === 'metro' || role === 'android') && process.env.LYNTTY_DEV_ANDROID_REQUESTED !== '1') {
    throw new Error('Android and Metro supervisors require `up --android`');
  }

  if (role === 'relay') {
    await runSupervisorChild([process.execPath, layout.relaySource, 'migrate'], layout, role);
    await runSupervisorChild([process.execPath, layout.relaySource, 'serve'], layout, role);
    return;
  }
  if (role === 'daemon') {
    await runSupervisorChild([process.execPath, layout.daemonSource], layout, role);
    return;
  }
  if (role === 'metro') {
    await runSupervisorChild([
      process.execPath,
      layout.expoCli,
      'start',
      layout.appDir,
      '--dev-client',
      '--port',
      process.env.LYNTTY_DEV_METRO_PORT ?? '',
    ], layout, role);
    return;
  }
  await runSupervisorChild([
    process.execPath,
    layout.expoCli,
    'run:android',
    layout.appDir,
    '--no-bundler',
  ], layout, role);
}

async function readMasterSecret(layout: DevLayout): Promise<string> {
  const existing = await readJson(layout.masterSecretFile);
  if (existing !== null) {
    if (typeof existing !== 'string' || existing.length < 20) {
      throw new Error('Isolated Relay master secret is corrupted');
    }
    return existing;
  }
  const secret = randomBytes(32).toString('base64');
  await writeJsonAtomically(layout.masterSecretFile, secret, 0o600);
  return secret;
}

function parseAccess(value: unknown): AccessFile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  return typeof raw.secret === 'string' && raw.secret.length > 0 && typeof raw.token === 'string' && raw.token.length > 0
    ? { secret: raw.secret, token: raw.token }
    : null;
}

function parseSettings(value: unknown): SettingsFile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  return typeof raw.machineId === 'string' && raw.machineId.length > 0
    ? {
      schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 2,
      onboardingCompleted: raw.onboardingCompleted !== false,
      machineId: raw.machineId,
      serverUrl: typeof raw.serverUrl === 'string' ? raw.serverUrl : '',
    }
    : null;
}

async function fetchMachines(url: string, token: string): Promise<MachineResult> {
  try {
    const response = await fetch(`${url}/v1/machines`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(2_000),
    });
    let machines: unknown[] = [];
    try {
      const body = await response.json() as unknown;
      if (Array.isArray(body)) machines = body;
    } catch {
      machines = [];
    }
    return { ok: response.ok && Array.isArray(machines), status: response.status, count: machines.length, machines };
  } catch {
    return { ok: false, status: null, count: 0, machines: [] };
  }
}

async function authenticateRelay(relayUrl: string): Promise<AccessFile> {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const jwk = publicKey.export({ format: 'jwk' }) as { x?: string };
  if (!jwk.x) throw new Error('Unable to create isolated Relay authentication key');
  const rawPublicKey = Buffer.from(jwk.x, 'base64url');
  const challenge = randomBytes(32);
  const signature = sign(null, challenge, privateKey);
  const response = await fetch(`${relayUrl}/v1/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      publicKey: rawPublicKey.toString('base64'),
      challenge: challenge.toString('base64'),
      signature: signature.toString('base64'),
    }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Isolated Relay authentication failed (${response.status})`);
  const body = await response.json() as { token?: unknown };
  if (typeof body.token !== 'string' || body.token.length === 0) throw new Error('Isolated Relay returned no authentication token');
  return { secret: randomBytes(32).toString('base64'), token: body.token };
}

async function hardenSensitiveFiles(layout: DevLayout): Promise<void> {
  for (const path of [layout.accessFile, layout.settingsFile, layout.masterSecretFile, layout.stateFile]) {
    try {
      await chmod(path, 0o600);
    } catch {
      // chmod is best-effort on filesystems without POSIX permissions.
    }
  }
}

async function ensureCredentials(layout: DevLayout, relayUrl: string): Promise<{ access: AccessFile; machineId: string }> {
  const access = parseAccess(await readJson(layout.accessFile));
  const settings = parseSettings(await readJson(layout.settingsFile));
  let usableAccess = access;
  if (usableAccess) {
    const probe = await fetchMachines(relayUrl, usableAccess.token);
    if (probe.status === 401) usableAccess = null;
  }
  if (!usableAccess) usableAccess = await authenticateRelay(relayUrl);

  const machineId = settings?.machineId ?? randomUUID();
  await writeJsonAtomically(layout.accessFile, usableAccess, 0o600);
  await writeJsonAtomically(layout.settingsFile, {
    schemaVersion: 2,
    onboardingCompleted: true,
    machineId,
    serverUrl: relayUrl,
  } satisfies SettingsFile, 0o600);
  return { access: usableAccess, machineId };
}

async function relayHealth(layout: DevLayout, state: DevState): Promise<HealthResult> {
  try {
    const response = await fetch(`http://127.0.0.1:${state.ports.relay}/health`, {
      signal: AbortSignal.timeout(1_500),
    });
    return { healthy: response.ok, status: response.status };
  } catch {
    return { healthy: false, status: null };
  }
}

async function metroHealth(state: DevState): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${state.ports.metro}/status`, {
      signal: AbortSignal.timeout(1_500),
    });
    if (!response.ok) return false;
    const body = await response.text();
    return /running|packager-status/i.test(body);
  } catch {
    return false;
  }
}

function hasExactEnvironment(environment: readonly string[], key: string, value: string): boolean {
  const matchingKey = environment.filter(entry => entry.startsWith(`${key}=`));
  return matchingKey.length === 1 && matchingKey[0] === `${key}=${value}`;
}

function parseDarwinBsdStartToken(value: Uint8Array | ArrayBuffer): string | null {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  if (bytes.byteLength < 136) return null;
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const seconds = view.getBigUint64(120, true);
    const microseconds = view.getBigUint64(128, true);
    if (microseconds >= 1_000_000n) return null;
    return `darwin:${seconds}:${microseconds}`;
  } catch {
    return null;
  }
}

type DarwinProcPidInfo = (pid: number, flavor: number, argument: bigint, buffer: unknown, size: number) => number;
let darwinProcPidInfo: DarwinProcPidInfo | null | undefined;
let darwinProcLibrary: unknown;

async function readDarwinProcessStartToken(pid: number): Promise<string | null> {
  if (darwinProcPidInfo === null) return null;
  try {
    const ffi = await import('bun:ffi');
    if (darwinProcPidInfo === undefined) {
      darwinProcLibrary = ffi.dlopen('/usr/lib/libproc.dylib', {
        proc_pidinfo: {
          args: [ffi.FFIType.i32, ffi.FFIType.i32, ffi.FFIType.u64, ffi.FFIType.ptr, ffi.FFIType.i32],
          returns: ffi.FFIType.i32,
        },
      });
      darwinProcPidInfo = (darwinProcLibrary as { symbols: { proc_pidinfo: DarwinProcPidInfo } }).symbols.proc_pidinfo;
    }
    const buffer = new Uint8Array(136);
    const result = darwinProcPidInfo(pid, 3, 0n, ffi.ptr(buffer), buffer.byteLength);
    if (result < buffer.byteLength) return null;
    return parseDarwinBsdStartToken(buffer);
  } catch {
    darwinProcPidInfo = null;
    return null;
  }
}

/**
 * Parse the Darwin KERN_PROCARGS2 layout without ever splitting on
 * whitespace. The buffer is an argc integer, the executable path, padding,
 * argc NUL-terminated argv strings, then NUL-terminated KEY=value entries.
 */
function parseKernProcargs2(value: Uint8Array | ArrayBuffer): { argv: string[]; environment: string[] } | null {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  if (bytes.byteLength < 4) return null;
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const argc = view.getInt32(0, true);
    if (argc <= 0 || argc > 4096) return null;
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let offset = 4;

    const readCString = (): string | null => {
      if (offset >= bytes.length) return null;
      const start = offset;
      while (offset < bytes.length && bytes[offset] !== 0) offset += 1;
      if (offset >= bytes.length) return null;
      const result = decoder.decode(bytes.subarray(start, offset));
      offset += 1;
      return result;
    };

    const executablePath = readCString();
    if (!executablePath) return null;
    while (offset < bytes.length && bytes[offset] === 0) offset += 1;

    const argv: string[] = [];
    for (let index = 0; index < argc; index += 1) {
      const argument = readCString();
      if (argument === null) return null;
      argv.push(argument);
    }

    const environment: string[] = [];
    while (offset < bytes.length) {
      while (offset < bytes.length && bytes[offset] === 0) offset += 1;
      if (offset >= bytes.length) break;
      const entry = readCString();
      if (entry === null || !entry.includes('=')) return null;
      environment.push(entry);
    }
    return { argv, environment };
  } catch {
    return null;
  }
}

type DarwinSysctl = (
  name: unknown,
  nameLength: number,
  oldValue: unknown,
  oldValueLength: unknown,
  newValue: unknown,
  newValueLength: number,
) => number;

let darwinSysctl: DarwinSysctl | null | undefined;
let darwinSysctlLibrary: unknown;

async function readDarwinProcargs(pid: number): Promise<{ argv: string[]; environment: string[] } | null> {
  if (darwinSysctl === null) return null;
  try {
    const ffi = await import('bun:ffi');
    if (darwinSysctl === undefined) {
      darwinSysctlLibrary = ffi.dlopen('/usr/lib/libSystem.B.dylib', {
        sysctl: {
          args: [ffi.FFIType.ptr, ffi.FFIType.u32, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.u32],
          returns: ffi.FFIType.i32,
        },
      });
      darwinSysctl = (darwinSysctlLibrary as { symbols: { sysctl: DarwinSysctl } }).symbols.sysctl;
    }
    // KERN_PROCARGS2, queried for one PID: { CTL_KERN, KERN_PROCARGS2,
    // pid }. A generous bounded buffer avoids a NULL FFI pointer while still
    // making unusually large/corrupt results fail closed.
    const mib = new Int32Array([1, 49, pid]);
    for (const capacity of [1 << 20, 4 << 20]) {
      const buffer = new Uint8Array(capacity);
      const oldLength = new BigUint64Array([BigInt(capacity)]);
      const result = darwinSysctl(
        ffi.ptr(mib),
        mib.length,
        ffi.ptr(buffer),
        ffi.ptr(oldLength),
        null,
        0,
      );
      if (result !== 0) continue;
      const length = Number(oldLength[0]);
      if (!Number.isSafeInteger(length) || length < 4 || length > buffer.length) return null;
      return parseKernProcargs2(buffer.subarray(0, length));
    }
  } catch {
    darwinSysctl = null;
  }
  return null;
}

async function readProcessIdentity(layout: DevLayout, pid: number): Promise<ProcessIdentity | null> {
  let argv: string[];
  let environment: string[];
  if (process.platform === 'linux') {
    try {
      argv = (await readFile(`/proc/${pid}/cmdline`)).toString().split('\0').filter(Boolean);
      environment = (await readFile(`/proc/${pid}/environ`)).toString().split('\0').filter(Boolean);
    } catch {
      return null;
    }
  } else {
    const procargs = await readDarwinProcargs(pid);
    if (!procargs) return null;
    argv = procargs.argv;
    environment = procargs.environment;
  }

  const lsof = await runCaptured(['/usr/sbin/lsof', '-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
    cwd: layout.canonicalRoot,
    env: copyEnvironment(),
  }).catch(async () => runCaptured(['lsof', '-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
    cwd: layout.canonicalRoot,
    env: copyEnvironment(),
  }).catch(() => ({ stdout: '', stderr: '', exitCode: 1 })));
  if (lsof.exitCode !== 0) return null;
  const cwdLines = lsof.stdout.split('\n').filter(line => line.startsWith('n'));
  if (cwdLines.length !== 1 || cwdLines[0]!.length <= 1) return null;
  return {
    cwd: cwdLines[0]!.slice(1).trim(),
    command: argv.join(' '),
    argv,
    environment,
  };
}

async function supervisorOwnership(
  layout: DevLayout,
  state: DevState,
  record: SupervisorRecord,
): Promise<OwnershipResult> {
  const alive = processIsAlive(record.pid);
  if (!alive) return { pid: record.pid, role: record.role, alive: false, owned: false, reason: 'not-running' };
  const identity = await readProcessIdentity(layout, record.pid);
  if (!identity) return { pid: record.pid, role: record.role, alive: true, owned: false, reason: 'unable-to-read-proc-identity' };

  if (record.processStartToken) {
    const actualStartToken = await processStartToken(record.pid);
    if (!actualStartToken || actualStartToken !== record.processStartToken) {
      return { pid: record.pid, role: record.role, alive: true, owned: false, reason: 'process-start-token-mismatch' };
    }
  } else {
    return { pid: record.pid, role: record.role, alive: true, owned: false, reason: 'process-start-token-missing' };
  }
  const expectedRole = `${record.role}-supervisor`;
  const expectedArgv = [process.execPath, layout.scriptPath, INTERNAL_SUPERVISOR, record.role];
  const commandOwned = identity.argv.length === expectedArgv.length
    && identity.argv.every((argument, index) => argument === expectedArgv[index]);
  const environmentOwned = hasExactEnvironment(identity.environment, 'LYNTTY_DEV_INSTANCE_ID', state.instanceId)
    && hasExactEnvironment(identity.environment, 'LYNTTY_DEV_ROLE', expectedRole)
    && hasExactEnvironment(identity.environment, 'LYNTTY_DEV_ROOT', layout.canonicalRoot)
    && hasExactEnvironment(identity.environment, 'LYNTTY_DEV_WORKTREE_HASH', layout.worktreeHash);
  const cwdOwned = identity.cwd === layout.canonicalRoot;
  if (!commandOwned) return { pid: record.pid, role: record.role, alive: true, owned: false, reason: 'command-mismatch' };
  if (!environmentOwned) return { pid: record.pid, role: record.role, alive: true, owned: false, reason: 'environment-mismatch' };
  if (!cwdOwned) return { pid: record.pid, role: record.role, alive: true, owned: false, reason: 'cwd-mismatch' };
  return { pid: record.pid, role: record.role, alive: true, owned: true };
}

function childCommandSpec(
  layout: DevLayout,
  state: DevState,
  role: SupervisorRole,
): { source: string; args: string[] | null } {
  if (role === 'relay') return { source: layout.relaySource, args: null };
  if (role === 'daemon') return { source: layout.daemonSource, args: [] };
  if (role === 'metro') return {
    source: layout.expoCli,
    args: ['start', layout.appDir, '--dev-client', '--port', String(state.ports.metro)],
  };
  return { source: layout.expoCli, args: ['run:android', layout.appDir, '--no-bundler'] };
}

function childCommandMatches(identity: ProcessIdentity, spec: { source: string; args: string[] | null }): boolean {
  const expectedPrefix = [process.execPath, spec.source];
  if (identity.argv.length < expectedPrefix.length
    || expectedPrefix.some((argument, index) => identity.argv[index] !== argument)) return false;
  const actualArgs = identity.argv.slice(expectedPrefix.length);
  if (spec.args === null) {
    return actualArgs.length === 1 && (actualArgs[0] === 'migrate' || actualArgs[0] === 'serve');
  }
  return actualArgs.length === spec.args.length && actualArgs.every((arg, index) => arg === spec.args[index]);
}

async function childOwnership(
  layout: DevLayout,
  state: DevState,
  record: SupervisorRecord,
  pid: number,
): Promise<OwnershipResult> {
  const alive = processIsAlive(pid);
  if (!alive) return { pid, role: record.role, alive: false, owned: false, reason: 'not-running' };
  const identity = await readProcessIdentity(layout, pid);
  if (!identity) return { pid, role: record.role, alive: true, owned: false, reason: 'unable-to-read-proc-identity' };
  const spec = childCommandSpec(layout, state, record.role);
  if (!childCommandMatches(identity, spec)) return { pid, role: record.role, alive: true, owned: false, reason: 'child-command-mismatch' };
  if (!hasExactEnvironment(identity.environment, 'LYNTTY_DEV_INSTANCE_ID', state.instanceId)
    || !hasExactEnvironment(identity.environment, 'LYNTTY_DEV_ROLE', record.role)
    || !hasExactEnvironment(identity.environment, 'LYNTTY_DEV_ROOT', layout.canonicalRoot)
    || !hasExactEnvironment(identity.environment, 'LYNTTY_DEV_WORKTREE_HASH', layout.worktreeHash)) {
    return { pid, role: record.role, alive: true, owned: false, reason: 'child-environment-mismatch' };
  }
  if (identity.cwd !== layout.canonicalRoot) return { pid, role: record.role, alive: true, owned: false, reason: 'child-cwd-mismatch' };
  return { pid, role: record.role, alive: true, owned: true };
}

function pathIsInside(root: string, candidate: string): boolean {
  const child = relative(root, candidate);
  return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`));
}

async function descendantOwnership(
  layout: DevLayout,
  state: DevState,
  record: SupervisorRecord,
  pid: number,
): Promise<OwnershipResult> {
  const alive = processIsAlive(pid);
  if (!alive) return { pid, role: record.role, alive: false, owned: false, reason: 'not-running' };
  const identity = await readProcessIdentity(layout, pid);
  if (!identity) return { pid, role: record.role, alive: true, owned: false, reason: 'unable-to-read-proc-identity' };
  if (!hasExactEnvironment(identity.environment, 'LYNTTY_DEV_INSTANCE_ID', state.instanceId)
    || !hasExactEnvironment(identity.environment, 'LYNTTY_DEV_ROLE', record.role)
    || !hasExactEnvironment(identity.environment, 'LYNTTY_DEV_ROOT', layout.canonicalRoot)
    || !hasExactEnvironment(identity.environment, 'LYNTTY_DEV_WORKTREE_HASH', layout.worktreeHash)) {
    return { pid, role: record.role, alive: true, owned: false, reason: 'descendant-environment-mismatch' };
  }
  if (!pathIsInside(layout.canonicalRoot, identity.cwd)) return { pid, role: record.role, alive: true, owned: false, reason: 'descendant-cwd-mismatch' };
  return { pid, role: record.role, alive: true, owned: true };
}

function hasOwnedChildAncestor(
  member: ProcessGroupMember,
  rootChildPids: Set<number>,
  membersByPid: Map<number, ProcessGroupMember>,
): boolean {
  const visited = new Set<number>();
  let parentPid = member.ppid;
  while (parentPid > 0 && !visited.has(parentPid)) {
    if (rootChildPids.has(parentPid)) return true;
    visited.add(parentPid);
    const parent = membersByPid.get(parentPid);
    if (!parent) return false;
    parentPid = parent.ppid;
  }
  return false;
}

async function listProcessGroups(): Promise<ProcessGroupMember[]> {
  const result = await runCaptured(['/bin/ps', '-axo', 'pid=,ppid=,pgid=,stat='], {
    cwd: process.cwd(),
    env: copyEnvironment(),
  });
  if (result.exitCode !== 0) throw new Error(`Unable to enumerate development process groups: ${result.stderr.trim() || 'ps failed'}`);
  const members: ProcessGroupMember[] = [];
  for (const line of result.stdout.split('\n')) {
    if (!line.trim()) continue;
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)/);
    if (!match) throw new Error('Unable to parse development process-group membership');
    members.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      pgid: Number(match[3]),
      stat: match[4],
    });
  }
  return members;
}

function isZombie(member: ProcessGroupMember): boolean {
  return member.stat.toUpperCase().includes('Z');
}

async function inspectOwnedProcessGroup(
  layout: DevLayout,
  state: DevState,
  record: SupervisorRecord,
  allMembers: ProcessGroupMember[],
): Promise<OwnedProcessGroup> {
  const recorded = allMembers.find(member => member.pid === record.pid);
  if (processIsAlive(record.pid) && !recorded) {
    throw new Error(`Unable to prove process-group membership for supervisor ${record.pid}`);
  }
  const pgid = recorded?.pgid ?? record.pid;
  if (!Number.isSafeInteger(pgid) || pgid <= 1) throw new Error(`Unable to prove safe process group for supervisor ${record.pid}`);
  const members = allMembers.filter(member => member.pgid === pgid && !isZombie(member));
  const membersByPid = new Map(members.map(member => [member.pid, member]));
  const supervisorPresent = members.some(member => member.pid === record.pid);
  const rootChildPids = new Set(
    members.filter(member => member.pid !== record.pid && member.ppid === record.pid).map(member => member.pid),
  );
  // Once the supervisor exits, surviving children are reparented. Re-prove an
  // exact source child as the group root, then prove its descendants by the
  // same instance/role environment and ancestry.
  const childOwnershipByPid = new Map<number, OwnershipResult>();
  if (!supervisorPresent) {
    for (const member of members) {
      if (member.pid === record.pid) continue;
      const ownership = await childOwnership(layout, state, record, member.pid);
      childOwnershipByPid.set(member.pid, ownership);
      if (ownership.owned) rootChildPids.add(member.pid);
    }
  }
  const provenMembers: ProcessGroupMember[] = [];
  for (const member of members) {
    const discoveredChildOwnership = childOwnershipByPid.get(member.pid);
    const ownership = member.pid === record.pid
      ? await supervisorOwnership(layout, state, record)
      : discoveredChildOwnership && !discoveredChildOwnership.alive
        ? discoveredChildOwnership
        : rootChildPids.has(member.pid)
          ? discoveredChildOwnership ?? await childOwnership(layout, state, record, member.pid)
          : hasOwnedChildAncestor(member, rootChildPids, membersByPid)
            ? await descendantOwnership(layout, state, record, member.pid)
            : { pid: member.pid, role: record.role, alive: true, owned: false, reason: 'unrelated-process-group-member' };
    // A member may exit between the process-group snapshot and identity proof.
    // It no longer needs a signal and must not turn a clean shutdown race into
    // an ownership failure. Every member still alive remains fail closed.
    if (!ownership.alive) continue;
    if (!ownership.owned) {
      throw new Error(`Refusing to signal process group ${pgid}: PID ${member.pid} (${record.role}) ownership not proven (${ownership.reason ?? 'unknown'})`);
    }
    provenMembers.push(member);
  }
  return { pgid, members: provenMembers };
}

async function inspectOwnedProcessGroups(layout: DevLayout, state: DevState): Promise<OwnedProcessGroup[]> {
  const allMembers = await listProcessGroups();
  const groups: OwnedProcessGroup[] = [];
  const seen = new Set<number>();
  for (const record of state.supervisors) {
    const group = await inspectOwnedProcessGroup(layout, state, record, allMembers);
    if (!seen.has(group.pgid)) {
      groups.push(group);
      seen.add(group.pgid);
    }
  }
  return groups;
}

async function inspectStateOwnership(layout: DevLayout, state: DevState): Promise<OwnershipResult[]> {
  if (state.canonicalRoot !== layout.canonicalRoot || state.worktreeHash !== layout.worktreeHash) {
    return state.supervisors.map(record => ({
      pid: record.pid,
      role: record.role,
      alive: processIsAlive(record.pid),
      owned: false,
      reason: 'state-root-mismatch',
    }));
  }
  return Promise.all(state.supervisors.map(record => supervisorOwnership(layout, state, record)));
}

async function launchClaimHasLiveOwner(layout: DevLayout, claim: LaunchIntent): Promise<boolean> {
  const expectedArgv = [process.execPath, layout.scriptPath, INTERNAL_SUPERVISOR, claim.role];
  for (const member of await listProcessGroups()) {
    if (isZombie(member)) continue;
    const identity = await readProcessIdentity(layout, member.pid);
    if (!identity) continue;
    if (identity.argv.length !== expectedArgv.length
      || !identity.argv.every((argument, index) => argument === expectedArgv[index])) continue;
    if (identity.cwd !== layout.canonicalRoot) continue;
    if (hasExactEnvironment(identity.environment, 'LYNTTY_DEV_LAUNCH_ID', claim.launchId)
      && hasExactEnvironment(identity.environment, 'LYNTTY_DEV_INSTANCE_ID', claim.instanceId)
      && hasExactEnvironment(identity.environment, 'LYNTTY_DEV_ROLE', `${claim.role}-supervisor`)
      && hasExactEnvironment(identity.environment, 'LYNTTY_DEV_ROOT', claim.canonicalRoot)
      && hasExactEnvironment(identity.environment, 'LYNTTY_DEV_WORKTREE_HASH', claim.worktreeHash)) return true;
  }
  return false;
}

async function reconcileLaunchMetadata(layout: DevLayout, state: DevState | null): Promise<DevState | null> {
  const metadata = await readLaunchMetadata(layout);
  const cleanup = new Set<string>();
  const completedLaunchIds = new Set<string>();
  let stateChanged = false;
  let liveReceiptSeen = false;

  if (!state) {
    for (const claim of metadata.claims) {
      if (await launchClaimHasLiveOwner(layout, claim.value)) {
        throw new Error('Development supervisor claim exists without a current state; refusing to proceed');
      }
      if (Date.parse(claim.value.expiresAt) > Date.now()) {
        throw new Error(`Development supervisor launch is in progress for role ${claim.value.role}`);
      }
      cleanup.add(claim.path);
    }
    for (const receipt of metadata.receipts) {
      if (processIsAlive(receipt.value.pid)) {
        throw new Error('Development supervisor receipt exists without a current state; refusing to proceed');
      }
      cleanup.add(receipt.path);
      completedLaunchIds.add(receipt.value.launchId);
    }
    for (const intent of metadata.intents) {
      const expiresAt = Date.parse(intent.value.expiresAt);
      if (completedLaunchIds.has(intent.value.launchId) || expiresAt <= Date.now()) {
        cleanup.add(await cancelLaunchIntent(intent.path));
      } else {
        throw new Error(`Development supervisor launch is in progress for role ${intent.value.role}`);
      }
    }
    await removeLaunchMetadata([...cleanup]);
    return null;
  }

  if (state.canonicalRoot !== layout.canonicalRoot || state.worktreeHash !== layout.worktreeHash) {
    if (metadata.intents.length > 0 || metadata.claims.length > 0 || metadata.receipts.length > 0) {
      throw new Error('Development launch metadata belongs to a different canonical worktree');
    }
    return state;
  }

  const receiptByLaunchId = new Map<string, LaunchMetadataEntry<SupervisorReceipt>>();
  for (const receipt of metadata.receipts) {
    const value = receipt.value;
    if (
      value.instanceId !== state.instanceId
      || value.canonicalRoot !== layout.canonicalRoot
      || value.worktreeHash !== layout.worktreeHash
    ) {
      throw new Error(`Development supervisor receipt identity mismatch for ${value.role}`);
    }
    if (receiptByLaunchId.has(value.launchId)) {
      throw new Error(`Duplicate development supervisor receipt for launch ${value.launchId}`);
    }
    receiptByLaunchId.set(value.launchId, receipt);

    const record: SupervisorRecord = {
      pid: value.pid,
      role: value.role,
      processStartToken: value.processStartToken,
    };
    if (processIsAlive(value.pid)) {
      const actualStartToken = await processStartToken(value.pid);
      if (!actualStartToken || actualStartToken !== value.processStartToken) {
        throw new Error(`Development supervisor receipt PID/start-token mismatch for ${value.role}`);
      }
      const ownership = await supervisorOwnership(layout, state, record);
      if (!ownership.owned) {
        throw new Error(`Development supervisor receipt ownership is not proven for ${value.role}: ${ownership.reason ?? 'unknown'}`);
      }
    } else {
      const group = await inspectOwnedProcessGroup(layout, state, record, await listProcessGroups());
      if (group.members.length === 0) {
        cleanup.add(receipt.path);
        completedLaunchIds.add(value.launchId);
        continue;
      }
    }
    liveReceiptSeen = true;
    const sameRole = state.supervisors.filter(item => item.role === value.role);
    if (sameRole.length > 1) {
      throw new Error(`Development state has duplicate supervisor role: ${value.role}`);
    }
    const existing = sameRole[0];
    if (existing) {
      if (existing.pid !== value.pid
        || (existing.processStartToken !== undefined && existing.processStartToken !== value.processStartToken)) {
        throw new Error(`Development supervisor receipt conflicts with persisted ${value.role} supervisor`);
      }
      if (existing.processStartToken !== value.processStartToken) {
        existing.processStartToken = value.processStartToken;
        stateChanged = true;
      }
    } else {
      state.supervisors.push(record);
      stateChanged = true;
    }
    cleanup.add(receipt.path);
    completedLaunchIds.add(value.launchId);
  }

  for (const claim of metadata.claims) {
    const value = claim.value;
    if (
      value.instanceId !== state.instanceId
      || value.canonicalRoot !== layout.canonicalRoot
      || value.worktreeHash !== layout.worktreeHash
    ) {
      throw new Error(`Development launch claim identity mismatch for ${value.role}`);
    }
    const receipt = receiptByLaunchId.get(value.launchId);
    if (receipt) {
      if (receipt.value.role !== value.role) {
        throw new Error(`Development launch claim/receipt role mismatch for ${value.role}`);
      }
      cleanup.add(claim.path);
      continue;
    }
    if (await launchClaimHasLiveOwner(layout, value)) {
      throw new Error(`Development supervisor launch is in progress for role ${value.role}`);
    }
    if (Date.parse(value.expiresAt) > Date.now()) {
      throw new Error(`Development supervisor launch claim is pending for role ${value.role}`);
    }
    cleanup.add(claim.path);
  }

  for (const intent of metadata.intents) {
    const value = intent.value;
    if (
      value.instanceId !== state.instanceId
      || value.canonicalRoot !== layout.canonicalRoot
      || value.worktreeHash !== layout.worktreeHash
    ) {
      throw new Error(`Development launch intent identity mismatch for ${value.role}`);
    }
    const receipt = receiptByLaunchId.get(value.launchId);
    if (receipt) {
      if (receipt.value.role !== value.role) {
        throw new Error(`Development launch intent/receipt role mismatch for ${value.role}`);
      }
      cleanup.add(await cancelLaunchIntent(intent.path));
      continue;
    }
    if (completedLaunchIds.has(value.launchId)) {
      cleanup.add(await cancelLaunchIntent(intent.path));
      continue;
    }
    if (Date.parse(value.expiresAt) <= Date.now()) {
      cleanup.add(await cancelLaunchIntent(intent.path));
      continue;
    }
    throw new Error(`Development supervisor launch is in progress for role ${value.role}`);
  }

  // A receipt is the recovery boundary: make its supervisor record durable
  // before deleting either side of the launch metadata pair.
  if (stateChanged || liveReceiptSeen) await writeState(layout, state);
  await removeLaunchMetadata([...cleanup]);
  return state;
}

function activeOwnershipFailure(results: OwnershipResult[]): string | null {
  const unowned = results.find(result => result.alive && !result.owned);
  return unowned ? `Refusing to signal PID ${unowned.pid} (${unowned.role}): ${unowned.reason ?? 'ownership not proven'}` : null;
}

function exactRoleSetFailure(state: DevState, ownership: OwnershipResult[]): string | null {
  const expected = state.androidRequested ? ['relay', 'daemon', 'metro'] : ['relay', 'daemon'];
  const actual = state.supervisors.map(record => record.role);
  const duplicates = actual.filter((role, index) => actual.indexOf(role) !== index);
  const extras = actual.filter(role => !expected.includes(role));
  const missing = expected.filter(role => !actual.includes(role));
  if (duplicates.length > 0) return `Persisted development state has duplicate supervisor role: ${duplicates[0]}`;
  if (extras.length > 0) return `Persisted development state has unexpected supervisor role: ${extras[0]}`;
  if (missing.length > 0) return `Persisted development state is missing live supervisor role: ${missing[0]}`;
  const notLive = ownership.find(result => !result.alive);
  if (notLive) return `Persisted ${notLive.role} supervisor is not live`;
  const notOwned = ownership.find(result => !result.owned);
  if (notOwned) return `Persisted ${notOwned.role} supervisor is not owned: ${notOwned.reason ?? 'ownership not proven'}`;
  return null;
}

async function withLifecycleLock<T>(layout: DevLayout, action: () => Promise<T>): Promise<T> {
  const lock = await acquireLifecycleLock(layout);
  try {
    return await action();
  } finally {
    await lock.release();
  }
}

async function waitFor<T>(description: string, condition: () => Promise<T | false> | T | false, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const result = await condition();
    if (result !== false) return result;
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(`Timed out waiting for ${description}`);
    await Bun.sleep(Math.min(POLL_INTERVAL_MS, remaining));
  }
}

async function waitForSupervisor(layout: DevLayout, state: DevState, role: SupervisorRole): Promise<void> {
  await waitFor(`${role} supervisor`, async () => {
    const record = state.supervisors.find(item => item.role === role);
    if (!record) throw new Error(`Missing ${role} supervisor state`);
    if (!processIsAlive(record.pid)) throw new Error(`${role} supervisor exited before readiness`);
    const ownership = await supervisorOwnership(layout, state, record);
    if (!ownership.owned) throw new Error(`Unable to prove ${role} supervisor ownership: ${ownership.reason}`);
    return true;
  }, 5_000);
}

async function waitForRelay(layout: DevLayout, state: DevState): Promise<void> {
  await waitFor('Relay health', async () => {
    await waitForSupervisor(layout, state, 'relay');
    return (await relayHealth(layout, state)).healthy;
  });
}

interface IsolatedDaemonState {
  pid: number;
  httpPort: number;
}

async function readIsolatedDaemonState(layout: DevLayout): Promise<IsolatedDaemonState | null> {
  const value = await readJson(join(layout.lynttyHomeDir, 'daemon.state.json'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (!Number.isSafeInteger(raw.pid) || (raw.pid as number) <= 0
    || !Number.isSafeInteger(raw.httpPort) || (raw.httpPort as number) <= 0) return null;
  return { pid: raw.pid as number, httpPort: raw.httpPort as number };
}

async function sourceDaemonStatus(layout: DevLayout, state: DevState): Promise<ProcessResult> {
  const env = baseRuntimeEnvironment(layout, state);
  env.LYNTTY_DEV_ROLE = 'cli-readiness-status';
  env.NO_COLOR = '1';
  return runCaptured([process.execPath, layout.cliSource, 'daemon', 'status'], {
    cwd: layout.canonicalRoot,
    env,
  });
}

function daemonStatusIsRunning(result: ProcessResult): boolean {
  return result.exitCode === 0 && /daemon is running/i.test(result.stdout);
}

async function currentDaemonControlIsProven(layout: DevLayout, state: DevState): Promise<boolean> {
  const status = await sourceDaemonStatus(layout, state);
  if (!daemonStatusIsRunning(status)) return false;
  const daemonState = await readIsolatedDaemonState(layout);
  if (!daemonState) return false;
  const record = state.supervisors.find(item => item.role === 'daemon');
  if (!record || daemonState.pid === record.pid) return false;
  let group: OwnedProcessGroup;
  try {
    const members = await listProcessGroups();
    group = await inspectOwnedProcessGroup(layout, state, record, members);
  } catch {
    return false;
  }
  const daemonMember = group.members.find(member => member.pid === daemonState.pid);
  if (!daemonMember || daemonMember.pid === record.pid) return false;
  const ownership = await childOwnership(layout, state, record, daemonState.pid);
  return ownership.owned;
}

async function waitForCurrentDaemonControl(layout: DevLayout, state: DevState): Promise<void> {
  await waitFor('current daemon control', async () => currentDaemonControlIsProven(layout, state), DEFAULT_TIMEOUT_MS);
}

function machineResultIsCurrent(result: MachineResult, machineId: string): boolean {
  if (!result.ok || result.count !== 1 || result.machines.length !== 1) return false;
  const machine = result.machines[0];
  return !!machine && typeof machine === 'object' && !Array.isArray(machine)
    && (machine as Record<string, unknown>).id === machineId;
}

async function waitForMachine(
  layout: DevLayout,
  state: DevState,
  token: string,
  machineId: string,
): Promise<MachineResult> {
  await waitForCurrentDaemonControl(layout, state);
  return waitFor('exactly one current registered machine', async () => {
    if (!(await currentDaemonControlIsProven(layout, state))) return false;
    const result = await fetchMachines(`http://127.0.0.1:${state.ports.relay}`, token);
    return machineResultIsCurrent(result, machineId) ? result : false;
  });
}

async function startRelay(
  layout: DevLayout,
  state: DevState,
  relayEnv: Record<string, string>,
): Promise<void> {
  const lock = await acquireCoordinationLock(layout);
  try {
    const coordination = await readCoordination(layout);
    const reconciled = await reconcileCoordinationAllocations(coordination);
    await writeCoordination(layout, reconciled);
    const ports = await choosePortBlock(layout, reconciled);
    state.ports = ports;
    relayEnv.LYNTTY_SERVER_URL = `http://127.0.0.1:${ports.relay}`;
    relayEnv.LYNTTY_DEV_RELAY_PORT = String(ports.relay);
    relayEnv.LYNTTY_DEV_METRO_PORT = String(ports.metro);
    relayEnv.PORT = String(ports.relay);

    // This write is the crash-gap boundary. It happens while the shared lock
    // is held and before spawn, so another worktree can never choose these
    // ports while the Relay is still unbound or migrating.
    const provisional: CoordinationAllocation = {
      schemaVersion: 1,
      status: 'provisional',
      canonicalRoot: layout.canonicalRoot,
      worktreeHash: layout.worktreeHash,
      instanceId: state.instanceId,
      relayPort: ports.relay,
      metroPort: ports.metro,
      relayPid: 0,
      leaseExpiresAt: new Date(Date.now() + PROVISIONAL_LEASE_MS).toISOString(),
      startedAt: state.startedAt,
    };
    await writeCoordination(layout, {
      schemaVersion: 1,
      allocations: [...reconciled.allocations, provisional],
    });

    const relay = await spawnSupervisor(layout, state, 'relay', relayEnv);
    state.supervisors.push(relay.record);
    if (!processIsAlive(relay.record.pid)) throw new Error('Relay supervisor exited before the coordination lock was released');
    await writeState(layout, state);
    await removeLaunchMetadata([relay.intentPath, relay.claimPath, relay.receiptPath]);
    const active: CoordinationAllocation = {
      schemaVersion: 1,
      status: 'active',
      canonicalRoot: layout.canonicalRoot,
      worktreeHash: layout.worktreeHash,
      instanceId: state.instanceId,
      relayPort: ports.relay,
      metroPort: ports.metro,
      relayPid: relay.record.pid,
      ...(relay.record.processStartToken ? { relayStartToken: relay.record.processStartToken } : {}),
      startedAt: state.startedAt,
    };
    // Replace the provisional record with the active PID in one atomic file
    // replacement while still holding the coordination lock.
    await writeCoordination(layout, {
      schemaVersion: 1,
      allocations: [...reconciled.allocations, active],
    });
  } finally {
    await lock.release();
  }
}

async function addSupervisor(
  layout: DevLayout,
  state: DevState,
  role: SupervisorRole,
  env: Record<string, string>,
): Promise<Bun.Subprocess> {
  const supervisor = await spawnSupervisor(layout, state, role, env);
  state.supervisors.push(supervisor.record);
  await writeState(layout, state);
  await removeLaunchMetadata([supervisor.intentPath, supervisor.claimPath, supervisor.receiptPath]);
  return supervisor.child;
}

async function stopOwnedSupervisors(layout: DevLayout, state: DevState): Promise<{ ok: boolean; error?: string }> {
  const ownership = await inspectStateOwnership(layout, state);
  const failure = activeOwnershipFailure(ownership);
  if (failure) return { ok: false, error: failure };

  let initialGroups: OwnedProcessGroup[];
  try {
    initialGroups = await inspectOwnedProcessGroups(layout, state);
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }

  const signalGroups = async (signal: 'SIGTERM' | 'SIGKILL', groups: OwnedProcessGroup[]): Promise<string | null> => {
    for (const group of groups) {
      if (group.members.length === 0) continue;
      try {
        process.kill(-group.pgid, signal);
      } catch (error) {
        if (!isErrno(error, 'ESRCH')) return `Unable to ${signal === 'SIGTERM' ? 'terminate' : 'kill'} owned process group ${group.pgid}: ${errorMessage(error)}`;
      }
    }
    return null;
  };

  let signalFailure = await signalGroups('SIGTERM', initialGroups);
  if (signalFailure) return { ok: false, error: signalFailure };

  const trackedGroupIds = new Set(initialGroups.map(group => group.pgid));
  const trackedGroupsAreGone = async (): Promise<boolean> => {
    const members = await listProcessGroups();
    return !members.some(member => trackedGroupIds.has(member.pgid) && !isZombie(member));
  };

  const termDeadline = Date.now() + 5_000;
  while (true) {
    try {
      if (await trackedGroupsAreGone()) return { ok: true };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
    const remaining = termDeadline - Date.now();
    if (remaining <= 0) break;
    await Bun.sleep(Math.min(POLL_INTERVAL_MS, remaining));
  }

  // Re-enumerate and re-prove every remaining member immediately before a
  // forced kill. Never reuse the initial proof after the group has changed.
  let beforeKill: OwnedProcessGroup[];
  try {
    beforeKill = await inspectOwnedProcessGroups(layout, state);
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
  signalFailure = await signalGroups('SIGKILL', beforeKill);
  if (signalFailure) return { ok: false, error: signalFailure };

  const killDeadline = Date.now() + 5_000;
  while (true) {
    try {
      if (await trackedGroupsAreGone()) return { ok: true };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
    const remaining = killDeadline - Date.now();
    if (remaining <= 0) {
      return { ok: false, error: 'Owned development process groups did not stop before the deadline' };
    }
    await Bun.sleep(Math.min(POLL_INTERVAL_MS, remaining));
  }
}

async function releaseAllocation(layout: DevLayout, state: DevState): Promise<void> {
  const lock = await acquireCoordinationLock(layout);
  try {
    const coordination = await readCoordination(layout);
    const allocations = coordination.allocations.filter(item => !(
      item.canonicalRoot === layout.canonicalRoot
      && item.worktreeHash === layout.worktreeHash
      && item.instanceId === state.instanceId
    ));
    if (allocations.length === 0) await rm(layout.coordinationFile, { force: true });
    else await writeCoordination(layout, { schemaVersion: 1, allocations });
  } finally {
    await lock.release();
  }
}

function redact(value: string, access?: AccessFile, masterSecret?: string): string {
  let result = value;
  for (const secret of [access?.token, access?.secret, masterSecret]) {
    if (secret) result = result.split(secret).join('<redacted>');
  }
  return result
    .replace(/(Authorization\s*:\s*Bearer\s+)[^\s\]"']+/gi, '$1<redacted>')
    .replace(/("?(?:token|secret|masterSecret|machineKey|publicKey)"?\s*[:=]\s*")([^"\n]+)(")/gi, '$1<redacted>$3');
}

async function verifyCli(
  layout: DevLayout,
  state: DevState,
  access: AccessFile,
): Promise<{ status: ProcessResult; list: ProcessResult; statusRunning: boolean; listUsable: boolean }> {
  const env = baseRuntimeEnvironment(layout, state);
  env.LYNTTY_DEV_ROLE = 'cli-verify';
  env.NO_COLOR = '1';
  const status = await runCaptured([process.execPath, layout.cliSource, 'daemon', 'status'], {
    cwd: layout.canonicalRoot,
    env,
  });
  const list = await runCaptured([process.execPath, layout.cliSource, 'daemon', 'list'], {
    cwd: layout.canonicalRoot,
    env: { ...env, LYNTTY_DEV_ROLE: 'cli-verify-list' },
  });
  return {
    status,
    list,
    statusRunning: status.exitCode === 0 && /daemon is running/i.test(status.stdout),
    listUsable: list.exitCode === 0 && !/no daemon running/i.test(list.stdout),
  };
}

async function writeEvidence(
  layout: DevLayout,
  state: DevState,
  evidence: Record<string, unknown>,
): Promise<string> {
  const path = join(layout.evidenceDir, 'verify.json');
  await writeJsonAtomically(path, {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    canonicalRoot: layout.canonicalRoot,
    worktreeHash: layout.worktreeHash,
    state: publicState(layout, state),
    ...evidence,
  }, 0o600);
  return path;
}

async function commandCheckLocked(layout: DevLayout, json: boolean): Promise<void> {
  let state = await loadState(layout);
  state = await reconcileLaunchMetadata(layout, state);
  const identity = {
    canonicalRoot: layout.canonicalRoot,
    worktreeHash: layout.worktreeHash,
    stateDir: layout.stateDir,
    androidRequested: state?.androidRequested ?? false,
  };
  if (!state) {
    const result = { command: 'check', ok: false, ...identity, error: 'No development state found' };
    if (json) console.log(JSON.stringify(result));
    else console.log(`No development state found at ${layout.stateDir}`);
    throw new ReportedCommandError('No development state found');
  }

  const ownership = await inspectStateOwnership(layout, state);
  const health = state.status === 'running' || state.status === 'starting'
    ? await relayHealth(layout, state)
    : { healthy: false, status: null };
  const roleFailure = state.status === 'running' || state.status === 'starting'
    ? exactRoleSetFailure(state, ownership)
    : null;
  const metroHealthy = state.androidRequested && (state.status === 'running' || state.status === 'starting')
    ? await metroHealth(state)
    : !state.androidRequested;
  const ok = state.status === 'running'
    && state.canonicalRoot === layout.canonicalRoot
    && state.worktreeHash === layout.worktreeHash
    && roleFailure === null
    && health.healthy
    && metroHealthy;
  const result = {
    command: 'check',
    ok,
    ...identity,
    status: state.status,
    ports: state.ports,
    startedAt: state.startedAt,
    supervisors: ownership,
    relay: { healthy: health.healthy, status: health.status },
    metro: { expected: state.androidRequested, healthy: metroHealthy },
    ...(roleFailure ? { error: roleFailure } : {}),
  };
  if (json) console.log(JSON.stringify(result));
  else {
    console.log(`Development state: ${state.status}`);
    console.log(`Relay: ${health.healthy ? 'healthy' : 'unhealthy'} on ${state.ports.relay}`);
    for (const item of ownership) console.log(`${item.role}: ${item.alive && item.owned ? 'owned' : item.alive ? 'unowned' : 'stopped'} (PID ${item.pid})`);
  }
  if (!ok) throw new ReportedCommandError('Development check failed');
}

async function commandCheck(layout: DevLayout, json: boolean): Promise<void> {
  return withLifecycleLock(layout, () => commandCheckLocked(layout, json));
}

async function commandVerifyLocked(layout: DevLayout, json: boolean): Promise<void> {
  let state = await loadState(layout);
  state = await reconcileLaunchMetadata(layout, state);
  if (!state) throw new Error('No development state found');
  const ownership = await inspectStateOwnership(layout, state);
  const health = await relayHealth(layout, state);
  const roleFailure = exactRoleSetFailure(state, ownership);
  const metroHealthy = state.androidRequested ? await metroHealth(state) : true;
  let currentDaemonReady = false;
  const baseValid = state.status === 'running'
    && state.canonicalRoot === layout.canonicalRoot
    && state.worktreeHash === layout.worktreeHash
    && roleFailure === null
    && health.healthy
    && metroHealthy;
  let access: AccessFile | null = null;
  let machines: MachineResult = { ok: false, status: null, count: 0, machines: [] };
  let cli: Awaited<ReturnType<typeof verifyCli>> | null = null;
  let evidencePath: string | null = null;
  let verifyError: string | undefined;

  try {
    access = parseAccess(await readJson(layout.accessFile));
    const settings = parseSettings(await readJson(layout.settingsFile));
    if (!access) throw new Error('Isolated access.key is missing or corrupted');
    if (!settings?.machineId) throw new Error('Isolated settings are missing the current machine ID');
    currentDaemonReady = await currentDaemonControlIsProven(layout, state);
    if (!currentDaemonReady) throw new Error('Current isolated daemon control could not be proven');
    machines = await fetchMachines(`http://127.0.0.1:${state.ports.relay}`, access.token);
    if (!machineResultIsCurrent(machines, settings.machineId)) throw new Error('Authenticated Relay machine registration is not exactly one current machine');
    cli = await verifyCli(layout, state, access);
    if (!cli.statusRunning) throw new Error('Source CLI daemon status did not report a running daemon');
    if (!cli.listUsable) throw new Error('Source CLI daemon list did not complete successfully');
    if (!baseValid) throw new Error('Development ownership or Relay health check failed');
  } catch (error) {
    verifyError = errorMessage(error);
  }

  const evidence = {
    ok: !verifyError,
    relay: { healthy: health.healthy, status: health.status },
    ownership,
    machines: { authenticated: machines.ok, count: machines.count, status: machines.status },
    cli: cli ? {
      status: {
        exitCode: cli.status.exitCode,
        running: cli.statusRunning,
        output: redact(cli.status.stdout, access ?? undefined),
      },
      list: {
        exitCode: cli.list.exitCode,
        usable: cli.listUsable,
        output: redact(cli.list.stdout, access ?? undefined),
      },
    } : null,
    ...(verifyError ? { error: redact(verifyError, access ?? undefined) } : {}),
  } satisfies Record<string, unknown>;
  evidencePath = await writeEvidence(layout, state, evidence);
  const result = {
    command: 'verify',
    ok: !verifyError,
    state: publicState(layout, state),
    relay: evidence.relay,
    ownership,
    machines: evidence.machines,
    cli: cli ? {
      status: { exitCode: cli.status.exitCode, running: cli.statusRunning },
      list: { exitCode: cli.list.exitCode, usable: cli.listUsable },
    } : null,
    evidencePath,
    ...(verifyError ? { error: redact(verifyError, access ?? undefined) } : {}),
  };
  if (json) console.log(JSON.stringify(result));
  else {
    console.log(`Verify: ${result.ok ? 'passed' : 'failed'}`);
    console.log(`Evidence: ${evidencePath}`);
  }
  if (!result.ok) throw new ReportedCommandError(verifyError ?? 'Development verification failed');
}

async function commandVerify(layout: DevLayout, json: boolean): Promise<void> {
  return withLifecycleLock(layout, () => commandVerifyLocked(layout, json));
}

async function startAndroid(layout: DevLayout, state: DevState, access: AccessFile): Promise<void> {
  if (state.androidRequested) return;
  const metroEnv = androidEnvironment(layout, state, access, 'metro-supervisor');
  await addSupervisor(layout, state, 'metro', metroEnv);
  await waitFor('Expo Metro health', async () => {
    await waitForSupervisor(layout, state, 'metro');
    return metroHealth(state);
  }, DEFAULT_TIMEOUT_MS);

  state.androidRequested = true;
  await writeState(layout, state);
  const androidEnv = androidEnvironment(layout, state, access, 'android-supervisor');
  const android = await addSupervisor(layout, state, 'android', androidEnv);
  const androidRecord = state.supervisors.find(item => item.role === 'android');
  if (!androidRecord) throw new Error('Android supervisor record was not made durable');
  const exitCode = await android.exited;
  if (exitCode !== 0) throw new Error(`Android development install exited with status ${exitCode}`);
  await waitFor('Android development process group shutdown', async () => {
    const members = await listProcessGroups();
    return !members.some(member => member.pgid === androidRecord.pid && !isZombie(member));
  }, 10_000);
  state.supervisors = state.supervisors.filter(item => item.role !== 'android');
  await writeState(layout, state);
}

async function commandUpLocked(layout: DevLayout, options: ParsedArgs): Promise<DevState> {
  await Promise.all([
    ensureDirectory(layout.stateDir),
    ensureDirectory(layout.homeDir),
    ensureDirectory(layout.lynttyHomeDir),
    ensureDirectory(layout.relayDataDir),
    ensureDirectory(layout.pgliteDir),
    ensureDirectory(layout.logsDir),
    ensureDirectory(layout.evidenceDir),
    ensureDirectory(layout.launchDir),
    ensureDirectory(dirname(layout.masterSecretFile)),
  ]);
  let oldState = await loadState(layout);
  oldState = await reconcileLaunchMetadata(layout, oldState);
  if (oldState && oldState.canonicalRoot !== layout.canonicalRoot) {
    throw new Error('Development state belongs to a different canonical worktree root');
  }
  if (oldState) {
    const ownership = await inspectStateOwnership(layout, oldState);
    const failure = activeOwnershipFailure(ownership);
    if (failure) throw new Error(failure);
    if (ownership.some(item => item.alive)) {
      if (oldState.status === 'stopped') {
        throw new Error('Stopped development state still owns live supervisors; run bun dev:down before restarting');
      }
      if (oldState.status === 'failed') {
        throw new Error('Failed development state still owns live supervisors; run bun dev:down before restarting');
      }
      const roleFailure = exactRoleSetFailure(oldState, ownership);
      if (roleFailure) throw new Error(`Refusing to reuse partial development state: ${roleFailure}`);
      const health = await relayHealth(layout, oldState);
      if (!health.healthy) throw new Error('Existing owned development supervisors are live but Relay is unhealthy');
      if (oldState.androidRequested && !(await metroHealth(oldState))) {
        throw new Error('Existing development state expects Metro, but Metro is unhealthy');
      }
      const existingAccess = parseAccess(await readJson(layout.accessFile));
      const existingSettings = parseSettings(await readJson(layout.settingsFile));
      if (!existingAccess || !existingSettings?.machineId) {
        throw new Error('Existing development instance has no isolated credentials or machine ID');
      }
      if (!(await currentDaemonControlIsProven(layout, oldState))) {
        throw new Error('Existing isolated daemon control could not be proven');
      }
      const existingMachines = await fetchMachines(`http://127.0.0.1:${oldState.ports.relay}`, existingAccess.token);
      if (!machineResultIsCurrent(existingMachines, existingSettings.machineId)) {
        throw new Error('Existing authenticated Relay machine registration is not exactly one current machine');
      }
      if (options.android) {
        try {
          await startAndroid(layout, oldState, existingAccess);
        } catch (error) {
          const cleanup = await stopOwnedSupervisors(layout, oldState);
          if (cleanup.ok) {
            oldState.status = 'stopped';
            oldState.stoppedAt = new Date().toISOString();
            await writeState(layout, oldState);
            await releaseAllocation(layout, oldState).catch(() => undefined);
          } else {
            oldState.status = 'failed';
            await writeState(layout, oldState).catch(() => undefined);
          }
          const suffix = cleanup.ok ? '' : `; cleanup refused or incomplete: ${cleanup.error}`;
          throw new Error(`${errorMessage(error)}${suffix}`);
        }
      }
      oldState.status = 'running';
      await writeState(layout, oldState);
      await hardenSensitiveFiles(layout);
      return oldState;
    }
  }

  const masterSecret = await readMasterSecret(layout);
  const state: DevState = {
    schemaVersion: STATE_SCHEMA_VERSION,
    status: 'starting',
    canonicalRoot: layout.canonicalRoot,
    worktreeHash: layout.worktreeHash,
    instanceId: randomUUID(),
    ports: { relay: 0, metro: 0 },
    startedAt: new Date().toISOString(),
    supervisors: [],
    androidRequested: false,
  };
  await writeState(layout, state);

  try {
    const relayEnv = relayEnvironment(layout, state, masterSecret);
    await startRelay(layout, state, relayEnv);
    await waitForRelay(layout, state);

    const relayUrl = `http://127.0.0.1:${state.ports.relay}`;
    const credentials = await ensureCredentials(layout, relayUrl);
    const daemonEnv = daemonEnvironment(layout, state);
    await addSupervisor(layout, state, 'daemon', daemonEnv);
    await waitForSupervisor(layout, state, 'daemon');
    await waitForMachine(layout, state, credentials.access.token, credentials.machineId);
    await hardenSensitiveFiles(layout);

    if (options.android) await startAndroid(layout, state, credentials.access);
    state.status = 'running';
    await writeState(layout, state);
    await hardenSensitiveFiles(layout);
    return state;
  } catch (error) {
    const cleanup = await stopOwnedSupervisors(layout, state);
    if (cleanup.ok) {
      state.status = 'stopped';
      state.stoppedAt = new Date().toISOString();
      await writeState(layout, state);
      await releaseAllocation(layout, state).catch(() => undefined);
    } else {
      state.status = 'failed';
      await writeState(layout, state).catch(() => undefined);
    }
    const suffix = cleanup.ok ? '' : `; cleanup refused or incomplete: ${cleanup.error}`;
    throw new Error(`${errorMessage(error)}${suffix}`);
  }
}

async function commandUp(layout: DevLayout, options: ParsedArgs): Promise<void> {
  return withLifecycleLock(layout, async () => {
    const state = await commandUpLocked(layout, options);
    // Keep the success emission under the same lifecycle lock as readiness and
    // the final state write. A concurrent down cannot slip between those
    // operations and stop the instance before this acknowledgement is sent.
    await emitUpResult(layout, state, options.json, options.android);
  });
}

async function commandDownLocked(layout: DevLayout, json: boolean): Promise<void> {
  let state = await loadState(layout);
  state = await reconcileLaunchMetadata(layout, state);
  if (!state) {
    const result = { command: 'down', ok: true, status: 'stopped', stateDir: layout.stateDir };
    if (json) console.log(JSON.stringify(result));
    else console.log('No development state found; nothing to stop.');
    return;
  }
  const ownership = await inspectStateOwnership(layout, state);
  const failure = activeOwnershipFailure(ownership);
  if (failure) throw new Error(failure);
  // The persisted label is not a shutdown guard. A stale/tampered `stopped`
  // label must still walk and stop every owned process group.
  const stopped = await stopOwnedSupervisors(layout, state);
  if (!stopped.ok) throw new Error(stopped.error ?? 'Failed to stop owned development supervisors');
  state.status = 'stopped';
  state.stoppedAt = new Date().toISOString();
  await writeState(layout, state);
  await releaseAllocation(layout, state);
  await hardenSensitiveFiles(layout);
  const result = {
    command: 'down',
    ok: true,
    status: state.status,
    stateDir: layout.stateDir,
    supervisors: ownership,
  };
  if (json) console.log(JSON.stringify(result));
  else console.log(`Development supervisors stopped. State: ${layout.stateDir}`);
}

async function commandDown(layout: DevLayout, json: boolean): Promise<void> {
  return withLifecycleLock(layout, () => commandDownLocked(layout, json));
}

async function emitUpResult(layout: DevLayout, state: DevState, json: boolean, android: boolean): Promise<void> {
  const result = {
    command: 'up',
    ok: true,
    state: publicState(layout, state),
    androidRequested: android,
    relayUrl: `http://127.0.0.1:${state.ports.relay}`,
  };
  if (json) console.log(JSON.stringify(result));
  else {
    console.log(`Development Relay is running at ${result.relayUrl}`);
    console.log(`State: ${layout.stateDir}`);
    if (android) console.log(`Android Metro is running on ${state.ports.metro}`);
  }
}

async function main(): Promise<void> {
  let parsed: ParsedArgs | null = null;
  try {
    parsed = parseArgs(process.argv.slice(2));
    assertSupportedPlatform();
    const layout = await resolveLayout();
    if (parsed.command === 'up') {
      await commandUp(layout, parsed);
      return;
    }
    if (parsed.command === 'check') {
      await commandCheck(layout, parsed.json);
      return;
    }
    if (parsed.command === 'verify') {
      await commandVerify(layout, parsed.json);
      return;
    }
    await commandDown(layout, parsed.json);
  } catch (error) {
    if (!(error instanceof ReportedCommandError)) {
      if (parsed?.json) {
        console.log(JSON.stringify({ command: parsed.command, ok: false, error: errorMessage(error) }));
      } else {
        console.error(errorMessage(error));
      }
    }
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  const internalArgs = process.argv.slice(2);
  if (internalArgs[0] === INTERNAL_SUPERVISOR) {
    try {
      assertSupportedPlatform();
      const layout = await resolveLayout();
      const role = internalArgs[1];
      if (!isSupervisorRole(role)) throw new Error('Unknown internal development supervisor role');
      await runSupervisor(layout, role);
    } catch (error) {
      console.error(errorMessage(error));
      process.exitCode = 1;
    }
  } else {
    await main();
  }
}

export {
  parseArgs,
  resolveLayout,
  parseState,
  parseCoordination,
  reconcileCoordinationAllocations,
  parseDarwinBsdStartToken,
  parseKernProcargs2,
  pathIsInside,
  supervisorOwnership,
};
