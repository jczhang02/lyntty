#!/usr/bin/env bun

import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
import { copyFile, mkdir, open, readFile, readdir, readlink, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { homedir, networkInterfaces } from 'node:os';
import { dirname, isAbsolute, join, relative } from 'node:path';
import {
  acquireAtomicLock,
  isZombie,
  listProcessGroups,
  processIsAlive,
  processStartToken,
  readProcessIdentity,
  type ProcessGroupMember,
} from './dev';

type PreviewCommand = 'test' | 'status' | 'logs' | 'stop' | 'reset';
type PreviewStatus = 'starting' | 'awaiting_auth' | 'running' | 'stopped' | 'failed';

interface PreviewLayout {
  canonicalRoot: string;
  worktreeHash: string;
  profileHash: string;
  stateDir: string;
  stateFile: string;
  receiptFile: string;
  lifecycleLockDir: string;
  logsDir: string;
  supervisorLog: string;
  runtimeLog: string;
  buildMarkerFile: string;
  relayDataDir: string;
  pgliteDir: string;
  masterSecretFile: string;
  lynttyHomeDir: string;
  accessFile: string;
  settingsFile: string;
  extensionPath: string;
  scriptPath: string;
  relaySource: string;
  daemonSource: string;
  cliSource: string;
  apkArtifactsDir: string;
  apkManifestFile: string;
  apkCounterFile: string;
  apkAllowlistFile: string;
  androidHomeDir: string;
  gradleHomeDir: string;
  androidUserHomeDir: string;
  ccacheDir: string;
}

interface SupervisorRecord {
  pid: number;
  processStartToken: string;
}

interface ApkArtifact {
  schemaVersion: 1;
  provenance: 'local-build' | 'reviewed-import';
  sourceCommit: string;
  sourceDigest: string;
  path: string;
  sha256: string;
  versionName: string;
  versionCode: number;
  signerSha256: string;
  builtAt: string;
}

interface PreviewState {
  schemaVersion: 1;
  status: PreviewStatus;
  canonicalRoot: string;
  worktreeHash: string;
  instanceId: string;
  lanIp: string;
  relayPort: number;
  relayUrl: string;
  daemonRequested: boolean;
  startedAt: string;
  stoppedAt?: string;
  supervisor?: SupervisorRecord;
  apk?: ApkArtifact;
}

interface SupervisorReceipt {
  schemaVersion: 1;
  instanceId: string;
  canonicalRoot: string;
  pid: number;
  processStartToken: string;
  createdAt: string;
}

interface RelayTarget {
  lanIp: string;
  relayPort: number;
  relayUrl: string;
}

interface GroupInspection {
  alive: boolean;
  owned: boolean;
  members: ProcessGroupMember[];
  reason?: string;
}

const INTERNAL_SUPERVISOR = '__supervisor';
const USAGE = 'Usage: bun preview:test | bun preview:status | bun preview:logs | bun preview:stop | bun preview:reset';
const COMMANDS: readonly PreviewCommand[] = ['test', 'status', 'logs', 'stop', 'reset'];
const POLL_INTERVAL_MS = 50;
const START_TIMEOUT_MS = 10_000;
const STOP_TIMEOUT_MS = 5_000;
const PREVIEW_SIGNER_SHA256 = 'ebd23c222b690e2be635fe3e52bd70b6fb86c5570ab279bc4e8c1f22ed90ef9c';
const MANUAL_VERSION_CODE_BASE = 920_000;
const APK_INPUT_PATHS = [
  '.bun-version',
  'bun.lock',
  'patches',
  'scripts/postinstall.cjs',
  'packages/lyntty-app',
  'packages/lyntty-wire',
] as const;

process.umask(0o077);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isErrno(error: unknown, code: string): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === code;
}

function testHooksEnabled(): boolean {
  return process.env.LYNTTY_PREVIEW_ALLOW_TEST_HOOKS === '1';
}

function testHook(name: string): boolean {
  return testHooksEnabled() && process.env[name] === '1';
}

function parseArgs(args: readonly string[]): PreviewCommand {
  if (args.length !== 1 || !COMMANDS.includes(args[0] as PreviewCommand)) throw new Error(USAGE);
  return args[0] as PreviewCommand;
}

async function runCaptured(command: string[], cwd: string, environment: Record<string, string> = copyEnvironment()): Promise<string> {
  const child = Bun.spawn({
    cmd: command,
    cwd,
    env: environment,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) throw new Error(stderr.trim() || `${command.join(' ')} failed`);
  return stdout.trim();
}

function copyEnvironment(): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) environment[key] = value;
  }
  return environment;
}

function sanitizePreviewBuildEnvironment(environment: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(environment).filter(([key]) => !key.startsWith('EXPO_PUBLIC_')));
}

async function resolveLayout(): Promise<PreviewLayout> {
  const root = await runCaptured(['git', 'rev-parse', '--show-toplevel'], process.cwd());
  const canonicalRoot = await realpath(root);
  const worktreeHash = createHash('sha256').update(canonicalRoot).digest('hex').slice(0, 16);
  const namespace = testHooksEnabled() ? process.env.LYNTTY_PREVIEW_TEST_NAMESPACE : undefined;
  const baseDir = namespace
    ? join(canonicalRoot, 'dist', 'manual-preview', 'tests', namespace)
    : join(canonicalRoot, 'dist', 'manual-preview');
  const stateDir = join(baseDir, worktreeHash);
  const logsDir = join(stateDir, 'logs');
  const profileHash = createHash('sha256').update(`${canonicalRoot}\0${namespace ?? 'default'}`).digest('hex').slice(0, 16);
  const lynttyHomeDir = join(stateDir, 'lyntty');
  return {
    canonicalRoot,
    worktreeHash,
    profileHash,
    stateDir,
    stateFile: join(stateDir, 'state.json'),
    receiptFile: join(stateDir, 'supervisor-receipt.json'),
    lifecycleLockDir: join(baseDir, '.locks', `${worktreeHash}.lock`),
    logsDir,
    supervisorLog: join(logsDir, 'supervisor.log'),
    runtimeLog: join(logsDir, 'runtime.log'),
    buildMarkerFile: join(stateDir, 'apk-build-owner.json'),
    relayDataDir: join(stateDir, 'relay'),
    pgliteDir: join(stateDir, 'relay', 'pglite'),
    masterSecretFile: join(stateDir, 'secrets', 'relay-master-secret'),
    lynttyHomeDir,
    accessFile: join(lynttyHomeDir, 'access.key'),
    settingsFile: join(lynttyHomeDir, 'settings.json'),
    extensionPath: join(stateDir, 'pi-extension', 'index.ts'),
    scriptPath: join(canonicalRoot, 'scripts', 'preview.ts'),
    relaySource: join(canonicalRoot, 'packages', 'lyntty-relay', 'sources', 'standalone.ts'),
    daemonSource: join(canonicalRoot, 'packages', 'lyntty-cli', 'src', 'daemon', 'entry.ts'),
    cliSource: join(canonicalRoot, 'packages', 'lyntty-cli', 'src', 'index.ts'),
    apkArtifactsDir: join(stateDir, 'artifacts'),
    apkManifestFile: join(stateDir, 'apk-manifest.json'),
    apkCounterFile: join(stateDir, 'apk-version-code.json'),
    apkAllowlistFile: testHooksEnabled() && process.env.LYNTTY_PREVIEW_TEST_APK_ALLOWLIST
      ? process.env.LYNTTY_PREVIEW_TEST_APK_ALLOWLIST
      : join(canonicalRoot, 'scripts', 'preview-apk-allowlist.json'),
    androidHomeDir: join(stateDir, 'android', 'home'),
    gradleHomeDir: join(stateDir, 'android', 'gradle'),
    androidUserHomeDir: join(stateDir, 'android', 'user-home'),
    ccacheDir: join(stateDir, 'android', 'ccache'),
  };
}

async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
}

async function writeAtomically(path: string, content: string): Promise<void> {
  await ensureDirectory(dirname(path));
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function writeJsonAtomically(path: string, value: unknown): Promise<void> {
  await writeAtomically(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return null;
    throw new Error(`Unable to read ${path}: ${errorMessage(error)}`);
  }
}

function parseSupervisor(value: unknown): SupervisorRecord | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Preview supervisor state');
  const raw = value as Record<string, unknown>;
  if (!Number.isSafeInteger(raw.pid) || (raw.pid as number) <= 0 || typeof raw.processStartToken !== 'string' || !raw.processStartToken) {
    throw new Error('Invalid Preview supervisor state');
  }
  return { pid: raw.pid as number, processStartToken: raw.processStartToken };
}

