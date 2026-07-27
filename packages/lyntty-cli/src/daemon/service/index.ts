import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

import { configuration } from '@/configuration';
import { installedExecutablePath } from '@/distribution/installPaths';
import { runtimeLayout } from '@/distribution/runtimeLayout';
import { LaunchAgentServiceManager, LAUNCH_AGENT_LABEL } from './launchd';
import { SystemdUserServiceManager } from './systemd';
import type { DaemonServiceConfig, DaemonServiceManager, ServiceCommandRunner } from './types';

interface ServiceManagerOptions {
  platform?: NodeJS.Platform;
  uid?: number;
  homeDir?: string;
  xdgConfigHome?: string;
  runner?: ServiceCommandRunner;
  systemctlPath?: string;
  launchctlPath?: string;
  allowPendingCurrent?: boolean;
}

export const runServiceCommand: ServiceCommandRunner = async (command, args) => {
  const child = Bun.spawn([command, ...args], {
    env: process.env,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
};

function resolveSystemctl(): string {
  for (const path of ['/usr/bin/systemctl', '/bin/systemctl']) {
    if (existsSync(path)) return path;
  }
  throw new Error('systemctl was not found; a systemd user session is required');
}

export function buildDaemonRuntimePath(platform: NodeJS.Platform, homeDir: string): string {
  const paths = [join(homeDir, '.local', 'bin'), join(homeDir, '.cargo', 'bin')];
  if (platform === 'darwin') paths.push('/opt/homebrew/bin');
  if (platform === 'linux') paths.push('/opt/bin');
  paths.push('/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin');
  return paths.join(':');
}

function assertAbsolute(path: string | null, label: string): asserts path is string {
  if (!path || !isAbsolute(path)) throw new Error(`${label} must be an absolute path in a standalone Lyntty installation`);
}

export function createDaemonServiceManagerForConfig(
  platform: NodeJS.Platform,
  config: DaemonServiceConfig,
  runner: ServiceCommandRunner,
  commands: { systemctl?: string; launchctl?: string } = {},
): DaemonServiceManager {
  if (platform === 'linux') {
    return new SystemdUserServiceManager(config, runner, commands.systemctl ?? '/usr/bin/systemctl');
  }
  if (platform === 'darwin') {
    return new LaunchAgentServiceManager(config, runner, commands.launchctl ?? '/bin/launchctl');
  }
  throw new Error('lynttyd user services are supported only on Linux and macOS; Windows service installation is not yet supported');
}

export function createDaemonServiceManager(options: ServiceManagerOptions = {}): DaemonServiceManager {
  const platform = options.platform ?? process.platform;
  if (platform !== 'linux' && platform !== 'darwin') {
    throw new Error('lynttyd user services are supported only on Linux and macOS; Windows service installation is not yet supported');
  }
  const layout = runtimeLayout();
  if (!layout.compiled) {
    throw new Error('Daemon service installation requires standalone lyntty and lynttyd artifacts');
  }

  const homeDir = options.homeDir ?? homedir();
  const uid = options.uid ?? process.getuid?.();
  if (uid === undefined || uid === 0) throw new Error('Daemon user service installation must run as a non-root user');

  const managedInstallRoot = process.env.LYNTTY_INSTALL_ROOT?.trim();
  if (!managedInstallRoot) {
    throw new Error('Daemon user services require a transactional Lyntty installation; run the verified release installer first');
  }
  const daemonExecutable = installedExecutablePath(managedInstallRoot, 'lynttyd', platform);
  const cliExecutable = installedExecutablePath(managedInstallRoot, 'lyntty', platform);
  assertAbsolute(daemonExecutable, 'lynttyd executable');
  assertAbsolute(cliExecutable, 'lyntty executable');
  if (!options.allowPendingCurrent && (!existsSync(daemonExecutable) || !existsSync(cliExecutable))) {
    throw new Error('The managed current release is missing lyntty or lynttyd; refusing to install an ephemeral service');
  }

  const servicePath = platform === 'linux'
    ? join(options.xdgConfigHome ?? process.env.XDG_CONFIG_HOME ?? join(homeDir, '.config'), 'systemd', 'user', 'lynttyd.service')
    : join(homeDir, 'Library', 'LaunchAgents', `${LAUNCH_AGENT_LABEL}.plist`);
  const config: DaemonServiceConfig = {
    daemonExecutable,
    cliExecutable,
    homeDir,
    lynttyHomeDir: configuration.lynttyHomeDir,
    servicePath,
    runtimePath: buildDaemonRuntimePath(platform, homeDir),
    uid,
  };

  const runner = options.runner ?? runServiceCommand;
  return createDaemonServiceManagerForConfig(platform, config, runner, {
    systemctl: options.systemctlPath ?? (platform === 'linux' ? resolveSystemctl() : undefined),
    launchctl: options.launchctlPath,
  });
}

export type { DaemonServiceConfig, DaemonServiceManager, DaemonServiceState, ServiceCommandRunner } from './types';
