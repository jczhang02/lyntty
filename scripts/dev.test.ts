import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { chmod, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCoordination, parseDarwinBsdStartToken, parseKernProcargs2, pathIsInside, reconcileCoordinationAllocations } from './dev';

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface State {
  status: string;
  canonicalRoot: string;
  worktreeHash: string;
  stateDir: string;
  ports: { relay: number; metro: number };
  supervisors: Array<{ pid: number; role: string }>;
  androidRequested: boolean;
}

const script = join(import.meta.dir, 'dev.ts');
const testEnvironment = {
  LYNTTY_DEV_ALLOW_TEST_HOOKS: '1',
  LYNTTY_DEV_TEST_NAMESPACE: `suite-${process.pid}`,
};
let state: State | null = null;

async function runDev(args: string[], environment: Record<string, string> = {}): Promise<RunResult> {
  const child = Bun.spawn({
    cmd: [process.execPath, script, ...args],
    cwd: join(import.meta.dir, '..'),
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

function json<T>(result: RunResult): T {
  const lines = result.stdout.trim().split('\n').filter(Boolean);
  return JSON.parse(lines.at(-1)!) as T;
}

interface ProcessGroupRow {
  pid: number;
  pgid: number;
  stat: string;
}

async function processGroupRows(): Promise<ProcessGroupRow[]> {
  const child = Bun.spawn({
    cmd: ['/bin/ps', '-axo', 'pid=,pgid=,stat='],
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  if (exitCode !== 0) return [];
  return stdout.split('\n').flatMap(line => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)/);
    return match ? [{ pid: Number(match[1]), pgid: Number(match[2]), stat: match[3] }] : [];
  });
}

async function waitForPidGone(pid: number, timeoutMs = 5_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) return false;
    await Bun.sleep(Math.min(50, remaining));
  }
}

async function waitForNoNonZombieMembers(pgid: number, timeoutMs = 5_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const members = (await processGroupRows()).filter(row => row.pgid === pgid && !row.stat.toUpperCase().includes('Z'));
    if (members.length === 0) return true;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return false;
    await Bun.sleep(Math.min(50, remaining));
  }
}

async function waitForNonZombieChild(pgid: number, timeoutMs = 5_000): Promise<ProcessGroupRow | null> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const child = (await processGroupRows()).find(row => row.pgid === pgid && row.pid !== pgid && !row.stat.toUpperCase().includes('Z'));
    if (child) return child;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    await Bun.sleep(Math.min(50, remaining));
  }
}

async function waitForLaunchFile(directory: string, prefix: string, timeoutMs = 10_000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const names = await readdir(directory).catch(() => [] as string[]);
    const match = names.find(name => name.startsWith(prefix) && name.endsWith('.json'));
    if (match) return match;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    await Bun.sleep(Math.min(50, remaining));
  }
}

async function findFreePortBlock(start = 58_000): Promise<{ relayPort: number; metroPort: number }> {
  for (let relayPort = start; relayPort < 59_900; relayPort += 2) {
    let relayListener: ReturnType<typeof Bun.listen> | null = null;
    let metroListener: ReturnType<typeof Bun.listen> | null = null;
    try {
      relayListener = Bun.listen({ hostname: '127.0.0.1', port: relayPort, socket: { data() {} } });
      metroListener = Bun.listen({ hostname: '127.0.0.1', port: relayPort + 1, socket: { data() {} } });
      return { relayPort, metroPort: relayPort + 1 };
    } catch {
      // Try the next aligned pair.
    } finally {
      relayListener?.stop(true);
      metroListener?.stop(true);
    }
  }
  throw new Error('Unable to find a free test port block');
}

beforeAll(async () => {
  await runDev(['down', '--json']);
  const started = await runDev(['up', '--json']);
  if (started.exitCode !== 0) {
    throw new Error(`dev:up failed during suite setup\n${started.stdout}${started.stderr}`);
  }
  state = json<{ state: State }>(started).state;
}, 30_000);

afterAll(async () => {
  const stopped = await runDev(['down', '--json']);
  if (stopped.exitCode !== 0) {
    throw new Error(`dev:down failed; preserving ownership state for safe recovery\n${stopped.stdout}${stopped.stderr}`);
  }
  if (state) await rm(state.stateDir, { recursive: true, force: true });
}, 30_000);