function parseApkArtifact(value: unknown): ApkArtifact {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Preview APK artifact');
  const raw = value as Record<string, unknown>;
  if (
    raw.schemaVersion !== 1
    || (raw.provenance !== 'local-build' && raw.provenance !== 'reviewed-import')
    || typeof raw.sourceCommit !== 'string'
    || !/^[0-9a-f]{40}$/.test(raw.sourceCommit)
    || typeof raw.sourceDigest !== 'string'
    || !raw.sourceDigest
    || typeof raw.path !== 'string'
    || !raw.path
    || typeof raw.sha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(raw.sha256)
    || typeof raw.versionName !== 'string'
    || !raw.versionName
    || !Number.isSafeInteger(raw.versionCode)
    || (raw.versionCode as number) <= 0
    || typeof raw.signerSha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(raw.signerSha256)
    || typeof raw.builtAt !== 'string'
  ) throw new Error('Invalid Preview APK artifact');
  return {
    schemaVersion: 1,
    provenance: raw.provenance,
    sourceCommit: raw.sourceCommit,
    sourceDigest: raw.sourceDigest,
    path: raw.path,
    sha256: raw.sha256,
    versionName: raw.versionName,
    versionCode: raw.versionCode as number,
    signerSha256: raw.signerSha256,
    builtAt: raw.builtAt,
  };
}

function parseState(value: unknown): PreviewState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Preview state');
  const raw = value as Record<string, unknown>;
  const statuses: readonly PreviewStatus[] = ['starting', 'awaiting_auth', 'running', 'stopped', 'failed'];
  if (
    raw.schemaVersion !== 1
    || !statuses.includes(raw.status as PreviewStatus)
    || typeof raw.canonicalRoot !== 'string'
    || typeof raw.worktreeHash !== 'string'
    || typeof raw.instanceId !== 'string'
    || typeof raw.lanIp !== 'string'
    || !Number.isSafeInteger(raw.relayPort)
    || (raw.relayPort as number) < 1
    || (raw.relayPort as number) > 65_535
    || typeof raw.relayUrl !== 'string'
    || typeof raw.daemonRequested !== 'boolean'
    || typeof raw.startedAt !== 'string'
    || (raw.stoppedAt !== undefined && typeof raw.stoppedAt !== 'string')
  ) throw new Error('Invalid Preview state');
  return {
    schemaVersion: 1,
    status: raw.status as PreviewStatus,
    canonicalRoot: raw.canonicalRoot,
    worktreeHash: raw.worktreeHash,
    instanceId: raw.instanceId,
    lanIp: raw.lanIp,
    relayPort: raw.relayPort as number,
    relayUrl: raw.relayUrl,
    daemonRequested: raw.daemonRequested,
    startedAt: raw.startedAt,
    ...(raw.stoppedAt ? { stoppedAt: raw.stoppedAt as string } : {}),
    ...(raw.supervisor !== undefined ? { supervisor: parseSupervisor(raw.supervisor) } : {}),
    ...(raw.apk !== undefined ? { apk: parseApkArtifact(raw.apk) } : {}),
  };
}

function parseReceipt(value: unknown): SupervisorReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Preview supervisor receipt');
  const raw = value as Record<string, unknown>;
  if (
    raw.schemaVersion !== 1
    || typeof raw.instanceId !== 'string'
    || typeof raw.canonicalRoot !== 'string'
    || !Number.isSafeInteger(raw.pid)
    || (raw.pid as number) <= 0
    || typeof raw.processStartToken !== 'string'
    || !raw.processStartToken
    || typeof raw.createdAt !== 'string'
  ) throw new Error('Invalid Preview supervisor receipt');
  return {
    schemaVersion: 1,
    instanceId: raw.instanceId,
    canonicalRoot: raw.canonicalRoot,
    pid: raw.pid as number,
    processStartToken: raw.processStartToken,
    createdAt: raw.createdAt,
  };
}

async function loadState(layout: PreviewLayout): Promise<PreviewState | null> {
  const value = await readJson(layout.stateFile);
  if (value === null) return null;
  const state = parseState(value);
  if (state.canonicalRoot !== layout.canonicalRoot || state.worktreeHash !== layout.worktreeHash) {
    throw new Error('Preview state belongs to a different worktree');
  }
  return state;
}

async function writeState(layout: PreviewLayout, state: PreviewState): Promise<void> {
  await writeJsonAtomically(layout.stateFile, state);
}

function hasExactEnvironment(environment: readonly string[], key: string, value: string): boolean {
  return environment.includes(`${key}=${value}`);
}

