import { type SpawnOptions, type ChildProcess } from 'node:child_process';
import { spawn as crossSpawn } from 'cross-spawn';
import { join, posix, win32 } from 'node:path';
import { projectPath } from '@/projectPath';
import { logger } from '@/ui/logger';
import { existsSync } from 'node:fs';

type LynttySpawnTarget = {
  command: string;
  prefixArgs: string[];
};

export function resolveLynttySpawnTarget(options: {
  bunMain: string;
  execPath: string;
  projectDir: string;
  configuredExecutable?: string;
}): LynttySpawnTarget {
  if (options.bunMain.startsWith('/$bunfs/')) {
    const configured = options.configuredExecutable?.trim();
    if (configured) {
      return { command: configured, prefixArgs: [] };
    }

    const executablePath = options.execPath.includes('\\') ? win32 : posix;
    const executableName = executablePath.basename(options.execPath).toLowerCase();
    const isWindowsExecutable = executableName.endsWith('.exe');
    const bareName = isWindowsExecutable ? executableName.slice(0, -4) : executableName;
    if (bareName === 'lynttyd') {
      return {
        command: executablePath.join(
          executablePath.dirname(options.execPath),
          isWindowsExecutable ? 'lyntty.exe' : 'lyntty',
        ),
        prefixArgs: [],
      };
    }

    return { command: options.execPath, prefixArgs: [] };
  }

  return {
    command: 'bun',
    prefixArgs: [join(options.projectDir, 'dist', 'index.mjs')],
  };
}

function currentLynttySpawnTarget(): LynttySpawnTarget {
  return resolveLynttySpawnTarget({
    bunMain: Bun.main,
    execPath: process.execPath,
    projectDir: projectPath(),
    configuredExecutable: process.env.LYNTTY_CLI_EXECUTABLE,
  });
}

function quotePosixShellArgument(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function formatLynttyShellCommand(target: LynttySpawnTarget, args: string[]): string {
  return [target.command, ...target.prefixArgs, ...args]
    .map(quotePosixShellArgument)
    .join(' ');
}

export function currentLynttyShellCommand(args: string[]): string {
  return formatLynttyShellCommand(currentLynttySpawnTarget(), args);
}

/** Spawn the Pi-only CLI without imposing a runtime dependency on releases. */
export function spawnLynttyCLI(args: string[], options: SpawnOptions = {}): ChildProcess {
  const target = currentLynttySpawnTarget();
  const directory = 'cwd' in options ? options.cwd : process.cwd();
  logger.debug(`[SPAWN LYNTTY CLI] Spawning: lyntty ${args.join(' ')} in ${directory}`);
  if (target.command !== 'bun' && !existsSync(target.command)) {
    throw new Error(`Compiled Lyntty executable not found at ${target.command}`);
  }
  if (target.command === 'bun' && !existsSync(target.prefixArgs[0]!)) {
    throw new Error(`Entrypoint ${target.prefixArgs[0]} does not exist`);
  }
  return crossSpawn(target.command, [...target.prefixArgs, ...args], {
    windowsHide: true,
    ...options,
  });
}
