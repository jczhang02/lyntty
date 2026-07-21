import { describe, expect, it } from 'bun:test';
import {
  CompatibilityBomV1Schema,
  NON_PUBLISHABLE_TEST_BOM_PUBLIC_KEY_BASE64,
  ReleaseTrustStoreSchema,
  canonicalCompatibilityBom,
  compatibilityBomFileBytes,
  evaluateComponentCompatibility,
  selectAndroidRelease,
  selectCliArchive,
  selectRelayImage,
  validateCompatibilityHistory,
  verifyCompatibilityBom,
  type CompatibilityBomV1,
  type ImmutableFile,
  type ReleaseChannel,
  type ReleaseTrustStore,
} from './compatibilityBom';
import {
  assertPublishableCompatibilityBomSigningIdentity,
  deriveEd25519PublicKeyBase64,
  nodeCompatibilityCrypto,
  signCompatibilityBom,
} from './compatibilityBom.node';
import { CURRENT_WIRE_OFFER } from './wireCompatibility';

const PRIVATE_KEY_SEED_BASE64 = Buffer.from(Uint8Array.from({ length: 32 }, (_, index) => index + 1)).toString('base64');
const PREVIEW_PRIVATE_KEY_SEED_BASE64 = Buffer.from(Uint8Array.from({ length: 32 }, (_, index) => index + 65)).toString('base64');
const PUBLIC_KEY_BASE64 = deriveEd25519PublicKeyBase64(PRIVATE_KEY_SEED_BASE64);
const PREVIEW_PUBLIC_KEY_BASE64 = deriveEd25519PublicKeyBase64(PREVIEW_PRIVATE_KEY_SEED_BASE64);
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const SOURCE_COMMIT = '1'.repeat(40);
const REQUIRED_CAPABILITIES = [...CURRENT_WIRE_OFFER.capabilities];

function immutableFile(name: string, sequence: number, sha256 = HASH_A): ImmutableFile {
  return {
    name,
    url: `https://github.com/jczhang02/lyntty/releases/download/compat-v${sequence}/${name}`,
    sha256,
    size: 1000 + sequence,
  };
}

function supplyChain(component: string, sequence: number) {
  return {
    sbom: immutableFile(`${component}-${sequence}.spdx.json`, sequence),
    provenance: immutableFile(`${component}-${sequence}.intoto.jsonl`, sequence, HASH_B),
  };
}

function buildBom(options: {
  sequence: number;
  channel?: ReleaseChannel;
  wireMinor?: number;
  appVersion?: string;
  cliVersion?: string;
  relayVersion?: string;
  predecessors?: CompatibilityBomV1['predecessors'];
}): CompatibilityBomV1 {
  const channel = options.channel ?? 'stable';
  const sequence = options.sequence;
  const wire = { ...CURRENT_WIRE_OFFER, protocolMinor: options.wireMinor ?? 1 };
  const componentBase = (version: string, kind: string) => ({
    version,
    sourceCommit: SOURCE_COMMIT,
    wire,
    requires: {
      app: '>=1.0.0 <2.0.0',
      cli: '>=1.1.0 <2.0.0',
      relay: '>=1.1.0 <2.0.0',
      requiredWireCapabilities: REQUIRED_CAPABILITIES,
    },
    supplyChain: supplyChain(kind, sequence),
  });
  const tag = channel === 'stable' ? `compat-v${sequence}` : `compat-preview-v${sequence}`;
  const releaseFile = (name: string, sha256 = HASH_A): ImmutableFile => ({
    name,
    url: `https://github.com/jczhang02/lyntty/releases/download/${tag}/${name}`,
    sha256,
    size: 2000 + sequence,
  });
  const targets = ['linux-x64-gnu', 'linux-arm64-gnu', 'darwin-x64', 'darwin-arm64', 'windows-x64'] as const;
  return CompatibilityBomV1Schema.parse({
    schemaVersion: 1,
    releaseId: `${channel}-${sequence}`,
    sequence,
    channel,
    releasedAt: `2026-07-${String(10 + sequence).padStart(2, '0')}T00:00:00Z`,
    source: {
      repository: 'https://github.com/jczhang02/lyntty',
      commit: SOURCE_COMMIT,
    },
    support: {
      maxWireMinorSkew: 1,
      stableHistoryLength: 3,
      minimumSupportDays: 90,
    },
    components: {
      app: {
        ...componentBase(options.appVersion ?? '1.1.0', 'app'),
        android: {
          packageId: channel === 'stable' ? 'dev.jczhang.lyntty' : 'dev.jczhang.lyntty.preview',
          versionCode: 900000 + sequence,
          signerSha256: channel === 'stable' ? HASH_A : HASH_B,
          apk: releaseFile(`lyntty-${channel}-${sequence}.apk`),
        },
      },
      cli: {
        ...componentBase(options.cliVersion ?? '1.2.0', 'cli'),
        archives: targets.map(target => ({
          ...releaseFile(`lyntty-${target}-${sequence}${target === 'windows-x64' ? '.zip' : '.tar.gz'}`),
          target,
          artifactManifestSha256: HASH_B,
          ...(channel === 'stable' && (target.startsWith('darwin-') || target === 'windows-x64')
            ? { nativeSigningAttestation: releaseFile(`native-${target}-attestation.json`) }
            : {}),
        })),
      },
      relay: {
        ...componentBase(options.relayVersion ?? '1.2.0', 'relay'),
        image: {
          repository: channel === 'stable'
            ? 'ghcr.io/jczhang02/lyntty-relay'
            : 'ghcr.io/jczhang02/lyntty-relay-preview',
          digest: `sha256:${HASH_B}`,
          reference: `${channel === 'stable' ? 'ghcr.io/jczhang02/lyntty-relay' : 'ghcr.io/jczhang02/lyntty-relay-preview'}@sha256:${HASH_B}`,
          platforms: ['linux/amd64', 'linux/arm64'],
        },
        schema: { minimum: 1, current: 1 },
      },
      wire: {
        version: '0.2.0',
        sourceCommit: SOURCE_COMMIT,
      },
    },
    predecessors: options.predecessors ?? [],
  });
}

