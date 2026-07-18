import {
  CompatibilityBomV1Schema,
  compatibilityBomFileBytes,
  type CompatibilityBomV1,
  type ImmutableFile,
  type ReleaseChannel,
  type ReleaseTrustStore,
} from './compatibilityBom';
import {
  deriveEd25519PublicKeyBase64,
  nodeCompatibilityCrypto,
  signCompatibilityBom,
} from './compatibilityBom.node';
import { CURRENT_WIRE_OFFER } from './wireCompatibility';

export const TEST_BOM_PRIVATE_KEY_SEED_BASE64 = Buffer.from(
  Uint8Array.from({ length: 32 }, (_, index) => index + 1),
).toString('base64');
export const TEST_BOM_PUBLIC_KEY_BASE64 = deriveEd25519PublicKeyBase64(TEST_BOM_PRIVATE_KEY_SEED_BASE64);
export const TEST_STABLE_ANDROID_SIGNER_SHA256 = 'a'.repeat(64);
export const TEST_PREVIEW_ANDROID_SIGNER_SHA256 = 'b'.repeat(64);
const TEST_SOURCE_COMMIT = '1'.repeat(40);

function immutableFile(name: string, tag: string, sha256 = 'a'.repeat(64)): ImmutableFile {
  return {
    name,
    url: `https://github.com/jczhang02/lyntty/releases/download/${tag}/${name}`,
    sha256,
    size: 1024,
  };
}

export function createCompatibilityBomFixture(options: {
  sequence?: number;
  channel?: ReleaseChannel;
  wireMinor?: number;
  appVersion?: string;
  appVersionCode?: number;
  cliVersion?: string;
  relayVersion?: string;
  predecessors?: CompatibilityBomV1['predecessors'];
} = {}): CompatibilityBomV1 {
  const sequence = options.sequence ?? 3;
  const channel = options.channel ?? 'stable';
  const tag = channel === 'stable' ? `compat-v${sequence}` : `compat-preview-v${sequence}`;
  const wire = { ...CURRENT_WIRE_OFFER, protocolMinor: options.wireMinor ?? 1 };
  const base = (version: string, component: string) => ({
    version,
    sourceCommit: TEST_SOURCE_COMMIT,
    wire,
    requires: {
      app: '>=1.0.0 <2.0.0',
      cli: '>=1.1.0 <2.0.0',
      relay: '>=1.1.0 <2.0.0',
      requiredWireCapabilities: [...CURRENT_WIRE_OFFER.capabilities],
    },
    supplyChain: {
      sbom: immutableFile(`${component}.spdx.json`, tag),
      provenance: immutableFile(`${component}.intoto.jsonl`, tag, 'b'.repeat(64)),
    },
  });
  const targets = ['linux-x64-gnu', 'linux-arm64-gnu', 'darwin-x64', 'darwin-arm64', 'windows-x64'] as const;
  const relayRepository = channel === 'stable'
    ? 'ghcr.io/jczhang02/lyntty-relay'
    : 'ghcr.io/jczhang02/lyntty-relay-preview';
  return CompatibilityBomV1Schema.parse({
    schemaVersion: 1,
    releaseId: `${channel}-${sequence}`,
    sequence,
    channel,
    releasedAt: '2026-07-18T00:00:00Z',
    source: { repository: 'https://github.com/jczhang02/lyntty', commit: TEST_SOURCE_COMMIT },
    support: { maxWireMinorSkew: 1, stableHistoryLength: 3, minimumSupportDays: 90 },
    components: {
      app: {
        ...base(options.appVersion ?? '1.1.0', 'app'),
        android: {
          packageId: channel === 'stable' ? 'dev.jczhang.lyntty' : 'dev.jczhang.lyntty.preview',
          versionCode: options.appVersionCode ?? 178,
          signerSha256: channel === 'stable'
            ? TEST_STABLE_ANDROID_SIGNER_SHA256
            : TEST_PREVIEW_ANDROID_SIGNER_SHA256,
          apk: immutableFile(`lyntty-${channel}.apk`, tag),
        },
      },
      cli: {
        ...base(options.cliVersion ?? '1.2.0', 'cli'),
        archives: targets.map(target => ({
          ...immutableFile(`lyntty-${target}${target === 'windows-x64' ? '.zip' : '.tar.gz'}`, tag),
          target,
          artifactManifestSha256: 'b'.repeat(64),
          ...(channel === 'stable' && (target.startsWith('darwin-') || target === 'windows-x64')
            ? { nativeSigningAttestation: immutableFile(`native-${target}-attestation.json`, tag, 'c'.repeat(64)) }
            : {}),
        })),
      },
      relay: {
        ...base(options.relayVersion ?? '1.2.0', 'relay'),
        image: {
          repository: relayRepository,
          digest: `sha256:${'b'.repeat(64)}`,
          reference: `${relayRepository}@sha256:${'b'.repeat(64)}`,
          platforms: ['linux/amd64', 'linux/arm64'],
        },
        schema: { minimum: 1, current: 1 },
      },
      wire: { version: '0.2.0', sourceCommit: TEST_SOURCE_COMMIT },
    },
    predecessors: options.predecessors ?? [],
  });
}

export function createReleaseTrustStoreFixture(channel: ReleaseChannel = 'stable'): ReleaseTrustStore {
  return {
    schemaVersion: 1,
    roots: [{
      keyId: `${channel}-test-key`,
      channel,
      publicKeyBase64: TEST_BOM_PUBLIC_KEY_BASE64,
      validFromSequence: 0,
      androidPackageId: channel === 'stable' ? 'dev.jczhang.lyntty' : 'dev.jczhang.lyntty.preview',
      androidSignerSha256: channel === 'stable'
        ? TEST_STABLE_ANDROID_SIGNER_SHA256
        : TEST_PREVIEW_ANDROID_SIGNER_SHA256,
      relayImageRepository: channel === 'stable'
        ? 'ghcr.io/jczhang02/lyntty-relay'
        : 'ghcr.io/jczhang02/lyntty-relay-preview',
    }],
  };
}

export function createSignedCompatibilityBomFixture(options: Parameters<typeof createCompatibilityBomFixture>[0] = {}) {
  const bom = createCompatibilityBomFixture(options);
  const signature = signCompatibilityBom({
    bom,
    keyId: `${bom.channel}-test-key`,
    channel: bom.channel,
    privateKeySeedBase64: TEST_BOM_PRIVATE_KEY_SEED_BASE64,
  });
  return { bom, signature, trustStore: createReleaseTrustStoreFixture(bom.channel) };
}

export async function createPredecessorReferenceFixture(bom: CompatibilityBomV1) {
  const sha256 = await nodeCompatibilityCrypto.sha256Hex(compatibilityBomFileBytes(bom));
  const tag = bom.channel === 'stable' ? `compat-v${bom.sequence}` : `compat-preview-v${bom.sequence}`;
  return {
    sequence: bom.sequence,
    bom: immutableFile('compatibility-bom.json', tag, sha256),
    signature: immutableFile('compatibility-bom.sig.json', tag, 'b'.repeat(64)),
  };
}
