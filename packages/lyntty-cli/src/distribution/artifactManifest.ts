import { readFile } from 'node:fs/promises';
import { isAbsolute, posix } from 'node:path';

export const ARTIFACT_MANIFEST_SCHEMA_VERSION = 1 as const;

export type ArtifactOperatingSystem = 'linux' | 'darwin' | 'windows';
export type ArtifactArchitecture = 'x64' | 'arm64';

export interface ArtifactTarget {
  os: ArtifactOperatingSystem;
  arch: ArtifactArchitecture;
  libc?: 'glibc';
}

export interface ArtifactFile {
  path: string;
  sha256: string;
  size: number;
  executable: boolean;
}

export interface ArtifactManifestV1 {
  schemaVersion: typeof ARTIFACT_MANIFEST_SCHEMA_VERSION;
  product: 'lyntty-cli';
  releaseId: string;
  version: string;
  /** Optional only for compatibility with pre-provenance local artifacts. */
  sourceCommit?: string;
  stateSchema: 1;
  target: ArtifactTarget;
  extensionSha256: string;
  files: ArtifactFile[];
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SOURCE_COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const RELEASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function parseTarget(value: unknown): ArtifactTarget {
  assertRecord(value, 'artifact target');
  if (value.os !== 'linux' && value.os !== 'darwin' && value.os !== 'windows') {
    throw new Error('artifact target has an unsupported operating system');
  }
  if (value.arch !== 'x64' && value.arch !== 'arm64') {
    throw new Error('artifact target has an unsupported architecture');
  }
  if (value.libc !== undefined && value.libc !== 'glibc') {
    throw new Error('artifact target has an unsupported libc');
  }
  if (value.os === 'linux' && value.libc !== 'glibc') {
    throw new Error('Linux artifact target must declare glibc');
  }
  if (value.os !== 'linux' && value.libc !== undefined) {
    throw new Error('Only Linux artifact targets may declare libc');
  }
  return { os: value.os, arch: value.arch, ...(value.libc ? { libc: value.libc } : {}) };
}

function parseFile(value: unknown, seen: Set<string>): ArtifactFile {
  assertRecord(value, 'artifact file');
  if (typeof value.path !== 'string' || !value.path || isAbsolute(value.path)) {
    throw new Error('artifact file path must be a non-empty relative path');
  }
  const normalizedPath = posix.normalize(value.path.replaceAll('\\', '/'));
  if (normalizedPath !== value.path || normalizedPath === '..' || normalizedPath.startsWith('../')) {
    throw new Error(`artifact file path is not canonical: ${value.path}`);
  }
  if (seen.has(normalizedPath)) throw new Error(`duplicate artifact file path: ${normalizedPath}`);
  seen.add(normalizedPath);
  if (typeof value.sha256 !== 'string' || !SHA256_PATTERN.test(value.sha256)) {
    throw new Error(`artifact file has an invalid SHA-256: ${normalizedPath}`);
  }
  if (typeof value.size !== 'number' || !Number.isSafeInteger(value.size) || value.size < 0) {
    throw new Error(`artifact file has an invalid size: ${normalizedPath}`);
  }
  if (typeof value.executable !== 'boolean') {
    throw new Error(`artifact file has an invalid executable flag: ${normalizedPath}`);
  }
  return {
    path: normalizedPath,
    sha256: value.sha256,
    size: value.size,
    executable: value.executable,
  };
}

export function parseArtifactManifest(value: unknown): ArtifactManifestV1 {
  assertRecord(value, 'artifact manifest');
  if (value.schemaVersion !== ARTIFACT_MANIFEST_SCHEMA_VERSION) {
    throw new Error(`Unsupported artifact manifest schema: ${String(value.schemaVersion)}`);
  }
  if (value.product !== 'lyntty-cli') throw new Error('artifact manifest product must be lyntty-cli');
  if (typeof value.releaseId !== 'string' || !RELEASE_ID_PATTERN.test(value.releaseId)) {
    throw new Error('artifact manifest releaseId is invalid');
  }
  if (typeof value.version !== 'string' || !value.version.trim()) {
    throw new Error('artifact manifest version is invalid');
  }
  if (value.sourceCommit !== undefined && (typeof value.sourceCommit !== 'string' || !SOURCE_COMMIT_PATTERN.test(value.sourceCommit))) {
    throw new Error('artifact manifest source commit is invalid');
  }
  if (value.stateSchema !== 1) throw new Error(`Unsupported local state schema: ${String(value.stateSchema)}`);
  if (typeof value.extensionSha256 !== 'string' || !SHA256_PATTERN.test(value.extensionSha256)) {
    throw new Error('artifact manifest extension SHA-256 is invalid');
  }
  if (!Array.isArray(value.files) || value.files.length === 0) {
    throw new Error('artifact manifest must list files');
  }
  const seen = new Set<string>();
  const files = value.files.map(file => parseFile(file, seen));
  return {
    schemaVersion: ARTIFACT_MANIFEST_SCHEMA_VERSION,
    product: 'lyntty-cli',
    releaseId: value.releaseId,
    version: value.version,
    ...(value.sourceCommit ? { sourceCommit: value.sourceCommit } : {}),
    stateSchema: 1,
    target: parseTarget(value.target),
    extensionSha256: value.extensionSha256,
    files,
  };
}

export async function readArtifactManifest(path: string): Promise<ArtifactManifestV1> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to read artifact manifest ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parseArtifactManifest(decoded);
}
