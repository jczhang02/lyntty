import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const OCI_INDEX_MEDIA_TYPE = 'application/vnd.oci.image.index.v1+json';
const OCI_MANIFEST_MEDIA_TYPES = new Set([
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
]);
const DIGEST_PATTERN = /^sha256:([a-f0-9]{64})$/;
const SOURCE_COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const EXPECTED_PLATFORMS = ['linux/amd64', 'linux/arm64'] as const;

type ExpectedPlatform = typeof EXPECTED_PLATFORMS[number];

interface OciDescriptor {
  mediaType: string;
  digest: string;
  size: number;
  platform?: {
    os?: string;
    architecture?: string;
  };
  annotations?: Record<string, string>;
}

interface OciIndex {
  schemaVersion: number;
  mediaType?: string;
  manifests: OciDescriptor[];
}

export interface RelayOciPlatformSelection {
  schemaVersion: 1;
  indexDigest: string;
  originalIndexBase64: string;
  originalIndexSha256: string;
  platforms: Record<ExpectedPlatform, OciDescriptor>;
  buildAttestations: OciDescriptor[];
}

interface SpdxDocument {
  SPDXID?: string;
  spdxVersion?: string;
  documentNamespace?: string;
  documentDescribes?: string[];
  packages?: Array<{
    SPDXID?: string;
    name?: string;
    versionInfo?: string;
    downloadLocation?: string;
    filesAnalyzed?: boolean;
    primaryPackagePurpose?: string;
    checksums?: Array<{ algorithm?: string; checksumValue?: string }>;
  }>;
  relationships?: Array<{
    spdxElementId?: string;
    relationshipType?: string;
    relatedSpdxElement?: string;
  }>;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
}

function parseDescriptor(value: unknown, label: string): OciDescriptor {
  assertRecord(value, label);
  if (typeof value.mediaType !== 'string') throw new Error(`${label} mediaType is invalid`);
  if (typeof value.digest !== 'string' || !DIGEST_PATTERN.test(value.digest)) throw new Error(`${label} digest is invalid`);
  if (typeof value.size !== 'number' || !Number.isSafeInteger(value.size) || value.size < 0) throw new Error(`${label} size is invalid`);
  let platform: OciDescriptor['platform'];
  if (value.platform !== undefined) {
    assertRecord(value.platform, `${label} platform`);
    platform = {
      ...(typeof value.platform.os === 'string' ? { os: value.platform.os } : {}),
      ...(typeof value.platform.architecture === 'string' ? { architecture: value.platform.architecture } : {}),
    };
  }
  return {
    mediaType: value.mediaType,
    digest: value.digest,
    size: value.size,
    ...(platform ? { platform } : {}),
    ...(value.annotations && typeof value.annotations === 'object' && !Array.isArray(value.annotations)
      ? { annotations: value.annotations as Record<string, string> }
      : {}),
  };
}

function parseIndex(value: unknown, label: string): OciIndex {
  assertRecord(value, label);
  if (value.schemaVersion !== 2) throw new Error(`${label} schemaVersion must be 2`);
  if (value.mediaType !== undefined && value.mediaType !== OCI_INDEX_MEDIA_TYPE) throw new Error(`${label} mediaType is invalid`);
  if (!Array.isArray(value.manifests) || value.manifests.length === 0) throw new Error(`${label} must contain manifests`);
  return {
    schemaVersion: 2,
    ...(value.mediaType ? { mediaType: value.mediaType as string } : {}),
    manifests: value.manifests.map((descriptor, index) => parseDescriptor(descriptor, `${label} manifest ${index}`)),
  };
}

