import { afterEach, describe, expect, it } from 'bun:test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { ArtifactManifestV1 } from './artifactManifest';
import { verifyArtifactFiles } from './selfCheck';

const roots: string[] = [];

async function fixture(): Promise<{ root: string; manifest: ArtifactManifestV1 }> {
  const root = resolve(import.meta.dir, '../../dist/test-state', randomUUID());
  roots.push(root);
  await mkdir(root, { recursive: true });
  const content = 'payload\n';
  await writeFile(join(root, 'payload.txt'), content);
  const manifest: ArtifactManifestV1 = {
    schemaVersion: 1,
    product: 'lyntty-cli',
    releaseId: 'lyntty-cli-1.0.0-linux-x64',
    version: '1.0.0',
    stateSchema: 1,
    target: { os: 'linux', arch: 'x64', libc: 'glibc' },
    extensionSha256: 'a'.repeat(64),
    files: [{
      path: 'payload.txt',
      sha256: createHash('sha256').update(content).digest('hex'),
      size: Buffer.byteLength(content),
      executable: false,
    }],
  };
  await writeFile(join(root, 'artifact-manifest.json'), JSON.stringify(manifest));
  return { root, manifest };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('artifact self-check inventory', () => {
  it('accepts exactly the manifest plus its listed regular files', async () => {
    const { root, manifest } = await fixture();
    await expect(verifyArtifactFiles(root, manifest)).resolves.toBeUndefined();
  });

  it('rejects unmanifested files', async () => {
    const { root, manifest } = await fixture();
    await writeFile(join(root, 'unlisted.txt'), 'not trusted');
    await expect(verifyArtifactFiles(root, manifest)).rejects.toThrow('Artifact inventory mismatch');
  });

  if (process.platform !== 'win32') {
    it('rejects symbolic links anywhere in the artifact', async () => {
      const { root, manifest } = await fixture();
      await symlink('payload.txt', join(root, 'link.txt'));
      await expect(verifyArtifactFiles(root, manifest)).rejects.toThrow('symbolic link');
    });
  }
});
