import { describe, expect, it } from 'bun:test';

import { parseArtifactManifest } from './artifactManifest';

const digest = 'a'.repeat(64);

function manifest(overrides: Record<string, unknown> = {}): unknown {
  return {
    schemaVersion: 1,
    product: 'lyntty-cli',
    releaseId: 'lyntty-cli-2.0.0-linux-x64',
    version: '2.0.0',
    stateSchema: 1,
    target: { os: 'linux', arch: 'x64', libc: 'glibc' },
    extensionSha256: digest,
    files: [{ path: 'lyntty', sha256: digest, size: 123, executable: true }],
    ...overrides,
  };
}

describe('artifact manifest', () => {
  it('accepts a canonical supported manifest', () => {
    const parsed = parseArtifactManifest(manifest());
    expect(parsed.releaseId).toBe('lyntty-cli-2.0.0-linux-x64');
    expect(parsed.target).toEqual({ os: 'linux', arch: 'x64', libc: 'glibc' });
    expect(parsed.files).toHaveLength(1);
  });

  it('rejects unsupported schema and target combinations', () => {
    expect(() => parseArtifactManifest(manifest({ schemaVersion: 2 }))).toThrow('Unsupported artifact manifest schema');
    expect(() => parseArtifactManifest(manifest({ target: { os: 'linux', arch: 'x64' } }))).toThrow('must declare glibc');
    expect(() => parseArtifactManifest(manifest({ target: { os: 'darwin', arch: 'x64', libc: 'glibc' } }))).toThrow('Only Linux');
  });

  it('rejects traversal, non-canonical paths, and duplicates', () => {
    for (const path of ['../lyntty', '/tmp/lyntty', './lyntty', 'tools\\rg.exe']) {
      expect(() => parseArtifactManifest(manifest({
        files: [{ path, sha256: digest, size: 1, executable: true }],
      }))).toThrow();
    }
    expect(() => parseArtifactManifest(manifest({
      files: [
        { path: 'lyntty', sha256: digest, size: 1, executable: true },
        { path: 'lyntty', sha256: digest, size: 1, executable: true },
      ],
    }))).toThrow('duplicate artifact file path');
  });

  it('rejects malformed hashes, sizes, and executable flags', () => {
    expect(() => parseArtifactManifest(manifest({
      files: [{ path: 'lyntty', sha256: 'bad', size: 1, executable: true }],
    }))).toThrow('invalid SHA-256');
    expect(() => parseArtifactManifest(manifest({
      files: [{ path: 'lyntty', sha256: digest, size: -1, executable: true }],
    }))).toThrow('invalid size');
    expect(() => parseArtifactManifest(manifest({
      files: [{ path: 'lyntty', sha256: digest, size: 1, executable: 'yes' }],
    }))).toThrow('invalid executable flag');
  });
});
