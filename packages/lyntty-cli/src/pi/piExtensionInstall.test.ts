import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  installLynttyPiExtension,
  lynttyPiExtensionPath,
  lynttyPiExtensionSha256,
  LYNTTY_PI_EXTENSION_SOURCE,
} from './piExtensionInstall';

const roots: string[] = [];
const previousExplicitPath = process.env.LYNTTY_PI_EXTENSION_PATH;
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), 'extension-install-'));
  roots.push(value);
  return value;
}

afterEach(async () => {
  if (previousExplicitPath === undefined) delete process.env.LYNTTY_PI_EXTENSION_PATH;
  else process.env.LYNTTY_PI_EXTENSION_PATH = previousExplicitPath;
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe('Pi extension installation', () => {
  it('resolves explicit path before Pi agent directory and default home', async () => {
    const base = await root();
    process.env.LYNTTY_PI_EXTENSION_PATH = join(base, 'explicit', 'index.ts');
    process.env.PI_CODING_AGENT_DIR = join(base, 'agent');
    expect(lynttyPiExtensionPath()).toBe(process.env.LYNTTY_PI_EXTENSION_PATH);

    delete process.env.LYNTTY_PI_EXTENSION_PATH;
    expect(lynttyPiExtensionPath()).toBe(join(base, 'agent', 'extensions', 'lyntty', 'index.ts'));
    expect(lynttyPiExtensionPath(join(base, 'home'))).toBe(join(base, 'home', '.pi', 'agent', 'extensions', 'lyntty', 'index.ts'));
  });

  it('writes the managed source atomically with private permissions', async () => {
    const base = await root();
    const path = join(base, 'agent', 'extensions', 'lyntty', 'index.ts');
    const result = await installLynttyPiExtension({ extensionPath: path });

    expect(result).toEqual({ path, changed: true, previousSha256: null });
    expect(await readFile(path, 'utf8')).toBe(LYNTTY_PI_EXTENSION_SOURCE);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await readdir(join(base, 'agent', 'extensions', 'lyntty'))).filter(name => name.endsWith('.tmp'))).toEqual([]);
    expect(lynttyPiExtensionSha256()).toHaveLength(64);
  });

  it('refuses to overwrite an unrecognized extension unless explicitly authorized', async () => {
    const base = await root();
    const path = join(base, 'extension', 'index.ts');
    await mkdir(join(base, 'extension'), { recursive: true });
    await writeFile(path, '// user extension\n');

    await expect(installLynttyPiExtension({ extensionPath: path })).rejects.toThrow('Refusing to overwrite');
    expect(await readFile(path, 'utf8')).toBe('// user extension\n');

    const replaced = await installLynttyPiExtension({ extensionPath: path, replaceUnknown: true });
    expect(replaced.changed).toBe(true);
    expect(replaced.previousSha256).toHaveLength(64);
    expect(await readFile(path, 'utf8')).toBe(LYNTTY_PI_EXTENSION_SOURCE);
  });

  it('upgrades the last known managed source without a destructive override', async () => {
    const base = await root();
    const path = join(base, 'extension', 'index.ts');
    await mkdir(join(base, 'extension'), { recursive: true });
    const previousSource = LYNTTY_PI_EXTENSION_SOURCE.replace('// lyntty-managed-pi-extension:v1\n', '');
    await writeFile(path, previousSource);

    const result = await installLynttyPiExtension({ extensionPath: path });
    expect(result.previousSha256).toBe('83c4971409b1397b574a4a407370928f7731a2765c63923fd4a1189d890a4f19');
    expect(await readFile(path, 'utf8')).toBe(LYNTTY_PI_EXTENSION_SOURCE);
  });
});