function trustStore(channel: ReleaseChannel = 'stable'): ReleaseTrustStore {
  return {
    schemaVersion: 1,
    roots: [{
      keyId: `${channel}-test-key`,
      channel,
      publicKeyBase64: channel === 'stable' ? PUBLIC_KEY_BASE64 : PREVIEW_PUBLIC_KEY_BASE64,
      validFromSequence: 0,
      androidPackageId: channel === 'stable' ? 'dev.jczhang.lyntty' : 'dev.jczhang.lyntty.preview',
      androidSignerSha256: channel === 'stable' ? HASH_A : HASH_B,
      relayImageRepository: channel === 'stable'
        ? 'ghcr.io/jczhang02/lyntty-relay'
        : 'ghcr.io/jczhang02/lyntty-relay-preview',
    }],
  };
}

async function predecessorReference(bom: CompatibilityBomV1) {
  const sha256 = await nodeCompatibilityCrypto.sha256Hex(compatibilityBomFileBytes(bom));
  return {
    sequence: bom.sequence,
    bom: immutableFile(`compatibility-bom-${bom.sequence}.json`, bom.sequence, sha256),
    signature: immutableFile(`compatibility-bom-${bom.sequence}.sig.json`, bom.sequence, HASH_B),
  };
}

describe('Compatibility BOM', () => {
  it('marks the deterministic fixture identity as non-publishable', () => {
    expect(PUBLIC_KEY_BASE64).toBe(NON_PUBLISHABLE_TEST_BOM_PUBLIC_KEY_BASE64);
    expect(() => assertPublishableCompatibilityBomSigningIdentity({
      keyId: 'stable-production-key',
      privateKeySeedBase64: PRIVATE_KEY_SEED_BASE64,
    })).toThrow('non-publishable test fixture');
  });

  it('rejects public-key reuse across Stable and Preview roots', () => {
    const stable = trustStore().roots[0]!;
    expect(() => ReleaseTrustStoreSchema.parse({
      schemaVersion: 1,
      roots: [stable, {
        ...stable,
        keyId: 'preview-other-key',
        channel: 'preview',
        androidPackageId: 'dev.jczhang.lyntty.preview',
        androidSignerSha256: HASH_B,
        relayImageRepository: 'ghcr.io/jczhang02/lyntty-relay-preview',
      }],
    })).toThrow('Stable and Preview trust roots must use distinct public keys');
  });
  it('canonicalizes, signs, verifies, and selects immutable artifacts', async () => {
    const bom = buildBom({ sequence: 3 });
    const signature = signCompatibilityBom({
      bom,
      keyId: 'stable-test-key',
      channel: 'stable',
      privateKeySeedBase64: PRIVATE_KEY_SEED_BASE64,
    });
    const verified = await verifyCompatibilityBom({
      bom: JSON.parse(JSON.stringify(bom)),
      signature,
      trustStore: trustStore(),
      crypto: nodeCompatibilityCrypto,
      expectedChannel: 'stable',
    });
    expect(verified.bomSha256).toBe('802c251cc64cb47cabc3824815ff2479f7cb9aaee87ab9363e03ae2638cc1c17');
    expect(canonicalCompatibilityBom(bom)).toBe(canonicalCompatibilityBom(JSON.parse(JSON.stringify(bom))));
    expect(selectAndroidRelease(verified.bom).apk.url).not.toContain('/latest/');
    expect(selectCliArchive(verified.bom, 'windows-x64').name).toEndWith('.zip');
    expect(selectRelayImage(verified.bom).reference).toBe(`ghcr.io/jczhang02/lyntty-relay@sha256:${HASH_B}`);
  });

  it('rejects tampering, channel confusion, replay, and a mismatched signer policy', async () => {
    const bom = buildBom({ sequence: 4 });
    const signature = signCompatibilityBom({
      bom,
      keyId: 'stable-test-key',
      channel: 'stable',
      privateKeySeedBase64: PRIVATE_KEY_SEED_BASE64,
    });
    const verify = (candidate: unknown, overrides: Partial<Parameters<typeof verifyCompatibilityBom>[0]> = {}) => verifyCompatibilityBom({
      bom: candidate,
      signature,
      trustStore: trustStore(),
      crypto: nodeCompatibilityCrypto,
      expectedChannel: 'stable',
      ...overrides,
    });
    await expect(verify({ ...bom, releaseId: 'stable-tampered' })).rejects.toThrow('digest does not match');
    await expect(verify(bom, { expectedChannel: 'preview' })).rejects.toThrow('Expected preview');
    await expect(verify(bom, { minimumSequence: 5 })).rejects.toThrow('older than accepted');
    const wrongSigner = structuredClone(bom);
    wrongSigner.components.app.android.signerSha256 = HASH_B;
    const wrongSignerSignature = signCompatibilityBom({
      bom: wrongSigner,
      keyId: 'stable-test-key',
      channel: 'stable',
      privateKeySeedBase64: PRIVATE_KEY_SEED_BASE64,
    });
    await expect(verifyCompatibilityBom({
      bom: wrongSigner,
      signature: wrongSignerSignature,
      trustStore: trustStore(),
      crypto: nodeCompatibilityCrypto,
      expectedChannel: 'stable',
    })).rejects.toThrow('signer does not match');
  });

  it('keeps preview package, signer, image, and key isolated from stable', async () => {
    expect(trustStore('preview').roots[0]!.publicKeyBase64).not.toBe(trustStore('stable').roots[0]!.publicKeyBase64);
    const preview = buildBom({ sequence: 7, channel: 'preview' });
    const signature = signCompatibilityBom({
      bom: preview,
      keyId: 'preview-test-key',
      channel: 'preview',
      privateKeySeedBase64: PREVIEW_PRIVATE_KEY_SEED_BASE64,
    });
    const verified = await verifyCompatibilityBom({
      bom: preview,
      signature,
      trustStore: trustStore('preview'),
      crypto: nodeCompatibilityCrypto,
      expectedChannel: 'preview',
    });
    expect(verified.bom.components.app.android.packageId).toBe('dev.jczhang.lyntty.preview');
    await expect(verifyCompatibilityBom({
      bom: preview,
      signature,
      trustStore: trustStore('stable'),
      crypto: nodeCompatibilityCrypto,
      expectedChannel: 'preview',
    })).rejects.toThrow('Untrusted');
  });

  it('validates every retained rolling-upgrade combination and predecessor digest', async () => {
    const oldest = buildBom({ sequence: 1, wireMinor: 0, appVersion: '1.0.0', cliVersion: '1.1.10', relayVersion: '1.1.11' });
    const previous = buildBom({ sequence: 2, wireMinor: 1 });
    const current = buildBom({
      sequence: 3,
      wireMinor: 1,
      predecessors: [await predecessorReference(previous), await predecessorReference(oldest)],
    });
    await expect(validateCompatibilityHistory({
      current,
      predecessors: [previous, oldest],
      crypto: nodeCompatibilityCrypto,
    })).resolves.toBeUndefined();

    const tooNew = buildBom({
      sequence: 4,
      wireMinor: 2,
      predecessors: [await predecessorReference(previous), await predecessorReference(oldest)],
    });
    await expect(validateCompatibilityHistory({
      current: tooNew,
      predecessors: [previous, oldest],
      crypto: nodeCompatibilityCrypto,
    })).rejects.toThrow('rolling-upgrade safe');
  });

  it('rejects component SemVer combinations outside declared support', () => {
    const app = buildBom({ sequence: 1 });
    const cli = buildBom({ sequence: 2, cliVersion: '2.0.0' });
    const relay = buildBom({ sequence: 3 });
    expect(evaluateComponentCompatibility({ app, cli, relay })).toMatchObject({
      compatible: false,
      reason: expect.stringContaining('requires cli'),
    });
  });
});
