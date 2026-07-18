import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from 'node:crypto';
import {
  CompatibilityBomV1Schema,
  CompatibilityBomSignatureV1Schema,
  NON_PUBLISHABLE_TEST_BOM_KEY_IDS,
  NON_PUBLISHABLE_TEST_BOM_PUBLIC_KEY_BASE64,
  compatibilityBomFileBytes,
  compatibilityBomPayload,
  type CompatibilityBomSignatureV1,
  type CompatibilityBomV1,
  type CompatibilityCrypto,
  type ReleaseChannel,
} from './compatibilityBom';

const ED25519_PRIVATE_DER_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const ED25519_PUBLIC_DER_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function decodeBase64Exact(value: string, length: number, label: string): Buffer {
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== length || decoded.toString('base64') !== value) {
    throw new Error(`${label} must be canonical base64 for ${length} bytes`);
  }
  return decoded;
}

function privateKeyFromSeed(privateKeySeedBase64: string) {
  const seed = decodeBase64Exact(privateKeySeedBase64, 32, 'Ed25519 private-key seed');
  return createPrivateKey({
    key: Buffer.concat([ED25519_PRIVATE_DER_PREFIX, seed]),
    format: 'der',
    type: 'pkcs8',
  });
}

function publicKeyFromRaw(publicKeyBase64: string) {
  const raw = decodeBase64Exact(publicKeyBase64, 32, 'Ed25519 public key');
  return createPublicKey({
    key: Buffer.concat([ED25519_PUBLIC_DER_PREFIX, raw]),
    format: 'der',
    type: 'spki',
  });
}

export const nodeCompatibilityCrypto: CompatibilityCrypto = {
  sha256Hex(payload) {
    return createHash('sha256').update(payload).digest('hex');
  },
  verifyEd25519(options) {
    const signature = decodeBase64Exact(options.signatureBase64, 64, 'Ed25519 signature');
    return verify(null, options.payload, publicKeyFromRaw(options.publicKeyBase64), signature);
  },
};

export function deriveEd25519PublicKeyBase64(privateKeySeedBase64: string): string {
  const jwk = privateKeyFromSeed(privateKeySeedBase64).export({ format: 'jwk' });
  if (typeof jwk.x !== 'string') throw new Error('Unexpected Ed25519 private-key encoding');
  return Buffer.from(jwk.x, 'base64url').toString('base64');
}

export function assertPublishableCompatibilityBomSigningIdentity(options: {
  keyId: string;
  privateKeySeedBase64: string;
}): void {
  if ((NON_PUBLISHABLE_TEST_BOM_KEY_IDS as readonly string[]).includes(options.keyId)) {
    throw new Error(`Compatibility BOM key ID ${options.keyId} is a non-publishable test fixture`);
  }
  if (deriveEd25519PublicKeyBase64(options.privateKeySeedBase64) === NON_PUBLISHABLE_TEST_BOM_PUBLIC_KEY_BASE64) {
    throw new Error('Compatibility BOM private key is a non-publishable test fixture');
  }
}

export function signCompatibilityBom(options: {
  bom: CompatibilityBomV1;
  keyId: string;
  channel: ReleaseChannel;
  privateKeySeedBase64: string;
}): CompatibilityBomSignatureV1 {
  const bom = CompatibilityBomV1Schema.parse(options.bom);
  if (bom.channel !== options.channel) throw new Error('Signing channel does not match Compatibility BOM channel');
  const payloadSha256 = createHash('sha256').update(compatibilityBomFileBytes(bom)).digest('hex');
  const signatureBase64 = sign(
    null,
    compatibilityBomPayload(bom),
    privateKeyFromSeed(options.privateKeySeedBase64),
  ).toString('base64');
  return CompatibilityBomSignatureV1Schema.parse({
    schemaVersion: 1,
    algorithm: 'Ed25519',
    keyId: options.keyId,
    channel: options.channel,
    payloadSha256,
    signatureBase64,
  });
}
