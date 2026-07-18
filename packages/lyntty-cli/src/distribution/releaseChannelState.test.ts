import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readAcceptedReleaseChannelState,
  rememberAcceptedReleaseChannelState,
} from './releaseChannelState';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function root() {
  const value = await mkdtemp(join(tmpdir(), 'lyntty-channel-state-'));
  roots.push(value);
  return value;
}

describe('durable signed release channel state', () => {
  it('persists independent Stable and Preview replay floors', async () => {
    const directory = await root();
    await rememberAcceptedReleaseChannelState(directory, {
      channel: 'stable', sequence: 10, bomSha256: 'a'.repeat(64), releaseId: 'stable-10',
    });
    await rememberAcceptedReleaseChannelState(directory, {
      channel: 'preview', sequence: 20, bomSha256: 'b'.repeat(64), releaseId: 'preview-20',
    });
    expect(await readAcceptedReleaseChannelState(directory, 'stable')).toMatchObject({ sequence: 10, bomSha256: 'a'.repeat(64) });
    expect(await readAcceptedReleaseChannelState(directory, 'preview')).toMatchObject({ sequence: 20, bomSha256: 'b'.repeat(64) });
  });

  it('rejects lower sequences and same-sequence equivocation', async () => {
    const directory = await root();
    await rememberAcceptedReleaseChannelState(directory, {
      channel: 'stable', sequence: 11, bomSha256: 'a'.repeat(64), releaseId: 'stable-11',
    });
    await expect(rememberAcceptedReleaseChannelState(directory, {
      channel: 'stable', sequence: 10, bomSha256: 'b'.repeat(64), releaseId: 'stable-10',
    })).rejects.toThrow('older than accepted');
    await expect(rememberAcceptedReleaseChannelState(directory, {
      channel: 'stable', sequence: 11, bomSha256: 'b'.repeat(64), releaseId: 'stable-11-other',
    })).rejects.toThrow('conflicting signed BOM digests');
  });

  it('fails closed for unexpected or corrupted state files', async () => {
    const directory = await root();
    await rememberAcceptedReleaseChannelState(directory, {
      channel: 'stable', sequence: 12, bomSha256: 'c'.repeat(64), releaseId: 'stable-12',
    });
    await writeFile(join(directory, 'stable', 'unexpected.txt'), 'ignored?');
    await expect(readAcceptedReleaseChannelState(directory, 'stable')).rejects.toThrow('Unexpected release channel state file');
  });
});