function pathIsInside(root: string, candidate: string): boolean {
  const child = relative(root, candidate);
  return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`));
}

async function inspectGroup(layout: PreviewLayout, state: PreviewState): Promise<GroupInspection> {
  const record = state.supervisor;
  if (!record) return { alive: false, owned: false, members: [], reason: 'supervisor-record-missing' };
  const allMembers = await listProcessGroups();
  const members = allMembers.filter(member => member.pgid === record.pid && !isZombie(member));
  if (members.length === 0) return { alive: false, owned: false, members: [], reason: 'not-running' };

  for (const member of members) {
    const identity = await readProcessIdentity(layout, member.pid);
    if (!identity) return { alive: true, owned: false, members, reason: `PID ${member.pid} identity unavailable` };
    if (
      !hasExactEnvironment(identity.environment, 'LYNTTY_PREVIEW_INSTANCE_ID', state.instanceId)
      || !hasExactEnvironment(identity.environment, 'LYNTTY_PREVIEW_ROOT', layout.canonicalRoot)
      || !hasExactEnvironment(identity.environment, 'LYNTTY_PREVIEW_ROLE', 'supervisor')
    ) return { alive: true, owned: false, members, reason: `PID ${member.pid} environment mismatch` };
    if (!pathIsInside(layout.canonicalRoot, identity.cwd)) {
      return { alive: true, owned: false, members, reason: `PID ${member.pid} cwd mismatch` };
    }
    if (member.pid === record.pid) {
      const actualStartToken = await processStartToken(member.pid);
      if (actualStartToken !== record.processStartToken) {
        return { alive: true, owned: false, members, reason: 'supervisor start token mismatch' };
      }
      const expectedArgv = [process.execPath, layout.scriptPath, INTERNAL_SUPERVISOR];
      if (identity.argv.length !== expectedArgv.length || identity.argv.some((arg, index) => arg !== expectedArgv[index])) {
        return { alive: true, owned: false, members, reason: 'supervisor command mismatch' };
      }
    }
  }
  return { alive: true, owned: true, members };
}

async function reconcileReceipt(layout: PreviewLayout, state: PreviewState): Promise<PreviewState> {
  if (state.supervisor) return state;
  const value = await readJson(layout.receiptFile);
  if (value === null) return state;
  const receipt = parseReceipt(value);
  if (receipt.instanceId !== state.instanceId || receipt.canonicalRoot !== layout.canonicalRoot) {
    throw new Error('Preview supervisor receipt does not match current state');
  }
  state.supervisor = { pid: receipt.pid, processStartToken: receipt.processStartToken };
  await writeState(layout, state);
  return state;
}

async function waitFor<T>(description: string, check: () => Promise<T | false>, timeoutMs: number): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const result = await check();
    if (result !== false) return result;
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(`Timed out waiting for ${description}`);
    await Bun.sleep(Math.min(POLL_INTERVAL_MS, remaining));
  }
}

function relayPortForHash(worktreeHash: string): number {
  return 42_000 + (Number.parseInt(worktreeHash.slice(0, 8), 16) % 18_000);
}

function isUsableLanIpv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const octets = address.split('.').map(Number);
  return octets[0] === 10
    || (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31)
    || (octets[0] === 192 && octets[1] === 168)
    || (octets[0] === 100 && octets[1]! >= 64 && octets[1]! <= 127);
}

function parseLinuxDefaultRoute(value: string): string | null {
  let routes: unknown;
  try {
    routes = JSON.parse(value) as unknown;
  } catch {
    return null;
  }
  if (!Array.isArray(routes)) return null;
  const candidates = routes.flatMap(route => {
    if (!route || typeof route !== 'object' || Array.isArray(route)) return [];
    const raw = route as Record<string, unknown>;
    if (raw.dst !== 'default' || typeof raw.prefsrc !== 'string' || !isUsableLanIpv4(raw.prefsrc)) return [];
    const metric = typeof raw.metric === 'number' && Number.isFinite(raw.metric) ? raw.metric : Number.MAX_SAFE_INTEGER;
    return [{ address: raw.prefsrc, metric }];
  }).sort((left, right) => left.metric - right.metric || left.address.localeCompare(right.address));
  return candidates[0]?.address ?? null;
}

function localIpv4Addresses(): string[] {
  return Object.values(networkInterfaces()).flatMap(entries => entries ?? []).flatMap(entry => (
    entry.family === 'IPv4' && !entry.internal && isUsableLanIpv4(entry.address) ? [entry.address] : []
  ));
}

async function selectedLanIp(): Promise<string> {
  const explicit = process.env.LYNTTY_PREVIEW_LAN_IP;
  if (explicit) {
    if (testHooksEnabled() && isIP(explicit) === 4) return explicit;
    if (!isUsableLanIpv4(explicit)) throw new Error(`LYNTTY_PREVIEW_LAN_IP is not a private LAN IPv4 address: ${explicit}`);
    if (!localIpv4Addresses().includes(explicit)) throw new Error(`LYNTTY_PREVIEW_LAN_IP is not assigned to this computer: ${explicit}`);
    return explicit;
  }

  if (process.platform === 'linux') {
    const route = await runCaptured(['ip', '-json', 'route', 'show', 'default'], process.cwd()).catch(() => '');
    const preferred = parseLinuxDefaultRoute(route);
    if (preferred) return preferred;
  } else if (process.platform === 'darwin') {
    const route = await runCaptured(['/sbin/route', '-n', 'get', 'default'], process.cwd()).catch(() => '');
    const interfaceName = route.match(/^\s*interface:\s*(\S+)\s*$/m)?.[1];
    if (interfaceName) {
      const address = await runCaptured(['/usr/sbin/ipconfig', 'getifaddr', interfaceName], process.cwd()).catch(() => '');
      if (isUsableLanIpv4(address)) return address;
    }
  }

  const addresses = [...new Set(localIpv4Addresses())].sort();
  if (addresses.length === 1) return addresses[0]!;
  const detail = addresses.length ? ` Candidates: ${addresses.join(', ')}.` : '';
  throw new Error(`Unable to choose one private LAN address.${detail} Set LYNTTY_PREVIEW_LAN_IP explicitly.`);
}

async function sourceDigest(layout: PreviewLayout): Promise<string> {
  const override = testHooksEnabled() ? process.env.LYNTTY_PREVIEW_TEST_SOURCE_DIGEST : undefined;
  if (override) return override;
  const child = Bun.spawn({
    cmd: ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...APK_INPUT_PATHS],
    cwd: layout.canonicalRoot,
    env: copyEnvironment(),
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) throw new Error(`Unable to inventory Preview APK inputs: ${stderr.trim() || 'git ls-files failed'}`);
  const files = new TextDecoder().decode(stdout).split('\0').filter(Boolean).sort();
  if (files.length === 0) throw new Error('Preview APK input inventory is empty');
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file);
    hash.update('\0');
    hash.update(await readFile(join(layout.canonicalRoot, file)));
    hash.update('\0');
  }
  const rootPackage = JSON.parse(await readFile(join(layout.canonicalRoot, 'package.json'), 'utf8')) as Record<string, unknown>;
  hash.update('root-build-config\0');
  hash.update(JSON.stringify({
    packageManager: rootPackage.packageManager,
    workspaces: rootPackage.workspaces,
    devDependencies: rootPackage.devDependencies,
    overrides: rootPackage.overrides,
    trustedDependencies: rootPackage.trustedDependencies,
  }));
  return hash.digest('hex');
}

function rootBuildConfig(value: Record<string, unknown>): Record<string, unknown> {
  return {
    packageManager: value.packageManager,
    workspaces: value.workspaces,
    devDependencies: value.devDependencies,
    overrides: value.overrides,
    trustedDependencies: value.trustedDependencies,
  };
}

async function runExitCode(command: string[], cwd: string): Promise<number> {
  const child = Bun.spawn({
    cmd: command,
    cwd,
    env: copyEnvironment(),
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
  });
  return child.exited;
}

async function apkInputsMatchCommit(layout: PreviewLayout, commit: string): Promise<boolean> {
  if (!/^[0-9a-f]{40}$/i.test(commit)) return false;
  if (await runExitCode(['git', 'cat-file', '-e', `${commit}^{commit}`], layout.canonicalRoot) !== 0) return false;
  if (await runExitCode(['git', 'diff', '--quiet', commit, '--', ...APK_INPUT_PATHS], layout.canonicalRoot) !== 0) return false;
  const untracked = await runCaptured(
    ['git', 'ls-files', '--others', '--exclude-standard', '--', ...APK_INPUT_PATHS],
    layout.canonicalRoot,
  );
  if (untracked) return false;
  const currentRoot = JSON.parse(await readFile(join(layout.canonicalRoot, 'package.json'), 'utf8')) as Record<string, unknown>;
  const committedRoot = JSON.parse(await runCaptured(['git', 'show', `${commit}:package.json`], layout.canonicalRoot)) as Record<string, unknown>;
  return JSON.stringify(rootBuildConfig(currentRoot)) === JSON.stringify(rootBuildConfig(committedRoot));
}

function parseAuditText(value: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of value.split('\n')) {
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    fields[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return fields;
}

async function previewApkCandidates(): Promise<{ paths: string[]; explicit: boolean }> {
  const explicit = process.env.LYNTTY_PREVIEW_APK?.trim();
  if (explicit) return { paths: [explicit], explicit: true };
  const downloads = join(homedir(), 'Downloads');
  const names = await readdir(downloads).catch(() => [] as string[]);
  return {
    paths: names.filter(name => /^lyntty-preview-.+\.apk$/.test(name)).sort().reverse().map(name => join(downloads, name)),
    explicit: false,
  };
}

interface ApprovedPreviewApk {
  sourceCommit: string;
  applicationId: string;
  versionName: string;
  versionCode: number;
  sha256: string;
  signerSha256: string;
}

async function approvedPreviewApks(layout: PreviewLayout): Promise<ApprovedPreviewApk[]> {
  const value = JSON.parse(await readFile(layout.apkAllowlistFile, 'utf8')) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Preview APK allowlist is invalid');
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== 1 || !Array.isArray(raw.artifacts)) throw new Error('Preview APK allowlist is invalid');
  return raw.artifacts.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Preview APK allowlist entry is invalid');
    const entry = item as Record<string, unknown>;
    if (
      typeof entry.sourceCommit !== 'string'
      || !/^[0-9a-f]{40}$/.test(entry.sourceCommit)
      || entry.applicationId !== 'dev.jczhang.lyntty.preview'
      || typeof entry.versionName !== 'string'
      || !entry.versionName
      || !Number.isSafeInteger(entry.versionCode)
      || (entry.versionCode as number) <= 0
      || typeof entry.sha256 !== 'string'
      || !/^[0-9a-f]{64}$/.test(entry.sha256)
      || entry.signerSha256 !== PREVIEW_SIGNER_SHA256
    ) throw new Error('Preview APK allowlist entry is invalid');
    return {
      sourceCommit: entry.sourceCommit,
      applicationId: entry.applicationId,
      versionName: entry.versionName,
      versionCode: entry.versionCode as number,
      sha256: entry.sha256,
      signerSha256: entry.signerSha256,
    };
  });
}

async function cachedArtifactIsTrusted(layout: PreviewLayout, artifact: ApkArtifact): Promise<boolean> {
  if (artifact.provenance === 'local-build') return true;
  return (await approvedPreviewApks(layout)).some(entry => (
    entry.sourceCommit === artifact.sourceCommit
    && entry.versionName === artifact.versionName
    && entry.versionCode === artifact.versionCode
    && entry.sha256 === artifact.sha256
    && entry.signerSha256 === artifact.signerSha256
  ));
}

async function importAuditedPreviewApk(
  layout: PreviewLayout,
  digest: string,
  expectedVersionName: string,
): Promise<ApkArtifact | null> {
  if (testHook('LYNTTY_PREVIEW_TEST_FAKE_APK')) return null;
  const candidates = await previewApkCandidates();
  const approved = await approvedPreviewApks(layout);
  for (const candidate of candidates.paths) {
    try {
      const auditPath = candidate.replace(/\.apk$/i, '.audit.txt');
      if (auditPath === candidate) throw new Error('Preview APK path must end in .apk');
      const fields = parseAuditText(await readFile(auditPath, 'utf8'));
      if (
        fields.application_id !== 'dev.jczhang.lyntty.preview'
        || fields.version_name !== expectedVersionName
        || fields.debuggable !== 'false'
        || fields.signature_scheme_v2 !== 'true'
        || fields.standalone_bundle !== 'assets/index.android.bundle'
        || fields.signer_sha256 !== PREVIEW_SIGNER_SHA256
        || !/^[0-9a-f]{64}$/.test(fields.sha256 ?? '')
        || !/^\d+$/.test(fields.version_code ?? '')
        || !(await apkInputsMatchCommit(layout, fields.source_commit ?? ''))
      ) throw new Error('APK audit does not match the current Preview source and identity');
      const sha256 = await sha256File(candidate);
      if (sha256 !== fields.sha256) throw new Error('APK SHA-256 does not match its audit sidecar');
      const approvedEntry = approved.find(entry => (
        entry.sourceCommit === fields.source_commit
        && entry.applicationId === fields.application_id
        && entry.versionName === fields.version_name
        && entry.versionCode === Number(fields.version_code)
        && entry.sha256 === sha256
        && entry.signerSha256 === fields.signer_sha256
      ));
      if (!approvedEntry) throw new Error('APK is not present in the reviewed Preview APK allowlist');
      if (!testHook('LYNTTY_PREVIEW_TEST_SKIP_APK_AUDIT')) {
        const appConfig = JSON.parse(await runCaptured(
          ['unzip', '-p', candidate, 'assets/app.config'],
          layout.canonicalRoot,
        )) as { extra?: { app?: { appEnv?: unknown; buildCommitSha?: unknown } } };
        if (
          appConfig.extra?.app?.appEnv !== 'preview'
          || appConfig.extra.app.buildCommitSha !== fields.source_commit
        ) throw new Error('APK embedded build identity does not match its source audit');
      }

      const artifactDir = join(layout.apkArtifactsDir, digest);
      await ensureDirectory(artifactDir);
      const apkPath = join(artifactDir, `lyntty-preview-${fields.version_name}-${fields.version_code}.apk`);
      await copyFile(candidate, apkPath);
      await copyFile(auditPath, join(artifactDir, 'source-audit.txt'));
      if (!testHook('LYNTTY_PREVIEW_TEST_SKIP_APK_AUDIT')) {
        const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '/opt/android-sdk';
        const audit = await runCaptured([
          join(layout.canonicalRoot, 'packages', 'lyntty-app', 'scripts', 'apk-audit.sh'),
          apkPath,
          'dev.jczhang.lyntty.preview',
          fields.version_name,
          fields.version_code,
          PREVIEW_SIGNER_SHA256,
        ], layout.canonicalRoot, {
          ...copyEnvironment(),
          ANDROID_HOME: androidHome,
          ANDROID_SDK_ROOT: androidHome,
        });
        await writeAtomically(join(artifactDir, 'apk-audit.txt'), `${audit}\n`);
      }
      const artifact: ApkArtifact = {
        schemaVersion: 1,
        provenance: 'reviewed-import',
        sourceCommit: fields.source_commit,
        sourceDigest: digest,
        path: apkPath,
        sha256,
        versionName: fields.version_name,
        versionCode: Number(fields.version_code),
        signerSha256: PREVIEW_SIGNER_SHA256,
        builtAt: new Date().toISOString(),
      };
      await writeJsonAtomically(layout.apkManifestFile, artifact);
      return artifact;
    } catch (error) {
      if (candidates.explicit) throw new Error(`Unable to import LYNTTY_PREVIEW_APK: ${errorMessage(error)}`);
    }
  }
  return null;
}

async function assertBuildMemoryAvailable(): Promise<void> {
  if (testHook('LYNTTY_PREVIEW_TEST_FAKE_APK')) return;
  if (testHooksEnabled() && process.env.LYNTTY_PREVIEW_ALLOW_LOW_MEMORY_BUILD === '1') return;
  if (process.platform !== 'linux') return;
  const testAvailable = testHooksEnabled() ? process.env.LYNTTY_PREVIEW_TEST_MEM_AVAILABLE_KIB : undefined;
  const meminfo = testAvailable ? '' : await readFile('/proc/meminfo', 'utf8');
  const availableKiB = testAvailable
    ? Number(testAvailable)
    : Number(meminfo.match(/^MemAvailable:\s+(\d+)\s+kB$/m)?.[1] ?? 0);
  const minimumKiB = 12 * 1024 * 1024;
  if (availableKiB < minimumKiB) {
    throw new Error(
      `A native Preview APK build needs at least 12 GiB available memory; currently ${(availableKiB / 1024 / 1024).toFixed(1)} GiB. `
      + 'Close memory-heavy processes or set LYNTTY_PREVIEW_APK to an audited current-source APK.',
    );
  }
}

async function sha256File(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function nextVersionCode(layout: PreviewLayout, previous: ApkArtifact | null): Promise<number> {
  let persisted = 0;
  const counter = await readJson(layout.apkCounterFile);
  if (counter && typeof counter === 'object' && !Array.isArray(counter)) {
    const value = (counter as Record<string, unknown>).lastVersionCode;
    if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error('Preview APK version counter is corrupted; run bun preview:reset');
    persisted = value as number;
  }
  const versionCode = Math.max(MANUAL_VERSION_CODE_BASE, persisted + 1, (previous?.versionCode ?? 0) + 1);
  await writeJsonAtomically(layout.apkCounterFile, { schemaVersion: 1, lastVersionCode: versionCode });
  return versionCode;
}

async function processHasBuildMarker(pid: number, buildId: string): Promise<boolean> {
  if (process.platform !== 'linux') {
    const identity = await readProcessIdentity({ canonicalRoot: process.cwd() }, pid);
    return identity !== null && hasExactEnvironment(identity.environment, 'LYNTTY_PREVIEW_BUILD_ID', buildId);
  }
  try {
    const environment = (await readFile(`/proc/${pid}/environ`)).toString().split('\0').filter(Boolean);
    return hasExactEnvironment(environment, 'LYNTTY_PREVIEW_BUILD_ID', buildId);
  } catch {
    return false;
  }
}

async function inspectBuildGroups(canonicalRoot: string, buildId: string): Promise<number[]> {
  const members = (await listProcessGroups()).filter(member => !isZombie(member));
  const candidateGroupIds = new Set<number>();
  for (const member of members) {
    if (await processHasBuildMarker(member.pid, buildId)) candidateGroupIds.add(member.pgid);
  }
  const ownedGroups: number[] = [];
  for (const pgid of candidateGroupIds) {
    const group = members.filter(member => member.pgid === pgid);
    for (const member of group) {
      let environment: string[];
      let cwd: string;
      if (process.platform === 'linux') {
        try {
          environment = (await readFile(`/proc/${member.pid}/environ`)).toString().split('\0').filter(Boolean);
          cwd = await readlink(`/proc/${member.pid}/cwd`);
        } catch {
          if (!processIsAlive(member.pid)) continue;
          throw new Error(`Refusing to stop Preview build group ${pgid}: PID ${member.pid} identity unavailable`);
        }
      } else {
        const identity = await readProcessIdentity({ canonicalRoot }, member.pid);
        if (!identity) {
          if (!processIsAlive(member.pid)) continue;
          throw new Error(`Refusing to stop Preview build group ${pgid}: PID ${member.pid} identity unavailable`);
        }
        environment = identity.environment;
        cwd = identity.cwd;
      }
      if (
        !hasExactEnvironment(environment, 'LYNTTY_PREVIEW_BUILD_ID', buildId)
        || !hasExactEnvironment(environment, 'LYNTTY_PREVIEW_BUILD_ROOT', canonicalRoot)
        || !pathIsInside(canonicalRoot, cwd)
      ) throw new Error(`Refusing to stop Preview build group ${pgid}: PID ${member.pid} ownership not proven`);
    }
    ownedGroups.push(pgid);
  }
  return ownedGroups;
}

async function inspectBuildPids(canonicalRoot: string, buildId: string): Promise<number[]> {
  const ownedPids: number[] = [];
  for (const member of (await listProcessGroups()).filter(member => !isZombie(member))) {
    if (!(await processHasBuildMarker(member.pid, buildId))) continue;
    const identity = await readProcessIdentity({ canonicalRoot }, member.pid);
    if (!identity) {
      if (!processIsAlive(member.pid)) continue;
      throw new Error(`Refusing to stop Preview build PID ${member.pid}: identity unavailable`);
    }
    if (
      !hasExactEnvironment(identity.environment, 'LYNTTY_PREVIEW_BUILD_ID', buildId)
      || !hasExactEnvironment(identity.environment, 'LYNTTY_PREVIEW_BUILD_ROOT', canonicalRoot)
      || !pathIsInside(canonicalRoot, identity.cwd)
    ) throw new Error(`Refusing to stop Preview build PID ${member.pid}: ownership not proven`);
    ownedPids.push(member.pid);
  }
  return ownedPids;
}

async function inspectBuildTargets(canonicalRoot: string, buildId: string): Promise<number[]> {
  if (process.platform === 'linux') {
    return (await inspectBuildGroups(canonicalRoot, buildId)).map(pgid => -pgid);
  }
  // Bun's detached subprocesses do not reliably form a distinct process group on Darwin.
  // Every Gradle/native descendant inherits the exact build marker, so sweep only those PIDs.
  return inspectBuildPids(canonicalRoot, buildId);
}

async function cleanupBuildProcesses(canonicalRoot: string, buildId: string): Promise<void> {
  const signal = async (name: 'SIGTERM' | 'SIGKILL'): Promise<void> => {
    for (const target of await inspectBuildTargets(canonicalRoot, buildId)) {
      try {
        process.kill(target, name);
      } catch (error) {
        if (!isErrno(error, 'ESRCH')) throw error;
      }
    }
  };
  await signal('SIGTERM');
  const stopped = await waitFor('Preview APK build process shutdown', async () => (
    (await inspectBuildTargets(canonicalRoot, buildId)).length === 0 ? true : false
  ), STOP_TIMEOUT_MS).then(() => true).catch(() => false);
  if (stopped) return;
  await signal('SIGKILL');
  await waitFor('Preview APK build forced shutdown', async () => (
    (await inspectBuildTargets(canonicalRoot, buildId)).length === 0 ? true : false
  ), STOP_TIMEOUT_MS);
}

async function runLogged(command: string[], cwd: string, environment: Record<string, string>, logPath: string): Promise<void> {
  const buildId = environment.LYNTTY_PREVIEW_BUILD_ID;
  const canonicalRoot = environment.LYNTTY_PREVIEW_BUILD_ROOT;
  if (!buildId || !canonicalRoot) throw new Error('Preview APK build ownership marker is missing');
  await ensureDirectory(dirname(logPath));
  const log = await open(logPath, 'w', 0o600);
  let interruptedBy: 'SIGINT' | 'SIGTERM' | null = null;
  let child: Bun.Subprocess | null = null;
  const interrupt = (signal: 'SIGINT' | 'SIGTERM'): void => {
    interruptedBy = signal;
    if (!child) return;
    try {
      if (process.platform === 'linux') process.kill(-child.pid, 'SIGTERM');
      else child.kill('SIGTERM');
    } catch {
      // The child may already have exited; the ownership sweep below is authoritative.
    }
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    child = Bun.spawn({
      cmd: command,
      cwd,
      env: environment,
      stdin: 'ignore',
      stdout: log.fd,
      stderr: log.fd,
      detached: true,
    });
    const exitCode = await child.exited;
    await cleanupBuildProcesses(canonicalRoot, buildId);
    if (interruptedBy) throw new Error(`Preview APK build interrupted by ${interruptedBy}. See ${logPath}`);
    if (exitCode !== 0) throw new Error(`Preview APK build exited with status ${exitCode}. See ${logPath}`);
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    await cleanupBuildProcesses(canonicalRoot, buildId).catch(() => undefined);
    await log.close();
  }
}

async function buildPreviewApk(
  layout: PreviewLayout,
  digest: string,
  versionName: string,
  versionCode: number,
): Promise<ApkArtifact> {
  const artifactDir = join(layout.apkArtifactsDir, digest);
  await Promise.all([
    ensureDirectory(artifactDir),
    ensureDirectory(layout.androidHomeDir),
    ensureDirectory(layout.gradleHomeDir),
    ensureDirectory(layout.androidUserHomeDir),
    ensureDirectory(layout.ccacheDir),
    ensureDirectory(layout.logsDir),
  ]);
  const apkPath = join(artifactDir, `lyntty-preview-${versionName}-${versionCode}.apk`);
  const sourceCommit = await runCaptured(['git', 'rev-parse', 'HEAD'], layout.canonicalRoot);
  if (testHook('LYNTTY_PREVIEW_TEST_FAKE_APK')) {
    await writeFile(apkPath, `fake Preview APK ${digest} ${versionCode}\n`, { mode: 0o600 });
  } else {
    const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '/opt/android-sdk';
    try {
      await stat(androidHome);
    } catch {
      throw new Error(`Android SDK was not found at ${androidHome}; set ANDROID_HOME`);
    }
    const appDir = join(layout.canonicalRoot, 'packages', 'lyntty-app');
    const localEnvironmentFiles = (await readdir(appDir)).filter(name => name === '.env' || name.startsWith('.env.'));
    const forbiddenBuildInputs = [
      ...localEnvironmentFiles.map(name => join(appDir, name)),
      join(appDir, 'google-services.json'),
      join(appDir, 'android', 'app', 'google-services.json'),
    ];
    for (const path of forbiddenBuildInputs) {
      try {
        await stat(path);
        throw new Error(`Refusing to embed unreviewed local Android configuration: ${path}`);
      } catch (error) {
        if (!isErrno(error, 'ENOENT')) throw error;
      }
    }
    const environment = sanitizePreviewBuildEnvironment(copyEnvironment());
    for (const key of [
      'LYNTTY_EXPO_PROJECT_ID',
      'LYNTTY_ANDROID_KEYSTORE_FILE',
      'LYNTTY_ANDROID_KEYSTORE_PASSWORD',
      'LYNTTY_ANDROID_KEY_ALIAS',
      'LYNTTY_ANDROID_KEY_PASSWORD',
    ]) delete environment[key];
    const buildId = randomUUID();
    Object.assign(environment, {
      APP_ENV: 'preview',
      LYNTTY_PREVIEW_BUILD_ID: buildId,
      LYNTTY_PREVIEW_BUILD_ROOT: layout.canonicalRoot,
      BUN_EXECUTABLE: process.execPath,
      HOME: layout.androidHomeDir,
      GRADLE_USER_HOME: layout.gradleHomeDir,
      ANDROID_USER_HOME: layout.androidUserHomeDir,
      ANDROID_HOME: androidHome,
      ANDROID_SDK_ROOT: androidHome,
      CCACHE_DIR: layout.ccacheDir,
      CCACHE_TEMPDIR: join(layout.ccacheDir, 'tmp'),
      CCACHE_DISABLE: '1',
      NODE_ENV: 'production',
      LYNTTY_BUILD_COMMIT_SHA: sourceCommit,
    });
    const androidDir = join(layout.canonicalRoot, 'packages', 'lyntty-app', 'android');
    const buildLog = join(layout.logsDir, 'apk-build.log');
    console.log(`Building standalone Preview APK. Log: ${buildLog}`);
    await writeJsonAtomically(layout.buildMarkerFile, {
      schemaVersion: 1,
      buildId,
      canonicalRoot: layout.canonicalRoot,
    });
    await runLogged([
      './gradlew',
      'assembleRelease',
      '--no-daemon',
      '--stacktrace',
      '--max-workers=1',
      '--no-parallel',
      '-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=768m -Dfile.encoding=UTF-8',
      '-Pkotlin.daemon.jvmargs=-Xmx768m',
      '-PreactNativeArchitectures=arm64-v8a',
      '-x',
      'lintVitalAnalyzeRelease',
      '-x',
      'lintVitalRelease',
      '-Pandroid.enablePngCrunchInReleaseBuilds=false',
      `-PlynttyVersionName=${versionName}`,
      `-PlynttyVersionCode=${versionCode}`,
    ], androidDir, environment, buildLog);
    await rm(layout.buildMarkerFile, { force: true });
    const builtApk = join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
    await copyFile(builtApk, apkPath);
    const audit = await runCaptured([
      join(layout.canonicalRoot, 'packages', 'lyntty-app', 'scripts', 'apk-audit.sh'),
      apkPath,
      'dev.jczhang.lyntty.preview',
      versionName,
      String(versionCode),
      PREVIEW_SIGNER_SHA256,
    ], layout.canonicalRoot, environment);
    await writeAtomically(join(artifactDir, 'apk-audit.txt'), `${audit}\n`);
  }
  const artifact: ApkArtifact = {
    schemaVersion: 1,
    provenance: 'local-build',
    sourceCommit,
    sourceDigest: digest,
    path: apkPath,
    sha256: await sha256File(apkPath),
    versionName,
    versionCode,
    signerSha256: PREVIEW_SIGNER_SHA256,
    builtAt: new Date().toISOString(),
  };
  await writeJsonAtomically(layout.apkManifestFile, artifact);
  return artifact;
}

async function ensurePreviewApk(layout: PreviewLayout): Promise<{ artifact: ApkArtifact; mode: 'built' | 'imported' | 'reused' }> {
  const digest = await sourceDigest(layout);
  const packageJson = JSON.parse(await readFile(join(layout.canonicalRoot, 'packages', 'lyntty-app', 'package.json'), 'utf8')) as { version?: unknown };
  if (typeof packageJson.version !== 'string' || !packageJson.version) throw new Error('Lyntty App package version is invalid');
  const manifestValue = await readJson(layout.apkManifestFile);
  const previous = manifestValue === null ? null : parseApkArtifact(manifestValue);
  if (previous && previous.sourceDigest === digest) {
    if (!pathIsInside(layout.apkArtifactsDir, previous.path)) throw new Error('Cached Preview APK path escapes the artifact directory');
    try {
      const hash = await sha256File(previous.path);
      if (hash === previous.sha256 && await cachedArtifactIsTrusted(layout, previous)) {
        return { artifact: previous, mode: 'reused' };
      }
    } catch (error) {
      if (!isErrno(error, 'ENOENT')) throw error;
    }
  }
  const imported = await importAuditedPreviewApk(layout, digest, packageJson.version);
  if (imported) return { artifact: imported, mode: 'imported' };
  await assertBuildMemoryAvailable();
  const versionCode = await nextVersionCode(layout, previous);
  return {
    artifact: await buildPreviewApk(layout, digest, packageJson.version, versionCode),
    mode: 'built',
  };
}

async function readMasterSecret(layout: PreviewLayout): Promise<string> {
  try {
    const existing = (await readFile(layout.masterSecretFile, 'utf8')).trim();
    if (existing.length < 32) throw new Error('Preview Relay master secret is corrupted; run bun preview:reset');
    return existing;
  } catch (error) {
    if (!isErrno(error, 'ENOENT')) throw error;
  }
  const secret = randomBytes(32).toString('base64');
  await writeAtomically(layout.masterSecretFile, `${secret}\n`);
  return secret;
}

async function desiredRelay(layout: PreviewLayout): Promise<RelayTarget> {
  const lanIp = await selectedLanIp();
  const relayPort = relayPortForHash(layout.profileHash);
  return { lanIp, relayPort, relayUrl: `http://${lanIp}:${relayPort}` };
}

