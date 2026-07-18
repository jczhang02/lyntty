import { afterEach, describe, expect, it } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  TEST_BOM_PRIVATE_KEY_SEED_BASE64,
  createCompatibilityBomFixture,
  createSignedCompatibilityBomFixture,
} from 'lyntty-wire/compatibility/testing';
import { deriveEd25519PublicKeyBase64 } from 'lyntty-wire/compatibility/node';

const roots: string[] = [];
const script = resolve(import.meta.dir, 'release.ts');

afterEach(async () => {
  await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

async function run(args: string[], env: Record<string, string> = {}) {
  const child = Bun.spawn({
    cmd: [process.execPath, script, ...args],
    env: { ...Bun.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

describe('release Compatibility BOM CLI', () => {
  it('assembles immutable file digests only from a contained artifact root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lyntty-release-cli-'));
    roots.push(root);
    const artifacts = join(root, 'artifacts');
    await mkdir(artifacts);
    await writeFile(join(artifacts, 'subject.bin'), 'release subject');
    const fixture = createSignedCompatibilityBomFixture({ sequence: 7 });
    const withLocalPaths = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(withLocalPaths);
      if (!value || typeof value !== 'object') return value;
      const record = value as Record<string, unknown>;
      if (typeof record.name === 'string' && typeof record.url === 'string' && typeof record.sha256 === 'string') {
        const { sha256: _, size: __, ...rest } = record;
        return { ...rest, localPath: 'subject.bin' };
      }
      return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, withLocalPaths(item)]));
    };
    const inventory = join(root, 'inventory.json');
    const bom = join(root, 'bom.json');
    await writeFile(inventory, JSON.stringify(withLocalPaths(fixture.bom)));
    const assembled = await run([
      'assemble', '--inventory', inventory, '--artifact-root', artifacts, '--out', bom,
    ]);
    expect(assembled.exitCode).toBe(0);
    const parsed = JSON.parse(await readFile(bom, 'utf8'));
    expect(parsed.components.app.android.apk).toMatchObject({
      sha256: '226ea43dc59843f2045529e937016121bc7d72cf6ab29d100aaeeb39107dc746',
      size: 15,
    });
  });

  it('assembles predecessor file-byte hashes that pass real verify-history', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lyntty-release-cli-'));
    roots.push(root);
    const artifacts = join(root, 'artifacts');
    await mkdir(artifacts);
    const oldest = createCompatibilityBomFixture({ sequence: 16, wireMinor: 0 });
    const previous = createCompatibilityBomFixture({ sequence: 17, wireMinor: 1 });
    const current = structuredClone(createCompatibilityBomFixture({ sequence: 18, wireMinor: 1 })) as unknown as Record<string, unknown>;
    for (const [name, bom] of [['oldest', oldest], ['previous', previous]] as const) {
      await writeFile(join(artifacts, `${name}-draft.json`), JSON.stringify(bom));
      expect(await run(['canonicalize', '--bom', join(artifacts, `${name}-draft.json`), '--out', join(artifacts, `${name}.json`)]))
        .toMatchObject({ exitCode: 0 });
      await writeFile(join(artifacts, `${name}.sig.json`), '{}\n');
    }
    current.predecessors = [
      {
        sequence: 17,
        bom: { name: 'previous.json', url: 'https://github.com/jczhang02/lyntty/releases/download/compat-v17/previous.json', localPath: 'previous.json' },
        signature: { name: 'previous.sig.json', url: 'https://github.com/jczhang02/lyntty/releases/download/compat-v17/previous.sig.json', localPath: 'previous.sig.json' },
      },
      {
        sequence: 16,
        bom: { name: 'oldest.json', url: 'https://github.com/jczhang02/lyntty/releases/download/compat-v16/oldest.json', localPath: 'oldest.json' },
        signature: { name: 'oldest.sig.json', url: 'https://github.com/jczhang02/lyntty/releases/download/compat-v16/oldest.sig.json', localPath: 'oldest.sig.json' },
      },
    ];
    const inventory = join(root, 'inventory.json');
    const assembled = join(root, 'current.json');
    await writeFile(inventory, JSON.stringify(current));
    expect(await run(['assemble', '--inventory', inventory, '--artifact-root', artifacts, '--out', assembled]))
      .toMatchObject({ exitCode: 0 });
    expect(await run([
      'verify-history', '--current', assembled,
      '--predecessor', join(artifacts, 'previous.json'),
      '--predecessor', join(artifacts, 'oldest.json'),
    ])).toMatchObject({ exitCode: 0, stdout: expect.stringContaining('"rollingUpgradeSafe":true') });
  });

  it('rejects artifact traversal and final-component symlinks before hashing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lyntty-release-cli-'));
    roots.push(root);
    const artifacts = join(root, 'artifacts');
    await mkdir(artifacts);
    await writeFile(join(root, 'outside.bin'), 'outside');
    await symlink(join(root, 'outside.bin'), join(artifacts, 'alias.bin'));
    const inventory = join(root, 'inventory.json');
    const output = join(root, 'bom.json');
    const writeInventory = (localPath: string) => writeFile(inventory, JSON.stringify({
      name: 'subject.bin',
      url: 'https://github.com/jczhang02/lyntty/releases/download/compat-v1/subject.bin',
      localPath,
    }));
    await writeInventory('alias.bin');
    expect(await run(['assemble', '--inventory', inventory, '--artifact-root', artifacts, '--out', output]))
      .toMatchObject({ exitCode: 1, stderr: expect.stringContaining('may not be a symlink') });
    await writeInventory('../outside.bin');
    expect(await run(['assemble', '--inventory', inventory, '--artifact-root', artifacts, '--out', output]))
      .toMatchObject({ exitCode: 1, stderr: expect.stringContaining('escapes artifact root') });
  });

  it('canonicalizes once, signs from an environment-only key, and verifies', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lyntty-release-cli-'));
    roots.push(root);
    const fixture = createSignedCompatibilityBomFixture({ sequence: 8 });
    const signingSeed = randomBytes(32).toString('base64');
    fixture.trustStore.roots[0].keyId = 'stable-ephemeral-key';
    fixture.trustStore.roots[0].publicKeyBase64 = deriveEd25519PublicKeyBase64(signingSeed);
    const draft = join(root, 'draft.json');
    const bom = join(root, 'compatibility-bom.json');
    const signature = join(root, 'compatibility-bom.sig.json');
    const trustStore = join(root, 'trust-roots.json');
    await writeFile(draft, JSON.stringify(fixture.bom, null, 2));
    await writeFile(trustStore, JSON.stringify(fixture.trustStore, null, 2));

    expect(await run(['canonicalize', '--bom', draft, '--out', bom])).toMatchObject({ exitCode: 0 });
    const canonical = await readFile(bom, 'utf8');
    expect(canonical).toEndWith('\n');
    expect(canonical).not.toContain('\n  ');

    expect(await run([
      'sign', '--bom', bom, '--signature', signature,
      '--key-id', 'stable-ephemeral-key', '--channel', 'stable',
    ], {
      LYNTTY_BOM_PRIVATE_KEY_SEED_BASE64: signingSeed,
    })).toMatchObject({ exitCode: 0 });

    const verified = await run([
      'verify', '--bom', bom, '--signature', signature,
      '--trust-store', trustStore, '--channel', 'stable', '--minimum-sequence', '8',
    ]);
    expect(verified.exitCode).toBe(0);
    expect(JSON.parse(verified.stdout)).toMatchObject({
      releaseId: 'stable-8',
      sequence: 8,
      channel: 'stable',
      bomSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });

    const noncanonical = join(root, 'noncanonical.json');
    await writeFile(noncanonical, `${JSON.stringify(fixture.bom, null, 2)}\n`);
    expect(await run([
      'verify', '--bom', noncanonical, '--signature', signature,
      '--trust-store', trustStore, '--channel', 'stable',
    ])).toMatchObject({ exitCode: 1, stderr: expect.stringContaining('is not canonical') });

    const overwrite = await run(['canonicalize', '--bom', draft, '--out', bom]);
    expect(overwrite.exitCode).not.toBe(0);
  });

  it('rejects the deterministic test fixture key from publishable signatures', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lyntty-release-cli-'));
    roots.push(root);
    const fixture = createSignedCompatibilityBomFixture({ sequence: 9 });
    const bom = join(root, 'bom.json');
    await writeFile(bom, `${JSON.stringify(fixture.bom)}\n`);
    const result = await run([
      'sign', '--bom', bom, '--signature', join(root, 'sig.json'),
      '--key-id', 'stable-test-key', '--channel', 'stable',
    ], { LYNTTY_BOM_PRIVATE_KEY_SEED_BASE64: TEST_BOM_PRIVATE_KEY_SEED_BASE64 });
    expect(result).toMatchObject({ exitCode: 1, stderr: expect.stringContaining('non-publishable test fixture') });
  });

  it('never accepts a signing key on argv and fails closed without the secret environment variable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lyntty-release-cli-'));
    roots.push(root);
    const fixture = createSignedCompatibilityBomFixture({ sequence: 9 });
    const bom = join(root, 'bom.json');
    await writeFile(bom, JSON.stringify(fixture.bom));
    const result = await run([
      'sign', '--bom', bom, '--signature', join(root, 'sig.json'),
      '--key-id', 'stable-test-key', '--channel', 'stable',
    ], { LYNTTY_BOM_PRIVATE_KEY_SEED_BASE64: '' });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('LYNTTY_BOM_PRIVATE_KEY_SEED_BASE64 is required');
    const argvSecret = await run([
      'sign', '--bom', bom, '--signature', join(root, 'sig.json'),
      '--key-id', 'stable-test-key', '--channel', 'stable', '--private-key', 'not-accepted',
    ], { LYNTTY_BOM_PRIVATE_KEY_SEED_BASE64: TEST_BOM_PRIVATE_KEY_SEED_BASE64 });
    expect(argvSecret).toMatchObject({ exitCode: 1, stderr: expect.stringContaining('Unknown release argument') });
  });
});
