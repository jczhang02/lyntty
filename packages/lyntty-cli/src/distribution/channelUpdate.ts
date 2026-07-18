import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  CompatibilityBomV1Schema,
  ReleaseTrustStoreSchema,
  compatibilityBomFileBytes,
  selectCliArchive,
  verifyCompatibilityBom,
  type ReleaseChannel,
  type ReleaseTrustStore,
} from 'lyntty-wire/compatibility';
import { nodeCompatibilityCrypto } from 'lyntty-wire/compatibility/node';
import { fetchBoundedJson, type ReleaseMetadataFetcher } from 'lyntty-wire/compatibility/fetch';
import * as semver from 'semver';
import { runtimeLayout } from './runtimeLayout';

const DEFAULT_STABLE_BOM_URL = 'https://github.com/jczhang02/lyntty/releases/latest/download/compatibility-bom.json';

export type ChannelUpdateResolution = {
  available: boolean;
  channel: ReleaseChannel;
  releaseId: string;
  sequence: number;
  bomSha256: string;
  currentVersion: string;
  candidateVersion: string;
  archive: ReturnType<typeof selectCliArchive>;
};

export function currentCliTarget(): Parameters<typeof selectCliArchive>[1] {
  if (process.platform === 'linux' && process.arch === 'x64') return 'linux-x64-gnu';
  if (process.platform === 'linux' && process.arch === 'arm64') return 'linux-arm64-gnu';
  if (process.platform === 'darwin' && process.arch === 'x64') return 'darwin-x64';
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'darwin-arm64';
  if (process.platform === 'win32' && process.arch === 'x64') return 'windows-x64';
  throw new Error(`No standalone CLI release target for ${process.platform}-${process.arch}`);
}

function signatureUrl(bomUrl: string, explicit?: string): string {
  if (explicit) return explicit;
  if (!bomUrl.endsWith('.json')) throw new Error('Compatibility BOM URL requires --signature-url');
  return `${bomUrl.slice(0, -'.json'.length)}.sig.json`;
}

export async function loadReleaseTrustStore(explicitPath?: string): Promise<ReleaseTrustStore> {
  if (explicitPath) return ReleaseTrustStoreSchema.parse(JSON.parse(await readFile(explicitPath, 'utf8')));
  if (process.env.LYNTTY_RELEASE_TRUST_ROOTS) {
    return ReleaseTrustStoreSchema.parse(JSON.parse(process.env.LYNTTY_RELEASE_TRUST_ROOTS));
  }
  const layout = runtimeLayout();
  if (!layout.compiled) throw new Error('Source-mode update checks require --trust-store or LYNTTY_RELEASE_TRUST_ROOTS');
  return ReleaseTrustStoreSchema.parse(JSON.parse(await readFile(
    join(layout.rootDir, 'runtime', 'release', 'trust-roots.json'),
    'utf8',
  )));
}

export async function resolveChannelUpdate(options: {
  channel: ReleaseChannel;
  currentVersion: string;
  bomUrl?: string;
  signatureUrl?: string;
  trustStore: ReleaseTrustStore;
  minimumSequence?: number;
  target?: Parameters<typeof selectCliArchive>[1];
  fetcher?: ReleaseMetadataFetcher;
}): Promise<ChannelUpdateResolution> {
  if (!semver.valid(options.currentVersion)) throw new Error(`Current CLI version is not SemVer: ${options.currentVersion}`);
  const bomUrl = options.bomUrl
    ?? (options.channel === 'stable' ? DEFAULT_STABLE_BOM_URL : null);
  if (!bomUrl) throw new Error('Preview update checks require --bom-url');
  const fetcher = options.fetcher ?? fetch;
  const [bom, signature] = await Promise.all([
    fetchBoundedJson({
      url: bomUrl,
      fetcher,
      canonicalBytes: value => compatibilityBomFileBytes(CompatibilityBomV1Schema.parse(value)),
    }),
    fetchBoundedJson({ url: signatureUrl(bomUrl, options.signatureUrl), fetcher }),
  ]);
  const verified = await verifyCompatibilityBom({
    bom,
    signature,
    trustStore: options.trustStore,
    crypto: nodeCompatibilityCrypto,
    expectedChannel: options.channel,
    minimumSequence: options.minimumSequence,
  });
  const archive = selectCliArchive(verified.bom, options.target ?? currentCliTarget());
  const candidateVersion = verified.bom.components.cli.version;
  return {
    available: !semver.eq(candidateVersion, options.currentVersion),
    channel: options.channel,
    releaseId: verified.bom.releaseId,
    sequence: verified.bom.sequence,
    bomSha256: verified.bomSha256,
    currentVersion: options.currentVersion,
    candidateVersion,
    archive,
  };
}
