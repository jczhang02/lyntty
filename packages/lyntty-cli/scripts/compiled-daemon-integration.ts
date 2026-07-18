import { generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const packageDir = resolve(import.meta.dir, '..');
const repoRoot = resolve(packageDir, '..', '..');
const relayBinary = join(repoRoot, 'packages', 'lyntty-relay', 'dist', 'lyntty-relay');
const cliBinary = join(packageDir, 'dist', 'compiled', process.platform === 'win32' ? 'lyntty.exe' : 'lyntty');
const daemonBinary = join(packageDir, 'dist', 'compiled', process.platform === 'win32' ? 'lynttyd.exe' : 'lynttyd');
const gateBase = join(packageDir, 'dist', 'test-state');
await mkdir(gateBase, { recursive: true });
const gateDir = await mkdtemp(join(gateBase, 'compiled-daemon-'));
const homeDir = join(gateDir, 'home');
const lynttyHomeDir = join(gateDir, 'lyntty');
const pgliteDir = join(gateDir, 'relay', 'pglite');
const sentinelDir = join(gateDir, 'sentinel-bin');
const sentinelLog = join(gateDir, 'runtime-sentinel.log');
const daemonStateFile = join(lynttyHomeDir, 'daemon.state.json');
let relayProcess: Bun.Subprocess | null = null;
let foregroundDaemon: Bun.Subprocess | null = null;

function allocatePort(): number {
    const listener = Bun.listen({
        hostname: '127.0.0.1',
        port: 0,
        socket: { data() {} },
    });
    const port = listener.port;
    listener.stop(true);
    return port;
}

async function waitFor(description: string, condition: () => boolean | Promise<boolean>, timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await condition()) return;
        await Bun.sleep(50);
    }
    throw new Error(`Timed out waiting for ${description}`);
}

async function run(command: string[], env: Record<string, string>): Promise<string> {
    const child = Bun.spawn(command, {
        cwd: repoRoot,
        env,
        stdout: 'pipe',
        stderr: 'pipe',
    });
    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
    ]);
    if (exitCode !== 0) {
        throw new Error(`${command.join(' ')} failed (${exitCode})\n${stdout}\n${stderr}`);
    }
    return `${stdout}${stderr}`;
}

function processIsAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

async function readDaemonPid(): Promise<number | null> {
    try {
        const state = JSON.parse(await readFile(daemonStateFile, 'utf8')) as { pid?: unknown };
        return typeof state.pid === 'number' && Number.isInteger(state.pid) ? state.pid : null;
    } catch {
        return null;
    }
}

async function cleanup(): Promise<void> {
    const daemonPid = await readDaemonPid();
    if (daemonPid && processIsAlive(daemonPid)) {
        try { process.kill(daemonPid, 'SIGTERM'); } catch {}
        await waitFor('daemon cleanup', () => !processIsAlive(daemonPid), 5_000).catch(() => undefined);
    }
    if (foregroundDaemon) {
        foregroundDaemon.kill('SIGTERM');
        await foregroundDaemon.exited.catch(() => undefined);
        foregroundDaemon = null;
    }
    if (relayProcess) {
        relayProcess.kill('SIGTERM');
        await relayProcess.exited.catch(() => undefined);
        relayProcess = null;
    }
    await rm(gateDir, { recursive: true, force: true });
}