async function readRegularFile(path: string, label: string): Promise<Uint8Array> {
  const stats = await lstat(path);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file`);
  return new Uint8Array(await readFile(path));
}

async function assertNonSymlinkDirectory(path: string, label: string): Promise<void> {
  const stats = await lstat(path);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error(`${label} must be a real non-symlink directory`);
}

async function assertLayoutStructure(layout: string): Promise<void> {
  await assertNonSymlinkDirectory(layout, 'OCI layout');
  await assertNonSymlinkDirectory(join(layout, 'blobs'), 'OCI blobs directory');
  await assertNonSymlinkDirectory(join(layout, 'blobs', 'sha256'), 'OCI SHA-256 blobs directory');
}

async function readJson(path: string, label: string): Promise<unknown> {
  const bytes = await readRegularFile(path, label);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readDescriptorBlob(layout: string, descriptor: OciDescriptor, label: string): Promise<Uint8Array> {
  const match = descriptor.digest.match(DIGEST_PATTERN);
  if (!match) throw new Error(`${label} digest is invalid`);
  const bytes = await readRegularFile(join(layout, 'blobs', 'sha256', match[1]!), label);
  if (bytes.length !== descriptor.size) throw new Error(`${label} size does not match its descriptor`);
  if (sha256(bytes) !== match[1]) throw new Error(`${label} SHA-256 does not match its descriptor`);
  return bytes;
}

async function writeBytesAtomic(path: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${randomUUID()}`;
  try {
    await writeFile(temporary, bytes, { mode: 0o644, flag: 'wx' });
    await rename(temporary, path);
  } finally {
    try {
      await unlink(temporary);
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
    }
  }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await writeBytesAtomic(path, new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`));
}

export async function prepareRelayOciPlatformSelection(layout: string, outputPath: string): Promise<RelayOciPlatformSelection> {
  await assertLayoutStructure(layout);
  const originalIndexBytes = await readRegularFile(join(layout, 'index.json'), 'OCI root index');
  const originalIndex = parseIndex(JSON.parse(new TextDecoder().decode(originalIndexBytes)), 'OCI root index');
  if (originalIndex.manifests.length !== 1) throw new Error('OCI root index must contain exactly one multiarch descriptor');
  const nestedDescriptor = originalIndex.manifests[0]!;
  if (nestedDescriptor.mediaType !== OCI_INDEX_MEDIA_TYPE) throw new Error('OCI root descriptor must reference a multiarch image index');
  const nestedBytes = await readDescriptorBlob(layout, nestedDescriptor, 'OCI multiarch index blob');
  const nestedIndex = parseIndex(JSON.parse(new TextDecoder().decode(nestedBytes)), 'OCI multiarch index');

  const runnable = nestedIndex.manifests.filter(descriptor => descriptor.platform?.os === 'linux');
  if (runnable.length !== EXPECTED_PLATFORMS.length) throw new Error('OCI multiarch index must contain exactly two Linux platform manifests');

  const selected = {} as Record<ExpectedPlatform, OciDescriptor>;
  for (const platform of EXPECTED_PLATFORMS) {
    const [os, architecture] = platform.split('/');
    const matches = runnable.filter(descriptor => descriptor.platform?.os === os && descriptor.platform?.architecture === architecture);
    if (matches.length !== 1) throw new Error(`OCI multiarch index must contain exactly one ${platform} manifest`);
    const descriptor = matches[0]!;
    if (!OCI_MANIFEST_MEDIA_TYPES.has(descriptor.mediaType)) throw new Error(`${platform} descriptor is not an OCI image manifest`);
    await readDescriptorBlob(layout, descriptor, `${platform} image manifest blob`);
    selected[platform] = descriptor;
  }

  const buildAttestations = nestedIndex.manifests.filter(descriptor => !runnable.includes(descriptor));
  if (buildAttestations.length !== 0 && buildAttestations.length !== EXPECTED_PLATFORMS.length) {
    throw new Error('OCI multiarch index must contain zero or one BuildKit attestation per runtime manifest');
  }
  const attestedRuntimeDigests = new Set<string>();
  for (const descriptor of buildAttestations) {
    const referencedDigest = descriptor.annotations?.['vnd.docker.reference.digest'];
    if (descriptor.platform?.os !== 'unknown'
      || descriptor.platform?.architecture !== 'unknown'
      || descriptor.annotations?.['vnd.docker.reference.type'] !== 'attestation-manifest'
      || !referencedDigest
      || !Object.values(selected).some(runtime => runtime.digest === referencedDigest)
      || attestedRuntimeDigests.has(referencedDigest)
      || !OCI_MANIFEST_MEDIA_TYPES.has(descriptor.mediaType)) {
      throw new Error('OCI multiarch index contains an unsupported non-runtime descriptor');
    }
    await readDescriptorBlob(layout, descriptor, `BuildKit attestation for ${referencedDigest}`);
    attestedRuntimeDigests.add(referencedDigest);
  }

  const selection: RelayOciPlatformSelection = {
    schemaVersion: 1,
    indexDigest: nestedDescriptor.digest,
    originalIndexBase64: Buffer.from(originalIndexBytes).toString('base64'),
    originalIndexSha256: sha256(originalIndexBytes),
    platforms: selected,
    buildAttestations,
  };
  await writeJsonAtomic(outputPath, selection);
  return selection;
}

async function readSelection(path: string): Promise<RelayOciPlatformSelection> {
  const value = await readJson(path, 'Relay OCI platform selection');
  assertRecord(value, 'Relay OCI platform selection');
  if (value.schemaVersion !== 1 || typeof value.indexDigest !== 'string' || !DIGEST_PATTERN.test(value.indexDigest)) {
    throw new Error('Relay OCI platform selection identity is invalid');
  }
  if (typeof value.originalIndexBase64 !== 'string' || typeof value.originalIndexSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.originalIndexSha256)) {
    throw new Error('Relay OCI platform selection original index is invalid');
  }
  const originalIndexBytes = new Uint8Array(Buffer.from(value.originalIndexBase64, 'base64'));
  if (Buffer.from(originalIndexBytes).toString('base64') !== value.originalIndexBase64
    || sha256(originalIndexBytes) !== value.originalIndexSha256) {
    throw new Error('Relay OCI platform selection original index bytes are invalid');
  }
  parseIndex(JSON.parse(new TextDecoder().decode(originalIndexBytes)), 'stored OCI root index');
  assertRecord(value.platforms, 'stored OCI platforms');
  const platforms = {} as Record<ExpectedPlatform, OciDescriptor>;
  for (const platform of EXPECTED_PLATFORMS) platforms[platform] = parseDescriptor(value.platforms[platform], `stored ${platform} descriptor`);
  if (!Array.isArray(value.buildAttestations)) throw new Error('stored OCI BuildKit attestations are invalid');
  const buildAttestations = value.buildAttestations.map((descriptor, index) => parseDescriptor(descriptor, `stored BuildKit attestation ${index}`));
  return {
    schemaVersion: 1,
    indexDigest: value.indexDigest,
    originalIndexBase64: value.originalIndexBase64,
    originalIndexSha256: value.originalIndexSha256,
    platforms,
    buildAttestations,
  };
}

export async function selectRelayOciPlatform(layout: string, selectionPath: string, platform: ExpectedPlatform): Promise<void> {
  if (!EXPECTED_PLATFORMS.includes(platform)) throw new Error(`Unsupported Relay OCI platform: ${platform}`);
  await assertLayoutStructure(layout);
  const selection = await readSelection(selectionPath);
  const descriptor = selection.platforms[platform];
  await readDescriptorBlob(layout, descriptor, `${platform} image manifest blob`);
  await writeJsonAtomic(join(layout, 'index.json'), {
    schemaVersion: 2,
    mediaType: OCI_INDEX_MEDIA_TYPE,
    manifests: [descriptor],
  });
}

export async function restoreRelayOciIndex(layout: string, selectionPath: string): Promise<void> {
  await assertLayoutStructure(layout);
  const selection = await readSelection(selectionPath);
  await writeBytesAtomic(join(layout, 'index.json'), new Uint8Array(Buffer.from(selection.originalIndexBase64, 'base64')));
}

function parseSpdxDocument(value: unknown, label: string): {
  document: Required<Pick<SpdxDocument, 'SPDXID' | 'spdxVersion' | 'documentNamespace'>> & SpdxDocument;
  describedPackage: NonNullable<SpdxDocument['packages']>[number] & { SPDXID: string };
} {
  assertRecord(value, label);
  if (value.SPDXID !== 'SPDXRef-DOCUMENT' || value.spdxVersion !== 'SPDX-2.3' || typeof value.documentNamespace !== 'string') {
    throw new Error(`${label} is not an SPDX 2.3 document`);
  }
  const described = Array.isArray(value.documentDescribes) && typeof value.documentDescribes[0] === 'string'
    ? value.documentDescribes[0]
    : Array.isArray(value.packages) && value.packages[0] && typeof value.packages[0] === 'object'
      ? (value.packages[0] as { SPDXID?: unknown }).SPDXID
      : undefined;
  if (typeof described !== 'string' || !/^SPDXRef-[A-Za-z0-9.-]+$/.test(described)) {
    throw new Error(`${label} does not identify its described package`);
  }
  if (!Array.isArray(value.packages)) throw new Error(`${label} does not contain packages`);
  const describedPackages = value.packages.filter((candidate): candidate is Record<string, unknown> => Boolean(candidate) && typeof candidate === 'object' && !Array.isArray(candidate))
    .filter(candidate => candidate.SPDXID === described);
  if (describedPackages.length !== 1) throw new Error(`${label} must contain exactly one described package`);
  return {
    document: value as Required<Pick<SpdxDocument, 'SPDXID' | 'spdxVersion' | 'documentNamespace'>> & SpdxDocument,
    describedPackage: describedPackages[0] as NonNullable<SpdxDocument['packages']>[number] & { SPDXID: string },
  };
}

function platformManifestPackageId(platform: ExpectedPlatform): string {
  return `SPDXRef-Package-lyntty-relay-${platform.replace('/', '-')}-manifest`;
}

export async function bindRelayPlatformSpdx(options: {
  selectionPath: string;
  platform: ExpectedPlatform;
  sbomPath: string;
  repository: string;
}): Promise<void> {
  if (!EXPECTED_PLATFORMS.includes(options.platform)) throw new Error(`Unsupported Relay OCI platform: ${options.platform}`);
  if (!/^ghcr\.io\/[a-z0-9][a-z0-9._/-]*$/.test(options.repository)) throw new Error('Relay SPDX repository is invalid');
  const selection = await readSelection(options.selectionPath);
  const value = await readJson(options.sbomPath, `${options.platform} SPDX document`);
  const { document, describedPackage } = parseSpdxDocument(value, `${options.platform} SPDX document`);
  const manifestPackageId = platformManifestPackageId(options.platform);
  if (document.packages!.some(candidate => candidate.SPDXID === manifestPackageId)) {
    throw new Error(`${options.platform} SPDX document already contains a manifest binding`);
  }
  const manifestDigest = selection.platforms[options.platform].digest;
  const digestValue = manifestDigest.match(DIGEST_PATTERN)![1]!;
  document.packages!.push({
    SPDXID: manifestPackageId,
    name: `${options.repository}@${manifestDigest}`,
    versionInfo: manifestDigest,
    downloadLocation: 'NOASSERTION',
    filesAnalyzed: false,
    primaryPackagePurpose: 'CONTAINER',
    checksums: [{ algorithm: 'SHA256', checksumValue: digestValue }],
  });
  document.documentDescribes = [...new Set([...(document.documentDescribes ?? [describedPackage.SPDXID]), manifestPackageId])];
  document.relationships = [
    ...(document.relationships ?? []),
    {
      spdxElementId: 'SPDXRef-DOCUMENT',
      relationshipType: 'DESCRIBES',
      relatedSpdxElement: manifestPackageId,
    },
  ];
  await writeJsonAtomic(options.sbomPath, document);
}

export async function assembleRelaySpdxIndex(options: {
  selectionPath: string;
  amd64SbomPath: string;
  arm64SbomPath: string;
  outputPath: string;
  sourceCommit: string;
  version: string;
  repository: string;
  created: string;
  expectedIndexDigest: string;
}): Promise<void> {
  if (!SOURCE_COMMIT_PATTERN.test(options.sourceCommit)) throw new Error('Relay SPDX source commit is invalid');
  if (!Bun.semver.satisfies(options.version, '>=0.1.0')) throw new Error('Relay SPDX version is invalid');
  if (!/^ghcr\.io\/[a-z0-9][a-z0-9._/-]*$/.test(options.repository)) throw new Error('Relay SPDX repository is invalid');
  if (Number.isNaN(Date.parse(options.created))) throw new Error('Relay SPDX creation timestamp is invalid');
  const selection = await readSelection(options.selectionPath);
  if (selection.indexDigest !== options.expectedIndexDigest) throw new Error('Relay SPDX index digest does not match the built OCI index');
  const indexDigest = selection.indexDigest.match(DIGEST_PATTERN)![1]!;
  const inputs = [
    { platform: 'linux/amd64' as const, path: options.amd64SbomPath, externalDocumentId: 'DocumentRef-linux-amd64' },
    { platform: 'linux/arm64' as const, path: options.arm64SbomPath, externalDocumentId: 'DocumentRef-linux-arm64' },
  ];
  const externalDocumentRefs = [];
  const documentNamespaces = new Set<string>();
  const relationships = [{
    spdxElementId: 'SPDXRef-DOCUMENT',
    relationshipType: 'DESCRIBES',
    relatedSpdxElement: 'SPDXRef-Package-lyntty-relay-multiarch',
  }];
  for (const input of inputs) {
    const bytes = await readRegularFile(input.path, `${input.platform} SPDX document`);
    const { document } = parseSpdxDocument(
      JSON.parse(new TextDecoder().decode(bytes)),
      `${input.platform} SPDX document`,
    );
    if (documentNamespaces.has(document.documentNamespace)) throw new Error('Relay platform SPDX document namespaces must be unique');
    documentNamespaces.add(document.documentNamespace);
    const manifestDigest = selection.platforms[input.platform].digest.match(DIGEST_PATTERN)![1]!;
    const manifestPackageId = platformManifestPackageId(input.platform);
    const manifestPackages = document.packages!.filter(candidate => candidate.SPDXID === manifestPackageId);
    const manifestPackage = manifestPackages[0];
    if (manifestPackages.length !== 1
      || !manifestPackage
      || !document.documentDescribes?.includes(manifestPackageId)
      || manifestPackage.name !== `${options.repository}@sha256:${manifestDigest}`
      || manifestPackage.versionInfo !== `sha256:${manifestDigest}`
      || manifestPackage.downloadLocation !== 'NOASSERTION'
      || manifestPackage.filesAnalyzed !== false
      || manifestPackage.primaryPackagePurpose !== 'CONTAINER'
      || !manifestPackage.checksums?.some(checksum => checksum.algorithm === 'SHA256' && checksum.checksumValue === manifestDigest)) {
      throw new Error(`${input.platform} SPDX document does not describe its selected image manifest`);
    }
    externalDocumentRefs.push({
      externalDocumentId: input.externalDocumentId,
      spdxDocument: document.documentNamespace,
      checksum: { algorithm: 'SHA256', checksumValue: sha256(bytes) },
    });
    relationships.push({
      spdxElementId: `${input.externalDocumentId}:${manifestPackageId}`,
      relationshipType: 'VARIANT_OF',
      relatedSpdxElement: 'SPDXRef-Package-lyntty-relay-multiarch',
    });
  }
  const document = {
    SPDXID: 'SPDXRef-DOCUMENT',
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    name: `lyntty-relay-${options.version}-multiarch`,
    documentNamespace: `https://github.com/jczhang02/lyntty/sbom/relay/${encodeURIComponent(options.repository)}/${options.sourceCommit}/${indexDigest}`,
    creationInfo: {
      created: new Date(options.created).toISOString(),
      creators: ['Tool: Lyntty Relay multiarch SPDX indexer 1'],
    },
    documentDescribes: ['SPDXRef-Package-lyntty-relay-multiarch'],
    packages: [{
      SPDXID: 'SPDXRef-Package-lyntty-relay-multiarch',
      name: options.repository,
      versionInfo: options.version,
      downloadLocation: 'NOASSERTION',
      filesAnalyzed: false,
      primaryPackagePurpose: 'CONTAINER',
      checksums: [{ algorithm: 'SHA256', checksumValue: indexDigest }],
    }],
    externalDocumentRefs,
    relationships,
  };
  await writeJsonAtomic(options.outputPath, document);
}

