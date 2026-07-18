import { readFile } from 'node:fs/promises';

import { writeJsonAtomically } from './atomicFile';

export const INSTALL_STATE_SCHEMA_VERSION = 1 as const;
const RELEASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export interface InstallStateV1 {
  schemaVersion: typeof INSTALL_STATE_SCHEMA_VERSION;
  currentReleaseId: string;
  previousReleaseId: string | null;
  extensionSha256: string;
  knownGoodReleaseIds: string[];
  quarantinedReleaseIds: Record<string, string>;
}

function releaseId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !RELEASE_ID_PATTERN.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

export function parseInstallState(value: unknown): InstallStateV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('install state must be an object');
  const state = value as Record<string, unknown>;
  if (state.schemaVersion !== INSTALL_STATE_SCHEMA_VERSION) {
    throw new Error(`Unsupported install state schema: ${String(state.schemaVersion)}`);
  }
  const currentReleaseId = releaseId(state.currentReleaseId, 'current release id');
  const previousReleaseId = state.previousReleaseId === null
    ? null
    : releaseId(state.previousReleaseId, 'previous release id');
  if (typeof state.extensionSha256 !== 'string' || !SHA256_PATTERN.test(state.extensionSha256)) {
    throw new Error('install state extension SHA-256 is invalid');
  }
  if (!Array.isArray(state.knownGoodReleaseIds)) throw new Error('known-good releases must be an array');
  const knownGoodReleaseIds = state.knownGoodReleaseIds.map((value, index) => releaseId(value, `known-good release ${index}`));
  if (!state.quarantinedReleaseIds || typeof state.quarantinedReleaseIds !== 'object' || Array.isArray(state.quarantinedReleaseIds)) {
    throw new Error('quarantined releases must be an object');
  }
  const quarantinedReleaseIds: Record<string, string> = {};
  for (const [id, reason] of Object.entries(state.quarantinedReleaseIds)) {
    releaseId(id, 'quarantined release id');
    if (typeof reason !== 'string' || !reason || reason.length > 500) throw new Error(`quarantine reason for ${id} is invalid`);
    quarantinedReleaseIds[id] = reason;
  }
  return {
    schemaVersion: INSTALL_STATE_SCHEMA_VERSION,
    currentReleaseId,
    previousReleaseId,
    extensionSha256: state.extensionSha256,
    knownGoodReleaseIds: [...new Set(knownGoodReleaseIds)],
    quarantinedReleaseIds,
  };
}

export async function readInstallState(path: string): Promise<InstallStateV1 | null> {
  try {
    return parseInstallState(JSON.parse(await readFile(path, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error(`Failed to read install state ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function writeInstallState(path: string, state: InstallStateV1): Promise<void> {
  await writeJsonAtomically(path, parseInstallState(state));
}
