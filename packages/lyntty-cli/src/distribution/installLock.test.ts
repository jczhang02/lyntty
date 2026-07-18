import { afterEach, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { acquireInstallLock } from './installLock';

const roots: string[] = [];

async function lockPath(): Promise<string> {
  const root = resolve(import.meta.dir, '../../dist/test-state', `lock-${randomUUID()}`);
  roots.push(root);
  await mkdir(root, { recursive: true });
  return join(root, '.install.lock');
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('install lock', () => {
  it('publishes ownership atomically and admits only one concurrent transaction', async () => {
    const path = await lockPath();
    const results = await Promise.allSettled([acquireInstallLock(path), acquireInstallLock(path)]);
    const acquired = results.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof acquireInstallLock>>> => result.status === 'fulfilled');
    const rejected = results.filter(result => result.status === 'rejected');
    expect(acquired).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    await acquired[0]!.value.release();

    const next = await acquireInstallLock(path);
    await next.release();
  });

  it('recovers a crashed lock when the PID start token does not match', async () => {
    const path = await lockPath();
    await mkdir(path, { mode: 0o700 });
    await writeFile(join(path, 'owner.json'), JSON.stringify({
      schemaVersion: 1,
      id: 'crashed-owner',
      pid: process.pid,
      processStartToken: 'definitely-not-this-process',
    }));

    const lock = await acquireInstallLock(path);
    await lock.release();
  });

  it('does not delete a freshly published malformed lock', async () => {
    const path = await lockPath();
    await mkdir(path, { mode: 0o700 });
    await writeFile(join(path, 'owner.json'), '{}');
    await expect(acquireInstallLock(path)).rejects.toThrow('already running');
  });
});