function assertRelayPortAvailable(lanIp: string, port: number): void {
  let listener: { stop(closeActiveConnections?: boolean): void } | null = null;
  try {
    listener = Bun.listen({ hostname: lanIp, port, socket: { data() {} } });
  } catch {
    throw new Error(`Relay port ${port} is already in use or cannot bind on ${lanIp}`);
  } finally {
    listener?.stop(true);
  }
}

async function supervisorEnvironment(layout: PreviewLayout, state: PreviewState): Promise<Record<string, string>> {
  const environment = copyEnvironment();
  for (const key of [
    'DATABASE_URL',
    'REDIS_URL',
    'HANDY_MASTER_SECRET',
    'S3_HOST',
    'S3_PORT',
    'S3_USE_SSL',
    'S3_REGION',
    'S3_ACCESS_KEY',
    'S3_SECRET_KEY',
    'S3_BUCKET',
    'LYNTTY_RELEASE_TRUST_ROOTS',
    'LYNTTY_STABLE_BOM_URL',
    'LYNTTY_PREVIEW_BOM_URL',
  ]) delete environment[key];
  return {
    ...environment,
    LYNTTY_PREVIEW_INSTANCE_ID: state.instanceId,
    LYNTTY_PREVIEW_ROOT: layout.canonicalRoot,
    LYNTTY_PREVIEW_ROLE: 'supervisor',
    LYNTTY_PREVIEW_STATE_DIR: layout.stateDir,
    LYNTTY_PREVIEW_RECEIPT_FILE: layout.receiptFile,
    LYNTTY_PREVIEW_RUNTIME_LOG: layout.runtimeLog,
    LYNTTY_PREVIEW_DAEMON_REQUESTED: state.daemonRequested ? '1' : '0',
    LYNTTY_HOME_DIR: layout.lynttyHomeDir,
    LYNTTY_PI_EXTENSION_PATH: layout.extensionPath,
    LYNTTY_SERVER_URL: state.relayUrl,
    LYNTTY_DISABLE_CAFFEINATE: '1',
    LYNTTY_VARIANT: 'preview',
    LYNTTY_CLI_SOURCE_ENTRY: layout.cliSource,
    DB_PROVIDER: 'pglite',
    DATA_DIR: layout.relayDataDir,
    PGLITE_DIR: layout.pgliteDir,
    LYNTTY_MASTER_SECRET: await readMasterSecret(layout),
    HOST: state.lanIp,
    PORT: String(state.relayPort),
    PUBLIC_URL: state.relayUrl,
    NODE_ENV: 'development',
  };
}

