import { afterEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  assembleRelaySpdxIndex,
  prepareRelayOciPlatformSelection,
  restoreRelayOciIndex,
  selectRelayOciPlatform,
} from './relay-oci-sbom';

const roots: string[] = [];

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function writeBlob(layout: string, value: unknown): Promise<{ mediaType: string; digest: string; size: number }> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = digest(bytes);
  await writeFile(join(layout, 'blobs', 'sha256', hash), bytes);
  return {
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    digest: `sha256:${hash}`,
    size: bytes.length,
  };
}

async function fixture(): Promise<{
  root: string;
  layout: string;
  selection: string;
  rootIndex: unknown;
  rootIndexBytes: string;
  amd64: Awaited<ReturnType<typeof writeBlob>>;
  arm64: Awaited<ReturnType<typeof writeBlob>>;
}> {
  const root = await mkdtemp(join(tmpdir(), 'lyntty-relay-oci-sbom-'));
  roots.push(root);
  const layout = join(root, 'layout');
  await mkdir(join(layout, 'blobs', 'sha256'), { recursive: true });
  await writeFile(join(layout, 'oci-layout'), '{"imageLayoutVersion":"1.0.0"}\n');
  const amd64 = await writeBlob(layout, { schemaVersion: 2, config: {}, layers: [], architecture: 'amd64' });
  const arm64 = await writeBlob(layout, { schemaVersion: 2, config: {}, layers: [], architecture: 'arm64' });
  const amd64Attestation = await writeBlob(layout, { schemaVersion: 2, config: {}, layers: [], predicate: 'amd64' });
  const arm64Attestation = await writeBlob(layout, { schemaVersion: 2, config: {}, layers: [], predicate: 'arm64' });
  const nestedValue = {
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.index.v1+json',
    manifests: [
      { ...amd64, platform: { os: 'linux', architecture: 'amd64' } },
      { ...arm64, platform: { os: 'linux', architecture: 'arm64' } },
      {
        ...amd64Attestation,
        platform: { os: 'unknown', architecture: 'unknown' },
        annotations: {
          'vnd.docker.reference.digest': amd64.digest,
          'vnd.docker.reference.type': 'attestation-manifest',
        },
      },
      {
        ...arm64Attestation,
        platform: { os: 'unknown', architecture: 'unknown' },
        annotations: {
          'vnd.docker.reference.digest': arm64.digest,
          'vnd.docker.reference.type': 'attestation-manifest',
        },
      },
    ],
  };
  const nestedBytes = new TextEncoder().encode(JSON.stringify(nestedValue));
  const nestedHash = digest(nestedBytes);
  await writeFile(join(layout, 'blobs', 'sha256', nestedHash), nestedBytes);
  const rootIndex = {
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.index.v1+json',
    annotations: { 'org.example.preserved': 'exactly' },
    manifests: [{
      mediaType: 'application/vnd.oci.image.index.v1+json',
      digest: `sha256:${nestedHash}`,
      size: nestedBytes.length,
      annotations: { 'org.opencontainers.image.ref.name': 'candidate' },
    }],
  };
  const rootIndexBytes = `${JSON.stringify(rootIndex, null, 4)}\n`;
  await writeFile(join(layout, 'index.json'), rootIndexBytes);
  return { root, layout, selection: join(root, 'selection.json'), rootIndex, rootIndexBytes, amd64, arm64 };
}

