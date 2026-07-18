import { createHash } from 'node:crypto';
import { access, lstat, readFile, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { lynttyPiExtensionSha256 } from '@/pi/piExtensionInstall';
import { CURRENT_WIRE_OFFER, type WireOffer } from 'lyntty-wire';
import { readArtifactManifest, type ArtifactManifestV1 } from './artifactManifest';
import { runtimeLayout } from './runtimeLayout';
import { getBuildInfo, type BuildInfo } from './buildInfo';

export interface SelfCheckResult {
  ok: true;
  releaseId: string;
  version: string;
  target: ArtifactManifestV1['target'];
  checkedFiles: number;
  daemonVersion: string;
  wire: Readonly<WireOffer>;
}

function currentTargetMatches(target: ArtifactManifestV1['target']): boolean {
  const currentOs = process.platform === 'win32' ? 'windows' : process.platform;
  return currentOs === target.os && process.arch === target.arch;
}

async function sha256File(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function collectArtifactFiles(rootDir: string, current = rootDir): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Artifact contains a symbolic link: ${relative(rootDir, path)}`);
    if (entry.isDirectory()) files.push(...await collectArtifactFiles(rootDir, path));
    else if (entry.isFile()) files.push(relative(rootDir, path).split(sep).join('/'));
    else throw new Error(`Artifact contains an unsupported filesystem entry: ${relative(rootDir, path)}`);
  }
  return files.sort();
}

export async function verifyArtifactFiles(rootDir: string, manifest: ArtifactManifestV1): Promise<void> {
  const rootStats = await lstat(rootDir).catch(() => null);
  if (!rootStats?.isDirectory() || rootStats.isSymbolicLink()) {
    throw new Error('Artifact root must be a real directory, not a symbolic link');
  }
  const expectedFiles = [...manifest.files.map(file => file.path), 'artifact-manifest.json'].sort();
  const actualFiles = await collectArtifactFiles(rootDir);
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    const unexpected = actualFiles.filter(path => !expectedFiles.includes(path));
    const missing = expectedFiles.filter(path => !actualFiles.includes(path));
    throw new Error(`Artifact inventory mismatch (unexpected: ${unexpected.join(', ') || 'none'}; missing: ${missing.join(', ') || 'none'})`);
  }

  for (const file of manifest.files) {
    const path = join(rootDir, ...file.path.split('/'));
    const stats = await lstat(path).catch(() => null);
    if (!stats?.isFile()) throw new Error(`Artifact file is missing or not regular: ${file.path}`);
    if (stats.size !== file.size) throw new Error(`Artifact file size mismatch: ${file.path}`);
    if (await sha256File(path) !== file.sha256) throw new Error(`Artifact file digest mismatch: ${file.path}`);
    if (file.executable && process.platform !== 'win32') {
      await access(path, constants.X_OK).catch(() => {
        throw new Error(`Artifact file is not executable: ${file.path}`);
      });
    }
  }
}

async function readDaemonBuildInfo(daemonExecutable: string): Promise<BuildInfo> {
  const child = Bun.spawn([daemonExecutable, '--build-info', '--json'], {
    env: process.env,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, 5_000);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]).finally(() => clearTimeout(timeout));
  if (timedOut) throw new Error('lynttyd build-info timed out');
  if (exitCode !== 0) {
    throw new Error(`lynttyd build-info failed (${exitCode}): ${stderr.trim() || stdout.trim()}`);
  }
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw new Error('lynttyd returned invalid build-info JSON');
  }
  if (!value || typeof value !== 'object') throw new Error('lynttyd returned invalid build-info');
  return value as BuildInfo;
}

export async function runSelfCheck(): Promise<SelfCheckResult> {
  const layout = runtimeLayout();
  if (!layout.compiled || !layout.manifestPath || !layout.daemonExecutable) {
    throw new Error('Self-check requires an installed compiled artifact');
  }
  const manifest = await readArtifactManifest(layout.manifestPath);
  const cliInfo = await getBuildInfo('lyntty');
  if (cliInfo.releaseId !== manifest.releaseId || cliInfo.version !== manifest.version) {
    throw new Error('lyntty build metadata does not match the artifact manifest');
  }
  if (!currentTargetMatches(manifest.target)) {
    throw new Error(`Artifact target ${manifest.target.os}-${manifest.target.arch} does not match ${process.platform}-${process.arch}`);
  }
  if (manifest.extensionSha256 !== lynttyPiExtensionSha256()) {
    throw new Error('Embedded Pi extension does not match the artifact manifest');
  }
  await verifyArtifactFiles(layout.rootDir, manifest);

  const daemonInfo = await readDaemonBuildInfo(layout.daemonExecutable);
  if (
    daemonInfo.role !== 'lynttyd'
    || daemonInfo.version !== manifest.version
    || daemonInfo.releaseId !== manifest.releaseId
    || daemonInfo.extensionSha256 !== manifest.extensionSha256
  ) {
    throw new Error('lyntty and lynttyd build metadata do not agree');
  }

  return {
    ok: true,
    releaseId: manifest.releaseId,
    version: manifest.version,
    target: manifest.target,
    checkedFiles: manifest.files.length,
    daemonVersion: daemonInfo.version,
    wire: CURRENT_WIRE_OFFER,
  };
}

export async function printSelfCheck(json: boolean): Promise<void> {
  const result = await runSelfCheck();
  if (json) {
    console.log(JSON.stringify(result));
    return;
  }
  console.log(`Self-check passed for ${result.releaseId} (${result.checkedFiles} files)`);
}
