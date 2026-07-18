#!/usr/bin/env bun
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { link, lstat, mkdir, readFile, realpath, unlink, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import {
  CompatibilityBomV1Schema,
  ReleaseChannelSchema,
  ReleaseTrustStoreSchema,
  canonicalCompatibilityBom,
  compatibilityBomFileBytes,
  validateCompatibilityHistory,
  verifyCompatibilityBom,
} from 'lyntty-wire/compatibility';
import {
  assertPublishableCompatibilityBomSigningIdentity,
  nodeCompatibilityCrypto,
  signCompatibilityBom,
} from 'lyntty-wire/compatibility/node';

function usage(): never {
  throw new Error(`Usage:
  bun scripts/release.ts assemble --inventory <inventory.json> --artifact-root <dir> --out <bom.json>
  bun scripts/release.ts canonicalize --bom <draft.json> --out <bom.json>
  bun scripts/release.ts sign --bom <bom.json> --signature <signature.json> --key-id <id> --channel <stable|preview>
  bun scripts/release.ts verify --bom <bom.json> --signature <signature.json> --trust-store <roots.json> --channel <stable|preview> [--minimum-sequence <n>]
  bun scripts/release.ts verify-history --current <bom.json> [--predecessor <bom.json> ...]`);
}

function parseOptions(args: string[]): Map<string, string[]> {
  const options = new Map<string, string[]>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith('--') || !value || value.startsWith('--')) usage();
    const values = options.get(flag) ?? [];
    values.push(value);
    options.set(flag, values);
  }
  return options;
}

function assertOnly(options: Map<string, string[]>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  for (const flag of options.keys()) {
    if (!allowedSet.has(flag)) throw new Error(`Unknown release argument: ${flag}`);
  }
}

function one(options: Map<string, string[]>, flag: string): string {
  const values = options.get(flag);
  if (!values || values.length !== 1) throw new Error(`${flag} is required exactly once`);
  return values[0]!;
}

