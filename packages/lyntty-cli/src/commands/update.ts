import { readCredentials } from '@/persistence';
import packageJson from '../../package.json';
import { join } from 'node:path';
import { configuration } from '@/configuration';
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
import { loadReleaseTrustStore, resolveChannelUpdate } from '@/distribution/channelUpdate';
import {
  readAcceptedReleaseChannelState,
  rememberAcceptedReleaseChannelState,
} from '@/distribution/releaseChannelState';
import type { ReleaseChannel } from 'lyntty-wire/compatibility';

interface ParsedCheckOptions {
  channel: ReleaseChannel;
  bomUrl?: string;
  signatureUrl?: string;
  trustStorePath?: string;
  json: boolean;
}

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

export function parseUpdateCheckOptions(args: string[]): ParsedCheckOptions {
  let channel: ReleaseChannel = 'stable';
  let bomUrl: string | undefined;
  let signatureUrl: string | undefined;
  let trustStorePath: string | undefined;
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === '--channel') {
      const value = valueAfter(args, index++, arg);
      if (value !== 'stable' && value !== 'preview') throw new Error('--channel must be stable or preview');
      channel = value;
    } else if (arg === '--bom-url') bomUrl = valueAfter(args, index++, arg);
    else if (arg === '--signature-url') signatureUrl = valueAfter(args, index++, arg);
    else if (arg === '--trust-store') trustStorePath = valueAfter(args, index++, arg);
    else if (arg === '--json') json = true;
    else throw new Error(`Unknown update check argument: ${arg}`);
  }
  return { channel, bomUrl, signatureUrl, trustStorePath, json };
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

async function check(args: string[]): Promise<void> {
  const parsed = parseUpdateCheckOptions(args);
  const trustStore = await loadReleaseTrustStore(parsed.trustStorePath);
  const stateRoot = join(configuration.lynttyHomeDir, 'release-channels');
  const accepted = await readAcceptedReleaseChannelState(stateRoot, parsed.channel);
  const resolution = await resolveChannelUpdate({
    channel: parsed.channel,
    currentVersion: packageJson.version,
    bomUrl: parsed.bomUrl,
    signatureUrl: parsed.signatureUrl,
    trustStore,
    minimumSequence: accepted?.sequence,
  });
  await rememberAcceptedReleaseChannelState(stateRoot, {
    channel: parsed.channel,
    sequence: resolution.sequence,
    bomSha256: resolution.bomSha256,
    releaseId: resolution.releaseId,
  });
  if (parsed.json) {
    console.log(JSON.stringify(resolution));
    return;
  }
  if (!resolution.available) {
    console.log(`Lyntty CLI ${resolution.currentVersion} is current on ${resolution.channel}`);
    return;
  }
  console.log(`Lyntty CLI ${resolution.candidateVersion} is available from signed release ${resolution.releaseId}`);
  console.log(`Archive: ${resolution.archive.url}`);
  console.log(`SHA-256: ${resolution.archive.sha256}`);
  console.log(`Artifact manifest SHA-256: ${resolution.archive.artifactManifestSha256}`);
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
  lyntty update check [--channel stable|preview] [--bom-url <url>] [--signature-url <url>] [--trust-store <path>] [--json]
  lyntty update rollback
  lyntty update apply --manifest-sha256 <sha256> [--install-root <path>]

The release installer invokes "update apply" from the verified candidate artifact.
"update check" accepts only a signed Compatibility BOM and selects the archive for this platform.`);
}

export async function handleUpdateCommand(args: string[]): Promise<void> {
  const command = args[0] ?? 'help';
  if (command === 'help' || command === '--help' || command === '-h') {
    showHelp();
    return;
  }
  if (command === 'check') return check(args.slice(1));
  if (command === 'apply') return applyCurrentArtifact(args.slice(1));
  if (command === 'rollback') return rollback(args.slice(1));
  if (command === 'status') return status(args.slice(1));
  throw new Error(`Unknown update command: ${command}`);
}

export async function handleSelfCommand(args: string[]): Promise<void> {
  if (args[0] !== 'install') throw new Error('Usage: lyntty self install --manifest-sha256 <sha256>');
  await applyCurrentArtifact(args.slice(1));
}