function option(args: string[], name: string): string {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`${name} is required`);
  return args[index + 1]!;
}

async function main(args: string[]): Promise<void> {
  const command = args[0];
  if (command === 'prepare') {
    await prepareRelayOciPlatformSelection(option(args, '--layout'), option(args, '--output'));
    return;
  }
  if (command === 'select') {
    await selectRelayOciPlatform(
      option(args, '--layout'),
      option(args, '--selection'),
      option(args, '--platform') as ExpectedPlatform,
    );
    return;
  }
  if (command === 'restore') {
    await restoreRelayOciIndex(option(args, '--layout'), option(args, '--selection'));
    return;
  }
  if (command === 'bind') {
    await bindRelayPlatformSpdx({
      selectionPath: option(args, '--selection'),
      platform: option(args, '--platform') as ExpectedPlatform,
      sbomPath: option(args, '--sbom'),
      repository: option(args, '--repository'),
    });
    return;
  }
  if (command === 'assemble') {
    await assembleRelaySpdxIndex({
      selectionPath: option(args, '--selection'),
      amd64SbomPath: option(args, '--amd64-sbom'),
      arm64SbomPath: option(args, '--arm64-sbom'),
      outputPath: option(args, '--output'),
      sourceCommit: option(args, '--source-commit'),
      version: option(args, '--version'),
      repository: option(args, '--repository'),
      created: option(args, '--created'),
      expectedIndexDigest: option(args, '--expected-index-digest'),
    });
    return;
  }
  throw new Error('Usage: relay-oci-sbom.ts <prepare|select|restore|bind|assemble> [options]');
}

if (import.meta.main) await main(process.argv.slice(2));