function optionalOne(options: Map<string, string[]>, flag: string): string | undefined {
  const values = options.get(flag);
  if (!values) return undefined;
  if (values.length !== 1) throw new Error(`${flag} may be supplied at most once`);
  return values[0];
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

async function readCanonicalBom(path: string) {
  const bytes = await readFile(resolve(path));
  const bom = CompatibilityBomV1Schema.parse(JSON.parse(bytes.toString('utf8')));
  const canonical = compatibilityBomFileBytes(bom);
  if (!Buffer.from(canonical).equals(bytes)) throw new Error(`Compatibility BOM is not canonical: ${path}`);
  return bom;
}

async function writeNewFile(path: string, content: string): Promise<void> {
  const destination = resolve(path);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}`;
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await link(temporary, destination);
    await unlink(temporary);
  } catch (error) {
    await Bun.file(temporary).delete().catch(() => undefined);
    throw error;
  }
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function materializeArtifacts(value: unknown, artifactRoot: string): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map(item => materializeArtifacts(item, artifactRoot)));
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if (typeof record.localPath === 'string') {
    if (typeof record.name !== 'string' || typeof record.url !== 'string') {
      throw new Error('Inventory artifact requires name, url, and localPath');
    }
    const requested = resolve(artifactRoot, record.localPath);
    const requestedMetadata = await lstat(requested);
    if (requestedMetadata.isSymbolicLink()) throw new Error(`Inventory artifact may not be a symlink: ${record.localPath}`);
    const candidate = await realpath(requested);
    const inside = relative(artifactRoot, candidate);
    if (!inside || inside.startsWith('..') || resolve(artifactRoot, inside) !== candidate) {
      throw new Error(`Inventory artifact escapes artifact root: ${record.localPath}`);
    }
    const metadata = await lstat(candidate);
    if (!metadata.isFile()) throw new Error(`Inventory artifact is not a regular file: ${record.localPath}`);
    const { localPath: _, ...rest } = record;
    return { ...rest, sha256: await hashFile(candidate), size: metadata.size };
  }
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) output[key] = await materializeArtifacts(item, artifactRoot);
  return output;
}

async function assemble(options: Map<string, string[]>): Promise<void> {
  assertOnly(options, ['--inventory', '--artifact-root', '--out']);
  const artifactRoot = await realpath(resolve(one(options, '--artifact-root')));
  const inventory = await readJson(one(options, '--inventory'));
  const bom = CompatibilityBomV1Schema.parse(await materializeArtifacts(inventory, artifactRoot));
  await writeNewFile(one(options, '--out'), `${canonicalCompatibilityBom(bom)}\n`);
}

async function canonicalize(options: Map<string, string[]>): Promise<void> {
  assertOnly(options, ['--bom', '--out']);
  const bom = CompatibilityBomV1Schema.parse(await readJson(one(options, '--bom')));
  await writeNewFile(one(options, '--out'), `${canonicalCompatibilityBom(bom)}\n`);
}

async function signBom(options: Map<string, string[]>): Promise<void> {
  assertOnly(options, ['--bom', '--signature', '--key-id', '--channel']);
  const privateKeySeedBase64 = process.env.LYNTTY_BOM_PRIVATE_KEY_SEED_BASE64;
  if (!privateKeySeedBase64) throw new Error('LYNTTY_BOM_PRIVATE_KEY_SEED_BASE64 is required');
  const keyId = one(options, '--key-id');
  assertPublishableCompatibilityBomSigningIdentity({ keyId, privateKeySeedBase64 });
  const bom = await readCanonicalBom(one(options, '--bom'));
  const channel = ReleaseChannelSchema.parse(one(options, '--channel'));
  const signature = signCompatibilityBom({
    bom,
    keyId,
    channel,
    privateKeySeedBase64,
  });
  await writeNewFile(one(options, '--signature'), `${JSON.stringify(signature, null, 2)}\n`);
}

async function verifyBom(options: Map<string, string[]>): Promise<void> {
  assertOnly(options, ['--bom', '--signature', '--trust-store', '--channel', '--minimum-sequence']);
  const minimumSequenceValue = optionalOne(options, '--minimum-sequence');
  const minimumSequence = minimumSequenceValue === undefined ? undefined : Number(minimumSequenceValue);
  if (minimumSequence !== undefined && (!Number.isInteger(minimumSequence) || minimumSequence < 0)) {
    throw new Error('--minimum-sequence must be a non-negative integer');
  }
  const result = await verifyCompatibilityBom({
    bom: await readCanonicalBom(one(options, '--bom')),
    signature: await readJson(one(options, '--signature')),
    trustStore: ReleaseTrustStoreSchema.parse(await readJson(one(options, '--trust-store'))),
    crypto: nodeCompatibilityCrypto,
    expectedChannel: ReleaseChannelSchema.parse(one(options, '--channel')),
    minimumSequence,
  });
  process.stdout.write(`${JSON.stringify({
    releaseId: result.bom.releaseId,
    sequence: result.bom.sequence,
    channel: result.bom.channel,
    bomSha256: result.bomSha256,
  })}\n`);
}

async function verifyHistory(options: Map<string, string[]>): Promise<void> {
  assertOnly(options, ['--current', '--predecessor']);
  const current = await readCanonicalBom(one(options, '--current'));
  const predecessors = await Promise.all((options.get('--predecessor') ?? []).map(readCanonicalBom));
  await validateCompatibilityHistory({
    current,
    predecessors,
    crypto: nodeCompatibilityCrypto,
  });
  process.stdout.write(`${JSON.stringify({
    releaseId: current.releaseId,
    retainedBomCount: predecessors.length + 1,
    rollingUpgradeSafe: true,
  })}\n`);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const options = parseOptions(process.argv.slice(3));
  if (command === 'assemble') return assemble(options);
  if (command === 'canonicalize') return canonicalize(options);
  if (command === 'sign') return signBom(options);
  if (command === 'verify') return verifyBom(options);
  if (command === 'verify-history') return verifyHistory(options);
  usage();
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
