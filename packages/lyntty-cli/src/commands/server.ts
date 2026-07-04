import chalk from 'chalk';
import { existsSync, rmSync, mkdirSync, readFileSync, writeFileSync, chmodSync, statSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { configuration } from '@/configuration';
import { updateSettings } from '@/persistence';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require_ = createRequire(import.meta.url);

const PRISMA_QUERY_ENGINE_FILES: Record<string, string> = {
    'arm64-darwin': 'libquery_engine-darwin-arm64.dylib.node',
    'x64-darwin': 'libquery_engine-darwin.dylib.node',
    'arm64-linux': 'libquery_engine-linux-arm64-openssl-3.0.x.so.node',
    'x64-linux': 'libquery_engine-debian-openssl-3.0.x.so.node',
    'x64-win32': 'query_engine-windows.dll.node',
};
const SERVER_PACKAGE_NAME = 'lyntty-relay-self-host';
const SETTINGS_WRITE_CONFIRM_FLAG = '--i-understand-this-will-modify-default-lyntty-settings';

interface ServerOptions {
    port: number;
    host: string;
    reset: boolean;
    persistServerUrl: boolean;
    allowSettingsWrite: boolean;
    masterSecret?: string;
}

interface ServerArtifacts {
    /** Path to the executable (or tsx entrypoint) used to run the server. */
    command: string;
    /** Extra args (e.g. tsx + script path for source mode). */
    prefixArgs: string[];
    /** Working directory for the spawn. */
    cwd: string;
    /** True when running the bundled bun binary; false when running from monorepo source. */
    bundled: boolean;
    /** Where this runnable came from. */
    source: 'package' | 'legacy-bundled' | 'source';
    /** Prisma's native query engine path for bun-compiled server binaries. */
    prismaQueryEngineLibrary?: string;
    /** Static web app directory served by the self-host server. */
    webappDir?: string;
}

interface LynttyServerPackageArtifact {
    command: string;
    prefixArgs?: string[];
    cwd: string;
    bundled?: boolean;
    source?: string;
    prismaQueryEngineLibrary?: string;
    webappDir?: string;
}

export async function handleServerCommand(args: string[]): Promise<void> {
    const opts = parseArgs(args);
    if (opts === null) return;

    const serverUrl = `http://${opts.host === '0.0.0.0' ? '127.0.0.1' : opts.host}:${opts.port}`;
    await ensureSettingsWriteAllowed(opts, serverUrl);

    const dataDir = path.join(configuration.lynttyHomeDir, 'server-data');
    const pgliteDir = path.join(dataDir, 'pglite');
    const secretFile = path.join(dataDir, 'master-secret');

    if (opts.reset && existsSync(dataDir)) {
        console.log(chalk.yellow(`Wiping ${dataDir}...`));
        rmSync(dataDir, { recursive: true, force: true });
    }

    mkdirSync(dataDir, { recursive: true });

    const masterSecret = opts.masterSecret ?? loadOrCreateMasterSecret(secretFile);

    const artifacts = resolveServerArtifacts();
    if (!artifacts) {
        console.error(chalk.red('Could not locate lyntty-relay.'));
        console.error(chalk.gray('  Expected one of:'));
        console.error(chalk.gray(`    - installed ${SERVER_PACKAGE_NAME} package`));
        console.error(chalk.gray(`    - legacy bundled binary at ${path.join(__dirname, '..', '..', 'tools', 'server', currentPlatform(), bundledBinaryName())}`));
        console.error(chalk.gray('    - sibling packages/lyntty-relay/sources/standalone.ts in the monorepo'));
        console.error(chalk.gray(`  For npm installs, run: npm install -g ${SERVER_PACKAGE_NAME}`));
        process.exit(1);
    }

    const staticDir = artifacts.webappDir ?? findWebappDir();

    console.log(chalk.cyan(`\n  lyntty server`));
    console.log(chalk.gray(`  data dir:   ${dataDir}`));
    console.log(chalk.gray(`  server url: ${serverUrl}`));
    console.log(chalk.gray(`  mode:       ${serverArtifactMode(artifacts)}`));
    if (staticDir) {
        console.log(chalk.gray(`  webapp:     ${staticDir}`));
    } else {
        console.log(chalk.yellow('  webapp:     (no build) — API only. Run `pnpm bundle:webapp` to build.'));
    }
    console.log();

    const env: NodeJS.ProcessEnv = {
        ...process.env,
        DB_PROVIDER: 'pglite',
        DATA_DIR: dataDir,
        PGLITE_DIR: pgliteDir,
        HANDY_MASTER_SECRET: masterSecret,
        PORT: String(opts.port),
        HOST: opts.host,
    };
    if (staticDir) env.LYNTTY_STATIC_DIR = staticDir;
    env.LYNTTY_INJECT_HTML_CONFIG = JSON.stringify({
        serverUrl,
        disableAnalytics: true,
    });

    // The bundled bun binary can't embed Prisma's native query engine. Source/dev
    // mode resolves the engine from node_modules normally, but bundled mode needs
    // an explicit path because bun's bunfs execPath defeats Prisma's search.
    if (artifacts.bundled) {
        const prismaEngine = artifacts.prismaQueryEngineLibrary ?? resolvePrismaQueryEngineLibrary(artifacts.cwd);
        if (!prismaEngine) {
            console.error(chalk.red('Could not locate the Prisma query engine for this platform.'));
            if (artifacts.source === 'package') {
                console.error(chalk.gray(`  Expected ${SERVER_PACKAGE_NAME} to install @prisma/engines.`));
                console.error(chalk.gray(`  Try reinstalling ${SERVER_PACKAGE_NAME}, then run \`lyntty server\` again.`));
            } else {
                console.error(chalk.gray('  Expected @prisma/engines to be available near the lyntty package.'));
                console.error(chalk.gray('  Try reinstalling lyntty, then run `lyntty server` again.'));
            }
            process.exit(1);
        }
        env.PRISMA_QUERY_ENGINE_LIBRARY = prismaEngine;
    }

    console.log(chalk.gray('Running migrations...'));
    await runMigrationsWithRecovery(artifacts, env, pgliteDir);

    if (opts.persistServerUrl) {
        // The bundled server serves the webapp at its own origin, so webappUrl === serverUrl.
        // Without this the CLI's auth flow would open the prod webapp (app.lyntty.engineering).
        await updateSettings(current => ({ ...current, serverUrl, webappUrl: serverUrl }));
        console.log(chalk.gray(`Wrote serverUrl + webappUrl=${serverUrl} to ${configuration.settingsFile}`));
    }

    console.log(chalk.gray('Starting server...'));
    const child = spawnBackground(artifacts, env, ['serve']);

    console.log();
    console.log(chalk.green.bold(`✓ lyntty-relay starting at ${serverUrl}`));
    if (staticDir) {
        console.log(chalk.green(`  Open ${serverUrl} in your browser.`));
    }
    if (opts.persistServerUrl) {
        console.log(chalk.gray('  lyntty CLI + daemon will use this server automatically (settings.serverUrl).'));
    }
    console.log(chalk.gray('  Press Ctrl-C to stop.'));
    console.log();

    const forwardSignal = (sig: NodeJS.Signals) => {
        if (!child.killed) child.kill(sig);
    };
    process.on('SIGINT', () => forwardSignal('SIGINT'));
    process.on('SIGTERM', () => forwardSignal('SIGTERM'));

    const exitCode = await new Promise<number>(resolve => {
        child.on('exit', code => {
            console.log(chalk.gray(`\nlyntty-relay exited (code ${code ?? 0})`));
            resolve(code ?? 0);
        });
    });
    process.exit(exitCode);
}

function parseArgs(args: string[]): ServerOptions | null {
    let port = 3005;
    let host = '127.0.0.1';
    let reset = false;
    let persistServerUrl = true;
    let allowSettingsWrite = false;
    let masterSecret: string | undefined;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '-h' || arg === '--help') {
            showHelp();
            return null;
        } else if (arg === '--port' || arg === '-p') {
            port = parseInt(args[++i], 10);
            if (Number.isNaN(port)) {
                console.error(chalk.red('Invalid --port'));
                process.exit(1);
            }
        } else if (arg === '--host') {
            host = args[++i];
        } else if (arg === '--reset') {
            reset = true;
        } else if (arg === '--no-persist') {
            persistServerUrl = false;
        } else if (arg === SETTINGS_WRITE_CONFIRM_FLAG) {
            allowSettingsWrite = true;
        } else if (arg === '--master-secret') {
            masterSecret = args[++i];
        } else {
            console.error(chalk.red(`Unknown arg: ${arg}`));
            showHelp();
            process.exit(1);
        }
    }

    return { port, host, reset, persistServerUrl, allowSettingsWrite, masterSecret };
}

