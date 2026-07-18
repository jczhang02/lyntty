import { lynttyPiExtensionSha256 } from '@/pi/piExtensionInstall';
import { readArtifactManifest, type ArtifactTarget } from './artifactManifest';
import { embeddedBuildIdentity } from './embeddedBuild';
import { runtimeLayout } from './runtimeLayout';

export type BinaryRole = 'lyntty' | 'lynttyd';

export interface BuildInfo {
  role: BinaryRole;
  version: string;
  releaseId: string | null;
  target: ArtifactTarget | null;
  extensionSha256: string;
  compiled: boolean;
}

function targetId(target: ArtifactTarget): string {
  return `${target.os}-${target.arch}`;
}

export async function getBuildInfo(role: BinaryRole): Promise<BuildInfo> {
  const layout = runtimeLayout();
  const embedded = embeddedBuildIdentity();
  const base: BuildInfo = {
    role,
    version: embedded.version,
    releaseId: embedded.releaseId,
    target: null,
    extensionSha256: lynttyPiExtensionSha256(),
    compiled: layout.compiled,
  };
  if (!layout.manifestPath) return base;

  let manifest;
  try {
    manifest = await readArtifactManifest(layout.manifestPath);
  } catch (error) {
    if (embedded.releaseId === null) return base;
    throw error;
  }
  if (
    embedded.releaseId === null
    || embedded.targetId === null
    || manifest.version !== embedded.version
    || manifest.releaseId !== embedded.releaseId
    || targetId(manifest.target) !== embedded.targetId
    || manifest.extensionSha256 !== base.extensionSha256
  ) {
    throw new Error('Artifact manifest does not match embedded build identity');
  }
  return { ...base, target: manifest.target };
}

export async function printBuildInfo(role: BinaryRole, json: boolean): Promise<void> {
  const info = await getBuildInfo(role);
  if (json) {
    console.log(JSON.stringify(info));
    return;
  }
  console.log(`${info.role} ${info.version}${info.releaseId ? ` (${info.releaseId})` : ''}`);
}
