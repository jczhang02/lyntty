import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { describe, expect, it } from 'bun:test';

import packageJson from '../package.json';
import { lynttyPiExtensionSha256 } from '../src/pi/piExtensionInstall';
import { readArtifactManifest, type ArtifactManifestV1, type ArtifactTarget } from '../src/distribution/artifactManifest';
import { archiveFinalizedArtifact, finalizeExistingArtifact } from './build-artifact';

const repoRoot = resolve(import.meta.dir, '../../..');
const scriptPath = resolve(import.meta.dir, 'build-artifact.ts');
const targetId = 'linux-x64' as const;
const artifactName = `lyntty-cli-${packageJson.version}-${targetId}`;
const executablePaths = ['lyntty', 'lynttyd', 'tools/rg', 'tools/difft'];
const fileContents = new Map([
  ['lyntty', Buffer.from('unsigned lyntty')],
  ['lynttyd', Buffer.from('unsigned lynttyd')],
  ['tools/rg', Buffer.from('unsigned rg')],
  ['tools/difft', Buffer.from('unsigned difft')],
  ['runtime/pi/readme.txt', Buffer.from('runtime bytes')],
  ['licenses/LICENSE.txt', Buffer.from('license bytes')],
]);

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

async function currentSourceCommit(): Promise<string> {
  const child = Bun.spawn(['git', '-C', repoRoot, 'rev-parse', 'HEAD'], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) throw new Error(stderr || stdout);
  return stdout.trim();
}

