import * as semver from 'semver';
import { z } from 'zod';
import {
  WireCapabilitySchema,
  WireOfferSchema,
  negotiateWireCompatibility,
  type WireCapability,
  type WireOffer,
} from './wireCompatibility';

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const CommitShaSchema = z.string().regex(/^[a-f0-9]{40}$/);
const Base64PublicKeySchema = z.string().regex(/^[A-Za-z0-9+/]{43}=$/);
const Base64SignatureSchema = z.string().regex(/^[A-Za-z0-9+/]{86}==$/);
const ComponentVersionSchema = z.string().refine(value => semver.valid(value) !== null, 'Expected strict SemVer');
const VersionRangeSchema = z.string().refine(value => semver.validRange(value) !== null, 'Expected a valid SemVer range');
const HttpsUrlSchema = z.string().url().refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.search && !url.hash && !url.pathname.includes('/latest/');
}, 'Expected an immutable HTTPS URL without query, fragment, or /latest/');

export const ReleaseChannelSchema = z.enum(['stable', 'preview']);
export type ReleaseChannel = z.infer<typeof ReleaseChannelSchema>;

export const ImmutableFileSchema = z.object({
  name: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/),
  url: HttpsUrlSchema,
  sha256: Sha256Schema,
  size: z.number().int().positive(),
}).strict();
export type ImmutableFile = z.infer<typeof ImmutableFileSchema>;

const SupplyChainEvidenceSchema = z.object({
  sbom: ImmutableFileSchema,
  provenance: ImmutableFileSchema,
}).strict();

const ComponentRequirementsSchema = z.object({
  app: VersionRangeSchema.optional(),
  cli: VersionRangeSchema.optional(),
  relay: VersionRangeSchema.optional(),
  requiredWireCapabilities: z.array(WireCapabilitySchema).max(32),
}).strict().superRefine((requirements, context) => {
  if (new Set(requirements.requiredWireCapabilities).size !== requirements.requiredWireCapabilities.length) {
    context.addIssue({ code: 'custom', path: ['requiredWireCapabilities'], message: 'Required capabilities must be unique' });
  }
});

const ComponentBaseSchema = z.object({
  version: ComponentVersionSchema,
  sourceCommit: CommitShaSchema,
  wire: WireOfferSchema,
  requires: ComponentRequirementsSchema,
  supplyChain: SupplyChainEvidenceSchema,
});

const AndroidReleaseSchema = z.object({
  packageId: z.enum(['dev.jczhang.lyntty', 'dev.jczhang.lyntty.preview']),
  versionCode: z.number().int().positive(),
  signerSha256: Sha256Schema,
  apk: ImmutableFileSchema,
}).strict();

const CliTargetSchema = z.enum([
  'linux-x64-gnu',
  'linux-arm64-gnu',
  'darwin-x64',
  'darwin-arm64',
  'windows-x64',
]);

const CliArchiveSchema = ImmutableFileSchema.extend({
  target: CliTargetSchema,
  artifactManifestSha256: Sha256Schema,
  nativeSigningAttestation: ImmutableFileSchema.optional(),
}).strict();

const RelayImageSchema = z.object({
  repository: z.string().regex(/^ghcr\.io\/[a-z0-9][a-z0-9._/-]*$/),
  digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  reference: z.string(),
  platforms: z.array(z.enum(['linux/amd64', 'linux/arm64'])).length(2),
}).strict().superRefine((image, context) => {
  if (image.reference !== `${image.repository}@${image.digest}`) {
    context.addIssue({ code: 'custom', path: ['reference'], message: 'Relay image reference must use its immutable digest' });
  }
  if (new Set(image.platforms).size !== image.platforms.length) {
    context.addIssue({ code: 'custom', path: ['platforms'], message: 'Relay image platforms must be unique' });
  }
});

const PredecessorBomSchema = z.object({
  sequence: z.number().int().nonnegative(),
  bom: ImmutableFileSchema,
  signature: ImmutableFileSchema,
}).strict();

