import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { processStartToken } from './dev';
import {
  cleanupBuildProcesses,
  isUsableLanIpv4,
  parseLinuxDefaultRoute,
  relayPortForHash,
  sanitizePreviewBuildEnvironment,
} from './preview';

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const repositoryRoot = join(import.meta.dir, '..');
const script = join(import.meta.dir, 'preview.ts');
const testEnvironment = {
  LYNTTY_PREVIEW_ALLOW_TEST_HOOKS: '1',
  LYNTTY_PREVIEW_TEST_NAMESPACE: `suite-${process.pid}`,
};

async function runPreview(args: string[], environment: Record<string, string> = {}): Promise<RunResult> {
  const child = Bun.spawn({
    cmd: [process.execPath, script, ...args],
    cwd: repositoryRoot,
    env: { ...Bun.env, ...testEnvironment, ...environment },
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
}

describe('Preview LAN selection', () => {
  it('selects the preferred source from the default route and rejects loopback addresses', () => {
    expect(parseLinuxDefaultRoute(JSON.stringify([
      { dst: 'default', dev: 'wlan0', prefsrc: '192.168.10.24', metric: 600 },
      { dst: 'default', dev: 'eth0', prefsrc: '10.20.0.8', metric: 100 },
    ]))).toBe('10.20.0.8');
    expect(isUsableLanIpv4('192.168.10.24')).toBe(true);
    expect(isUsableLanIpv4('127.0.0.1')).toBe(false);
    expect(isUsableLanIpv4('8.8.8.8')).toBe(false);
  });
});

describe('Preview build cleanup', () => {
  it('removes every inherited EXPO_PUBLIC value before a release-style build', () => {
    expect(sanitizePreviewBuildEnvironment({
      PATH: '/usr/bin',
      EXPO_PUBLIC_DEV_SECRET: 'secret',
      EXPO_PUBLIC_TOKEN: 'token',
      EXPO_PUBLIC_LOG_SERVER_URL: 'https://logs.invalid',
      EXPO_PUBLIC_LYNTTY_SERVER_URL: 'https://relay.invalid',
    })).toEqual({ PATH: '/usr/bin' });
  });

  it('stops only detached build groups carrying the exact build marker', async () => {
    const buildId = `build-${process.pid}-${Date.now()}`;
    const child = Bun.spawn({
      cmd: [process.execPath, '-e', 'setInterval(() => {}, 1_000)'],
      cwd: repositoryRoot,
      env: {
        ...Bun.env,
        LYNTTY_PREVIEW_BUILD_ID: buildId,
        LYNTTY_PREVIEW_BUILD_ROOT: repositoryRoot,
      },
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
      detached: true,
    });
    child.unref?.();

    await cleanupBuildProcesses(repositoryRoot, buildId);
    expect(() => process.kill(child.pid, 0)).toThrow();
  });
});

describe('public Preview manual-test commands', () => {
  it('exposes the five agreed root commands', async () => {
    const packageJson = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.['preview:test']).toBe('bun scripts/preview.ts test');
    expect(packageJson.scripts?.['preview:status']).toBe('bun scripts/preview.ts status');
    expect(packageJson.scripts?.['preview:logs']).toBe('bun scripts/preview.ts logs');
    expect(packageJson.scripts?.['preview:stop']).toBe('bun scripts/preview.ts stop');
    expect(packageJson.scripts?.['preview:reset']).toBe('bun scripts/preview.ts reset');
  });

  it('reports an uninitialized profile without creating live state', async () => {
    const result = await runPreview(['status']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Preview test profile is not initialized');
    expect(result.stderr).toBe('');
  });

  it('keeps logs, stop, and reset idempotent before first setup', async () => {
    const logs = await runPreview(['logs']);
    const stop = await runPreview(['stop']);
    const reset = await runPreview(['reset']);

    expect(logs.exitCode).toBe(0);
    expect(logs.stdout).toContain('No Preview test logs found');
    expect(stop.exitCode).toBe(0);
    expect(stop.stdout).toContain('nothing to stop');
    expect(reset.exitCode).toBe(0);
    expect(reset.stdout).toContain('nothing to reset');
  });

  it('reset removes an incomplete build profile even before state publication', async () => {
    const environment = { LYNTTY_PREVIEW_TEST_NAMESPACE: `partial-reset-${process.pid}` };
    const status = await runPreview(['status'], environment);
    const stateDir = status.stdout.match(/^.*State: (.+)$/m)?.[1];
    expect(stateDir).toBeTruthy();
    const partialFile = join(stateDir!, 'android', 'gradle', 'partial.bin');
    await mkdir(join(stateDir!, 'android', 'gradle'), { recursive: true });
    await writeFile(partialFile, 'partial build');

    const reset = await runPreview(['reset'], environment);

    expect(reset.exitCode).toBe(0);
    expect(reset.stdout).toContain('incomplete profile removed');
    expect(await Bun.file(partialFile).exists()).toBe(false);
  });

  it('recognizes the V2 data-key credentials written by real mobile pairing', async () => {
    const namespace = `v2-auth-${process.pid}`;
    const environment = {
      LYNTTY_PREVIEW_TEST_NAMESPACE: namespace,
      LYNTTY_PREVIEW_TEST_FAKE_RUNTIME: '1',
      LYNTTY_PREVIEW_TEST_FAKE_APK: '1',
      LYNTTY_PREVIEW_TEST_SEED_AUTH: '1',
      LYNTTY_PREVIEW_TEST_SKIP_PI: '1',
      LYNTTY_PREVIEW_LAN_IP: '127.0.0.1',
    };
    const uninitialized = await runPreview(['status'], environment);
    const stateDir = uninitialized.stdout.match(/^.*State: (.+)$/m)?.[1];
    expect(stateDir).toBeTruthy();
    await mkdir(join(stateDir!, 'lyntty'), { recursive: true });
    const key = Buffer.alloc(32, 7).toString('base64');
    await writeFile(join(stateDir!, 'lyntty', 'access.key'), `${JSON.stringify({
      token: 'v2-mobile-token',
      encryption: { publicKey: key, machineKey: key },
    }, null, 2)}\n`, { mode: 0o600 });
    await writeFile(join(stateDir!, 'lyntty', 'settings.json'), `${JSON.stringify({
      schemaVersion: 2,
      machineId: 'v2-paired-machine',
      serverUrl: 'http://127.0.0.1:1',
    }, null, 2)}\n`, { mode: 0o600 });
    try {
      const started = await runPreview(['test'], environment);
      expect(started.exitCode).toBe(0);
      expect(started.stdout).toContain('Preview test backend is running');
    } finally {
      await runPreview(['stop'], environment);
      await runPreview(['reset'], environment);
    }
  }, 20_000);

  it('starts, inspects, stops, and resets only its owned test supervisor', async () => {
    const environment = {
      LYNTTY_PREVIEW_TEST_NAMESPACE: `lifecycle-${process.pid}`,
      LYNTTY_PREVIEW_TEST_FAKE_RUNTIME: '1',
      LYNTTY_PREVIEW_TEST_SKIP_APK: '1',
      LYNTTY_PREVIEW_TEST_SKIP_AUTH: '1',
      LYNTTY_PREVIEW_TEST_SKIP_PI: '1',
      LYNTTY_PREVIEW_LAN_IP: '127.0.0.1',
    };

    const started = await runPreview(['test'], environment);
    expect(started.exitCode).toBe(0);
    expect(started.stdout).toContain('Preview test backend is running');

    const running = await runPreview(['status'], environment);
    expect(running.exitCode).toBe(0);
    expect(running.stdout).toContain('Status: running');
    expect(running.stdout).toContain('Owned supervisor: yes');

    const stopped = await runPreview(['stop'], environment);
    expect(stopped.exitCode).toBe(0);
    expect(stopped.stdout).toContain('Preview test backend stopped');

    const afterStop = await runPreview(['status'], environment);
    expect(afterStop.exitCode).toBe(0);
    expect(afterStop.stdout).toContain('Status: stopped');

    const reset = await runPreview(['reset'], environment);
    expect(reset.exitCode).toBe(0);
    expect(reset.stdout).toContain('Preview test profile reset');

    const absent = await runPreview(['status'], environment);
    expect(absent.stdout).toContain('not initialized');
  }, 20_000);

  it('prints useful logs without exposing pairing URLs or credential fields', async () => {
    const environment = {
      LYNTTY_PREVIEW_TEST_NAMESPACE: `logs-${process.pid}`,
      LYNTTY_PREVIEW_TEST_FAKE_RUNTIME: '1',
      LYNTTY_PREVIEW_TEST_SKIP_APK: '1',
      LYNTTY_PREVIEW_TEST_SKIP_AUTH: '1',
      LYNTTY_PREVIEW_TEST_SKIP_PI: '1',
      LYNTTY_PREVIEW_LAN_IP: '127.0.0.1',
    };
    try {
      expect((await runPreview(['test'], environment)).exitCode).toBe(0);
      const status = await runPreview(['status'], environment);
      const stateDir = status.stdout.match(/^State: (.+)$/m)?.[1];
      expect(stateDir).toBeTruthy();
      await writeFile(join(stateDir!, 'logs', 'supervisor.log'), [
        'Relay ready',
        'lyntty://terminal?publicKey=sensitive-pairing-data',
        '{"token":"sensitive-token","secret":"sensitive-secret"}',
        'Authorization: Bearer sensitive-bearer',
      ].join('\n'));

      const logs = await runPreview(['logs'], environment);
      expect(logs.exitCode).toBe(0);
      expect(logs.stdout).toContain('Relay ready');
      expect(logs.stdout).toContain('<redacted-pairing-url>');
      expect(logs.stdout).not.toContain('sensitive-pairing-data');
      expect(logs.stdout).not.toContain('sensitive-token');
      expect(logs.stdout).not.toContain('sensitive-secret');
      expect(logs.stdout).not.toContain('sensitive-bearer');
    } finally {
      await runPreview(['stop'], environment);
      await runPreview(['reset'], environment);
    }
  }, 20_000);

  it('reuses a content-matched Preview APK and rebuilds after source changes', async () => {
    const environment = {
      LYNTTY_PREVIEW_TEST_NAMESPACE: `apk-${process.pid}`,
      LYNTTY_PREVIEW_TEST_FAKE_RUNTIME: '1',
      LYNTTY_PREVIEW_TEST_FAKE_APK: '1',
      LYNTTY_PREVIEW_TEST_SKIP_AUTH: '1',
      LYNTTY_PREVIEW_TEST_SKIP_PI: '1',
      LYNTTY_PREVIEW_TEST_SOURCE_DIGEST: 'source-a',
      LYNTTY_PREVIEW_LAN_IP: '127.0.0.1',
    };
    try {
      const first = await runPreview(['test'], environment);
      expect(first.exitCode).toBe(0);
      expect(first.stdout).toContain('Preview APK built');
      await runPreview(['stop'], environment);

      const second = await runPreview(['test'], environment);
      expect(second.exitCode).toBe(0);
      expect(second.stdout).toContain('Preview APK reused');
      const firstStatus = await runPreview(['status'], environment);
      const firstCode = Number(firstStatus.stdout.match(/^APK versionCode: (\d+)$/m)?.[1]);
      expect(firstCode).toBeGreaterThan(0);
      await runPreview(['stop'], environment);

      const changed = await runPreview(['test'], {
        ...environment,
        LYNTTY_PREVIEW_TEST_SOURCE_DIGEST: 'source-b',
      });
      expect(changed.exitCode).toBe(0);
      expect(changed.stdout).toContain('Preview APK built');
      const changedStatus = await runPreview(['status'], {
        ...environment,
        LYNTTY_PREVIEW_TEST_SOURCE_DIGEST: 'source-b',
      });
      const changedCode = Number(changedStatus.stdout.match(/^APK versionCode: (\d+)$/m)?.[1]);
      expect(changedCode).toBeGreaterThan(firstCode);
    } finally {
      await runPreview(['stop'], environment);
      await runPreview(['reset'], environment);
    }
  }, 30_000);

  it('imports only an allowlisted audited current-source Preview APK', async () => {
    const fixtureDir = join(repositoryRoot, 'dist', 'test-state', `preview-apk-import-${process.pid}`);
    await mkdir(fixtureDir, { recursive: true });
    const apkPath = join(fixtureDir, 'lyntty-preview-1.1.0-919999.apk');
    const apkContent = 'audited Preview APK fixture';
    await writeFile(apkPath, apkContent);
    const sha256 = createHash('sha256').update(apkContent).digest('hex');
    const sourceCommit = await Bun.$`git rev-parse HEAD`.cwd(repositoryRoot).text().then(value => value.trim());
    const allowlistPath = join(fixtureDir, 'allowlist.json');
    await writeFile(allowlistPath, `${JSON.stringify({
      schemaVersion: 1,
      artifacts: [{
        sourceCommit,
        applicationId: 'dev.jczhang.lyntty.preview',
        versionName: '1.1.0',
        versionCode: 919999,
        sha256,
        signerSha256: 'ebd23c222b690e2be635fe3e52bd70b6fb86c5570ab279bc4e8c1f22ed90ef9c',
      }],
    }, null, 2)}\n`);
    await writeFile(apkPath.replace(/\.apk$/, '.audit.txt'), [
      'Lyntty standalone Preview APK',
      `source_commit=${sourceCommit}`,
      'application_id=dev.jczhang.lyntty.preview',
      'version_name=1.1.0',
      'version_code=919999',
      `sha256=${sha256}`,
      'debuggable=false',
      'signer_sha256=ebd23c222b690e2be635fe3e52bd70b6fb86c5570ab279bc4e8c1f22ed90ef9c',
      'signature_scheme_v2=true',
      'standalone_bundle=assets/index.android.bundle',
    ].join('\n'));
    const environment = {
      LYNTTY_PREVIEW_TEST_NAMESPACE: `import-${process.pid}`,
      LYNTTY_PREVIEW_TEST_FAKE_RUNTIME: '1',
      LYNTTY_PREVIEW_TEST_SKIP_APK_AUDIT: '1',
      LYNTTY_PREVIEW_TEST_SKIP_AUTH: '1',
      LYNTTY_PREVIEW_TEST_SKIP_PI: '1',
      LYNTTY_PREVIEW_APK: apkPath,
      LYNTTY_PREVIEW_LAN_IP: '127.0.0.1',
    };
    const approvedEnvironment = {
      ...environment,
      LYNTTY_PREVIEW_TEST_APK_ALLOWLIST: allowlistPath,
    };
    try {
      const unapproved = await runPreview(['test'], environment);
      expect(unapproved.exitCode).toBe(1);
      expect(unapproved.stderr).toContain('not present in the reviewed Preview APK allowlist');

      const started = await runPreview(['test'], approvedEnvironment);
      expect(started.exitCode).toBe(0);
      expect(started.stdout).toContain('Preview APK imported');
      const status = await runPreview(['status'], approvedEnvironment);
      expect(status.stdout).toContain('APK versionCode: 919999');
    } finally {
      await runPreview(['stop'], approvedEnvironment);
      await runPreview(['reset'], approvedEnvironment);
      await rm(fixtureDir, { recursive: true, force: true });
    }
  }, 20_000);

  it('refuses a native APK build before spawning Gradle when memory is insufficient', async () => {
    const fixtureHome = join(repositoryRoot, 'dist', 'test-state', `preview-low-memory-${process.pid}`);
    await mkdir(fixtureHome, { recursive: true });
    const environment = {
      HOME: fixtureHome,
      LYNTTY_PREVIEW_TEST_NAMESPACE: `memory-${process.pid}`,
      LYNTTY_PREVIEW_TEST_FAKE_RUNTIME: '1',
      LYNTTY_PREVIEW_TEST_SKIP_AUTH: '1',
      LYNTTY_PREVIEW_TEST_SKIP_PI: '1',
      LYNTTY_PREVIEW_TEST_SOURCE_DIGEST: 'no-cached-apk',
      LYNTTY_PREVIEW_TEST_MEM_AVAILABLE_KIB: String(4 * 1024 * 1024),
      LYNTTY_PREVIEW_LAN_IP: '127.0.0.1',
    };
    try {
      const refused = await runPreview(['test'], environment);
      expect(refused.exitCode).toBe(1);
      expect(refused.stderr).toContain('needs at least 12 GiB available memory');
      expect(refused.stderr).toContain('LYNTTY_PREVIEW_APK');
    } finally {
      await runPreview(['reset'], environment);
      await rm(fixtureHome, { recursive: true, force: true });
    }
  });

  it('launches a new managed Pi with isolated Lyntty state and the real user HOME', async () => {
    const environment = {
      LYNTTY_PREVIEW_TEST_NAMESPACE: `pi-${process.pid}`,
      LYNTTY_PREVIEW_TEST_FAKE_RUNTIME: '1',
      LYNTTY_PREVIEW_TEST_FAKE_APK: '1',
      LYNTTY_PREVIEW_TEST_SKIP_AUTH: '1',
      LYNTTY_PREVIEW_TEST_FAKE_PI: '1',
      LYNTTY_PREVIEW_LAN_IP: '127.0.0.1',
    };
    try {
      const started = await runPreview(['test'], environment);
      expect(started.exitCode).toBe(0);
      expect(started.stdout).toContain('Manual phone check');
      const status = await runPreview(['status'], environment);
      const stateDir = status.stdout.match(/^State: (.+)$/m)?.[1];
      expect(stateDir).toBeTruthy();
      const launch = JSON.parse(await readFile(join(stateDir!, 'pi-launch.json'), 'utf8')) as Record<string, unknown>;
      expect(launch.home).toBe(Bun.env.HOME);
      expect(launch.lynttyHome).toBe(join(stateDir!, 'lyntty'));
      expect(launch.extensionPath).toBe(join(stateDir!, 'pi-extension', 'index.ts'));
    } finally {
      await runPreview(['stop'], environment);
      await runPreview(['reset'], environment);
    }
  }, 20_000);

  it('runs the current source Relay in an isolated persistent profile', async () => {
    const environment = {
      LYNTTY_PREVIEW_TEST_NAMESPACE: `relay-${process.pid}`,
      LYNTTY_PREVIEW_TEST_SKIP_APK: '1',
      LYNTTY_PREVIEW_TEST_SKIP_AUTH: '1',
      LYNTTY_PREVIEW_TEST_SKIP_PI: '1',
      LYNTTY_PREVIEW_LAN_IP: '127.0.0.1',
    };
    try {
      const started = await runPreview(['test'], environment);
      expect(started.exitCode).toBe(0);
      expect(started.stdout).toContain('Preview test backend is running');
      const relayUrl = started.stdout.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      expect(relayUrl).toBeTruthy();
      const rootResponse = await fetch(relayUrl!);
      expect(rootResponse.status).toBe(200);
      expect(await rootResponse.text()).toContain('Welcome to Lyntty Relay!');

      const status = await runPreview(['status'], environment);
      expect(status.exitCode).toBe(0);
      expect(status.stdout).toContain('Relay health: healthy');
      expect(status.stdout).toContain('Daemon: not started');
    } finally {
      await runPreview(['stop'], environment);
      await runPreview(['reset'], environment);
    }
  }, 30_000);

  it('pairs an isolated test identity and runs the current source daemon without installing an extension', async () => {
    const environment = {
      LYNTTY_PREVIEW_TEST_NAMESPACE: `daemon-${process.pid}`,
      LYNTTY_PREVIEW_TEST_SKIP_APK: '1',
      LYNTTY_PREVIEW_TEST_SEED_AUTH: '1',
      LYNTTY_PREVIEW_TEST_SKIP_PI: '1',
      LYNTTY_PREVIEW_LAN_IP: '127.0.0.1',
    };
    try {
      const started = await runPreview(['test'], environment);
      expect(started.exitCode).toBe(0);
      const status = await runPreview(['status'], environment);
      expect(status.exitCode).toBe(0);
      expect(status.stdout).toContain('Relay health: healthy');
      expect(status.stdout).toContain('Daemon: running');
      expect(status.stdout).toContain('Global Pi extension touched: no');
    } finally {
      await runPreview(['stop'], environment);
      await runPreview(['reset'], environment);
    }
  }, 45_000);

  it('refuses to replace an unrelated listener on the stable Relay port', async () => {
    const namespace = `port-${process.pid}`;
    const canonicalRoot = await Bun.$`git rev-parse --show-toplevel`.cwd(repositoryRoot).text().then(value => value.trim());
    const profileHash = createHash('sha256').update(`${canonicalRoot}\0${namespace}`).digest('hex').slice(0, 16);
    const port = relayPortForHash(profileHash);
    const listener = Bun.listen({ hostname: '127.0.0.1', port, socket: { data() {} } });
    const environment = {
      LYNTTY_PREVIEW_TEST_NAMESPACE: namespace,
      LYNTTY_PREVIEW_TEST_FAKE_RUNTIME: '1',
      LYNTTY_PREVIEW_TEST_SKIP_APK: '1',
      LYNTTY_PREVIEW_TEST_SKIP_AUTH: '1',
      LYNTTY_PREVIEW_TEST_SKIP_PI: '1',
      LYNTTY_PREVIEW_LAN_IP: '127.0.0.1',
    };
    try {
      const refused = await runPreview(['test'], environment);
      expect(refused.exitCode).toBe(1);
      expect(refused.stderr).toContain(`Relay port ${port} is already in use`);
      expect(listener.port).toBe(port);
    } finally {
      listener.stop(true);
      await runPreview(['reset'], environment);
    }
  });

  it('refuses to signal a process group whose ownership is not proven', async () => {
    const environment = {
      LYNTTY_PREVIEW_TEST_NAMESPACE: `ownership-${process.pid}`,
      LYNTTY_PREVIEW_TEST_FAKE_RUNTIME: '1',
      LYNTTY_PREVIEW_TEST_SKIP_APK: '1',
      LYNTTY_PREVIEW_TEST_SKIP_AUTH: '1',
      LYNTTY_PREVIEW_TEST_SKIP_PI: '1',
      LYNTTY_PREVIEW_LAN_IP: '127.0.0.1',
    };
    const started = await runPreview(['test'], environment);
    expect(started.exitCode).toBe(0);
    const status = await runPreview(['status'], environment);
    const stateDir = status.stdout.match(/^State: (.+)$/m)?.[1];
    expect(stateDir).toBeTruthy();
    const stateFile = join(stateDir!, 'state.json');
    const originalState = JSON.parse(await readFile(stateFile, 'utf8')) as Record<string, unknown>;

    const unrelated = Bun.spawn({
      cmd: [process.execPath, '-e', 'setInterval(() => {}, 1_000)'],
      cwd: repositoryRoot,
      env: Bun.env,
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
      detached: true,
    });
    unrelated.unref?.();
    try {
      const token = await processStartToken(unrelated.pid);
      expect(token).toBeTruthy();
      await writeFile(stateFile, `${JSON.stringify({
        ...originalState,
        supervisor: { pid: unrelated.pid, processStartToken: token },
      }, null, 2)}\n`, { mode: 0o600 });

      const refused = await runPreview(['stop'], environment);
      expect(refused.exitCode).toBe(1);
      expect(refused.stderr).toContain('Refusing to stop Preview process group');
      expect(() => process.kill(unrelated.pid, 0)).not.toThrow();
    } finally {
      await writeFile(stateFile, `${JSON.stringify(originalState, null, 2)}\n`, { mode: 0o600 });
      process.kill(-unrelated.pid, 'SIGKILL');
      await runPreview(['stop'], environment);
      await runPreview(['reset'], environment);
    }
  }, 20_000);

  it('rejects unknown commands with the public usage', async () => {
    const result = await runPreview(['unknown']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Usage: bun preview:test | bun preview:status | bun preview:logs | bun preview:stop | bun preview:reset');
  });
});