async function startSupervisor(layout: PreviewLayout, state: PreviewState): Promise<PreviewState> {
  await ensureDirectory(layout.logsDir);
  await rm(layout.receiptFile, { force: true });
  const child = Bun.spawn({
    cmd: [process.execPath, layout.scriptPath, INTERNAL_SUPERVISOR],
    cwd: layout.canonicalRoot,
    env: await supervisorEnvironment(layout, state),
    stdin: 'ignore',
    stdout: Bun.file(layout.supervisorLog),
    stderr: Bun.file(layout.supervisorLog),
    detached: true,
  });
  child.unref?.();
  const receipt = await waitFor('Preview supervisor receipt', async () => {
    const value = await readJson(layout.receiptFile);
    if (value === null) return false;
    const candidate = parseReceipt(value);
    if (candidate.instanceId !== state.instanceId || candidate.canonicalRoot !== layout.canonicalRoot) {
      throw new Error('Preview supervisor receipt identity mismatch');
    }
    if (!processIsAlive(candidate.pid)) return false;
    return candidate;
  }, START_TIMEOUT_MS);
  state.supervisor = { pid: receipt.pid, processStartToken: receipt.processStartToken };
  state.status = 'running';
  await writeState(layout, state);
  const inspection = await inspectGroup(layout, state);
  if (!inspection.alive || !inspection.owned) throw new Error(`Preview supervisor ownership not proven: ${inspection.reason ?? 'unknown'}`);
  return state;
}

