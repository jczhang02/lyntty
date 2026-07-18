import { randomUUID } from 'node:crypto';
import { chmod, mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export async function writeFileAtomically(
  path: string,
  content: string | Uint8Array,
  options: { mode?: number } = {},
): Promise<void> {
  const mode = options.mode ?? 0o600;
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = join(directory, `.${randomUUID()}.tmp`);
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(temporaryPath, 'wx', mode);
    await handle.writeFile(content);
    await handle.sync();
    await handle.close();
    handle = null;
    await chmod(temporaryPath, mode);
    await rename(temporaryPath, path);
    const directoryHandle = await open(directory, 'r').catch(() => null);
    if (directoryHandle) {
      await directoryHandle.sync().catch(() => undefined);
      await directoryHandle.close();
    }
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function writeJsonAtomically(path: string, value: unknown, mode = 0o600): Promise<void> {
  await writeFileAtomically(path, `${JSON.stringify(value, null, 2)}\n`, { mode });
}
