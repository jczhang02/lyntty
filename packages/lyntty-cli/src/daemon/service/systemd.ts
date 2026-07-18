import { readFile, rm } from 'node:fs/promises';

import { writeServiceFileAtomically } from './serviceFile';
import type { DaemonServiceConfig, DaemonServiceManager, DaemonServiceState, ServiceCommandRunner } from './types';

const UNIT_NAME = 'lynttyd.service';

function assertSafeUnitValue(value: string, label: string): void {
  if (!value || value.includes('\0') || value.includes('\n') || value.includes('\r')) {
    throw new Error(`${label} contains unsupported characters`);
  }
}

function quoteSystemd(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%')}"`;
}

function escapeSystemdPath(value: string): string {
  return value
    .replaceAll('\\', '\\x5c')
    .replaceAll(' ', '\\x20')
    .replaceAll('\t', '\\x09')
    .replaceAll('"', '\\x22')
    .replaceAll("'", '\\x27')
    .replaceAll('%', '%%');
}

export function renderSystemdUserUnit(config: DaemonServiceConfig): string {
  for (const [label, value] of Object.entries({
    daemonExecutable: config.daemonExecutable,
    cliExecutable: config.cliExecutable,
    homeDir: config.homeDir,
    lynttyHomeDir: config.lynttyHomeDir,
    runtimePath: config.runtimePath,
  })) assertSafeUnitValue(value, label);

  return [
    '[Unit]',
    'Description=Lyntty local Pi control daemon',
    'After=network.target',
    '',
    '[Service]',
    'Type=simple',
    `ExecStart=${quoteSystemd(config.daemonExecutable)}`,
    `WorkingDirectory=${escapeSystemdPath(config.homeDir)}`,
    `Environment=${quoteSystemd(`HOME=${config.homeDir}`)}`,
    `Environment=${quoteSystemd(`LYNTTY_HOME_DIR=${config.lynttyHomeDir}`)}`,
    `Environment=${quoteSystemd(`LYNTTY_CLI_EXECUTABLE=${config.cliExecutable}`)}`,
    `Environment=${quoteSystemd(`PATH=${config.runtimePath}`)}`,
    'Environment="LYNTTY_DAEMON_PROCESS=1"',
    'Restart=on-failure',
    'RestartSec=2',
    'TimeoutStopSec=20',
    'UMask=0077',
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n');
}

async function readExisting(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export class SystemdUserServiceManager implements DaemonServiceManager {
  readonly kind = 'systemd-user' as const;

  constructor(
    private readonly config: DaemonServiceConfig,
    private readonly run: ServiceCommandRunner,
    private readonly systemctl: string,
  ) {}

  private async command(args: readonly string[], allowFailure = false): Promise<void> {
    const result = await this.run(this.systemctl, ['--user', ...args]);
    if (!allowFailure && result.exitCode !== 0) {
      throw new Error(`systemctl --user ${args.join(' ')} failed: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`}`);
    }
  }

  async install(): Promise<void> {
    const previous = await readExisting(this.config.servicePath);
    await writeServiceFileAtomically(this.config.servicePath, renderSystemdUserUnit(this.config));
    try {
      await this.command(['daemon-reload']);
      await this.command(['enable', '--now', UNIT_NAME]);
    } catch (error) {
      if (previous === null) await rm(this.config.servicePath, { force: true });
      else await writeServiceFileAtomically(this.config.servicePath, previous);
      await this.command(['daemon-reload'], true);
      throw error;
    }
  }

  async start(): Promise<void> {
    if (await readExisting(this.config.servicePath) === null) throw new Error('lynttyd user service is not installed');
    await this.command(['start', UNIT_NAME]);
  }

  async stop(): Promise<void> {
    await this.command(['stop', UNIT_NAME], true);
  }

  async restart(): Promise<void> {
    if (await readExisting(this.config.servicePath) === null) throw new Error('lynttyd user service is not installed');
    await this.command(['restart', UNIT_NAME]);
  }

  async status(): Promise<DaemonServiceState> {
    if (await readExisting(this.config.servicePath) === null) return 'not-installed';
    const result = await this.run(this.systemctl, ['--user', 'is-active', '--quiet', UNIT_NAME]);
    return result.exitCode === 0 ? 'running' : 'stopped';
  }

  async uninstall(): Promise<void> {
    await this.command(['disable', '--now', UNIT_NAME], true);
    await rm(this.config.servicePath, { force: true });
    await this.command(['daemon-reload']);
  }
}