async function stopLocked(layout: PreviewLayout, state: PreviewState): Promise<PreviewState> {
  state = await reconcileReceipt(layout, state);
  const inspection = await inspectGroup(layout, state);
  if (!inspection.alive) {
    state.status = 'stopped';
    state.stoppedAt = new Date().toISOString();
    await writeState(layout, state);
    return state;
  }
  if (!inspection.owned || !state.supervisor) {
    throw new Error(`Refusing to stop Preview process group: ${inspection.reason ?? 'ownership not proven'}`);
  }

  const signalGroup = (signal: 'SIGTERM' | 'SIGKILL'): void => {
    try {
      process.kill(-state.supervisor!.pid, signal);
    } catch (error) {
      if (!isErrno(error, 'ESRCH')) throw error;
    }
  };
  signalGroup('SIGTERM');
  const stoppedAfterTerm = await waitFor('Preview process group shutdown', async () => {
    const current = await listProcessGroups();
    return current.some(member => member.pgid === state.supervisor!.pid && !isZombie(member)) ? false : true;
  }, STOP_TIMEOUT_MS).then(() => true).catch(() => false);
  if (!stoppedAfterTerm) {
    const beforeKill = await inspectGroup(layout, state);
    if (!beforeKill.alive) {
      // The group exited between the deadline and the fresh proof.
    } else if (!beforeKill.owned) {
      throw new Error(`Refusing to kill Preview process group: ${beforeKill.reason ?? 'ownership not proven'}`);
    } else {
      signalGroup('SIGKILL');
      await waitFor('Preview process group forced shutdown', async () => {
        const current = await listProcessGroups();
        return current.some(member => member.pgid === state.supervisor!.pid && !isZombie(member)) ? false : true;
      }, STOP_TIMEOUT_MS);
    }
  }
  state.status = 'stopped';
  state.stoppedAt = new Date().toISOString();
  await writeState(layout, state);
  return state;
}

async function withLifecycleLock<T>(layout: PreviewLayout, operation: () => Promise<T>): Promise<T> {
  const lock = await acquireAtomicLock(layout.lifecycleLockDir, 15_000, 'Timed out waiting for Preview lifecycle lock');
  try {
    return await operation();
  } finally {
    await lock.release();
  }
}

function runtimeEnvironment(layout: PreviewLayout, state: PreviewState): Record<string, string> {
  return {
    ...copyEnvironment(),
    LYNTTY_HOME_DIR: layout.lynttyHomeDir,
    LYNTTY_PI_EXTENSION_PATH: layout.extensionPath,
    LYNTTY_SERVER_URL: state.relayUrl,
    LYNTTY_DISABLE_CAFFEINATE: '1',
    LYNTTY_VARIANT: 'preview',
    LYNTTY_CLI_SOURCE_ENTRY: layout.cliSource,
  };
}

async function credentialsExist(layout: PreviewLayout): Promise<boolean> {
  const access = await readJson(layout.accessFile);
  const settings = await readJson(layout.settingsFile);
  if (!access || typeof access !== 'object' || Array.isArray(access)) return false;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return false;
  const accessRecord = access as Record<string, unknown>;
  const settingsRecord = settings as Record<string, unknown>;
  const encryption = accessRecord.encryption;
  const hasLegacyKey = typeof accessRecord.secret === 'string' && accessRecord.secret.length > 0;
  const hasDataKey = encryption !== null
    && typeof encryption === 'object'
    && !Array.isArray(encryption)
    && typeof (encryption as Record<string, unknown>).publicKey === 'string'
    && ((encryption as Record<string, unknown>).publicKey as string).length > 0
    && typeof (encryption as Record<string, unknown>).machineKey === 'string'
    && ((encryption as Record<string, unknown>).machineKey as string).length > 0;
  return (hasLegacyKey || hasDataKey)
    && typeof accessRecord.token === 'string'
    && accessRecord.token.length > 0
    && typeof settingsRecord.machineId === 'string'
    && settingsRecord.machineId.length > 0;
}

