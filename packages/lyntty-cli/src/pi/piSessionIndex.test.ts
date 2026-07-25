import { afterEach, describe, expect, it } from 'bun:test';
import { appendFile, chmod, mkdir, mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { SessionInfo } from '@earendil-works/pi-coding-agent';

import { createPiSessionIndex, readPiSessionInfo } from './piSessionIndex';

const BOOTSTRAP_TEST_READ_LIMIT_BYTES = (256 + 64) * 1024;
const testRoots: string[] = [];

async function createFixture(): Promise<{ root: string; sessionsDir: string; indexFile: string }> {
  const root = await mkdtemp(join(tmpdir(), 'lyntty-pi-session-index-'));
  testRoots.push(root);
  const sessionsDir = join(root, 'pi-agent', 'sessions');
  await mkdir(sessionsDir, { recursive: true });
  return {
    root,
    sessionsDir,
    indexFile: join(root, 'lyntty', 'pi-session-index.json'),
  };
}

async function writeSession(options: {
  sessionsDir: string;
  project?: string;
  id: string;
  cwd: string;
  userText: string;
  timestamp?: string;
}): Promise<string> {
  const projectDir = join(options.sessionsDir, options.project ?? '--repo--');
  await mkdir(projectDir, { recursive: true });
  const timestamp = options.timestamp ?? '2026-07-24T08:00:00.000Z';
  const path = join(projectDir, `${options.id}.jsonl`);
  const lines = [
    { type: 'session', version: 3, id: options.id, timestamp, cwd: options.cwd },
    {
      type: 'message',
      id: `${options.id}-user`,
      parentId: null,
      timestamp,
      message: { role: 'user', content: [{ type: 'text', text: options.userText }] },
    },
  ];
  await writeFile(path, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`, 'utf8');
  return path;
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

afterEach(async () => {
  await Promise.all(testRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('readPiSessionInfo', () => {
  it('builds the list summary without retaining full message text', async () => {
    const { sessionsDir } = await createFixture();
    const path = await writeSession({
      sessionsDir,
      id: 'pi-1',
      cwd: '/repo',
      userText: `  first   prompt ${'x'.repeat(500)}  `,
    });
    await appendFile(path, `${JSON.stringify({
      type: 'session_info',
      id: 'rename',
      parentId: 'pi-1-user',
      timestamp: '2026-07-24T08:01:00.000Z',
      name: '  Renamed session  ',
    })}\n${JSON.stringify({
      type: 'message',
      id: 'assistant',
      parentId: 'rename',
      timestamp: '2026-07-24T08:02:00.000Z',
      message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
    })}\n`);

    const info = await readPiSessionInfo(path);

    expect(info).toMatchObject({
      path,
      id: 'pi-1',
      cwd: '/repo',
      name: 'Renamed session',
      messageCount: 2,
      allMessagesText: '',
    });
    expect(info?.firstMessage.startsWith('first prompt')).toBe(true);
    expect(info?.firstMessage.length).toBeLessThanOrEqual(241);
    expect(info?.modified.toISOString()).toBe('2026-07-24T08:02:00.000Z');
  });
});

describe('PiSessionIndex', () => {
  it('persists a private snapshot and only reparses changed JSONL files', async () => {
    const fixture = await createFixture();
    const firstPath = await writeSession({ sessionsDir: fixture.sessionsDir, id: 'pi-1', cwd: '/repo/one', userText: 'one' });
    await writeSession({ sessionsDir: fixture.sessionsDir, id: 'pi-2', cwd: '/repo/two', userText: 'two', project: '--repo-two--' });
    const scanned: string[] = [];
    const index = await createPiSessionIndex({
      ...fixture,
      now: () => 1_000,
      refreshIntervalMs: 10_000,
      scanSessionFile: async (path) => {
        scanned.push(path);
        return readPiSessionInfo(path);
      },
    });

    await expect(index.list({ scope: 'machine' })).resolves.toHaveLength(2);
    await index.refresh();
    expect(scanned).toHaveLength(2);
    expect((await stat(fixture.indexFile)).mode & 0o777).toBe(0o600);

    scanned.length = 0;
    await index.refresh();
    expect(scanned).toEqual([]);

    await appendFile(firstPath, `${JSON.stringify({
      type: 'message',
      id: 'pi-1-assistant',
      parentId: 'pi-1-user',
      timestamp: '2026-07-24T08:03:00.000Z',
      message: { role: 'assistant', content: 'updated' },
    })}\n`);
    await index.refresh();

    expect(scanned).toEqual([firstPath]);
    await expect(index.list({ scope: 'cwd', cwd: '/repo/one' })).resolves.toMatchObject([
      { id: 'pi-1', messageCount: 2 },
    ]);
  });

  it('returns a stale persisted snapshot while one background refresh updates it', async () => {
    const fixture = await createFixture();
    const sessionPath = await writeSession({ sessionsDir: fixture.sessionsDir, id: 'pi-stale', cwd: '/repo', userText: 'before' });
    const initial = await createPiSessionIndex({
      ...fixture,
      now: () => 1_000,
      refreshIntervalMs: 10,
    });
    await initial.list({ scope: 'machine' });
    await initial.refresh();
    await appendFile(sessionPath, `${JSON.stringify({
      type: 'message',
      id: 'after',
      parentId: 'pi-stale-user',
      timestamp: '2026-07-24T08:04:00.000Z',
      message: { role: 'assistant', content: 'after' },
    })}\n`);

    const scanStarted = deferred<void>();
    const scanResult = deferred<SessionInfo | null>();
    let scanCalls = 0;
    const restored = await createPiSessionIndex({
      ...fixture,
      now: () => 2_000,
      refreshIntervalMs: 10,
      scanSessionFile: async () => {
        scanCalls += 1;
        scanStarted.resolve();
        return scanResult.promise;
      },
    });

    await expect(restored.list({ scope: 'machine' })).resolves.toMatchObject([
      { id: 'pi-stale', messageCount: 1 },
    ]);
    await scanStarted.promise;
    expect(scanCalls).toBe(1);

    scanResult.resolve(await readPiSessionInfo(sessionPath));
    await restored.refresh();
    await expect(restored.list({ scope: 'machine' })).resolves.toMatchObject([
      { id: 'pi-stale', messageCount: 2 },
    ]);
  });

  it('publishes a newest-tail bootstrap while the full first scan continues', async () => {
    const fixture = await createFixture();
    const oldPath = await writeSession({ sessionsDir: fixture.sessionsDir, id: 'pi-old', cwd: '/repo', userText: 'old' });
    const newPath = await writeSession({ sessionsDir: fixture.sessionsDir, id: 'pi-new', cwd: '/repo', userText: 'new' });
    await utimes(oldPath, new Date(1_000), new Date(1_000));
    await utimes(newPath, new Date(2_000), new Date(2_000));
    const oldScanStarted = deferred<void>();
    const oldScanResult = deferred<SessionInfo | null>();
    const index = await createPiSessionIndex({
      ...fixture,
      bootstrapSessionCount: 1,
      scanSessionFile: async (path) => {
        if (path === oldPath) {
          oldScanStarted.resolve();
          return oldScanResult.promise;
        }
        return readPiSessionInfo(path);
      },
    });

    const refresh = index.refresh();
    const bootstrap = await index.snapshot({ scope: 'machine' });
    await oldScanStarted.promise;

    expect(bootstrap.sessions).toMatchObject([{ id: 'pi-new' }]);
    expect(bootstrap.incompleteSessionIds).toEqual(new Set(['pi-new']));
    expect(bootstrap.refreshing).toBe(true);
    await expect(index.find('pi-new', { scope: 'machine' })).resolves.toMatchObject({ id: 'pi-new' });
    const oldLookup = index.find('pi-old', { scope: 'machine' });
    oldScanResult.resolve(await readPiSessionInfo(oldPath));
    await expect(oldLookup).resolves.toMatchObject({ id: 'pi-old' });
    await refresh;
    const completed = await index.snapshot({ scope: 'machine' });
    expect(completed).toMatchObject({
      sessions: [{ id: 'pi-new' }, { id: 'pi-old' }],
      refreshing: false,
    });
    expect(completed.incompleteSessionIds.size).toBe(0);
  });

  it('publishes an empty bounded tail while older valid files continue scanning', async () => {
    const fixture = await createFixture();
    const oldPath = await writeSession({ sessionsDir: fixture.sessionsDir, id: 'pi-valid-old', cwd: '/repo', userText: 'old' });
    const corruptDir = join(fixture.sessionsDir, '--corrupt--');
    await mkdir(corruptDir, { recursive: true });
    const corruptPath = join(corruptDir, 'corrupt.jsonl');
    await writeFile(corruptPath, '{not-json}\n');
    await utimes(oldPath, new Date(1_000), new Date(1_000));
    await utimes(corruptPath, new Date(2_000), new Date(2_000));
    const oldScan = deferred<SessionInfo | null>();
    const index = await createPiSessionIndex({
      ...fixture,
      bootstrapSessionCount: 1,
      scanSessionFile: async (path) => path === oldPath ? oldScan.promise : null,
    });

    const refresh = index.refresh();
    await expect(index.snapshot({ scope: 'machine' })).resolves.toMatchObject({
      sessions: [],
      refreshing: true,
    });
    oldScan.resolve(await readPiSessionInfo(oldPath));
    await refresh;
    await expect(index.list({ scope: 'machine' })).resolves.toMatchObject([{ id: 'pi-valid-old' }]);
  });

  it('bounds first-tail work even when the newest JSONL has a very large line', async () => {
    const fixture = await createFixture();
    const sessionPath = await writeSession({
      sessionsDir: fixture.sessionsDir,
      id: 'pi-large',
      cwd: '/repo',
      userText: 'x'.repeat(2 * 1024 * 1024),
    });
    await appendFile(sessionPath, `${JSON.stringify({
      type: 'message',
      id: 'large-assistant',
      parentId: 'pi-large-user',
      timestamp: '2026-07-24T08:03:00.000Z',
      message: { role: 'assistant', content: 'done' },
    })}\n`);
    const fullScan = deferred<SessionInfo | null>();
    let bytesRead = 0;
    const index = await createPiSessionIndex({
      ...fixture,
      scanSessionFile: async () => fullScan.promise,
      onBytesRead: (_path, bytes) => { bytesRead += bytes; },
    });

    const refresh = index.refresh();
    await expect(index.snapshot({ scope: 'machine' })).resolves.toMatchObject({
      sessions: [{ id: 'pi-large', messageCount: 1 }],
      refreshing: true,
    });
    expect(bytesRead).toBeLessThanOrEqual(BOOTSTRAP_TEST_READ_LIMIT_BYTES);
    expect(bytesRead).toBeLessThan((await stat(sessionPath)).size);

    fullScan.resolve(await readPiSessionInfo(sessionPath));
    await refresh;
    const completed = await index.list({ scope: 'machine' });
    expect(completed).toMatchObject([{ messageCount: 2 }]);
    expect(completed[0]?.modified.getTime()).toBe(Math.trunc((await stat(sessionPath)).mtimeMs));
  });

  it('reads only the appended range after a persisted large session grows', async () => {
    const fixture = await createFixture();
    const sessionPath = await writeSession({
      sessionsDir: fixture.sessionsDir,
      id: 'pi-append',
      cwd: '/repo',
      userText: 'x'.repeat(512 * 1024),
    });
    let bytesRead = 0;
    const index = await createPiSessionIndex({
      ...fixture,
      onBytesRead: (_path, bytes) => { bytesRead += bytes; },
    });
    await index.list({ scope: 'machine' });
    await index.refresh();
    bytesRead = 0;

    await appendFile(sessionPath, `${JSON.stringify({
      type: 'message',
      id: 'pi-append-assistant',
      parentId: 'pi-append-user',
      timestamp: '2026-07-24T08:03:00.000Z',
      message: { role: 'assistant', content: 'updated' },
    })}\n`);
    await index.refresh();

    expect(bytesRead).toBeLessThan(128 * 1024);
    await expect(index.list({ scope: 'machine' })).resolves.toMatchObject([
      { id: 'pi-append', messageCount: 2 },
    ]);
  });

  it('revalidates an exact stale summary before a gap decision uses its count', async () => {
    const fixture = await createFixture();
    const sessionPath = await writeSession({
      sessionsDir: fixture.sessionsDir,
      id: 'pi-gap-candidate',
      cwd: '/repo',
      userText: 'one',
    });
    const index = await createPiSessionIndex({
      ...fixture,
      refreshIntervalMs: 60_000,
    });
    await index.refresh();
    await appendFile(sessionPath, `${JSON.stringify({
      type: 'message',
      id: 'pi-gap-candidate-assistant',
      parentId: 'pi-gap-candidate-user',
      timestamp: '2026-07-24T08:04:00.000Z',
      message: { role: 'assistant', content: 'two' },
    })}\n`);

    await expect(index.snapshot({ scope: 'machine' })).resolves.toMatchObject({
      sessions: [{ id: 'pi-gap-candidate', messageCount: 1 }],
    });
    await expect(index.find('pi-gap-candidate', { scope: 'machine' })).resolves.toMatchObject({
      id: 'pi-gap-candidate',
      messageCount: 2,
    });
  });

  it('publishes a valid in-memory snapshot when persistence fails', async () => {
    const fixture = await createFixture();
    await writeSession({ sessionsDir: fixture.sessionsDir, id: 'pi-memory', cwd: '/repo', userText: 'hello' });
    const blocker = join(fixture.root, 'not-a-directory');
    await writeFile(blocker, 'block');
    const errors: unknown[] = [];
    const index = await createPiSessionIndex({
      ...fixture,
      indexFile: join(blocker, 'pi-session-index.json'),
      onError: (error) => errors.push(error),
    });

    await expect(index.list({ scope: 'machine' })).resolves.toMatchObject([{ id: 'pi-memory' }]);
    await index.refresh();
    expect(errors.length).toBeGreaterThan(0);
  });

  it('coalesces concurrent first-build requests into one scan', async () => {
    const fixture = await createFixture();
    const sessionPath = await writeSession({ sessionsDir: fixture.sessionsDir, id: 'pi-new', cwd: '/repo', userText: 'hello' });
    const scanStarted = deferred<void>();
    const scanResult = deferred<SessionInfo | null>();
    let scanCalls = 0;
    const index = await createPiSessionIndex({
      ...fixture,
      scanSessionFile: async () => {
        scanCalls += 1;
        scanStarted.resolve();
        return scanResult.promise;
      },
    });

    const first = index.list({ scope: 'machine' });
    const second = index.list({ scope: 'machine' });
    await scanStarted.promise;
    expect(scanCalls).toBe(1);

    scanResult.resolve(await readPiSessionInfo(sessionPath));
    await expect(Promise.all([first, second])).resolves.toMatchObject([
      [{ id: 'pi-new' }],
      [{ id: 'pi-new' }],
    ]);
  });

  it('removes a session after its canonical JSONL is deleted', async () => {
    const fixture = await createFixture();
    const sessionPath = await writeSession({ sessionsDir: fixture.sessionsDir, id: 'pi-deleted', cwd: '/repo', userText: 'hello' });
    const index = await createPiSessionIndex({ ...fixture });
    await expect(index.list({ scope: 'machine' })).resolves.toMatchObject([{ id: 'pi-deleted' }]);
    await index.refresh();

    await rm(sessionPath);
    await index.refresh();

    await expect(index.list({ scope: 'machine' })).resolves.toEqual([]);
    const restored = await createPiSessionIndex({ ...fixture });
    await expect(restored.list({ scope: 'machine' })).resolves.toEqual([]);
  });

  it('does not return a deleted file from a stale persisted lookup', async () => {
    const fixture = await createFixture();
    const sessionPath = await writeSession({ sessionsDir: fixture.sessionsDir, id: 'pi-stale-deleted', cwd: '/repo', userText: 'hello' });
    const initial = await createPiSessionIndex({ ...fixture, now: () => 1_000, refreshIntervalMs: 10 });
    await initial.list({ scope: 'machine' });
    await initial.refresh();
    await rm(sessionPath);

    const restored = await createPiSessionIndex({ ...fixture, now: () => 2_000, refreshIntervalMs: 10 });
    await expect(restored.find('pi-stale-deleted', { scope: 'machine' })).resolves.toBeUndefined();
  });

  it('rejects discovery when no valid snapshot can be built', async () => {
    const fixture = await createFixture();
    const notDirectory = join(fixture.root, 'sessions-file');
    await writeFile(notDirectory, 'not a directory');
    const errors: unknown[] = [];
    const index = await createPiSessionIndex({
      ...fixture,
      sessionsDir: notDirectory,
      onError: (error) => errors.push(error),
    });

    await expect(index.list({ scope: 'machine' })).rejects.toThrow('index is unavailable');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('keeps the last valid snapshot when a refresh cannot read the sessions root', async () => {
    const fixture = await createFixture();
    await writeSession({ sessionsDir: fixture.sessionsDir, id: 'pi-safe', cwd: '/repo', userText: 'hello' });
    const index = await createPiSessionIndex({ ...fixture });
    await index.list({ scope: 'machine' });
    await chmod(fixture.sessionsDir, 0o000);

    try {
      await index.refresh();
      await expect(index.list({ scope: 'machine' })).resolves.toMatchObject([{ id: 'pi-safe' }]);
    } finally {
      await chmod(fixture.sessionsDir, 0o700);
    }
  });
});
