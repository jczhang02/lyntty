import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const originalLynttyHomeDir = process.env.LYNTTY_HOME_DIR;
const testRoot = mkdtempSync(join(tmpdir(), 'lyntty-permissions-'));
const testHome = join(testRoot, 'state');

let configuration: typeof import('./configuration').configuration;
let persistence: typeof import('./persistence');

function fileMode(path: string): number {
  return statSync(path).mode & 0o777;
}

beforeAll(async () => {
  process.env.LYNTTY_HOME_DIR = testHome;
  vi.resetModules();
  ({ configuration } = await import('./configuration'));
  persistence = await import('./persistence');
});

afterAll(() => {
  if (originalLynttyHomeDir === undefined) {
    delete process.env.LYNTTY_HOME_DIR;
  } else {
    process.env.LYNTTY_HOME_DIR = originalLynttyHomeDir;
  }
  rmSync(testRoot, { recursive: true, force: true });
});

describe.runIf(process.platform !== 'win32')('secret persistence permissions', () => {
  it('restricts the Lyntty state directory to the current user', () => {
    expect(fileMode(configuration.lynttyHomeDir)).toBe(0o700);
  });

  it('writes credentials with owner-only permissions', async () => {
    await persistence.writeCredentialsDataKey({
      publicKey: new Uint8Array([1, 2, 3]),
      machineKey: new Uint8Array([4, 5, 6]),
      token: 'secret-token',
    });

    expect(fileMode(configuration.privateKeyFile)).toBe(0o600);
  });

  it('writes the session encryption ledger with owner-only permissions', () => {
    persistence.persistSession('relay-session-1', {
      encryptionKey: 'secret-key',
      encryptionVariant: 'dataKey',
      seq: 1,
      metadataVersion: 1,
      agentStateVersion: 1,
      metadata: {
        path: '/tmp/project',
        host: 'test-host',
        homeDir: '/tmp/home',
        lynttyHomeDir: testHome,
        lynttyLibDir: '/tmp/lib',
        lynttyToolsDir: '/tmp/tools',
      },
      savedAt: Date.now(),
    });

    expect(fileMode(configuration.sessionsFile)).toBe(0o600);
  });
});