function showHelp() {
    console.log(`
${chalk.bold('lyntty server')} - Run Lyntty sync server + web app locally (self-host)

${chalk.bold('Usage:')}
  lyntty server [--port 3005] [--host 127.0.0.1] [--reset] [--no-persist]

${chalk.bold('Options:')}
  --port, -p <n>        Port to listen on (default: 3005)
  --host <ip>           Host to bind (default: 127.0.0.1)
  --reset               Wipe local server data before starting
  --no-persist          Don't write serverUrl into settings.json
  ${SETTINGS_WRITE_CONFIRM_FLAG}
                        Write settings.serverUrl/settings.webappUrl without prompting
  --master-secret <hex> Use a specific master secret (default: auto-generated)

${chalk.bold('Notes:')}
  - Stores data in ${chalk.cyan('$LYNTTY_HOME_DIR/server-data/')}
  - Packaged installs require ${chalk.cyan(SERVER_PACKAGE_NAME)} for the local server binary
  - By default, asks before writing ${chalk.cyan('settings.serverUrl')} and ${chalk.cyan('settings.webappUrl')}
  - Use ${chalk.cyan('--no-persist')} to run without modifying default Lyntty settings
  - Open ${chalk.cyan('http://127.0.0.1:<port>')} for the web app (if bundled)
`);
}

