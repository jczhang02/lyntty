import { afterEach, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { LaunchAgentServiceManager, renderLaunchAgentPlist } from './launchd';
import { buildDaemonRuntimePath } from './index';
import { SystemdUserServiceManager, renderSystemdUserUnit } from './systemd';
import type { DaemonServiceConfig, ServiceCommandResult, ServiceCommandRunner } from './types';

const testRoots: string[] = [];

async function testConfig(platform: 'linux' | 'darwin'): Promise<{ root: string; config: DaemonServiceConfig }> {
  const root = resolve(import.meta.dir, '../../../dist/test-state', randomUUID());
  testRoots.push(root);
  await mkdir(root, { recursive: true });
  const home = join(root, 'home with spaces');
  const servicePath = platform === 'linux'
    ? join(home, '.config', 'systemd', 'user', 'lynttyd.service')
    : join(home, 'Library', 'LaunchAgents', 'dev.jczhang.lynttyd.plist');
  return {
    root,
    config: {
      daemonExecutable: join(root, 'versions', 'v2', 'lynttyd'),
      cliExecutable: join(root, 'versions', 'v2', 'lyntty'),
      homeDir: home,
      lynttyHomeDir: join(home, '.lyntty'),
      servicePath,
      runtimePath: '/usr/local/bin:/usr/bin:/bin',
      uid: 501,
    },
  };
}

afterEach(async () => {
  await Promise.all(testRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

function recordingRunner(
  commands: Array<[string, readonly string[]]>,
  response: (command: string, args: readonly string[]) => ServiceCommandResult = () => ({ exitCode: 0, stdout: '', stderr: '' }),
): ServiceCommandRunner {
  return async (command, args) => {
    commands.push([command, [...args]]);
    return response(command, args);
  };
}

describe('systemd user service', () => {
  it('includes the standard /opt executable directory in the Linux daemon PATH', () => {
    const runtimePath = buildDaemonRuntimePath('linux', '/home/user');

    expect(runtimePath.split(':')).toContain('/opt/bin');
  });

  it('renders a direct standalone daemon command and fixed service environment', async () => {
    const { config } = await testConfig('linux');
    const unit = renderSystemdUserUnit(config);
    expect(unit).toContain(`ExecStart="${config.daemonExecutable}"`);
    expect(unit).toContain(`Environment="LYNTTY_CLI_EXECUTABLE=${config.cliExecutable}"`);
    expect(unit).toContain('Environment="LYNTTY_DAEMON_PROCESS=1"');
    expect(unit).toContain('UMask=0077');
    expect(unit).not.toContain('/tmp');
    expect(() => renderSystemdUserUnit({ ...config, homeDir: 'bad\nvalue' })).toThrow('unsupported characters');
  });

  it('atomically installs, enables, reports, and removes a user unit', async () => {
    const { config } = await testConfig('linux');
    const commands: Array<[string, readonly string[]]> = [];
    const manager = new SystemdUserServiceManager(config, recordingRunner(commands), '/fake/systemctl');

    await manager.install();
    expect((await stat(config.servicePath)).mode & 0o777).toBe(0o600);
    expect(await manager.status()).toBe('running');
    await manager.stop();
    await manager.start();
    await manager.restart();
    await manager.uninstall();
    expect(await manager.status()).toBe('not-installed');
    expect(commands).toContainEqual(['/fake/systemctl', ['--user', 'enable', '--now', 'lynttyd.service']]);
    expect(commands).toContainEqual(['/fake/systemctl', ['--user', 'disable', '--now', 'lynttyd.service']]);
  });

  it('restores the previous unit when enablement fails', async () => {
    const { config } = await testConfig('linux');
    await mkdir(resolve(config.servicePath, '..'), { recursive: true });
    await writeFile(config.servicePath, 'previous-unit');
    const manager = new SystemdUserServiceManager(config, recordingRunner([], (_command, args) => ({
      exitCode: args.includes('enable') ? 1 : 0,
      stdout: '',
      stderr: args.includes('enable') ? 'enable failed' : '',
    })), '/fake/systemctl');

    await expect(manager.install()).rejects.toThrow('enable failed');
    expect(await readFile(config.servicePath, 'utf8')).toBe('previous-unit');
  });
});

describe('macOS LaunchAgent service', () => {
  it('escapes plist values and never uses a system LaunchDaemon', async () => {
    const { config } = await testConfig('darwin');
    const plist = renderLaunchAgentPlist({ ...config, homeDir: `${config.homeDir}&<private>` });
    expect(plist).toContain('dev.jczhang.lynttyd');
    expect(plist).toContain('&amp;&lt;private&gt;');
    expect(plist).toContain(`<string>${config.daemonExecutable}</string>`);
    expect(plist).not.toContain('/Library/LaunchDaemons');
    expect(plist).not.toContain('/tmp');
  });

  it('bootstraps, restarts, stops, and removes the per-user agent', async () => {
    const { config } = await testConfig('darwin');
    const commands: Array<[string, readonly string[]]> = [];
    const manager = new LaunchAgentServiceManager(config, recordingRunner(commands), '/bin/launchctl');

    await manager.install();
    expect((await stat(config.servicePath)).mode & 0o777).toBe(0o600);
    expect(await manager.status()).toBe('running');
    await manager.restart();
    await manager.stop();
    await manager.uninstall();
    expect(await manager.status()).toBe('not-installed');
    expect(commands).toContainEqual(['/bin/launchctl', ['bootstrap', 'gui/501', config.servicePath]]);
    expect(commands).toContainEqual(['/bin/launchctl', ['kickstart', '-k', 'gui/501/dev.jczhang.lynttyd']]);
    expect(commands).toContainEqual(['/bin/launchctl', ['bootout', 'gui/501/dev.jczhang.lynttyd']]);
  });
});
