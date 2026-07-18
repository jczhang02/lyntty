import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { writeServiceFileAtomically } from './serviceFile';
import type { DaemonServiceConfig, DaemonServiceManager, DaemonServiceState, ServiceCommandRunner } from './types';

export const LAUNCH_AGENT_LABEL = 'dev.jczhang.lynttyd';

function assertSafePlistValue(value: string, label: string): void {
  if (!value || value.includes('\0')) throw new Error(`${label} contains unsupported characters`);
}

function xml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function renderLaunchAgentPlist(config: DaemonServiceConfig): string {
  for (const [label, value] of Object.entries({
    daemonExecutable: config.daemonExecutable,
    cliExecutable: config.cliExecutable,
    homeDir: config.homeDir,
    lynttyHomeDir: config.lynttyHomeDir,
    runtimePath: config.runtimePath,
  })) assertSafePlistValue(value, label);

  const logDir = join(config.lynttyHomeDir, 'logs');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>Label</key>',
    `  <string>${LAUNCH_AGENT_LABEL}</string>`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    `    <string>${xml(config.daemonExecutable)}</string>`,
    '  </array>',
    '  <key>WorkingDirectory</key>',
    `  <string>${xml(config.homeDir)}</string>`,
    '  <key>EnvironmentVariables</key>',
    '  <dict>',
    '    <key>HOME</key>',
    `    <string>${xml(config.homeDir)}</string>`,
    '    <key>LYNTTY_HOME_DIR</key>',
    `    <string>${xml(config.lynttyHomeDir)}</string>`,
    '    <key>LYNTTY_CLI_EXECUTABLE</key>',
    `    <string>${xml(config.cliExecutable)}</string>`,
    '    <key>LYNTTY_DAEMON_PROCESS</key>',
    '    <string>1</string>',
    '    <key>PATH</key>',
    `    <string>${xml(config.runtimePath)}</string>`,
    '  </dict>',
    '  <key>RunAtLoad</key>',
    '  <true/>',
    '  <key>KeepAlive</key>',
    '  <true/>',
    '  <key>ProcessType</key>',
    '  <string>Background</string>',
    '  <key>StandardOutPath</key>',
    `  <string>${xml(join(logDir, 'lynttyd.stdout.log'))}</string>`,
    '  <key>StandardErrorPath</key>',
    `  <string>${xml(join(logDir, 'lynttyd.stderr.log'))}</string>`,
    '</dict>',
    '</plist>',
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

export class LaunchAgentServiceManager implements DaemonServiceManager {
  readonly kind = 'launch-agent' as const;
  private readonly domain: string;
  private readonly serviceTarget: string;

  constructor(
    private readonly config: DaemonServiceConfig,
    private readonly run: ServiceCommandRunner,
    private readonly launchctl: string,
  ) {
    if (config.uid === undefined || !Number.isSafeInteger(config.uid) || config.uid < 0) {
      throw new Error('A valid user id is required for the macOS LaunchAgent');
    }
    this.domain = `gui/${config.uid}`;
    this.serviceTarget = `${this.domain}/${LAUNCH_AGENT_LABEL}`;
  }

  private async command(args: readonly string[], allowFailure = false): Promise<void> {
    const result = await this.run(this.launchctl, args);
    if (!allowFailure && result.exitCode !== 0) {
      throw new Error(`launchctl ${args.join(' ')} failed: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`}`);
    }
  }

  async install(): Promise<void> {
    const previous = await readExisting(this.config.servicePath);
    await this.command(['bootout', this.serviceTarget], true);
    await writeServiceFileAtomically(this.config.servicePath, renderLaunchAgentPlist(this.config));
    try {
      await this.command(['bootstrap', this.domain, this.config.servicePath]);
      await this.command(['enable', this.serviceTarget]);
      await this.command(['kickstart', '-k', this.serviceTarget]);
    } catch (error) {
      await this.command(['bootout', this.serviceTarget], true);
      if (previous === null) await rm(this.config.servicePath, { force: true });
      else {
        await writeServiceFileAtomically(this.config.servicePath, previous);
        await this.command(['bootstrap', this.domain, this.config.servicePath], true);
      }
      throw error;
    }
  }

  async start(): Promise<void> {
    if (await readExisting(this.config.servicePath) === null) throw new Error('lynttyd LaunchAgent is not installed');
    const status = await this.run(this.launchctl, ['print', this.serviceTarget]);
    if (status.exitCode !== 0) await this.command(['bootstrap', this.domain, this.config.servicePath]);
    await this.command(['kickstart', '-k', this.serviceTarget]);
  }

  async stop(): Promise<void> {
    await this.command(['bootout', this.serviceTarget], true);
  }

  async restart(): Promise<void> {
    await this.start();
  }

  async status(): Promise<DaemonServiceState> {
    if (await readExisting(this.config.servicePath) === null) return 'not-installed';
    const result = await this.run(this.launchctl, ['print', this.serviceTarget]);
    return result.exitCode === 0 ? 'running' : 'stopped';
  }

  async uninstall(): Promise<void> {
    await this.stop();
    await rm(this.config.servicePath, { force: true });
  }
}