async function ensureSettingsWriteAllowed(opts: ServerOptions, serverUrl: string): Promise<void> {
    if (!opts.persistServerUrl || opts.allowSettingsWrite) {
        return;
    }

    const message =
        `lyntty server will write settings.serverUrl and settings.webappUrl to ${serverUrl} ` +
        `in ${configuration.settingsFile}.`;

    if (!process.stdin.isTTY || !process.stderr.isTTY) {
        console.error(chalk.red('Refusing to modify default Lyntty settings from a non-interactive run.'));
        console.error(chalk.gray(message));
        console.error(chalk.gray(`Re-run with --no-persist, or pass ${SETTINGS_WRITE_CONFIRM_FLAG}.`));
        process.exit(1);
    }

    const rl = createInterface({ input: process.stdin, output: process.stderr });
    try {
        const answer = await rl.question(`${chalk.yellow(message)} Continue? ${chalk.gray('[y/N]')} `);
        const normalized = answer.trim().toLowerCase();
        if (normalized !== 'y' && normalized !== 'yes') {
            console.error(chalk.gray('Cancelled. Re-run with --no-persist to start without changing settings.'));
            process.exit(1);
        }
    } finally {
        rl.close();
    }
}

function loadOrCreateMasterSecret(file: string): string {
    if (existsSync(file)) {
        return readFileSync(file, 'utf8').trim();
    }
    const secret = randomBytes(32).toString('hex');
    writeFileSync(file, secret, { mode: 0o600 });
    return secret;
}

function currentPlatform(): string {
    return `${process.arch}-${process.platform}`;
}

function resolvePrismaQueryEngineLibrary(bundledServerDir: string): string | undefined {
    const fromDependency = findPrismaEngineFromDependency();
    if (fromDependency) {
        return fromDependency;
    }

    // Backward-compatible local fallback for bundles produced before the engine
    // moved to @prisma/engines as a CLI dependency.
    const legacyBundledEngine = path.join(bundledServerDir, 'libquery_engine.node');
    return existsSync(legacyBundledEngine) ? legacyBundledEngine : undefined;
}

