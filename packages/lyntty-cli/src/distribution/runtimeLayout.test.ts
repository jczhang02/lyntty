import { describe, expect, it } from 'bun:test';

import { isCompiledBunMain, resolveRuntimeLayout } from './runtimeLayout';

describe('runtime layout', () => {
  it('recognizes Bun virtual filesystem entrypoints', () => {
    expect(isCompiledBunMain('/$bunfs/root/lyntty')).toBe(true);
    expect(isCompiledBunMain('C:\\~BUN\\root\\lyntty.exe')).toBe(true);
    expect(isCompiledBunMain('/repo/src/index.ts')).toBe(false);
  });

  it('keeps source development paths inside the package', () => {
    expect(resolveRuntimeLayout({
      bunMain: '/repo/packages/lyntty-cli/src/index.ts',
      execPath: '/opt/bun/bin/bun',
      platform: 'linux',
      sourcePackageDir: '/repo/packages/lyntty-cli',
    })).toEqual({
      compiled: false,
      rootDir: '/repo/packages/lyntty-cli',
      libraryDir: '/repo/packages/lyntty-cli',
      toolsDir: '/repo/packages/lyntty-cli/tools/unpacked',
      piPackageDir: null,
      cliExecutable: null,
      daemonExecutable: null,
      manifestPath: null,
    });
  });

  it('resolves POSIX release assets beside sibling executables', () => {
    expect(resolveRuntimeLayout({
      bunMain: '/$bunfs/root/lyntty',
      execPath: '/opt/lyntty/versions/v2/lyntty',
      platform: 'linux',
      sourcePackageDir: '/unused',
    })).toEqual({
      compiled: true,
      rootDir: '/opt/lyntty/versions/v2',
      libraryDir: '/opt/lyntty/versions/v2',
      toolsDir: '/opt/lyntty/versions/v2/tools',
      piPackageDir: '/opt/lyntty/versions/v2/runtime/pi',
      cliExecutable: '/opt/lyntty/versions/v2/lyntty',
      daemonExecutable: '/opt/lyntty/versions/v2/lynttyd',
      manifestPath: '/opt/lyntty/versions/v2/artifact-manifest.json',
    });
  });

  it('resolves Windows release paths with Windows semantics', () => {
    expect(resolveRuntimeLayout({
      bunMain: 'C:\\~BUN\\root\\lyntty.exe',
      execPath: 'C:\\Lyntty\\versions\\v2\\lyntty.exe',
      platform: 'win32',
      sourcePackageDir: 'C:\\unused',
    })).toEqual({
      compiled: true,
      rootDir: 'C:\\Lyntty\\versions\\v2',
      libraryDir: 'C:\\Lyntty\\versions\\v2',
      toolsDir: 'C:\\Lyntty\\versions\\v2\\tools',
      piPackageDir: 'C:\\Lyntty\\versions\\v2\\runtime\\pi',
      cliExecutable: 'C:\\Lyntty\\versions\\v2\\lyntty.exe',
      daemonExecutable: 'C:\\Lyntty\\versions\\v2\\lynttyd.exe',
      manifestPath: 'C:\\Lyntty\\versions\\v2\\artifact-manifest.json',
    });
  });
});
