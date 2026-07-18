import { createHash, randomUUID } from 'node:crypto';
import { cp, link, lstat, mkdir, readFile, readlink, rename, rm, symlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import type { DaemonServiceManager, DaemonServiceState } from '@/daemon/service';
import {
  installLynttyPiExtension,
  lynttyPiExtensionPath,
  LYNTTY_PI_EXTENSION_SOURCE,
} from '@/pi/piExtensionInstall';
import { readArtifactManifest, type ArtifactManifestV1 } from './artifactManifest';
import { writeFileAtomically, writeJsonAtomically } from './atomicFile';
import type { InstallPaths } from './installPaths';
import { acquireInstallLock } from './installLock';
import { readInstallState, writeInstallState, type InstallStateV1 } from './installState';
import { verifyArtifactFiles } from './selfCheck';

export type InstallTransactionPhase =
  | 'preparing'
  | 'service-stopping'
  | 'extension-swapping'
  | 'current-swapping'
  | 'launcher-swapping'
  | 'service-starting'
  | 'health-checking'
  | 'committing';

interface InstallJournalV1 {
  schemaVersion: 1;
  id: string;
  phase: InstallTransactionPhase;
  candidateReleaseId: string;
  previousReleaseId: string | null;
  candidateCreated: boolean;
  candidateVersionPath: string;
  stagingPath: string;
  extensionPath: string;
  extensionExisted: boolean;
  extensionBackupPath: string;
  previousLauncherTarget: string | null;
  launcherExisted: boolean;
  previousServiceState: DaemonServiceState;
}

export interface ApplyInstallCandidateOptions {
  candidateRoot: string;
  manifest: ArtifactManifestV1;
  paths: InstallPaths;
  serviceManager: DaemonServiceManager;
  healthCheck: (releaseId: string) => Promise<void>;
  extensionPath?: string;
  extensionSource?: string;
  replaceExtension?: boolean;
  onPhase?: (phase: InstallTransactionPhase) => void | Promise<void>;
  cleanupTransaction?: (activeTransactionDir: string) => Promise<void>;
}

export interface ApplyInstallCandidateResult {
  releaseId: string;
  previousReleaseId: string | null;
  versionPath: string;
}

const ACTIVE_TRANSACTION_DIR = 'active';
const JOURNAL_FILE = 'journal.json';

async function pathKind(path: string): Promise<'missing' | 'file' | 'directory' | 'symlink' | 'other'> {
  try {
    const value = await lstat(path);
    if (value.isSymbolicLink()) return 'symlink';
    if (value.isFile()) return 'file';
    if (value.isDirectory()) return 'directory';
    return 'other';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
    throw error;
  }
}

async function readOptionalFile(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function restoreClaimedSymlink(claimedPath: string, path: string): Promise<void> {
  if (await pathKind(path) === 'missing') await link(claimedPath, path);
}

async function replaceOwnedSymlink(path: string, target: string, allowedExistingTargets: readonly string[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const kind = await pathKind(path);
  if (kind === 'symlink' && await readlink(path) === target) return;
  if (kind !== 'missing' && kind !== 'symlink') throw new Error(`Refusing to replace non-symlink path: ${path}`);

  const transactionId = randomUUID();
  const claimedPath = join(dirname(path), `.${basename(path)}.${transactionId}.claimed`);
  const temporaryPath = join(dirname(path), `.${basename(path)}.${transactionId}.tmp`);
  let claimed = false;
  if (kind === 'symlink') {
    await rename(path, claimedPath);
    claimed = true;
    const claimedKind = await pathKind(claimedPath);
    const claimedTarget = claimedKind === 'symlink' ? await readlink(claimedPath) : null;
    if (!claimedTarget || !allowedExistingTargets.includes(claimedTarget)) {
      await restoreClaimedSymlink(claimedPath, path).catch(() => undefined);
      await rm(claimedPath, { force: true });
      throw new Error(`Refusing to replace unrecognized symlink at ${path}`);
    }
  }

  try {
    await symlink(target, temporaryPath, 'dir');
    await link(temporaryPath, path);
  } catch (error) {
    if (claimed) await restoreClaimedSymlink(claimedPath, path).catch(() => undefined);
    throw new Error(`Failed to publish owned symlink ${path} without clobbering: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await rm(temporaryPath, { force: true });
    if (claimed) await rm(claimedPath, { force: true });
  }
}

async function removeOwnedSymlink(path: string, allowedTargets: readonly string[]): Promise<void> {
  const kind = await pathKind(path);
  if (kind === 'missing') return;
  if (kind !== 'symlink') throw new Error(`Refusing to remove non-symlink path: ${path}`);
  const claimedPath = join(dirname(path), `.${basename(path)}.${randomUUID()}.claimed`);
  await rename(path, claimedPath);
  const claimedKind = await pathKind(claimedPath);
  const claimedTarget = claimedKind === 'symlink' ? await readlink(claimedPath) : null;
  if (!claimedTarget || !allowedTargets.includes(claimedTarget)) {
    await restoreClaimedSymlink(claimedPath, path).catch(() => undefined);
    await rm(claimedPath, { force: true });
    throw new Error(`Refusing to remove unrecognized symlink at ${path}`);
  }
  await rm(claimedPath, { force: true });
}

async function validateCurrentPointer(paths: InstallPaths, state: InstallStateV1 | null): Promise<void> {
  const kind = await pathKind(paths.currentPath);
  if (!state) {
    if (kind !== 'missing') throw new Error('Install state is missing but a current pointer already exists');
    return;
  }
  if (kind !== 'symlink') throw new Error('Installed current pointer is missing or is not a symbolic link');
  const target = await readlink(paths.currentPath);
  const expected = join('versions', state.currentReleaseId);
  if (target !== expected) throw new Error(`Install state/current pointer mismatch: expected ${expected}, found ${target}`);
}

async function writeJournal(path: string, journal: InstallJournalV1, phase: InstallTransactionPhase): Promise<void> {
  journal.phase = phase;
  await writeJsonAtomically(path, journal);
}

function snapshotPath(paths: InstallPaths, releaseId: string): string {
  return join(paths.extensionSnapshotsDir, `${releaseId}.ts`);
}

async function restoreExtension(journal: InstallJournalV1): Promise<void> {
  if (!journal.extensionExisted) {
    await rm(journal.extensionPath, { force: true });
    return;
  }
  const backup = await readFile(journal.extensionBackupPath);
  await writeFileAtomically(journal.extensionPath, backup, { mode: 0o600 });
}

async function restoreLauncher(paths: InstallPaths, journal: InstallJournalV1): Promise<void> {
  const launcherPath = join(paths.userBinDir, 'lyntty');
  const managedTarget = join(paths.currentPath, 'lyntty');
  if (!journal.launcherExisted) {
    await removeOwnedSymlink(launcherPath, [managedTarget]);
    return;
  }
  if (journal.previousLauncherTarget !== managedTarget) throw new Error('Launcher rollback target is not installer-owned');
  await replaceOwnedSymlink(launcherPath, managedTarget, [managedTarget]);
}

async function restoreCurrentPointer(paths: InstallPaths, journal: InstallJournalV1): Promise<void> {
  const candidateTarget = join('versions', journal.candidateReleaseId);
  if (journal.previousReleaseId === null) {
    await removeOwnedSymlink(paths.currentPath, [candidateTarget]);
    return;
  }
  const previousTarget = join('versions', journal.previousReleaseId);
  await replaceOwnedSymlink(paths.currentPath, previousTarget, [candidateTarget, previousTarget]);
}

async function restoreService(manager: DaemonServiceManager, previousState: DaemonServiceState): Promise<void> {
  if (previousState === 'not-installed') {
    await manager.uninstall();
  } else if (previousState === 'running') {
    await manager.restart();
  } else {
    await manager.stop();
  }
}

async function rollbackJournal(paths: InstallPaths, journal: InstallJournalV1, manager: DaemonServiceManager): Promise<void> {
  await manager.stop().catch(() => undefined);
  await restoreCurrentPointer(paths, journal);
  await restoreLauncher(paths, journal);
  await restoreExtension(journal);
  await restoreService(manager, journal.previousServiceState);
  await rm(journal.stagingPath, { recursive: true, force: true });
  if (journal.candidateCreated) await rm(journal.candidateVersionPath, { recursive: true, force: true });
}

function parseJournal(value: unknown): InstallJournalV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('install journal is invalid');
  const journal = value as InstallJournalV1;
  const phases: InstallTransactionPhase[] = [
    'preparing', 'service-stopping', 'extension-swapping', 'current-swapping',
    'launcher-swapping', 'service-starting', 'health-checking', 'committing',
  ];
  if (journal.schemaVersion !== 1 || !phases.includes(journal.phase)) throw new Error('install journal schema or phase is invalid');
  for (const key of ['id', 'candidateReleaseId', 'candidateVersionPath', 'stagingPath', 'extensionPath', 'extensionBackupPath'] as const) {
    if (typeof journal[key] !== 'string' || !journal[key]) throw new Error(`install journal ${key} is invalid`);
  }
  const releasePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
  if (!releasePattern.test(journal.candidateReleaseId)) throw new Error('install journal candidate release is invalid');
  if (journal.previousReleaseId !== null && (typeof journal.previousReleaseId !== 'string' || !releasePattern.test(journal.previousReleaseId))) {
    throw new Error('install journal previous release is invalid');
  }
  if (typeof journal.candidateCreated !== 'boolean' || typeof journal.extensionExisted !== 'boolean' || typeof journal.launcherExisted !== 'boolean') {
    throw new Error('install journal flags are invalid');
  }
  if (journal.previousLauncherTarget !== null && typeof journal.previousLauncherTarget !== 'string') throw new Error('install journal launcher target is invalid');
  if (!['running', 'stopped', 'not-installed'].includes(journal.previousServiceState)) throw new Error('install journal service state is invalid');
  return journal;
}

function validateJournalPaths(paths: InstallPaths, activeDir: string, journal: InstallJournalV1, expectedExtensionPath: string): void {
  const expectedVersionPath = join(paths.versionsDir, journal.candidateReleaseId);
  if (journal.candidateVersionPath !== expectedVersionPath) throw new Error('install journal candidate path escaped the install root');
  const stagingRelative = relative(paths.versionsDir, journal.stagingPath);
  if (!stagingRelative || stagingRelative.startsWith('..') || !basename(journal.stagingPath).startsWith(`.${journal.candidateReleaseId}.`)) {
    throw new Error('install journal staging path escaped the install root');
  }
  if (journal.extensionBackupPath !== join(activeDir, 'extension.before')) {
    throw new Error('install journal extension backup path is invalid');
  }
  if (journal.extensionPath !== expectedExtensionPath) {
    throw new Error('install journal extension path does not match the current isolated configuration');
  }
}

export async function recoverInterruptedInstall(
  paths: InstallPaths,
  manager: DaemonServiceManager,
  expectedExtensionPath = lynttyPiExtensionPath(),
): Promise<boolean> {
  const activeDir = join(paths.transactionsDir, ACTIVE_TRANSACTION_DIR);
  const journalPath = join(activeDir, JOURNAL_FILE);
  const journalBytes = await readOptionalFile(journalPath);
  if (!journalBytes) return false;
  const journal = parseJournal(JSON.parse(journalBytes.toString('utf8')));
  validateJournalPaths(paths, activeDir, journal, expectedExtensionPath);
  const state = await readInstallState(paths.statePath);
  if (journal.phase === 'committing' && state?.currentReleaseId === journal.candidateReleaseId) {
    await rm(activeDir, { recursive: true, force: true });
    return true;
  }
  await rollbackJournal(paths, journal, manager).catch(error => {
    throw new Error(`Interrupted Lyntty update requires manual recovery: ${error instanceof Error ? error.message : String(error)}`);
  });
  await rm(activeDir, { recursive: true, force: true });
  return true;
}

async function prepareCandidate(
  candidateRoot: string,
  manifest: ArtifactManifestV1,
  paths: InstallPaths,
  journal: InstallJournalV1,
): Promise<void> {
  const versionKind = await pathKind(journal.candidateVersionPath);
  if (versionKind === 'directory') {
    const installedManifest = await readArtifactManifest(join(journal.candidateVersionPath, 'artifact-manifest.json'));
    if (JSON.stringify(installedManifest) !== JSON.stringify(manifest)) {
      throw new Error('Existing release directory has conflicting metadata');
    }
    await verifyArtifactFiles(journal.candidateVersionPath, manifest);
    journal.candidateCreated = false;
    return;
  }
  if (versionKind !== 'missing') throw new Error('Candidate release path is not a directory');
  journal.candidateCreated = true;
  const stagingFromCandidate = relative(resolve(candidateRoot), resolve(journal.stagingPath));
  const stagingIsInsideCandidate = stagingFromCandidate === ''
    || (stagingFromCandidate !== '..' && !stagingFromCandidate.startsWith(`..${sep}`) && !isAbsolute(stagingFromCandidate));
  if (stagingIsInsideCandidate) throw new Error('Install root must not be inside the candidate artifact directory');
  await rm(journal.stagingPath, { recursive: true, force: true });
  await cp(candidateRoot, journal.stagingPath, { recursive: true, errorOnExist: true, force: false });
  await verifyArtifactFiles(journal.stagingPath, manifest);
  await rename(journal.stagingPath, journal.candidateVersionPath);
}

export async function applyInstallCandidate(options: ApplyInstallCandidateOptions): Promise<ApplyInstallCandidateResult> {
  if (process.platform === 'win32') throw new Error('Atomic installer/updater is not yet supported on Windows');
  const candidateExtensionSource = options.extensionSource ?? LYNTTY_PI_EXTENSION_SOURCE;
  if (options.manifest.extensionSha256 !== extensionDigest(Buffer.from(candidateExtensionSource))) {
    throw new Error('Candidate Pi extension digest does not match the installer extension source');
  }
  await verifyArtifactFiles(options.candidateRoot, options.manifest);
  await mkdir(options.paths.rootDir, { recursive: true, mode: 0o700 });
  await mkdir(options.paths.versionsDir, { recursive: true, mode: 0o700 });
  await mkdir(options.paths.transactionsDir, { recursive: true, mode: 0o700 });
  await mkdir(options.paths.extensionSnapshotsDir, { recursive: true, mode: 0o700 });

  const lock = await acquireInstallLock(join(options.paths.rootDir, '.install.lock'));
  try {
    const resolvedExtensionPath = options.extensionPath ?? lynttyPiExtensionPath();
    await recoverInterruptedInstall(options.paths, options.serviceManager, resolvedExtensionPath);
    const previousState = await readInstallState(options.paths.statePath);
    await validateCurrentPointer(options.paths, previousState);
    if (previousState?.quarantinedReleaseIds[options.manifest.releaseId]) {
      throw new Error(`Release ${options.manifest.releaseId} is quarantined: ${previousState.quarantinedReleaseIds[options.manifest.releaseId]}`);
    }
    if (previousState?.currentReleaseId === options.manifest.releaseId) {
      const installedRoot = join(options.paths.versionsDir, options.manifest.releaseId);
      const installedManifest = await readArtifactManifest(join(installedRoot, 'artifact-manifest.json'));
      if (JSON.stringify(installedManifest) !== JSON.stringify(options.manifest)) {
        throw new Error('Installed release metadata conflicts with the candidate');
      }
      await verifyArtifactFiles(installedRoot, installedManifest);
      const serviceState = await options.serviceManager.status();
      if (serviceState === 'not-installed') await options.serviceManager.install();
      else if (serviceState === 'stopped') await options.serviceManager.start();
      await options.healthCheck(options.manifest.releaseId);
      return {
        releaseId: options.manifest.releaseId,
        previousReleaseId: previousState.previousReleaseId,
        versionPath: join(options.paths.versionsDir, options.manifest.releaseId),
      };
    }

    const activeDir = join(options.paths.transactionsDir, ACTIVE_TRANSACTION_DIR);
    await rm(activeDir, { recursive: true, force: true });
    await mkdir(activeDir, { recursive: true, mode: 0o700 });
    const journalPath = join(activeDir, JOURNAL_FILE);
    const extensionPath = resolvedExtensionPath;
    const extensionBefore = await readOptionalFile(extensionPath);
    const launcherPath = join(options.paths.userBinDir, 'lyntty');
    const launcherKind = await pathKind(launcherPath);
    if (launcherKind !== 'missing' && launcherKind !== 'symlink') {
      throw new Error(`Refusing to replace unrecognized launcher at ${launcherPath}; move it before installing`);
    }
    const previousLauncherTarget = launcherKind === 'symlink' ? await readlink(launcherPath) : null;
    const managedLauncherTarget = join(options.paths.currentPath, 'lyntty');
    if (previousLauncherTarget !== null && (previousState === null || previousLauncherTarget !== managedLauncherTarget)) {
      throw new Error(`Refusing to replace unrecognized symlink at ${launcherPath}`);
    }
    const serviceState = await options.serviceManager.status();
    const candidateVersionPath = join(options.paths.versionsDir, options.manifest.releaseId);
    const journal: InstallJournalV1 = {
      schemaVersion: 1,
      id: randomUUID(),
      phase: 'preparing',
      candidateReleaseId: options.manifest.releaseId,
      previousReleaseId: previousState?.currentReleaseId ?? null,
      candidateCreated: false,
      candidateVersionPath,
      stagingPath: join(options.paths.versionsDir, `.${options.manifest.releaseId}.${randomUUID()}.staging`),
      extensionPath,
      extensionExisted: extensionBefore !== null,
      extensionBackupPath: join(activeDir, 'extension.before'),
      previousLauncherTarget,
      launcherExisted: launcherKind !== 'missing',
      previousServiceState: serviceState,
    };
    if (extensionBefore) await writeFileAtomically(journal.extensionBackupPath, extensionBefore, { mode: 0o600 });
    await writeJournal(journalPath, journal, 'preparing');
    try {
      await options.onPhase?.('preparing');
      await prepareCandidate(options.candidateRoot, options.manifest, options.paths, journal);
      await writeJournal(journalPath, journal, 'service-stopping');
      await options.onPhase?.('service-stopping');
      if (serviceState !== 'not-installed') await options.serviceManager.stop();

      await writeJournal(journalPath, journal, 'extension-swapping');
      await options.onPhase?.('extension-swapping');
      if (options.extensionSource === undefined) {
        await installLynttyPiExtension({
          extensionPath,
          replaceUnknown: options.replaceExtension,
          allowedExistingSha256: previousState ? [previousState.extensionSha256] : [],
        });
      } else {
        const currentDigest = extensionBefore ? extensionDigest(extensionBefore) : null;
        if (currentDigest && !options.replaceExtension && currentDigest !== previousState?.extensionSha256) {
          throw new Error(`Refusing to overwrite an unrecognized Pi extension at ${extensionPath}`);
        }
        await writeFileAtomically(extensionPath, candidateExtensionSource, { mode: 0o600 });
      }
      await writeFileAtomically(snapshotPath(options.paths, options.manifest.releaseId), candidateExtensionSource, { mode: 0o600 });
      if (previousState && extensionBefore) {
        await writeFileAtomically(snapshotPath(options.paths, previousState.currentReleaseId), extensionBefore, { mode: 0o600 });
      }

      await writeJournal(journalPath, journal, 'current-swapping');
      await options.onPhase?.('current-swapping');
      await replaceOwnedSymlink(
        options.paths.currentPath,
        join('versions', options.manifest.releaseId),
        previousState ? [join('versions', previousState.currentReleaseId)] : [],
      );

      await writeJournal(journalPath, journal, 'launcher-swapping');
      await options.onPhase?.('launcher-swapping');
      await mkdir(options.paths.userBinDir, { recursive: true, mode: 0o700 });
      await replaceOwnedSymlink(launcherPath, managedLauncherTarget, previousState ? [managedLauncherTarget] : []);

      await writeJournal(journalPath, journal, 'service-starting');
      await options.onPhase?.('service-starting');
      // Reinstall the native definition on every transition so a stale or
      // ephemeral ExecStart can never survive an otherwise valid update.
      await options.serviceManager.install();
      await options.serviceManager.restart();

      await writeJournal(journalPath, journal, 'health-checking');
      await options.onPhase?.('health-checking');
      await options.healthCheck(options.manifest.releaseId);

      await writeJournal(journalPath, journal, 'committing');
      await options.onPhase?.('committing');
      const nextState: InstallStateV1 = {
        schemaVersion: 1,
        currentReleaseId: options.manifest.releaseId,
        previousReleaseId: previousState?.currentReleaseId ?? null,
        extensionSha256: options.manifest.extensionSha256,
        knownGoodReleaseIds: [...new Set([...(previousState?.knownGoodReleaseIds ?? []), options.manifest.releaseId])],
        quarantinedReleaseIds: { ...(previousState?.quarantinedReleaseIds ?? {}) },
      };
      await writeInstallState(options.paths.statePath, nextState);
      // Publishing install-state.json is the commit point. Journal cleanup is
      // recoverable and must never roll back a committed first installation.
      const cleanupTransaction = options.cleanupTransaction
        ?? (path => rm(path, { recursive: true, force: true }));
      await cleanupTransaction(activeDir).catch(() => undefined);
      return {
        releaseId: options.manifest.releaseId,
        previousReleaseId: previousState?.currentReleaseId ?? null,
        versionPath: candidateVersionPath,
      };
    } catch (error) {
      let rollbackError: unknown = null;
      try {
        await rollbackJournal(options.paths, journal, options.serviceManager);
      } catch (caught) {
        rollbackError = caught;
      }
      if (previousState) {
        await writeInstallState(options.paths.statePath, {
          ...previousState,
          quarantinedReleaseIds: {
            ...previousState.quarantinedReleaseIds,
            [options.manifest.releaseId]: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
          },
        }).catch(() => undefined);
      }
      if (rollbackError) {
        throw new Error(`Update failed and rollback requires manual recovery: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
      }
      await rm(activeDir, { recursive: true, force: true });
      throw error;
    }
  } finally {
    await lock.release();
  }
}

export async function rollbackInstallCandidate(options: {
  paths: InstallPaths;
  serviceManager: DaemonServiceManager;
  healthCheck: (releaseId: string) => Promise<void>;
  extensionPath?: string;
  replaceExtension?: boolean;
  onPhase?: (phase: InstallTransactionPhase) => void | Promise<void>;
}): Promise<ApplyInstallCandidateResult> {
  const state = await readInstallState(options.paths.statePath);
  if (!state?.previousReleaseId) throw new Error('No previous known-good Lyntty release is available for rollback');
  if (!state.knownGoodReleaseIds.includes(state.previousReleaseId)) {
    throw new Error(`Rollback target ${state.previousReleaseId} is not recorded as known-good`);
  }
  const candidateRoot = join(options.paths.versionsDir, state.previousReleaseId);
  const manifest = await readArtifactManifest(join(candidateRoot, 'artifact-manifest.json'));
  if (manifest.releaseId !== state.previousReleaseId) throw new Error('Rollback target manifest identity is inconsistent');
  const extensionSource = await readFile(snapshotPath(options.paths, state.previousReleaseId), 'utf8');
  if (extensionDigest(Buffer.from(extensionSource)) !== manifest.extensionSha256) {
    throw new Error('Rollback Pi extension snapshot does not match the target manifest');
  }
  return applyInstallCandidate({
    candidateRoot,
    manifest,
    paths: options.paths,
    serviceManager: options.serviceManager,
    healthCheck: options.healthCheck,
    extensionPath: options.extensionPath,
    extensionSource,
    replaceExtension: options.replaceExtension,
    onPhase: options.onPhase,
  });
}

export function extensionDigest(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}
