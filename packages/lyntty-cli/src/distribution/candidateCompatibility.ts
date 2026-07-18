import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { lynttyPiExtensionSha256 } from '@/pi/piExtensionInstall';
import { readArtifactManifest, type ArtifactManifestV1 } from './artifactManifest';
import { embeddedBuildIdentity } from './embeddedBuild';
import { verifyArtifactFiles } from './selfCheck';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function currentTargetId(): string {
  const os = process.platform === 'win32' ? 'windows' : process.platform;
  return `${os}-${process.arch}`;
}

export async function sha256File(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

export async function verifyLocalReleaseCandidate(options: {
  candidateRoot: string;
  expectedManifestSha256: string;
  requireEmbeddedIdentity?: boolean;
}): Promise<ArtifactManifestV1> {
  if (!SHA256_PATTERN.test(options.expectedManifestSha256)) {
    throw new Error('Expected artifact manifest SHA-256 must be 64 lowercase hexadecimal characters');
  }
  const manifestPath = join(options.candidateRoot, 'artifact-manifest.json');
  if (await sha256File(manifestPath) !== options.expectedManifestSha256) {
    throw new Error('Artifact manifest SHA-256 does not match the trusted value');
  }
  const manifest = await readArtifactManifest(manifestPath);
  const targetId = `${manifest.target.os}-${manifest.target.arch}`;
  if (targetId !== currentTargetId()) {
    throw new Error(`Artifact target ${targetId} does not match this system (${currentTargetId()})`);
  }
  if (manifest.extensionSha256 !== lynttyPiExtensionSha256()) {
    throw new Error('Artifact manifest does not match the candidate embedded Pi extension');
  }

  if (options.requireEmbeddedIdentity !== false) {
    const embedded = embeddedBuildIdentity();
    if (
      embedded.releaseId !== manifest.releaseId
      || embedded.version !== manifest.version
      || embedded.targetId !== targetId
    ) {
      throw new Error('Candidate manifest does not match the executing binary identity');
    }
  }

  const suffix = manifest.target.os === 'windows' ? '.exe' : '';
  const requiredFiles = [
    `lyntty${suffix}`,
    `lynttyd${suffix}`,
    `tools/rg${suffix}`,
    `tools/difft${suffix}`,
    'runtime/pi/package.json',
    'runtime/pi/theme/dark.json',
    'runtime/pi/theme/light.json',
    'runtime/pi/export-html/template.html',
    'runtime/pi/export-html/template.css',
    'runtime/pi/export-html/template.js',
    'runtime/pi/examples/sdk/01-minimal.ts',
  ];
  const fileMap = new Map(manifest.files.map(file => [file.path, file]));
  for (const path of requiredFiles) {
    const file = fileMap.get(path);
    if (!file) throw new Error(`Artifact is missing required runtime file: ${path}`);
  }
  for (const path of [`lyntty${suffix}`, `lynttyd${suffix}`, `tools/rg${suffix}`, `tools/difft${suffix}`]) {
    if (!fileMap.get(path)?.executable) throw new Error(`Artifact executable is not marked executable: ${path}`);
  }

  await verifyArtifactFiles(options.candidateRoot, manifest);
  return manifest;
}
