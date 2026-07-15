import { type SpawnOptions, type ChildProcess } from 'node:child_process';
import { spawn as crossSpawn } from 'cross-spawn';
import { join } from 'node:path';
import { projectPath } from '@/projectPath';
import { logger } from '@/ui/logger';
import { existsSync } from 'node:fs';

/** Spawn the built Pi-only CLI through Bun. */
export function spawnLynttyCLI(args: string[], options: SpawnOptions = {}): ChildProcess {
  const entrypoint = join(projectPath(), 'dist', 'index.mjs');
  const directory = 'cwd' in options ? options.cwd : process.cwd();
  logger.debug(`[SPAWN LYNTTY CLI] Spawning: lyntty ${args.join(' ')} in ${directory}`);
  if (!existsSync(entrypoint)) {
    throw new Error(`Entrypoint ${entrypoint} does not exist`);
  }
  return crossSpawn('bun', [entrypoint, ...args], {
    windowsHide: true,
    ...options,
  });
}
