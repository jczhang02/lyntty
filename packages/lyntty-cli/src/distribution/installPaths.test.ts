import { describe, expect, it } from 'bun:test';

import { defaultInstallRoot, inferInstallRootFromRuntimeRoot, installedExecutablePath, resolveInstallPaths } from './installPaths';

describe('installation paths', () => {
  it('uses XDG user data paths on Linux', () => {
    expect(defaultInstallRoot({
      platform: 'linux',
      homeDir: '/home/tester',
      xdgDataHome: '/data/tester',
      installRoot: '',
    })).toBe('/data/tester/lyntty');
    expect(resolveInstallPaths({
      platform: 'linux',
      homeDir: '/home/tester',
      installRoot: '/opt/lyntty-user',
      userBinDir: '/home/tester/bin',
    })).toMatchObject({
      rootDir: '/opt/lyntty-user',
      currentPath: '/opt/lyntty-user/current',
      statePath: '/opt/lyntty-user/install-state.json',
      userBinDir: '/home/tester/bin',
    });
  });

  it('uses per-user application support on macOS', () => {
    expect(defaultInstallRoot({ platform: 'darwin', homeDir: '/Users/tester', installRoot: '' }))
      .toBe('/Users/tester/Library/Application Support/Lyntty');
  });

  it('infers a managed root only from a release versions directory', () => {
    expect(inferInstallRootFromRuntimeRoot('/home/tester/.local/share/lyntty/versions/release-1')).toBe('/home/tester/.local/share/lyntty');
    expect(inferInstallRootFromRuntimeRoot('/downloads/release-1')).toBeNull();
    expect(inferInstallRootFromRuntimeRoot('/install/versions/.staging')).toBeNull();
  });

  it('resolves stable current-pointer executable paths', () => {
    expect(installedExecutablePath('/install', 'lyntty', 'linux')).toBe('/install/current/lyntty');
    expect(installedExecutablePath('/install', 'lynttyd', 'win32')).toBe('/install/current/lynttyd.exe');
  });
});