try {
    await mkdir(homeDir, { recursive: true });
    await mkdir(lynttyHomeDir, { recursive: true });
    await mkdir(sentinelDir, { recursive: true });

    const sentinel = `#!/usr/bin/env bash\nprintf '%s\\n' "$(basename "$0")" >> ${JSON.stringify(sentinelLog)}\nexit 97\n`;
    for (const executable of ['bun', 'node', 'npm', 'pnpm', 'npx', 'tsx']) {
        const file = join(sentinelDir, executable);
        await writeFile(file, sentinel);
        await chmod(file, 0o755);
    }

    const port = allocatePort();
    const relayUrl = `http://127.0.0.1:${port}`;
    const baseEnv = Object.fromEntries(
        Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
    );
    const relayEnv = {
        ...baseEnv,
        HOME: homeDir,
        DATA_DIR: join(gateDir, 'relay'),
        PGLITE_DIR: pgliteDir,
        DB_PROVIDER: 'pglite',
        LYNTTY_MASTER_SECRET: 'compiled-daemon-integration-local-only',
        HOST: '127.0.0.1',
        PORT: String(port),
    };

    await run([relayBinary, 'migrate'], relayEnv);
    relayProcess = Bun.spawn([relayBinary, 'serve'], {
        cwd: repoRoot,
        env: relayEnv,
        stdout: 'pipe',
        stderr: 'pipe',
    });
    await waitFor('Relay health', async () => {
        if (relayProcess && await Promise.race([
            relayProcess.exited.then(() => true),
            Bun.sleep(0).then(() => false),
        ])) {
            throw new Error('Relay exited before becoming healthy');
        }
        return fetch(`${relayUrl}/health`).then(response => response.ok, () => false);
    });

    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const jwk = publicKey.export({ format: 'jwk' }) as { x?: string };
    if (!jwk.x) throw new Error('Failed to export test public key');
    const rawPublicKey = Buffer.from(jwk.x, 'base64url');
    const challenge = randomBytes(32);
    const signature = sign(null, challenge, privateKey);
    const authResponse = await fetch(`${relayUrl}/v1/auth`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            publicKey: rawPublicKey.toString('base64'),
            challenge: challenge.toString('base64'),
            signature: signature.toString('base64'),
        }),
    });
    if (!authResponse.ok) {
        throw new Error(`Relay auth failed: ${authResponse.status} ${await authResponse.text()}`);
    }
    const auth = await authResponse.json() as { token?: unknown };
    if (typeof auth.token !== 'string' || !auth.token) throw new Error('Relay returned no auth token');

    await writeFile(join(lynttyHomeDir, 'access.key'), JSON.stringify({
        secret: randomBytes(32).toString('base64'),
        token: auth.token,
    }));
    await chmod(join(lynttyHomeDir, 'access.key'), 0o600);
    await writeFile(join(lynttyHomeDir, 'settings.json'), JSON.stringify({
        schemaVersion: 2,
        onboardingCompleted: true,
        machineId: randomUUID(),
    }));

    const runtimeEnv = {
        ...baseEnv,
        HOME: homeDir,
        USERPROFILE: homeDir,
        LYNTTY_HOME_DIR: lynttyHomeDir,
        LYNTTY_SERVER_URL: relayUrl,
        LYNTTY_DISABLE_CAFFEINATE: '1',
        PATH: `${sentinelDir}:${baseEnv.PATH ?? ''}`,
    };

    foregroundDaemon = Bun.spawn([daemonBinary], {
        cwd: repoRoot,
        env: runtimeEnv,
        stdout: 'pipe',
        stderr: 'pipe',
    });
    await waitFor('standalone lynttyd state', async () => {
        const pid = await readDaemonPid();
        return pid !== null && processIsAlive(pid);
    });

    const statusOutput = await run([cliBinary, 'daemon', 'status'], runtimeEnv);
    if (!statusOutput.toLowerCase().includes('running')) {
        throw new Error(`Daemon status did not report running: ${statusOutput}`);
    }
    const listOutput = await run([cliBinary, 'daemon', 'list'], runtimeEnv);
    if (!listOutput.includes('No active sessions')) {
        throw new Error(`Fresh daemon did not report an empty session list: ${listOutput}`);
    }

    const machinesResponse = await fetch(`${relayUrl}/v1/machines`, {
        headers: { authorization: `Bearer ${auth.token}` },
    });
    const machines = await machinesResponse.json() as unknown;
    if (!machinesResponse.ok || !Array.isArray(machines) || machines.length !== 1) {
        throw new Error('Daemon did not register exactly one isolated machine');
    }

    const firstDaemonPid = await readDaemonPid();
    await run([cliBinary, 'daemon', 'stop'], runtimeEnv);
    if (firstDaemonPid) {
        await waitFor('compiled CLI daemon shutdown', () => !processIsAlive(firstDaemonPid));
    }
    await foregroundDaemon.exited;
    foregroundDaemon = null;

    foregroundDaemon = Bun.spawn([daemonBinary], {
        cwd: repoRoot,
        env: runtimeEnv,
        stdout: 'pipe',
        stderr: 'pipe',
    });
    await waitFor('compiled lynttyd state', async () => {
        const pid = await readDaemonPid();
        return pid === foregroundDaemon?.pid && processIsAlive(pid);
    });
    await run([cliBinary, 'daemon', 'stop'], runtimeEnv);
    await waitFor('compiled lynttyd shutdown', async () => {
        const pid = await readDaemonPid();
        return pid === null || !processIsAlive(pid);
    });
    await foregroundDaemon.exited;
    foregroundDaemon = null;

    const sentinelHits = await readFile(sentinelLog, 'utf8').catch(() => '');
    if (sentinelHits.trim()) {
        throw new Error(`Compiled runtime invoked forbidden executables: ${sentinelHits.trim()}`);
    }

    console.log('compiled CLI/lynttyd daemon integration passed');
} finally {
    await cleanup();
}