async function seedCredentialsForTest(layout: PreviewLayout, relayUrl: string): Promise<void> {
  if (!testHook('LYNTTY_PREVIEW_TEST_SEED_AUTH')) throw new Error('Test credential seeding is disabled');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const jwk = publicKey.export({ format: 'jwk' }) as { x?: string };
  if (!jwk.x) throw new Error('Unable to generate Preview test authentication key');
  const challenge = randomBytes(32);
  const response = await fetch(`${relayUrl}/v1/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      publicKey: Buffer.from(jwk.x, 'base64url').toString('base64'),
      challenge: challenge.toString('base64'),
      signature: sign(null, challenge, privateKey).toString('base64'),
    }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Preview test authentication failed (${response.status})`);
  const body = await response.json() as { token?: unknown };
  if (typeof body.token !== 'string' || !body.token) throw new Error('Preview test authentication returned no token');
  await writeJsonAtomically(layout.accessFile, {
    secret: randomBytes(32).toString('base64'),
    token: body.token,
  });
  await writeJsonAtomically(layout.settingsFile, {
    schemaVersion: 2,
    onboardingCompleted: true,
    machineId: randomUUID(),
    serverUrl: relayUrl,
  });
}

async function runInteractiveAuth(layout: PreviewLayout, state: PreviewState): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('First-time Preview pairing requires an interactive terminal');
  console.log('');
  console.log('First-time setup:');
  console.log(`1. In Lyntty (preview), set Server URL to ${state.relayUrl}`);
  console.log('   An imported APK may initially show relay.jczhang.cc; do not create or use an account there for this test.');
  console.log('2. Create the local test account only after the local URL is active.');
  const { createInterface } = await import('node:readline/promises');
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await readline.question('Press Enter after the App shows the local Server URL...');
  } finally {
    readline.close();
  }
  console.log('3. Scan the QR code shown below. The pairing URL is sensitive and is not saved.');
  console.log('');
  const child = Bun.spawn({
    cmd: [process.execPath, layout.cliSource, 'auth', 'login'],
    cwd: layout.canonicalRoot,
    env: runtimeEnvironment(layout, state),
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`Preview CLI authentication exited with status ${exitCode}`);
  if (!(await credentialsExist(layout))) throw new Error('Preview CLI authentication completed without durable credentials');
}

async function daemonIsRunning(layout: PreviewLayout, state: PreviewState): Promise<boolean> {
  try {
    const output = await runCaptured(
      [process.execPath, layout.cliSource, 'daemon', 'status'],
      layout.canonicalRoot,
      { ...runtimeEnvironment(layout, state), NO_COLOR: '1' },
    );
    return /daemon is running/i.test(output);
  } catch {
    return false;
  }
}