export const CompatibilityBomV1Schema = z.object({
  schemaVersion: z.literal(1),
  releaseId: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,127}$/),
  sequence: z.number().int().nonnegative(),
  channel: ReleaseChannelSchema,
  releasedAt: z.string().datetime({ offset: true }),
  source: z.object({
    repository: z.literal('https://github.com/jczhang02/lyntty'),
    commit: CommitShaSchema,
  }).strict(),
  support: z.object({
    maxWireMinorSkew: z.literal(1),
    stableHistoryLength: z.literal(3),
    minimumSupportDays: z.number().int().min(90),
  }).strict(),
  components: z.object({
    app: ComponentBaseSchema.extend({ android: AndroidReleaseSchema }).strict(),
    cli: ComponentBaseSchema.extend({
      archives: z.array(CliArchiveSchema).length(5),
    }).strict().superRefine((cli, context) => {
      if (new Set(cli.archives.map(archive => archive.target)).size !== cli.archives.length) {
        context.addIssue({ code: 'custom', path: ['archives'], message: 'CLI archive targets must be unique' });
      }
    }),
    relay: ComponentBaseSchema.extend({
      image: RelayImageSchema,
      schema: z.object({
        minimum: z.number().int().positive(),
        current: z.number().int().positive(),
      }).strict().refine(schema => schema.minimum <= schema.current, 'Relay minimum schema exceeds current schema'),
    }).strict(),
    wire: z.object({
      version: ComponentVersionSchema,
      sourceCommit: CommitShaSchema,
    }).strict(),
  }).strict(),
  predecessors: z.array(PredecessorBomSchema).max(2),
}).strict().superRefine((bom, context) => {
  if (bom.channel !== 'stable') return;
  for (const [index, archive] of bom.components.cli.archives.entries()) {
    if ((archive.target.startsWith('darwin-') || archive.target === 'windows-x64') && !archive.nativeSigningAttestation) {
      context.addIssue({
        code: 'custom',
        path: ['components', 'cli', 'archives', index, 'nativeSigningAttestation'],
        message: `Stable native archive ${archive.target} requires pinned signing attestation evidence`,
      });
    }
  }
});

export type CompatibilityBomV1 = z.infer<typeof CompatibilityBomV1Schema>;

export const CompatibilityBomSignatureV1Schema = z.object({
  schemaVersion: z.literal(1),
  algorithm: z.literal('Ed25519'),
  keyId: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,127}$/),
  channel: ReleaseChannelSchema,
  payloadSha256: Sha256Schema,
  signatureBase64: Base64SignatureSchema,
}).strict();
export type CompatibilityBomSignatureV1 = z.infer<typeof CompatibilityBomSignatureV1Schema>;

export const ReleaseTrustRootSchema = z.object({
  keyId: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,127}$/),
  channel: ReleaseChannelSchema,
  publicKeyBase64: Base64PublicKeySchema,
  validFromSequence: z.number().int().nonnegative(),
  validThroughSequence: z.number().int().nonnegative().optional(),
  androidPackageId: z.enum(['dev.jczhang.lyntty', 'dev.jczhang.lyntty.preview']),
  androidSignerSha256: Sha256Schema,
  relayImageRepository: z.string().regex(/^ghcr\.io\/[a-z0-9][a-z0-9._/-]*$/),
}).strict().superRefine((root, context) => {
  if (root.validThroughSequence !== undefined && root.validThroughSequence < root.validFromSequence) {
    context.addIssue({ code: 'custom', path: ['validThroughSequence'], message: 'Trust-root sequence interval is inverted' });
  }
});
export type ReleaseTrustRoot = z.infer<typeof ReleaseTrustRootSchema>;

export const ReleaseTrustStoreSchema = z.object({
  schemaVersion: z.literal(1),
  roots: z.array(ReleaseTrustRootSchema).min(1),
}).strict().superRefine((store, context) => {
  if (new Set(store.roots.map(root => root.keyId)).size !== store.roots.length) {
    context.addIssue({ code: 'custom', path: ['roots'], message: 'Release trust-root key IDs must be unique' });
  }
});
export type ReleaseTrustStore = z.infer<typeof ReleaseTrustStoreSchema>;

// This public key is derived from the deterministic seed committed in
// compatibilityBom.testing.ts. Production release tooling must reject it.
export const NON_PUBLISHABLE_TEST_BOM_PUBLIC_KEY_BASE64 = 'ebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ=';
export const NON_PUBLISHABLE_TEST_BOM_KEY_IDS = ['stable-test-key', 'preview-test-key'] as const;

export interface CompatibilityCrypto {
  sha256Hex(payload: Uint8Array): string | Promise<string>;
  verifyEd25519(options: {
    publicKeyBase64: string;
    payload: Uint8Array;
    signatureBase64: string;
  }): boolean | Promise<boolean>;
}

function canonicalValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Canonical JSON does not support non-finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(',')}]`;
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error('Canonical JSON requires plain objects');
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalValue(record[key])}`).join(',')}}`;
  }
  throw new Error(`Canonical JSON does not support ${typeof value}`);
}

export function canonicalCompatibilityBom(bom: CompatibilityBomV1): string {
  return canonicalValue(CompatibilityBomV1Schema.parse(bom));
}

export function compatibilityBomFileBytes(bom: CompatibilityBomV1): Uint8Array {
  return new TextEncoder().encode(`${canonicalCompatibilityBom(bom)}\n`);
}

export function compatibilityBomPayload(bom: CompatibilityBomV1): Uint8Array {
  const domain = new TextEncoder().encode('LYNTTY-COMPATIBILITY-BOM-V1\n');
  const file = compatibilityBomFileBytes(bom);
  const payload = new Uint8Array(domain.byteLength + file.byteLength);
  payload.set(domain, 0);
  payload.set(file, domain.byteLength);
  return payload;
}

export function compatibilityBomCanonicalBytes(bom: CompatibilityBomV1): Uint8Array {
  return new TextEncoder().encode(canonicalCompatibilityBom(bom));
}

function validateReleasePolicy(bom: CompatibilityBomV1, root: ReleaseTrustRoot): void {
  if (bom.channel !== root.channel) throw new Error(`BOM channel ${bom.channel} is not trusted by ${root.keyId}`);
  if (bom.sequence < root.validFromSequence || (root.validThroughSequence !== undefined && bom.sequence > root.validThroughSequence)) {
    throw new Error(`BOM sequence ${bom.sequence} is outside trust-root validity`);
  }
  const android = bom.components.app.android;
  if (android.packageId !== root.androidPackageId) throw new Error('BOM Android package does not match trust root');
  if (android.signerSha256 !== root.androidSignerSha256) throw new Error('BOM Android signer does not match trust root');
  if (bom.channel === 'stable' && android.packageId !== 'dev.jczhang.lyntty') throw new Error('Stable BOM must use the stable Android package');
  if (bom.channel === 'preview' && android.packageId !== 'dev.jczhang.lyntty.preview') throw new Error('Preview BOM must use the preview Android package');
  if (bom.components.relay.image.repository !== root.relayImageRepository) throw new Error('BOM Relay repository does not match trust root');
}

export async function verifyCompatibilityBom(options: {
  bom: unknown;
  signature: unknown;
  trustStore: unknown;
  crypto: CompatibilityCrypto;
  expectedChannel: ReleaseChannel;
  minimumSequence?: number;
}): Promise<{ bom: CompatibilityBomV1; signature: CompatibilityBomSignatureV1; bomSha256: string }> {
  const bom = CompatibilityBomV1Schema.parse(options.bom);
  const signature = CompatibilityBomSignatureV1Schema.parse(options.signature);
  const trustStore = ReleaseTrustStoreSchema.parse(options.trustStore);
  if (bom.channel !== options.expectedChannel || signature.channel !== options.expectedChannel) {
    throw new Error(`Expected ${options.expectedChannel} release metadata`);
  }
  if (options.minimumSequence !== undefined && bom.sequence < options.minimumSequence) {
    throw new Error(`BOM sequence ${bom.sequence} is older than accepted sequence ${options.minimumSequence}`);
  }
  const root = trustStore.roots.find(candidate => candidate.keyId === signature.keyId);
  if (!root) throw new Error(`Untrusted Compatibility BOM key ${signature.keyId}`);
  validateReleasePolicy(bom, root);
  const bomSha256 = await options.crypto.sha256Hex(compatibilityBomFileBytes(bom));
  if (bomSha256 !== signature.payloadSha256) throw new Error('Compatibility BOM digest does not match signature envelope');
  const valid = await options.crypto.verifyEd25519({
    publicKeyBase64: root.publicKeyBase64,
    payload: compatibilityBomPayload(bom),
    signatureBase64: signature.signatureBase64,
  });
  if (!valid) throw new Error('Compatibility BOM signature is invalid');
  const compatibility = evaluateComponentCompatibility({
    app: bom,
    cli: bom,
    relay: bom,
  });
  if (!compatibility.compatible) throw new Error(`Compatibility BOM is internally incompatible: ${compatibility.reason}`);
  return { bom, signature, bomSha256 };
}

type ComponentKind = 'app' | 'cli' | 'relay';

type ComponentSet = Record<ComponentKind, CompatibilityBomV1>;

export type ComponentCompatibilityResult = {
  compatible: true;
} | {
  compatible: false;
  reason: string;
};

function componentDescriptor(bom: CompatibilityBomV1, kind: ComponentKind) {
  return bom.components[kind];
}

export function evaluateComponentCompatibility(set: ComponentSet): ComponentCompatibilityResult {
  const kinds: ComponentKind[] = ['app', 'cli', 'relay'];
  for (const localKind of kinds) {
    const local = componentDescriptor(set[localKind], localKind);
    for (const remoteKind of kinds) {
      if (localKind === remoteKind) continue;
      const requiredRange = local.requires[remoteKind];
      const remote = componentDescriptor(set[remoteKind], remoteKind);
      if (requiredRange && !semver.satisfies(remote.version, requiredRange, { includePrerelease: true })) {
        return {
          compatible: false,
          reason: `${localKind} ${local.version} requires ${remoteKind} ${requiredRange}, got ${remote.version}`,
        };
      }
      const wire = negotiateWireCompatibility({
        local: local.wire,
        remote: remote.wire,
        requiredRemoteCapabilities: local.requires.requiredWireCapabilities,
        maxMinorSkew: set[localKind].support.maxWireMinorSkew,
      });
      if (!wire.compatible) {
        return { compatible: false, reason: `${localKind}/${remoteKind} Wire negotiation failed: ${wire.details}` };
      }
    }
  }
  return { compatible: true };
}

export async function validateCompatibilityHistory(options: {
  current: CompatibilityBomV1;
  predecessors: CompatibilityBomV1[];
  crypto: Pick<CompatibilityCrypto, 'sha256Hex'>;
}): Promise<void> {
  const current = CompatibilityBomV1Schema.parse(options.current);
  const predecessors = options.predecessors.map(value => CompatibilityBomV1Schema.parse(value));
  const history = [current, ...predecessors];
  if (history.length > current.support.stableHistoryLength) throw new Error('Compatibility history exceeds supported retention window');
  if (current.predecessors.length !== predecessors.length) throw new Error('Compatibility BOM predecessor list is incomplete');
  for (let index = 0; index < predecessors.length; index += 1) {
    const predecessor = predecessors[index]!;
    const reference = current.predecessors[index]!;
    if (predecessor.channel !== current.channel) throw new Error('Compatibility history crosses release channels');
    if (index > 0 && predecessors[index - 1]!.sequence <= predecessor.sequence) throw new Error('Compatibility history sequence is not descending');
    if (predecessor.sequence >= current.sequence || reference.sequence !== predecessor.sequence) throw new Error('Compatibility predecessor sequence does not match');
    const digest = await options.crypto.sha256Hex(compatibilityBomFileBytes(predecessor));
    if (digest !== reference.bom.sha256) throw new Error('Compatibility predecessor digest does not match');
  }
  const newestRelaySchemaMinimum = Math.max(...history.map(bom => bom.components.relay.schema.minimum));
  const oldestRelaySchemaCurrent = Math.min(...history.map(bom => bom.components.relay.schema.current));
  if (newestRelaySchemaMinimum > oldestRelaySchemaCurrent) {
    throw new Error('Retained Relay binaries cannot read the newest required database schema');
  }
  for (const app of history) {
    for (const cli of history) {
      for (const relay of history) {
        const result = evaluateComponentCompatibility({ app, cli, relay });
        if (!result.compatible) throw new Error(`Retained Compatibility BOM matrix is not rolling-upgrade safe: ${result.reason}`);
      }
    }
  }
}

export function selectAndroidRelease(bom: CompatibilityBomV1) {
  return CompatibilityBomV1Schema.parse(bom).components.app.android;
}

export function selectCliArchive(bom: CompatibilityBomV1, target: z.infer<typeof CliTargetSchema>) {
  const parsed = CompatibilityBomV1Schema.parse(bom);
  const archive = parsed.components.cli.archives.find(candidate => candidate.target === target);
  if (!archive) throw new Error(`Compatibility BOM has no CLI archive for ${target}`);
  return archive;
}

export function selectRelayImage(bom: CompatibilityBomV1) {
  return CompatibilityBomV1Schema.parse(bom).components.relay.image;
}

export type { WireCapability, WireOffer };
