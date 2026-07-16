import { describe, expect, it } from 'bun:test';

import { formatLynttyShellCommand, resolveLynttySpawnTarget } from './spawnLynttyCLI';

describe('resolveLynttySpawnTarget', () => {
  it('uses Bun only for source-development builds', () => {
    expect(resolveLynttySpawnTarget({
      bunMain: '/repo/packages/lyntty-cli/dist/index.mjs',
      execPath: '/opt/bun/bin/bun',
      projectDir: '/repo/packages/lyntty-cli',
    })).toEqual({
      command: 'bun',
      prefixArgs: ['/repo/packages/lyntty-cli/dist/index.mjs'],
    });
  });

  it('lets a compiled CLI respawn itself without Bun', () => {
    expect(resolveLynttySpawnTarget({
      bunMain: '/$bunfs/root/lyntty',
      execPath: '/opt/lyntty/bin/lyntty',
      projectDir: '/unused',
    })).toEqual({ command: '/opt/lyntty/bin/lyntty', prefixArgs: [] });
  });

  it('lets compiled lynttyd spawn the sibling CLI', () => {
    expect(resolveLynttySpawnTarget({
      bunMain: '/$bunfs/root/lynttyd',
      execPath: 'C:\\Lyntty\\lynttyd.exe',
      projectDir: 'C:\\unused',
    })).toEqual({ command: 'C:\\Lyntty\\lyntty.exe', prefixArgs: [] });
  });

  it('accepts an explicit release executable override', () => {
    expect(resolveLynttySpawnTarget({
      bunMain: '/$bunfs/root/lynttyd',
      execPath: '/opt/lyntty/lynttyd',
      projectDir: '/unused',
      configuredExecutable: '/custom/lyntty',
    })).toEqual({ command: '/custom/lyntty', prefixArgs: [] });
  });

  it('quotes tmux shell commands without reintroducing a runtime', () => {
    expect(formatLynttyShellCommand(
      { command: "/opt/Lyntty's bin/lyntty", prefixArgs: [] },
      ['pi', '--started-by', 'daemon'],
    )).toBe("'/opt/Lyntty'\"'\"'s bin/lyntty' 'pi' '--started-by' 'daemon'");
  });
});