async function relayIsHealthy(state: PreviewState): Promise<boolean> {
  try {
    const response = await fetch(`${state.relayUrl}/health`, { signal: AbortSignal.timeout(1_500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function commandStatus(layout: PreviewLayout): Promise<void> {
  let state = await loadState(layout);
  if (!state) {
    console.log(`Preview test profile is not initialized. State: ${layout.stateDir}`);
    return;
  }
  state = await reconcileReceipt(layout, state);
  const inspection = await inspectGroup(layout, state);
  const effectiveStatus = inspection.alive ? state.status : state.status === 'running' ? 'stopped' : state.status;
  console.log(`Status: ${effectiveStatus}`);
  console.log(`Relay URL: ${state.relayUrl}`);
  console.log(`Owned supervisor: ${inspection.alive && inspection.owned ? 'yes' : 'no'}`);
  console.log(`Relay health: ${inspection.alive && await relayIsHealthy(state) ? 'healthy' : 'unavailable'}`);
  const daemonStatus = state.daemonRequested && inspection.alive && await daemonIsRunning(layout, state) ? 'running' : 'not started';
  console.log(`Daemon: ${daemonStatus}`);
  console.log('Global Pi extension touched: no');
  if (state.apk) {
    console.log(`APK: ${state.apk.path}`);
    console.log(`APK SHA-256: ${state.apk.sha256}`);
    console.log(`APK versionCode: ${state.apk.versionCode}`);
  }
  console.log(`State: ${layout.stateDir}`);
}

function redactLog(value: string, secrets: readonly string[]): string {
  let redacted = value;
  for (const secret of secrets) {
    if (secret) redacted = redacted.split(secret).join('<redacted>');
  }
  return redacted
    .replace(/lyntty:\/\/terminal\?[^\s"'<>]+/gi, '<redacted-pairing-url>')
    .replace(/(Authorization\s*:\s*Bearer\s+)[^\s\]"']+/gi, '$1<redacted>')
    .replace(/("?(?:token|secret|masterSecret|machineKey|publicKey)"?\s*[:=]\s*")([^"\n]+)(")/gi, '$1<redacted>$3');
}

async function logSecrets(layout: PreviewLayout): Promise<string[]> {
  const values: string[] = [];
  for (const path of [layout.accessFile, layout.masterSecretFile]) {
    const content = await readFile(path, 'utf8').catch(() => '');
    if (!content) continue;
    values.push(content.trim());
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      for (const key of ['token', 'secret', 'masterSecret']) {
        if (typeof parsed[key] === 'string') values.push(parsed[key] as string);
      }
    } catch {
      // The Relay master secret is a plain private file, not JSON.
    }
  }
  return values;
}

async function commandLogs(layout: PreviewLayout): Promise<void> {
  const state = await loadState(layout);
  if (!state) {
    console.log(`No Preview test logs found. State: ${layout.stateDir}`);
    return;
  }
  console.log(`Preview test logs: ${layout.logsDir}`);
  const secrets = await logSecrets(layout);
  let printed = false;
  for (const [label, path] of [['Supervisor', layout.supervisorLog], ['Runtime', layout.runtimeLog]] as const) {
    const content = await readFile(path, 'utf8').catch(() => '');
    if (!content) continue;
    const tail = content.slice(-65_536).split('\n').slice(-200).join('\n');
    console.log(`\n--- ${label} (${path}) ---`);
    console.log(redactLog(tail, secrets));
    printed = true;
  }
  if (!printed) console.log('No log output has been written yet.');
}

async function commandStop(layout: PreviewLayout): Promise<void> {
  const stopped = await withLifecycleLock(layout, async () => {
    const state = await loadState(layout);
    if (!state) return false;
    await stopLocked(layout, state);
    return true;
  });
  if (!stopped) {
    console.log('Preview test profile is not initialized; nothing to stop.');
    return;
  }
  console.log(`Preview test backend stopped. State preserved at ${layout.stateDir}`);
}

async function commandReset(layout: PreviewLayout): Promise<void> {
  const outcome = await withLifecycleLock(layout, async (): Promise<'missing' | 'incomplete' | 'complete'> => {
    const state = await loadState(layout);
    if (state) {
      await stopLocked(layout, state);
      await rm(layout.stateDir, { recursive: true, force: true });
      return 'complete';
    }
    const profileExists = await stat(layout.stateDir).then(() => true).catch(error => {
      if (isErrno(error, 'ENOENT')) return false;
      throw error;
    });
    if (!profileExists) return 'missing';
    const marker = await readJson(layout.buildMarkerFile);
    if (marker) {
      if (
        typeof marker !== 'object'
        || Array.isArray(marker)
        || marker.schemaVersion !== 1
        || typeof marker.buildId !== 'string'
        || marker.canonicalRoot !== layout.canonicalRoot
      ) throw new Error('Invalid Preview APK build ownership marker');
      await cleanupBuildProcesses(layout.canonicalRoot, marker.buildId);
    }
    await rm(layout.stateDir, { recursive: true, force: true });
    return 'incomplete';
  });
  if (outcome === 'missing') {
    console.log('Preview test profile is not initialized; nothing to reset.');
    return;
  }
  if (outcome === 'incomplete') {
    console.log('Preview test incomplete profile removed.');
    return;
  }
  console.log('Preview test profile reset. Local Relay data, account, and pairing were removed.');
}

async function ensureBackendLocked(
  layout: PreviewLayout,
  target: RelayTarget,
  daemonRequested: boolean,
  apk?: ApkArtifact,
): Promise<PreviewState> {
  let previous = await loadState(layout);
  if (previous) {
    previous = await reconcileReceipt(layout, previous);
    const inspection = await inspectGroup(layout, previous);
    if (inspection.alive) {
      if (!inspection.owned) throw new Error(`Existing Preview process group is not owned: ${inspection.reason ?? 'unknown'}`);
      if (previous.daemonRequested === daemonRequested && previous.relayUrl === target.relayUrl) {
        previous.status = 'running';
        if (apk) previous.apk = apk;
        await writeState(layout, previous);
        return previous;
      }
      await stopLocked(layout, previous);
    }
  }

  assertRelayPortAvailable(target.lanIp, target.relayPort);
  const state: PreviewState = {
    schemaVersion: 1,
    status: 'starting',
    canonicalRoot: layout.canonicalRoot,
    worktreeHash: layout.worktreeHash,
    instanceId: randomUUID(),
    lanIp: target.lanIp,
    relayPort: target.relayPort,
    relayUrl: target.relayUrl,
    daemonRequested,
    startedAt: new Date().toISOString(),
    ...(apk ? { apk } : {}),
  };
  await ensureDirectory(layout.stateDir);
  await writeState(layout, state);
  await startSupervisor(layout, state);
  if (!testHook('LYNTTY_PREVIEW_TEST_FAKE_RUNTIME')) {
    await waitFor('local Preview Relay health', async () => await relayIsHealthy(state) || false, 30_000);
  }
  return state;
}

async function runManagedPi(layout: PreviewLayout, state: PreviewState): Promise<void> {
  console.log('');
  console.log('Manual phone check:');
  console.log('1. Install/open the standalone Preview APK shown above.');
  console.log(`2. Confirm the App Server URL is ${state.relayUrl}`);
  console.log('3. Open the new Pi Session on the phone and send a short message.');
  console.log('4. Confirm Pi receives it, replies, and the reply appears on the phone.');
  console.log('5. Reopen the App and confirm the Session is still present.');
  console.log('');

  if (testHook('LYNTTY_PREVIEW_TEST_FAKE_PI')) {
    await writeJsonAtomically(join(layout.stateDir, 'pi-launch.json'), {
      schemaVersion: 1,
      home: process.env.HOME,
      lynttyHome: layout.lynttyHomeDir,
      extensionPath: layout.extensionPath,
      cwd: layout.canonicalRoot,
    });
    return;
  }
  if (!state.daemonRequested) throw new Error('Pair the Preview App before launching managed Pi');
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('bun preview:test must run in an interactive terminal to launch managed Pi');
  const child = Bun.spawn({
    cmd: [process.execPath, layout.cliSource],
    cwd: layout.canonicalRoot,
    env: {
      ...runtimeEnvironment(layout, state),
      LYNTTY_PI_EXTENSION_DISABLED: '1',
    },
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`Managed Pi exited with status ${exitCode}; Preview backend is still running`);
  console.log('Managed Pi exited. Preview Relay and daemon remain running; use bun preview:stop when finished.');
}

async function commandTest(layout: PreviewLayout): Promise<void> {
  const target = await desiredRelay(layout);
  const prepared = await withLifecycleLock(layout, async () => {
    const apkResult = testHook('LYNTTY_PREVIEW_TEST_SKIP_APK') ? undefined : await ensurePreviewApk(layout);
    if (testHook('LYNTTY_PREVIEW_TEST_PAUSE_BEFORE_BACKEND')) {
      await writeFile(join(layout.stateDir, '.test-before-backend'), 'ready\n', { mode: 0o600 });
      await Bun.sleep(1_000);
    }
    const authenticated = await credentialsExist(layout);
    const state = await ensureBackendLocked(layout, target, authenticated, apkResult?.artifact);
    return { apkResult, authenticated, state };
  });
  const apk = prepared.apkResult?.artifact;
  if (prepared.apkResult && apk) {
    console.log(`Preview APK ${prepared.apkResult.mode}: ${apk.path}`);
    console.log(`SHA-256: ${apk.sha256}`);
  }
  let { authenticated, state } = prepared;

  if (!authenticated && !testHook('LYNTTY_PREVIEW_TEST_SKIP_AUTH')) {
    if (testHook('LYNTTY_PREVIEW_TEST_SEED_AUTH')) await seedCredentialsForTest(layout, state.relayUrl);
    else await runInteractiveAuth(layout, state);
    authenticated = await credentialsExist(layout);
    if (!authenticated) throw new Error('Preview pairing did not produce usable credentials');
    state = await withLifecycleLock(layout, async () => ensureBackendLocked(layout, target, true, apk));
  }

  if (state.daemonRequested && !testHook('LYNTTY_PREVIEW_TEST_FAKE_RUNTIME')) {
    await waitFor('current source Preview daemon', async () => await daemonIsRunning(layout, state) || false, 30_000);
  }
  console.log(`Preview test backend is running at ${state.relayUrl}`);
  console.log(`State: ${layout.stateDir}`);
  if (!testHook('LYNTTY_PREVIEW_TEST_SKIP_PI')) await runManagedPi(layout, state);
}

async function runSupervisor(layout: PreviewLayout): Promise<void> {
  const instanceId = process.env.LYNTTY_PREVIEW_INSTANCE_ID;
  if (!instanceId || process.env.LYNTTY_PREVIEW_ROOT !== layout.canonicalRoot || process.env.LYNTTY_PREVIEW_ROLE !== 'supervisor') {
    throw new Error('Invalid Preview supervisor environment');
  }
  const token = await processStartToken(process.pid);
  if (!token) throw new Error('Unable to prove Preview supervisor process identity');
  const receipt: SupervisorReceipt = {
    schemaVersion: 1,
    instanceId,
    canonicalRoot: layout.canonicalRoot,
    pid: process.pid,
    processStartToken: token,
    createdAt: new Date().toISOString(),
  };
  await writeJsonAtomically(layout.receiptFile, receipt);

  if (testHook('LYNTTY_PREVIEW_TEST_FAKE_RUNTIME')) {
    const child = Bun.spawn({
      cmd: [process.execPath, '-e', 'setInterval(() => {}, 1_000)'],
      cwd: layout.canonicalRoot,
      env: copyEnvironment(),
      stdin: 'ignore',
      stdout: Bun.file(layout.runtimeLog),
      stderr: Bun.file(layout.runtimeLog),
      detached: false,
    });
    const exitCode = await child.exited;
    if (exitCode !== 0 && exitCode !== 143) throw new Error(`Preview test runtime exited with status ${exitCode}`);
    return;
  }

  const migrate = Bun.spawn({
    cmd: [process.execPath, layout.relaySource, 'migrate'],
    cwd: layout.canonicalRoot,
    env: copyEnvironment(),
    stdin: 'ignore',
    stdout: 'inherit',
    stderr: 'inherit',
    detached: false,
  });
  const migrationExit = await migrate.exited;
  if (migrationExit !== 0) throw new Error(`Preview Relay migration exited with status ${migrationExit}`);

  const relay = Bun.spawn({
    cmd: [process.execPath, layout.relaySource, 'serve'],
    cwd: layout.canonicalRoot,
    env: copyEnvironment(),
    stdin: 'ignore',
    stdout: 'inherit',
    stderr: 'inherit',
    detached: false,
  });
  if (process.env.LYNTTY_PREVIEW_DAEMON_REQUESTED !== '1') {
    const relayExit = await relay.exited;
    if (relayExit !== 0 && relayExit !== 143) throw new Error(`Preview Relay exited with status ${relayExit}`);
    return;
  }

  const daemon = Bun.spawn({
    cmd: [process.execPath, layout.daemonSource],
    cwd: layout.canonicalRoot,
    env: copyEnvironment(),
    stdin: 'ignore',
    stdout: 'inherit',
    stderr: 'inherit',
    detached: false,
  });
  const first = await Promise.race([
    relay.exited.then(exitCode => ({ role: 'Relay', exitCode, other: daemon })),
    daemon.exited.then(exitCode => ({ role: 'daemon', exitCode, other: relay })),
  ]);
  first.other.kill('SIGTERM');
  await first.other.exited;
  if (first.exitCode !== 0 && first.exitCode !== 143) throw new Error(`Preview ${first.role} exited with status ${first.exitCode}`);
  throw new Error(`Preview ${first.role} exited unexpectedly`);
}

async function main(): Promise<void> {
  if (process.argv[2] === INTERNAL_SUPERVISOR) {
    if (process.argv.length !== 3) throw new Error('Invalid internal Preview supervisor invocation');
    const layout = await resolveLayout();
    await runSupervisor(layout);
    return;
  }

  const command = parseArgs(process.argv.slice(2));
  const layout = await resolveLayout();
  if (command === 'status') return commandStatus(layout);
  if (command === 'logs') return commandLogs(layout);
  if (command === 'stop') return commandStop(layout);
  if (command === 'reset') return commandReset(layout);
  return commandTest(layout);
}

if (import.meta.main) {
  await main().catch((error: unknown) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}

export {
  cleanupBuildProcesses,
  isUsableLanIpv4,
  parseArgs,
  parseLinuxDefaultRoute,
  parseState,
  relayPortForHash,
  resolveLayout,
  sanitizePreviewBuildEnvironment,
};
