import { readCredentials } from '@/persistence';
import {
  checkIfDaemonRunningAndCleanupStaleState,
  isDaemonRunningExpectedRelease,
  stopDaemon,
} from '@/daemon/controlClient';
import { createDaemonServiceManager, type DaemonServiceManager } from '@/daemon/service';
import { verifyLocalReleaseCandidate } from '@/distribution/candidateCompatibility';
import { resolveInstallPaths } from '@/distribution/installPaths';
import { applyInstallCandidate, rollbackInstallCandidate } from '@/distribution/installTransaction';
import { readInstallState } from '@/distribution/installState';
import { runtimeLayout } from '@/distribution/runtimeLayout';

interface ParsedApplyOptions {
  manifestSha256: string;
  installRoot?: string;
  replaceExtension: boolean;
}

function valueAfter(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseUpdateApplyOptions(args: string[]): ParsedApplyOptions {
  let manifestSha256: string | null = null;
  let installRoot: string | undefined;
  let replaceExtension = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === '--manifest-sha256') manifestSha256 = valueAfter(args, index++, arg);
    else if (arg === '--install-root') installRoot = valueAfter(args, index++, arg);
    else if (arg === '--replace-extension') replaceExtension = true;
    else throw new Error(`Unknown update install argument: ${arg}`);
  }
  if (!manifestSha256) throw new Error('--manifest-sha256 is required');
  return { manifestSha256, installRoot, replaceExtension };
}

async function requireAuthenticatedInstall(): Promise<void> {
  if (!await readCredentials()) {
    throw new Error('Authenticate first with `lyntty auth login`; installation never starts an interactive daemon login.');
  }
}

async function waitForInstalledDaemon(manager: DaemonServiceManager, releaseId: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await manager.status() === 'running' && await isDaemonRunningExpectedRelease(releaseId)) return;
    await Bun.sleep(100);
  }
  throw new Error(`managed lynttyd ${releaseId} did not become healthy within 15 seconds`);
}

async function stopLegacyUnmanagedDaemon(manager: DaemonServiceManager): Promise<void> {
  if (await manager.status() !== 'not-installed' || !await checkIfDaemonRunningAndCleanupStaleState()) return;
  await stopDaemon();
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (!await checkIfDaemonRunningAndCleanupStaleState()) return;
    await Bun.sleep(100);
  }
  throw new Error('Legacy unmanaged lynttyd did not stop; refusing to install a competing user service');
}

async function applyCurrentArtifact(args: string[]): Promise<void> {
  await requireAuthenticatedInstall();
  const parsed = parseUpdateApplyOptions(args);
  const layout = runtimeLayout();
  if (!layout.compiled) throw new Error('Installation requires a standalone Lyntty artifact');
  const paths = resolveInstallPaths({ installRoot: parsed.installRoot });
  process.env.LYNTTY_INSTALL_ROOT = paths.rootDir;
  const manifest = await verifyLocalReleaseCandidate({
    candidateRoot: layout.rootDir,
    expectedManifestSha256: parsed.manifestSha256,
  });
  const manager = createDaemonServiceManager({ allowPendingCurrent: true });
  await stopLegacyUnmanagedDaemon(manager);
  const result = await applyInstallCandidate({
    candidateRoot: layout.rootDir,
    manifest,
    paths,
    serviceManager: manager,
    healthCheck: releaseId => waitForInstalledDaemon(manager, releaseId),
    replaceExtension: parsed.replaceExtension,
  });
  console.log(`Installed ${result.releaseId} at ${result.versionPath}`);
  console.log(`Launcher: ${paths.userBinDir}/lyntty`);
}

async function rollback(args: string[]): Promise<void> {
  if (args.length > 0) throw new Error('Usage: lyntty update rollback [no options]');
  await requireAuthenticatedInstall();
  const paths = resolveInstallPaths();
  process.env.LYNTTY_INSTALL_ROOT = paths.rootDir;
  const manager = createDaemonServiceManager();
  const result = await rollbackInstallCandidate({
    paths,
    serviceManager: manager,
    healthCheck: releaseId => waitForInstalledDaemon(manager, releaseId),
  });
  console.log(`Rolled back to ${result.releaseId}`);
}

async function status(args: string[]): Promise<void> {
  if (args.some(arg => arg !== '--json')) throw new Error('Usage: lyntty update status [--json]');
  const paths = resolveInstallPaths();
  const state = await readInstallState(paths.statePath);
  const value = { installed: state !== null, installRoot: paths.rootDir, state };
  if (args.includes('--json')) console.log(JSON.stringify(value));
  else if (!state) console.log(`Lyntty is not transactionally installed at ${paths.rootDir}`);
  else {
    console.log(`Current release: ${state.currentReleaseId}`);
    console.log(`Previous release: ${state.previousReleaseId ?? 'none'}`);
    console.log(`Install root: ${paths.rootDir}`);
  }
}

function showHelp(): void {
  console.log(`Usage:
  lyntty update status [--json]
  lyntty update rollback
  lyntty update apply --manifest-sha256 <sha256> [--install-root <path>]

The release installer invokes "update apply" from the verified candidate artifact.
Channel discovery and promotion metadata are verified separately by the release Compatibility BOM.`);
}

export async function handleUpdateCommand(args: string[]): Promise<void> {
  const command = args[0] ?? 'help';
  if (command === 'help' || command === '--help' || command === '-h') {
    showHelp();
    return;
  }
  if (command === 'apply') return applyCurrentArtifact(args.slice(1));
  if (command === 'rollback') return rollback(args.slice(1));
  if (command === 'status') return status(args.slice(1));
  throw new Error(`Unknown update command: ${command}`);
}

export async function handleSelfCommand(args: string[]): Promise<void> {
  if (args[0] !== 'install') throw new Error('Usage: lyntty self install --manifest-sha256 <sha256>');
  await applyCurrentArtifact(args.slice(1));
}
