import { afterEach, describe, expect, it } from 'bun:test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { DaemonServiceManager, DaemonServiceState } from '@/daemon/service';
import { lynttyPiExtensionSha256, LYNTTY_PI_EXTENSION_SOURCE } from '@/pi/piExtensionInstall';
import type { ArtifactManifestV1 } from './artifactManifest';
import type { InstallPaths } from './installPaths';
import { applyInstallCandidate, recoverInterruptedInstall, replaceOwnedSymlink, rollbackInstallCandidate } from './installTransaction';
import { readInstallState } from './installState';

const roots: string[] = [];

class FakeServiceManager implements DaemonServiceManager {
  readonly kind = 'systemd-user' as const;
  calls: string[] = [];
  failUninstall = false;

  constructor(public state: DaemonServiceState = 'not-installed') {}
  async install() { this.calls.push('install'); this.state = 'running'; }
  async start() { this.calls.push('start'); this.state = 'running'; }
  async stop() { this.calls.push('stop'); if (this.state !== 'not-installed') this.state = 'stopped'; }
  async restart() { this.calls.push('restart'); this.state = 'running'; }
  async status() { this.calls.push('status'); return this.state; }
  async uninstall() {
    this.calls.push('uninstall');
    if (this.failUninstall) throw new Error('injected uninstall failure');
    this.state = 'not-installed';
  }
}