describe('public bun dev commands', () => {
  it('parses Darwin numeric process start time and exact argv/environment boundaries', () => {
    const bsdInfo = new Uint8Array(136);
    const bsdView = new DataView(bsdInfo.buffer);
    bsdView.setBigUint64(120, 1_723_456_789n, true);
    bsdView.setBigUint64(128, 123_456n, true);
    expect(parseDarwinBsdStartToken(bsdInfo)).toBe('darwin:1723456789:123456');

    const argv = ['/usr/bin/bun', '/tmp/work tree/dev.ts', '__supervisor', 'daemon'];
    const environment = [
      'LYNTTY_DEV_ROOT=/tmp/work tree',
      'LYNTTY_DEV_INSTANCE_ID=instance with spaces',
      'KEY=value with spaces',
    ];
    const strings = ['/usr/bin/bun', '', ...argv, ...environment].map(value => new TextEncoder().encode(`${value}\0`));
    const buffer = new Uint8Array(4 + strings.reduce((total, value) => total + value.length, 0));
    new DataView(buffer.buffer).setInt32(0, argv.length, true);
    let offset = 4;
    for (const value of strings) {
      buffer.set(value, offset);
      offset += value.length;
    }
    expect(parseKernProcargs2(buffer)).toEqual({ argv, environment });
    expect(pathIsInside('/tmp/work tree', '/tmp/work tree/packages/lyntty-app/android')).toBe(true);
    expect(pathIsInside('/tmp/work tree', '/tmp/work tree-other')).toBe(false);
  });

  it('rejects unsupported arguments at every public seam', async () => {
    for (const args of [
      ['up', '--unknown'],
      ['up', '--android', '--android'],
      ['check', '--android'],
      ['verify', 'extra'],
      ['down', '--json', '--json'],
    ]) {
      const result = await runDev(args);
      expect(result.exitCode).not.toBe(0);
    }
  });

  it('reports deterministic worktree-local identity and does not plan Android by default', async () => {
    const first = await runDev(['check', '--json']);
    const second = await runDev(['check', '--json']);
    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    const firstJson = json<{ canonicalRoot: string; worktreeHash: string; stateDir: string; androidRequested: boolean }>(first);
    const secondJson = json<{ canonicalRoot: string; worktreeHash: string; stateDir: string; androidRequested: boolean }>(second);
    expect(firstJson.canonicalRoot).toBe(secondJson.canonicalRoot);
    expect(firstJson.worktreeHash).toBe(secondJson.worktreeHash);
    expect(firstJson.stateDir).toBe(join(firstJson.canonicalRoot, 'dist', 'dev', firstJson.worktreeHash));
    expect(firstJson.androidRequested).toBe(false);
    expect(secondJson.androidRequested).toBe(false);
    expect(firstJson.stateDir).not.toContain('/.lyntty');
    expect(firstJson.stateDir).not.toContain('/.pi');
    expect(state?.androidRequested).toBe(false);
    expect(state?.supervisors.map(item => item.role).sort()).toEqual(['daemon', 'relay']);
  });

  it('retains an unexpired provisional allocation after its creator disappears and reclaims an expired free lease', async () => {
    const retainedPorts = await findFreePortBlock(58_000);
    const expiredPorts = await findFreePortBlock(59_000);
    const future = new Date(Date.now() + 30_000).toISOString();
    const past = new Date(Date.now() - 30_000).toISOString();
    const coordination = parseCoordination({
      schemaVersion: 1,
      allocations: [
        {
          schemaVersion: 1,
          status: 'provisional',
          canonicalRoot: '/tmp/crashed-worktree',
          worktreeHash: 'crashed',
          instanceId: 'crashed-instance',
          relayPort: retainedPorts.relayPort,
          metroPort: retainedPorts.metroPort,
          relayPid: 0,
          leaseExpiresAt: future,
          startedAt: new Date().toISOString(),
        },
        {
          schemaVersion: 1,
          status: 'provisional',
          canonicalRoot: '/tmp/expired-worktree',
          worktreeHash: 'expired',
          instanceId: 'expired-instance',
          relayPort: expiredPorts.relayPort,
          metroPort: expiredPorts.metroPort,
          relayPid: 0,
          leaseExpiresAt: past,
          startedAt: new Date().toISOString(),
        },
      ],
    });
    const reconciled = await reconcileCoordinationAllocations(coordination);
    expect(reconciled.allocations).toHaveLength(1);
    expect(reconciled.allocations[0]).toMatchObject({
      status: 'provisional',
      instanceId: 'crashed-instance',
      relayPort: retainedPorts.relayPort,
      metroPort: retainedPorts.metroPort,
    });
  });

  it('serializes concurrent fresh up commands under the worktree lifecycle lock', async () => {
    const stopped = await runDev(['down', '--json']);
    expect(stopped.exitCode).toBe(0);
    const [first, second] = await Promise.all([
      runDev(['up', '--json']),
      runDev(['up', '--json']),
    ]);
    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    const firstState = json<{ state: State }>(first).state;
    const secondState = json<{ state: State }>(second).state;
    expect(firstState.startedAt).toBe(secondState.startedAt);
    expect(firstState.supervisors.map(item => item.role).sort()).toEqual(['daemon', 'relay']);
    expect(secondState.supervisors.map(item => item.role).sort()).toEqual(['daemon', 'relay']);
  }, 20_000);

  it('rejects partial-role existing-state reuse without rewriting it as running', async () => {
    const statePath = join(state!.stateDir, 'state.json');
    const original = await readFile(statePath, 'utf8');
    const partial = JSON.parse(original) as State;
    partial.supervisors = partial.supervisors.filter(item => item.role !== 'daemon');
    await writeFile(statePath, `${JSON.stringify(partial, null, 2)}\n`);
    await chmod(statePath, 0o600);

    try {
      const up = await runDev(['up', '--json']);
      expect(up.exitCode).not.toBe(0);
      expect(json<{ error: string }>(up).error).toMatch(/missing live supervisor role: daemon/i);
      expect(JSON.parse(await readFile(statePath, 'utf8')).status).toBe('running');
    } finally {
      await writeFile(statePath, original);
      await chmod(statePath, 0o600);
    }
  });

  it('fails closed on an unowned live PID without signaling it', async () => {
    expect(state).not.toBeNull();
    const statePath = join(state!.stateDir, 'state.json');
    const original = await readFile(statePath, 'utf8');
    const corrupted = JSON.parse(original) as State;
    corrupted.supervisors[0] = { pid: process.pid, role: corrupted.supervisors[0]!.role };
    await writeFile(statePath, `${JSON.stringify(corrupted, null, 2)}\n`);
    await chmod(statePath, 0o600);

    try {
      const down = await runDev(['down', '--json']);
      expect(down.exitCode).not.toBe(0);
      expect(JSON.parse(original).status).toBe('running');
    } finally {
      await writeFile(statePath, original);
      await chmod(statePath, 0o600);
    }
    const restoredCheck = await runDev(['check', '--json']);
    expect(restoredCheck.exitCode).toBe(0);
  });

  it('stops live owned groups even when the persisted status is stopped', async () => {
    const statePath = join(state!.stateDir, 'state.json');
    const running = JSON.parse(await readFile(statePath, 'utf8')) as State;
    running.status = 'stopped';
    await writeFile(statePath, `${JSON.stringify(running, null, 2)}\n`);
    await chmod(statePath, 0o600);

    const down = await runDev(['down', '--json']);
    expect(down.exitCode).toBe(0);
    for (const supervisor of running.supervisors) {
      expect(await waitForNoNonZombieMembers(supervisor.pid)).toBe(true);
    }

    const restarted = await runDev(['up', '--json']);
    expect(restarted.exitCode).toBe(0);
    state = json<{ state: State }>(restarted).state;
  });

  it('waits for and stops an owned child after its supervisor exits', async () => {
    const statePath = join(state!.stateDir, 'state.json');
    const running = JSON.parse(await readFile(statePath, 'utf8')) as State;
    const daemon = running.supervisors.find(item => item.role === 'daemon');
    expect(daemon).toBeDefined();
    const child = await waitForNonZombieChild(daemon!.pid);
    expect(child).not.toBeNull();

    process.kill(daemon!.pid, 'SIGTERM');
    expect(await waitForPidGone(daemon!.pid)).toBe(true);
    expect((await processGroupRows()).some(row => row.pid === child!.pid && !row.stat.toUpperCase().includes('Z'))).toBe(true);

    const down = await runDev(['down', '--json']);
    expect(down.exitCode).toBe(0);
    expect(await waitForNoNonZombieMembers(daemon!.pid)).toBe(true);

    const restarted = await runDev(['up', '--json']);
    expect(restarted.exitCode).toBe(0);
    state = json<{ state: State }>(restarted).state;
  });

  it('runs the real isolated up/check/verify/down smoke', async () => {
    const check = await runDev(['check', '--json']);
    expect(check.exitCode).toBe(0);
    const checkJson = json<{ ok: boolean; relay: { healthy: boolean }; supervisors: Array<{ owned: boolean }> }>(check);
    expect(checkJson.ok).toBe(true);
    expect(checkJson.relay.healthy).toBe(true);
    expect(checkJson.supervisors.every(item => item.owned)).toBe(true);

    const verify = await runDev(['verify', '--json']);
    expect(verify.exitCode).toBe(0);
    const verifyJson = json<{ ok: boolean; machines: { count: number }; cli: { status: { running: boolean }; list: { usable: boolean } } }>(verify);
    expect(verifyJson.ok).toBe(true);
    expect(verifyJson.machines.count).toBe(1);
    expect(verifyJson.cli.status.running).toBe(true);
    expect(verifyJson.cli.list.usable).toBe(true);

    const down = await runDev(['down', '--json']);
    expect(down.exitCode).toBe(0);
    expect(json<{ ok: boolean; status: string }>(down)).toMatchObject({ ok: true, status: 'stopped' });
    for (const path of ['state.json', 'lyntty/access.key', 'lyntty/settings.json', 'evidence/verify.json']) {
      expect((await stat(join(state!.stateDir, path))).mode & 0o077).toBe(0);
    }
  });

  it('ignores a stale isolated daemon state and passes readiness verification repeatedly', async () => {
    expect(state).not.toBeNull();
    const daemonStatePath = join(state!.stateDir, 'lyntty', 'daemon.state.json');
    await writeFile(daemonStatePath, `${JSON.stringify({
      pid: process.pid,
      httpPort: 1,
      piExtensionToken: 'stale',
      startTime: 'stale',
      startedWithCliVersion: 'stale',
    })}\n`);
    await chmod(daemonStatePath, 0o600);

    const started = await runDev(['up', '--json']);
    expect(started.exitCode).toBe(0);
    state = json<{ state: State }>(started).state;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const verify = await runDev(['verify', '--json']);
      expect(verify.exitCode).toBe(0);
      expect(json<{ ok: boolean; machines: { count: number }; cli: { status: { running: boolean } } }>(verify)).toMatchObject({
        ok: true,
        machines: { count: 1 },
        cli: { status: { running: true } },
      });
    }
    const down = await runDev(['down', '--json']);
    expect(down.exitCode).toBe(0);
  }, 30_000);

  it('uses an atomic claim so reconciliation cannot delete an intent before receipt publication', async () => {
    expect(state).not.toBeNull();
    const launchDir = join(state!.stateDir, 'launches');
    const caller = Bun.spawn({
      cmd: [process.execPath, script, 'up', '--json'],
      cwd: join(import.meta.dir, '..'),
      env: {
        ...Bun.env,
        ...testEnvironment,
        LYNTTY_DEV_ALLOW_TEST_HOOKS: '1',
        LYNTTY_DEV_TEST_CLAIM_DELAY_ROLE: 'relay',
        LYNTTY_DEV_TEST_CLAIM_DELAY_MS: '5000',
      },
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
    });
    expect(await waitForLaunchFile(launchDir, 'claim-')).not.toBeNull();
    caller.kill('SIGKILL');
    expect(await caller.exited).not.toBe(0);

    const duringClaim = await runDev(['down', '--json']);
    expect(duringClaim.exitCode).not.toBe(0);
    expect(json<{ error: string }>(duringClaim).error).toMatch(/launch is in progress|claim is pending/i);
    expect(await waitForLaunchFile(launchDir, 'receipt-')).not.toBeNull();

    const down = await runDev(['down', '--json']);
    expect(down.exitCode).toBe(0);
    expect(await readdir(launchDir)).toEqual([]);
  }, 30_000);

  it('recovers a caller crash from supervisor receipts and stops every receipt-owned group', async () => {
    expect(state).not.toBeNull();
    const crashed = await runDev(['up', '--json'], {
      LYNTTY_DEV_ALLOW_TEST_HOOKS: '1',
      LYNTTY_DEV_TEST_CRASH_ROLE: 'daemon',
    });
    expect(crashed.exitCode).not.toBe(0);

    const launchDir = join(state!.stateDir, 'launches');
    const names = await readdir(launchDir);
    const receiptNames = names.filter(name => name.startsWith('receipt-') && name.endsWith('.json'));
    expect(receiptNames.length).toBeGreaterThan(0);
    const receiptPids: number[] = [];
    for (const name of receiptNames) {
      const path = join(launchDir, name);
      expect((await stat(path)).mode & 0o077).toBe(0);
      const receipt = JSON.parse(await readFile(path, 'utf8')) as { pid: number; role: string; processStartToken: string };
      expect(receipt.role).toBe('daemon');
      expect(receipt.processStartToken).toBeString();
      receiptPids.push(receipt.pid);
    }

    const down = await runDev(['down', '--json']);
    expect(down.exitCode).toBe(0);
    for (const pid of receiptPids) expect(await waitForNoNonZombieMembers(pid)).toBe(true);
    expect(await readdir(launchDir)).toEqual([]);
    expect(JSON.parse(await readFile(join(state!.stateDir, 'state.json'), 'utf8')).status).toBe('stopped');
  }, 30_000);
});