function findPrismaEngineFromDependency(): string | undefined {
    const engineFile = PRISMA_QUERY_ENGINE_FILES[currentPlatform()];
    if (!engineFile) {
        return undefined;
    }

    try {
        const enginesPackage = require_.resolve('@prisma/engines/package.json');
        const candidate = path.join(path.dirname(enginesPackage), engineFile);
        return existsSync(candidate) ? candidate : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Path to tools/<name>/ shipped alongside the CLI.
 *
 * pkgroll bundles into dist/, so __dirname at runtime is .../lyntty-cli/dist; tools/ lives
 * at .../lyntty-cli/tools. In rare layouts (e.g. running un-built source via tsx from src/
 * commands/), tools/ sits at .../lyntty-cli/tools and __dirname is .../lyntty-cli/src/commands,
 * so we walk up until we find a directory that contains tools/.
 */
function resolveToolsPath(name: string): string {
    let dir = __dirname;
    for (let i = 0; i < 5; i++) {
        const candidate = path.join(dir, 'tools', name);
        if (existsSync(candidate)) return candidate;
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return path.resolve(__dirname, '..', 'tools', name);
}

function bundledBinaryName(): string {
    return process.platform === 'win32' ? 'lyntty-relay.exe' : 'lyntty-relay';
}

function ensureExecutable(file: string): void {
    if (process.platform === 'win32') return;
    try {
        const mode = statSync(file).mode;
        // 0o111 = any execute bit. npm tarballs sometimes lose the executable bit
        // (mode preservation differs across npm/pnpm/yarn versions), so re-apply it here.
        if ((mode & 0o111) === 0) chmodSync(file, mode | 0o755);
    } catch {
        // best-effort — spawn will surface a clearer error if this fails
    }
}

function serverArtifactMode(artifacts: ServerArtifacts): string {
    if (artifacts.source === 'package') return SERVER_PACKAGE_NAME;
    if (artifacts.source === 'legacy-bundled') return 'legacy bundled';
    return 'source (dev)';
}

/**
 * Resolves the artifacts needed to spawn lyntty-relay.
 *
 * Order:
 *   1. lyntty-relay-self-host package (npm-installed local server artifact)
 *   2. Legacy bundled binary at tools/server/<platform>/lyntty-relay
 *   3. Source-mode fallback for monorepo dev: ../lyntty-relay/sources/standalone.ts via tsx
 */
function resolveServerArtifacts(): ServerArtifacts | undefined {
    const packageArtifact = resolveInstalledServerPackage();
    if (packageArtifact) return packageArtifact;

    const toolsRoot = resolveToolsPath('server');
    const binDir = path.join(toolsRoot, currentPlatform());
    const binary = path.join(binDir, bundledBinaryName());
    if (existsSync(binary)) {
        ensureExecutable(binary);
        return { command: binary, prefixArgs: [], cwd: binDir, bundled: true, source: 'legacy-bundled' };
    }

    const sourceEntry = findSourceStandalone();
    if (sourceEntry) {
        const tsx = findTsxBinary(path.dirname(path.dirname(sourceEntry)));
        const useNode = tsx !== 'tsx';
        return {
            command: useNode ? process.execPath : 'tsx',
            prefixArgs: useNode ? [tsx, sourceEntry] : [sourceEntry],
            cwd: path.dirname(path.dirname(sourceEntry)),
            bundled: false,
            source: 'source',
        };
    }

    return undefined;
}

function resolveInstalledServerPackage(): ServerArtifacts | undefined {
    try {
        const serverPackage = require_(SERVER_PACKAGE_NAME) as {
            resolveServerArtifact?: () => LynttyServerPackageArtifact | undefined;
        };
        const artifact = serverPackage.resolveServerArtifact?.();
        if (!artifact || !artifact.command || !existsSync(artifact.command)) {
            return undefined;
        }
        return {
            command: artifact.command,
            prefixArgs: artifact.prefixArgs ?? [],
            cwd: artifact.cwd,
            bundled: artifact.bundled ?? true,
            source: 'package',
            prismaQueryEngineLibrary: artifact.prismaQueryEngineLibrary,
            webappDir: artifact.webappDir,
        };
    } catch {
        return undefined;
    }
}

function findSourceStandalone(): string | undefined {
    const candidates = [
        path.resolve(__dirname, '../../../lyntty-relay/sources/standalone.ts'),
        path.resolve(__dirname, '../../lyntty-relay/sources/standalone.ts'),
        path.resolve(process.cwd(), 'packages/lyntty-relay/sources/standalone.ts'),
        path.resolve(process.cwd(), '../lyntty-relay/sources/standalone.ts'),
    ];
    for (const c of candidates) {
        if (existsSync(c)) return c;
    }
    return undefined;
}

function findWebappDir(): string | undefined {
    const bundled = resolveToolsPath('webapp');
    if (existsSync(path.join(bundled, 'index.html'))) return bundled;

    const candidates = [
        path.resolve(__dirname, '../../../lyntty-app/dist'),
        path.resolve(__dirname, '../../lyntty-app/dist'),
        path.resolve(process.cwd(), 'packages/lyntty-app/dist'),
    ];
    for (const c of candidates) {
        if (existsSync(path.join(c, 'index.html'))) return c;
    }
    return undefined;
}

function findTsxBinary(cwd: string): string {
    try {
        return require_.resolve('tsx/cli', { paths: [cwd] });
    } catch {
        return 'tsx';
    }
}

class SpawnExitError extends Error {
    constructor(message: string, readonly output: string) {
        super(message);
        this.name = 'SpawnExitError';
    }
}

async function spawnAndWaitWithOutput(art: ServerArtifacts, env: NodeJS.ProcessEnv, args: string[]): Promise<string> {
    const cmdArgs = [...art.prefixArgs, ...args];
    return new Promise<string>((resolve, reject) => {
        const child = spawn(art.command, cmdArgs, { cwd: art.cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
        const chunks: string[] = [];
        const collect = (chunk: Buffer) => {
            const text = chunk.toString('utf8');
            chunks.push(text);
            return text;
        };
        child.stdout?.on('data', (chunk: Buffer) => process.stdout.write(collect(chunk)));
        child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(collect(chunk)));
        child.on('error', reject);
        child.on('exit', code => {
            const output = chunks.join('');
            if (code === 0) resolve(output);
            else reject(new SpawnExitError(`lyntty-relay ${args[0]} exited with code ${code}`, output));
        });
    });
}

export function isPgliteOpenAbort(output: string): boolean {
    return output.includes('RuntimeError: Aborted()') && output.includes('_checkReady');
}

function backupPgliteDir(pgliteDir: string): string {
    const suffix = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = `${pgliteDir}.unopenable-${suffix}`;
    renameSync(pgliteDir, backupDir);
    return backupDir;
}

async function confirmPgliteRecovery(pgliteDir: string): Promise<boolean> {
    if (!process.stdin.isTTY || !process.stderr.isTTY) {
        console.error(chalk.red('PGlite database could not be opened.'));
        console.error(chalk.gray(`  Database: ${pgliteDir}`));
        console.error(chalk.gray('  Run `lyntty server --reset` to wipe local relay data, or move the pglite directory aside and retry.'));
        return false;
    }

    const rl = createInterface({ input: process.stdin, output: process.stderr });
    try {
        const answer = await rl.question(
            chalk.yellow(`PGlite database at ${pgliteDir} could not be opened. Move it aside and create a fresh local relay database? `) +
            chalk.gray('[y/N] '),
        );
        const normalized = answer.trim().toLowerCase();
        return normalized === 'y' || normalized === 'yes';
    } finally {
        rl.close();
    }
}

async function runMigrationsWithRecovery(artifacts: ServerArtifacts, env: NodeJS.ProcessEnv, pgliteDir: string): Promise<void> {
    try {
        await spawnAndWaitWithOutput(artifacts, env, ['migrate']);
        return;
    } catch (error) {
        if (!(error instanceof SpawnExitError) || !isPgliteOpenAbort(error.output) || !existsSync(pgliteDir)) {
            throw error;
        }
        const shouldRecover = await confirmPgliteRecovery(pgliteDir);
        if (!shouldRecover) {
            throw error;
        }
        const backupDir = backupPgliteDir(pgliteDir);
        console.error(chalk.yellow(`Moved unopenable PGlite database to ${backupDir}`));
        mkdirSync(pgliteDir, { recursive: true });
        await spawnAndWaitWithOutput(artifacts, env, ['migrate']);
    }
}

function spawnBackground(art: ServerArtifacts, env: NodeJS.ProcessEnv, args: string[]): ChildProcess {
    const cmdArgs = [...art.prefixArgs, ...args];
    return spawn(art.command, cmdArgs, { cwd: art.cwd, env, stdio: 'inherit' });
}