async function fixture(releaseId = 'release-1'): Promise<{
  root: string;
  candidateRoot: string;
  manifest: ArtifactManifestV1;
  paths: InstallPaths;
  extensionPath: string;
}> {
  const root = resolve(import.meta.dir, '../../dist/test-state', `transaction-${randomUUID()}`);
  roots.push(root);
  const candidateRoot = join(root, 'candidate', releaseId);
  await mkdir(candidateRoot, { recursive: true });
  const payload = `payload for ${releaseId}\n`;
  await writeFile(join(candidateRoot, 'payload.txt'), payload);
  const manifest: ArtifactManifestV1 = {
    schemaVersion: 1,
    product: 'lyntty-cli',
    releaseId,
    version: releaseId.slice('release-'.length) + '.0.0',
    stateSchema: 1,
    target: { os: 'linux', arch: 'x64', libc: 'glibc' },
    extensionSha256: lynttyPiExtensionSha256(),
    files: [{
      path: 'payload.txt',
      sha256: createHash('sha256').update(payload).digest('hex'),
      size: Buffer.byteLength(payload),
      executable: false,
    }],
  };
  await writeFile(join(candidateRoot, 'artifact-manifest.json'), JSON.stringify(manifest));
  const installRoot = join(root, 'install');
  return {
    root,
    candidateRoot,
    manifest,
    paths: {
      rootDir: installRoot,
      versionsDir: join(installRoot, 'versions'),
      currentPath: join(installRoot, 'current'),
      transactionsDir: join(installRoot, 'transactions'),
      extensionSnapshotsDir: join(installRoot, 'extension-snapshots'),
      statePath: join(installRoot, 'install-state.json'),
      userBinDir: join(root, 'bin'),
    },
    extensionPath: join(root, 'pi-agent', 'extensions', 'lyntty', 'index.ts'),
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('atomic install transaction', () => {
  it('installs a candidate, extension, stable pointers, service, and known-good state', async () => {
    const data = await fixture();
    const service = new FakeServiceManager();
    const healthChecks: string[] = [];

    const result = await applyInstallCandidate({
      ...data,
      serviceManager: service,
      healthCheck: async releaseId => { healthChecks.push(releaseId); },
    });

    expect(result).toEqual({
      releaseId: 'release-1',
      previousReleaseId: null,
      versionPath: join(data.paths.versionsDir, 'release-1'),
    });
    expect(await readlink(data.paths.currentPath)).toBe(join('versions', 'release-1'));
    expect(await readlink(join(data.paths.userBinDir, 'lyntty'))).toBe(join(data.paths.currentPath, 'lyntty'));
    expect(await readFile(data.extensionPath, 'utf8')).toBe(LYNTTY_PI_EXTENSION_SOURCE);
    expect((await readInstallState(data.paths.statePath))?.currentReleaseId).toBe('release-1');
    expect(service.calls).toContain('install');
    expect(healthChecks).toEqual(['release-1']);
  });

  it('restores the previous release and quarantines a candidate when health fails', async () => {
    const first = await fixture('release-1');
    const service = new FakeServiceManager();
    await applyInstallCandidate({ ...first, serviceManager: service, healthCheck: async () => {} });

    const second = await fixture('release-2');
    second.paths = first.paths;
    second.extensionPath = first.extensionPath;
    await expect(applyInstallCandidate({
      ...second,
      serviceManager: service,
      healthCheck: async () => { throw new Error('new daemon unhealthy'); },
    })).rejects.toThrow('new daemon unhealthy');

    expect(await readlink(first.paths.currentPath)).toBe(join('versions', 'release-1'));
    const state = await readInstallState(first.paths.statePath);
    expect(state?.currentReleaseId).toBe('release-1');
    expect(state?.quarantinedReleaseIds['release-2']).toContain('unhealthy');
    expect(await readFile(first.extensionPath, 'utf8')).toBe(LYNTTY_PI_EXTENSION_SOURCE);
    expect(service.state).toBe('running');
    await expect(readFile(join(first.paths.versionsDir, 'release-2', 'payload.txt'))).rejects.toThrow();
  });

  it('rolls back to the recorded previous known-good release and keeps roll-forward available', async () => {
    const first = await fixture('release-1');
    const service = new FakeServiceManager();
    await applyInstallCandidate({ ...first, serviceManager: service, healthCheck: async () => {} });
    const second = await fixture('release-2');
    second.paths = first.paths;
    second.extensionPath = first.extensionPath;
    await applyInstallCandidate({ ...second, serviceManager: service, healthCheck: async () => {} });

    const result = await rollbackInstallCandidate({
      paths: first.paths,
      serviceManager: service,
      extensionPath: first.extensionPath,
      healthCheck: async () => {},
    });

    expect(result.releaseId).toBe('release-1');
    expect(await readlink(first.paths.currentPath)).toBe(join('versions', 'release-1'));
    const state = await readInstallState(first.paths.statePath);
    expect(state?.currentReleaseId).toBe('release-1');
    expect(state?.previousReleaseId).toBe('release-2');
  });

  it('treats state publication as the commit point when journal cleanup fails', async () => {
    const data = await fixture();
    const service = new FakeServiceManager();
    const result = await applyInstallCandidate({
      ...data,
      serviceManager: service,
      healthCheck: async () => {},
      cleanupTransaction: async () => { throw new Error('injected cleanup failure'); },
    });

    expect(result.releaseId).toBe('release-1');
    expect((await readInstallState(data.paths.statePath))?.currentReleaseId).toBe('release-1');
    expect(await readlink(data.paths.currentPath)).toBe(join('versions', 'release-1'));
    expect(await recoverInterruptedInstall(data.paths, service, data.extensionPath)).toBe(true);
    expect((await readInstallState(data.paths.statePath))?.currentReleaseId).toBe('release-1');
  });

  it('refuses an unknown regular launcher without changing the user extension', async () => {
    const data = await fixture();
    const service = new FakeServiceManager();
    await mkdir(join(data.root, 'pi-agent', 'extensions', 'lyntty'), { recursive: true });
    await writeFile(data.extensionPath, '// custom extension\n');
    await mkdir(data.paths.userBinDir, { recursive: true });
    await writeFile(join(data.paths.userBinDir, 'lyntty'), 'custom launcher');

    await expect(applyInstallCandidate({
      ...data,
      serviceManager: service,
      healthCheck: async () => {},
    })).rejects.toThrow('unrecognized launcher');
    expect(await readFile(data.extensionPath, 'utf8')).toBe('// custom extension\n');
    expect(await readFile(join(data.paths.userBinDir, 'lyntty'), 'utf8')).toBe('custom launcher');
  });

  it('refuses an arbitrary pre-existing launcher symlink', async () => {
    const data = await fixture();
    const service = new FakeServiceManager();
    await mkdir(data.paths.userBinDir, { recursive: true });
    await symlink('/other/tool', join(data.paths.userBinDir, 'lyntty'));

    await expect(applyInstallCandidate({
      ...data,
      serviceManager: service,
      healthCheck: async () => {},
    })).rejects.toThrow('unrecognized symlink');
    expect(await readlink(join(data.paths.userBinDir, 'lyntty'))).toBe('/other/tool');
  });

  it('never clobbers a regular file raced into the current pointer', async () => {
    const first = await fixture('release-1');
    const service = new FakeServiceManager();
    await applyInstallCandidate({ ...first, serviceManager: service, healthCheck: async () => {} });
    const second = await fixture('release-2');
    second.paths = first.paths;
    second.extensionPath = first.extensionPath;

    await expect(applyInstallCandidate({
      ...second,
      serviceManager: service,
      healthCheck: async () => {},
      onPhase: async phase => {
        if (phase === 'current-swapping') {
          await rm(first.paths.currentPath);
          await writeFile(first.paths.currentPath, 'raced user file');
        }
      },
    })).rejects.toThrow('manual recovery');
    expect(await readFile(first.paths.currentPath, 'utf8')).toBe('raced user file');
    expect((await readInstallState(first.paths.statePath))?.currentReleaseId).toBe('release-1');
  });

  it('preserves a claimed pointer when publication and restoration both fail', async () => {
    const data = await fixture();
    await mkdir(data.paths.rootDir, { recursive: true });
    const previousTarget = join('versions', 'release-1');
    await symlink(previousTarget, data.paths.currentPath);
    let claimedPath = '';

    await expect(replaceOwnedSymlink(
      data.paths.currentPath,
      join('versions', 'release-2'),
      [previousTarget],
      async claimed => {
        claimedPath = claimed;
        await writeFile(data.paths.currentPath, 'raced user file');
      },
    )).rejects.toThrow(/previous pointer.*preserved/i);

    expect(await readFile(data.paths.currentPath, 'utf8')).toBe('raced user file');
    expect(await readlink(claimedPath)).toBe(previousTarget);
  });

  it('recovers an interrupted rollback from its private journal', async () => {
    const data = await fixture();
    const brokenService = new FakeServiceManager();
    brokenService.failUninstall = true;
    await expect(applyInstallCandidate({
      ...data,
      serviceManager: brokenService,
      healthCheck: async () => {},
      onPhase: phase => {
        if (phase === 'current-swapping') throw new Error('simulated process interruption');
      },
    })).rejects.toThrow('manual recovery');

    const recoveredService = new FakeServiceManager('stopped');
    expect(await recoverInterruptedInstall(data.paths, recoveredService, data.extensionPath)).toBe(true);
    expect(await recoverInterruptedInstall(data.paths, recoveredService, data.extensionPath)).toBe(false);
    await expect(readFile(data.extensionPath, 'utf8')).rejects.toThrow();
  });
});
