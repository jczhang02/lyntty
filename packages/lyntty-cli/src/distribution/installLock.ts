import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { writeJsonAtomically } from './atomicFile';

export interface InstallLock {
  release(): Promise<void>;
}

interface LockOwner {
  schemaVersion: 1;
  id: string;
  pid: number;
  processStartToken: string;
}

const OWNER_FILE = 'owner.json';

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function processStartToken(pid: number): Promise<string | null> {
  if (process.platform === 'linux') {
    try {
      const statLine = await readFile(`/proc/${pid}/stat`, 'utf8');
      const fieldsAfterCommand = statLine.slice(statLine.lastIndexOf(')') + 2).trim().split(/\s+/);
      const startTime = fieldsAfterCommand[19];
      return startTime ? `linux:${startTime}` : null;
    } catch {
      return null;
    }
  }
  if (process.platform === 'darwin') {
    const child = Bun.spawn(['/bin/ps', '-o', 'lstart=', '-p', String(pid)], {
      stdin: 'ignore', stdout: 'pipe', stderr: 'ignore',
    });
    const [stdout, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);
    const value = stdout.trim();
    return exitCode === 0 && value ? `darwin:${value}` : null;
  }
  return null;
}

function parseOwner(value: unknown): LockOwner | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const owner = value as Partial<LockOwner>;
  if (
    owner.schemaVersion !== 1
    || typeof owner.id !== 'string'
    || !owner.id
    || typeof owner.pid !== 'number'
    || !Number.isSafeInteger(owner.pid)
    || owner.pid <= 0
    || typeof owner.processStartToken !== 'string'
    || !owner.processStartToken
  ) return null;
  return owner as LockOwner;
}

async function existingLockIsActive(path: string): Promise<boolean> {
  let owner: LockOwner | null = null;
  try {
    owner = parseOwner(JSON.parse(await readFile(join(path, OWNER_FILE), 'utf8')));
  } catch {
    owner = null;
  }
  if (!owner) {
    const ageMs = Date.now() - (await stat(path)).mtimeMs;
    return ageMs < 30_000;
  }
  if (!processIsAlive(owner.pid)) return false;
  const actualStartToken = await processStartToken(owner.pid);
  return actualStartToken === null || actualStartToken === owner.processStartToken;
}

async function publishLock(path: string, owner: LockOwner): Promise<boolean> {
  const stagingPath = `${path}.${owner.id}.candidate`;
  await rm(stagingPath, { recursive: true, force: true });
  await mkdir(stagingPath, { mode: 0o700 });
  await writeJsonAtomically(join(stagingPath, OWNER_FILE), owner);
  try {
    await rename(stagingPath, path);
    return true;
  } catch (error) {
    await rm(stagingPath, { recursive: true, force: true });
    if (['EEXIST', 'ENOTEMPTY', 'EISDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return false;
    throw error;
  }
}

async function claimAndRemoveStaleLock(path: string, claimantId: string): Promise<boolean> {
  const claimedPath = `${path}.${claimantId}.stale`;
  try {
    await rename(path, claimedPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
  await rm(claimedPath, { recursive: true, force: true });
  return true;
}

export async function acquireInstallLock(path: string): Promise<InstallLock> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const startToken = await processStartToken(process.pid);
  if (!startToken) throw new Error('Unable to establish a process-start identity for the install lock');
  const owner: LockOwner = { schemaVersion: 1, id: randomUUID(), pid: process.pid, processStartToken: startToken };

  if (!await publishLock(path, owner)) {
    if (await existingLockIsActive(path)) throw new Error('Another Lyntty install or update is already running');
    await claimAndRemoveStaleLock(path, owner.id);
    if (!await publishLock(path, owner)) throw new Error('Another Lyntty install or update acquired the lock');
  }

  return {
    async release() {
      try {
        const current = parseOwner(JSON.parse(await readFile(join(path, OWNER_FILE), 'utf8')));
        if (current?.id === owner.id && current.processStartToken === owner.processStartToken) {
          await rm(path, { recursive: true, force: true });
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    },
  };
}