function spdx(namespace: string, packageId: string, manifestDigest: string) {
  return {
    SPDXID: 'SPDXRef-DOCUMENT',
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    name: packageId,
    documentNamespace: namespace,
    creationInfo: { created: '2026-07-21T00:00:00Z', creators: ['Tool: test'] },
    documentDescribes: [packageId],
    packages: [{
      SPDXID: packageId,
      name: packageId,
      downloadLocation: 'NOASSERTION',
      filesAnalyzed: false,
      checksums: [{ algorithm: 'SHA256', checksumValue: manifestDigest.slice('sha256:'.length) }],
    }],
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('Relay multiarch OCI SBOM preparation', () => {
  it('selects each exact platform manifest and restores the nested index', async () => {
    const value = await fixture();
    const selection = await prepareRelayOciPlatformSelection(value.layout, value.selection);
    expect(selection.platforms['linux/amd64'].digest).toBe(value.amd64.digest);
    expect(selection.platforms['linux/arm64'].digest).toBe(value.arm64.digest);

    await selectRelayOciPlatform(value.layout, value.selection, 'linux/amd64');
    let selected = JSON.parse(await readFile(join(value.layout, 'index.json'), 'utf8'));
    expect(selected.manifests).toHaveLength(1);
    expect(selected.manifests[0].digest).toBe(value.amd64.digest);

    await selectRelayOciPlatform(value.layout, value.selection, 'linux/arm64');
    selected = JSON.parse(await readFile(join(value.layout, 'index.json'), 'utf8'));
    expect(selected.manifests[0].digest).toBe(value.arm64.digest);

    await restoreRelayOciIndex(value.layout, value.selection);
    expect(await readFile(join(value.layout, 'index.json'), 'utf8')).toBe(value.rootIndexBytes);
  });

  it('assembles a deterministic SPDX index that hash-binds both platform documents', async () => {
    const value = await fixture();
    const selection = await prepareRelayOciPlatformSelection(value.layout, value.selection);
    const amd64Path = join(value.root, 'relay-linux-amd64.spdx.json');
    const arm64Path = join(value.root, 'relay-linux-arm64.spdx.json');
    const amd64Bytes = `${JSON.stringify(spdx('https://example.invalid/amd64', 'SPDXRef-Package-amd64', value.amd64.digest), null, 2)}\n`;
    const arm64Bytes = `${JSON.stringify(spdx('https://example.invalid/arm64', 'SPDXRef-Package-arm64', value.arm64.digest), null, 2)}\n`;
    await writeFile(amd64Path, amd64Bytes);
    await writeFile(arm64Path, arm64Bytes);
    const output = join(value.root, 'relay.spdx.json');
    const options = {
      selectionPath: value.selection,
      amd64SbomPath: amd64Path,
      arm64SbomPath: arm64Path,
      outputPath: output,
      sourceCommit: '1'.repeat(40),
      version: '1.2.0',
      repository: 'ghcr.io/jczhang02/lyntty-relay',
      created: '2026-07-21T00:00:00Z',
      expectedIndexDigest: selection.indexDigest,
    };
    await assembleRelaySpdxIndex(options);
    const first = await readFile(output, 'utf8');
    await assembleRelaySpdxIndex(options);
    expect(await readFile(output, 'utf8')).toBe(first);
    const index = JSON.parse(first);
    expect(index.externalDocumentRefs.map((entry: { checksum: { checksumValue: string } }) => entry.checksum.checksumValue))
      .toEqual([digest(new TextEncoder().encode(amd64Bytes)), digest(new TextEncoder().encode(arm64Bytes))]);
    expect(index.relationships.filter((entry: { relationshipType: string }) => entry.relationshipType === 'VARIANT_OF')).toHaveLength(2);
    expect(index.packages[0].checksums[0].checksumValue).toBe(selection.indexDigest.slice('sha256:'.length));
    await expect(assembleRelaySpdxIndex({ ...options, expectedIndexDigest: `sha256:${'f'.repeat(64)}` }))
      .rejects.toThrow('does not match the built OCI index');
    await expect(assembleRelaySpdxIndex({ ...options, amd64SbomPath: arm64Path, arm64SbomPath: amd64Path }))
      .rejects.toThrow('does not describe its selected image manifest');
    await expect(assembleRelaySpdxIndex({ ...options, arm64SbomPath: amd64Path }))
      .rejects.toThrow(/does not describe|namespaces must be unique/);
  });

  it('rejects nested-index and platform blobs that no longer match their descriptors', async () => {
    const nestedValue = await fixture();
    const nestedDigest = (nestedValue.rootIndex as { manifests: Array<{ digest: string }> }).manifests[0]!.digest.slice('sha256:'.length);
    await writeFile(join(nestedValue.layout, 'blobs', 'sha256', nestedDigest), 'tampered');
    await expect(prepareRelayOciPlatformSelection(nestedValue.layout, nestedValue.selection)).rejects.toThrow('size does not match');

    const platformValue = await fixture();
    await writeFile(join(platformValue.layout, 'blobs', 'sha256', platformValue.amd64.digest.slice('sha256:'.length)), 'tampered');
    await expect(prepareRelayOciPlatformSelection(platformValue.layout, platformValue.selection)).rejects.toThrow('size does not match');
  });

  it('rejects extra image platforms and symlinked layout parents', async () => {
    const value = await fixture();
    const windows = await writeBlob(value.layout, { schemaVersion: 2, config: {}, layers: [], architecture: 'amd64' });
    const rootIndex = JSON.parse(value.rootIndexBytes);
    const nestedDigest = rootIndex.manifests[0].digest.slice('sha256:'.length);
    const nested = JSON.parse(await readFile(join(value.layout, 'blobs', 'sha256', nestedDigest), 'utf8'));
    nested.manifests.push({ ...windows, platform: { os: 'windows', architecture: 'amd64' } });
    const nestedBytes = new TextEncoder().encode(JSON.stringify(nested));
    const replacementDigest = digest(nestedBytes);
    await writeFile(join(value.layout, 'blobs', 'sha256', replacementDigest), nestedBytes);
    rootIndex.manifests[0].digest = `sha256:${replacementDigest}`;
    rootIndex.manifests[0].size = nestedBytes.length;
    await writeFile(join(value.layout, 'index.json'), `${JSON.stringify(rootIndex)}\n`);
    await expect(prepareRelayOciPlatformSelection(value.layout, value.selection)).rejects.toThrow(/unsupported|zero or one/);

    const symlinkValue = await fixture();
    const outside = join(symlinkValue.root, 'outside-blobs');
    await rename(join(symlinkValue.layout, 'blobs'), outside);
    await symlink(outside, join(symlinkValue.layout, 'blobs'));
    await expect(prepareRelayOciPlatformSelection(symlinkValue.layout, symlinkValue.selection))
      .rejects.toThrow('real non-symlink directory');
  });
});