async function createFixture(): Promise<{ outputDir: string; root: string; sourceCommit: string }> {
  const outputDir = await mkdtemp(join(tmpdir(), 'lyntty-build-artifact-finalize-'));
  const root = join(outputDir, artifactName);
  try {
    for (const [relativePath, contents] of fileContents) {
      const path = join(root, ...relativePath.split('/'));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, contents);
      await chmod(path, executablePaths.includes(relativePath) ? 0o755 : 0o644);
    }

    const sourceCommit = await currentSourceCommit();
    const manifest: ArtifactManifestV1 = {
      schemaVersion: 1,
      product: 'lyntty-cli',
      releaseId: artifactName,
      version: packageJson.version,
      sourceCommit,
      stateSchema: 1,
      target: { os: 'linux', arch: 'x64', libc: 'glibc' },
      extensionSha256: lynttyPiExtensionSha256(),
      files: [...fileContents.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([path, contents]) => ({
        path,
        sha256: sha256(contents),
        size: contents.byteLength,
        executable: executablePaths.includes(path),
      })),
    };
    await writeFile(join(root, 'artifact-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    return { outputDir, root, sourceCommit };
  } catch (error) {
    await rm(outputDir, { recursive: true, force: true });
    throw error;
  }
}

async function createTargetFixture(
  fixtureTargetId: 'darwin-arm64' | 'windows-x64',
  target: ArtifactTarget,
): Promise<{ outputDir: string; root: string; sourceCommit: string; artifactName: string; executables: string[] }> {
  const outputDir = await mkdtemp(join(tmpdir(), 'lyntty-build-artifact-platform-'));
  const platformArtifactName = `lyntty-cli-${packageJson.version}-${fixtureTargetId}`;
  const root = join(outputDir, platformArtifactName);
  const suffix = fixtureTargetId === 'windows-x64' ? '.exe' : '';
  const executables = [`lyntty${suffix}`, `lynttyd${suffix}`, `tools/rg${suffix}`, `tools/difft${suffix}`];
  const contents = new Map([
    ...executables.map(path => [path, Buffer.from(`unsigned ${path}`)] as const),
    ['runtime/pi/readme.txt', Buffer.from('runtime bytes')] as const,
    ['licenses/LICENSE.txt', Buffer.from('license bytes')] as const,
  ]);
  try {
    for (const [relativePath, bytes] of contents) {
      const path = join(root, ...relativePath.split('/'));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
      await chmod(path, executables.includes(relativePath) ? 0o755 : 0o644);
    }
    const sourceCommit = await currentSourceCommit();
    const manifest: ArtifactManifestV1 = {
      schemaVersion: 1,
      product: 'lyntty-cli',
      releaseId: platformArtifactName,
      version: packageJson.version,
      sourceCommit,
      stateSchema: 1,
      target,
      extensionSha256: lynttyPiExtensionSha256(),
      files: [...contents.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([path, bytes]) => ({
        path,
        sha256: sha256(bytes),
        size: bytes.byteLength,
        executable: executables.includes(path),
      })),
    };
    await writeFile(join(root, 'artifact-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    return { outputDir, root, sourceCommit, artifactName: platformArtifactName, executables };
  } catch (error) {
    await rm(outputDir, { recursive: true, force: true });
    throw error;
  }
}

async function runCommand(command: string[], cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const child = Bun.spawn(command, {
    cwd,
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

describe('build artifact finalization', () => {
  it('finalizes executable bytes, excludes the stale manifest, and creates stable archives', async () => {
    const fixture = await createFixture();
    try {
      const staleManifest = await readFile(join(fixture.root, 'artifact-manifest.json'));
      for (const relativePath of executablePaths) {
        await writeFile(join(fixture.root, ...relativePath.split('/')), `signed ${relativePath}`);
      }

      await finalizeExistingArtifact(targetId, fixture.outputDir, false, fixture.sourceCommit);
      const manifestOnly = await readFile(join(fixture.root, 'artifact-manifest.json'));
      const manifestSidecarOnly = await readFile(join(fixture.outputDir, `${artifactName}.manifest.sha256`), 'utf8');
      const finalizedManifest = await readArtifactManifest(join(fixture.root, 'artifact-manifest.json'));
      expect(manifestOnly).not.toEqual(staleManifest);
      expect(finalizedManifest.files.some(file => file.path === 'artifact-manifest.json')).toBe(false);
      for (const file of finalizedManifest.files) {
        const contents = await readFile(join(fixture.root, ...file.path.split('/')));
        expect(file.sha256).toBe(sha256(contents));
        expect(file.size).toBe(contents.byteLength);
      }
      expect(manifestSidecarOnly).toBe(`${sha256(manifestOnly)}  artifact-manifest.json\n`);

      await archiveFinalizedArtifact(targetId, fixture.outputDir, fixture.sourceCommit);
      const archivePath = join(fixture.outputDir, `${artifactName}.tar.gz`);
      const archive = await readFile(archivePath);
      const archiveManifest = await runCommand(['tar', '-xOzf', archivePath, `${artifactName}/artifact-manifest.json`]);
      const manifestWithArchive = await readFile(join(fixture.root, 'artifact-manifest.json'));
      const archiveSidecar = await readFile(`${archivePath}.sha256`, 'utf8');
      expect(manifestWithArchive).toEqual(manifestOnly);
      expect(archiveManifest.exitCode).toBe(0);
      expect(archiveManifest.stdout).toBe(manifestWithArchive.toString());
      expect(archiveSidecar).toBe(`${sha256(archive)}  ${artifactName}.tar.gz\n`);

      await writeFile(join(fixture.root, 'lyntty'), 'transport-corruption');
      await expect(archiveFinalizedArtifact(targetId, fixture.outputDir, fixture.sourceCommit)).rejects.toThrow('outside the signing finalization seam');
      await writeFile(join(fixture.root, 'lyntty'), 'signed lyntty');
      await archiveFinalizedArtifact(targetId, fixture.outputDir, fixture.sourceCommit);
      expect(await readFile(join(fixture.root, 'artifact-manifest.json'))).toEqual(manifestWithArchive);
      expect(await readFile(join(fixture.outputDir, `${artifactName}.manifest.sha256`), 'utf8')).toBe(manifestSidecarOnly);
      expect(await readFile(archivePath)).toEqual(archive);
      expect(await readFile(`${archivePath}.sha256`, 'utf8')).toBe(archiveSidecar);
    } finally {
      await rm(fixture.outputDir, { recursive: true, force: true });
    }
  });

  it('archives strict finalized macOS and Windows inventories', async () => {
    const cases = [
      { id: 'darwin-arm64' as const, target: { os: 'darwin', arch: 'arm64' } as ArtifactTarget, suffix: '.tar.gz' },
      { id: 'windows-x64' as const, target: { os: 'windows', arch: 'x64' } as ArtifactTarget, suffix: '.zip' },
    ];
    for (const item of cases) {
      const fixture = await createTargetFixture(item.id, item.target);
      try {
        for (const relativePath of fixture.executables) {
          await writeFile(join(fixture.root, ...relativePath.split('/')), `signed ${relativePath}`);
        }
        await finalizeExistingArtifact(item.id, fixture.outputDir, false, fixture.sourceCommit);
        const signedManifest = await readFile(join(fixture.root, 'artifact-manifest.json'));
        await archiveFinalizedArtifact(item.id, fixture.outputDir, fixture.sourceCommit);
        expect(await readFile(join(fixture.root, 'artifact-manifest.json'))).toEqual(signedManifest);
        const archivePath = join(fixture.outputDir, `${fixture.artifactName}${item.suffix}`);
        const archiveCheck = item.id === 'windows-x64'
          ? await runCommand(['unzip', '-t', archivePath])
          : await runCommand(['tar', '-tzf', archivePath]);
        expect(archiveCheck.exitCode).toBe(0);
        expect(await readFile(`${archivePath}.sha256`, 'utf8')).toContain(`${fixture.artifactName}${item.suffix}`);
      } finally {
        await rm(fixture.outputDir, { recursive: true, force: true });
      }
    }
  });

  it('rejects changed non-executables and unsafe inventory entries', async () => {
    const mutations: Array<(root: string) => Promise<void>> = [
      root => writeFile(join(root, 'runtime', 'pi', 'readme.txt'), 'tampered runtime'),
      root => writeFile(join(root, 'extra.txt'), 'unexpected'),
      root => symlink('runtime/pi/readme.txt', join(root, 'extra-link')),
      async root => {
        const manifestPath = join(root, 'artifact-manifest.json');
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ArtifactManifestV1;
        manifest.extensionSha256 = 'f'.repeat(64);
        await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      },
    ];

    for (const mutate of mutations) {
      const fixture = await createFixture();
      try {
        await mutate(fixture.root);
        await expect(finalizeExistingArtifact(targetId, fixture.outputDir, false, fixture.sourceCommit)).rejects.toThrow();
      } finally {
        await rm(fixture.outputDir, { recursive: true, force: true });
      }
    }
  });

  it('rejects finalization without exactly one concrete target', async () => {
    const withoutTarget = await runCommand([process.execPath, scriptPath, '--finalize-existing', '--no-archive'], repoRoot);
    expect(withoutTarget.exitCode).not.toBe(0);
    expect(`${withoutTarget.stdout}\n${withoutTarget.stderr}`).toContain('--finalize-existing');

    const withAll = await runCommand([process.execPath, scriptPath, '--finalize-existing', '--all', '--no-archive'], repoRoot);
    expect(withAll.exitCode).not.toBe(0);
    expect(`${withAll.stdout}\n${withAll.stderr}`).toContain('--all');

    const strictWithoutArchive = await runCommand([process.execPath, scriptPath, '--archive-finalized', '--target', targetId, '--no-archive'], repoRoot);
    expect(strictWithoutArchive.exitCode).not.toBe(0);
    expect(`${strictWithoutArchive.stdout}\n${strictWithoutArchive.stderr}`).toContain('always creates an archive');
  });
});
