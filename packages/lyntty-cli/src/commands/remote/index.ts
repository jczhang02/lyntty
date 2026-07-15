import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { installLynttyPiExtension, lynttyPiExtensionPath } from '@/pi/piExtensionInstall';
import { loadConfig, type Config } from './config';
import { requireCredentials, type Credentials } from './credentials';
import { authLogin, authLogout, authStatus } from './auth';
import {
    createSession,
    getSessionMessages,
    postSessionUserMessage,
    listActiveSessions,
    listMachines,
    listSessions,
    type DecryptedMachine,
    type DecryptedSession,
} from './api';
import { spawnSessionOnMachine } from './machineRpc';
import { SessionClient } from './session';
import {
    formatJson,
    formatMachineTable,
    formatMessageHistory,
    formatSessionStatus,
    formatSessionTable,
} from './output';

/**
 * Remote control is intentionally a Pi-only command surface.  It lives in the
 * CLI package so the published CLI has one entry point and one set of relay
 * credentials; the remote control surface is part of the CLI package.
 */
export async function handleRemoteCommand(args: string[]): Promise<void> {
    const command = args[0] ?? 'install';

    switch (command) {
        case 'install':
            await handleInstall(args.slice(1));
            return;
        case 'auth':
            await handleAuth(args.slice(1));
            return;
        case 'machines':
            await handleMachines(args.slice(1));
            return;
        case 'list':
            await handleList(args.slice(1));
            return;
        case 'status':
            await handleStatus(args.slice(1));
            return;
        case 'spawn':
            await handleSpawn(args.slice(1));
            return;
        case 'resume':
            await handleResume(args.slice(1));
            return;
        case 'create':
            await handleCreate(args.slice(1));
            return;
        case 'send':
            await handleSend(args.slice(1));
            return;
        case 'history':
            await handleHistory(args.slice(1));
            return;
        case 'stop':
            await handleStop(args.slice(1));
            return;
        case 'wait':
            await handleWait(args.slice(1));
            return;
        case 'help':
        case '--help':
        case '-h':
            showRemoteHelp();
            return;
        default:
            throw new Error(`Unknown remote subcommand: ${command}\n\n${remoteUsage()}`);
    }
}

async function handleInstall(args: string[]): Promise<void> {
    if (hasHelp(args)) {
        console.log('Usage: lyntty remote install');
        return;
    }
    if (args.length > 0) {
        throw new Error(`Unknown remote install argument: ${args[0]}`);
    }
    const result = await installLynttyPiExtension();
    console.log(`${result.changed ? 'Installed' : 'Already installed'} Lyntty Pi extension: ${result.path}`);
}

async function handleAuth(args: string[]): Promise<void> {
    const command = args[0] ?? 'help';
    if (command === 'help' || hasHelp(args)) {
        showAuthHelp();
        return;
    }
    const config = loadConfig();
    switch (command) {
        case 'login':
            assertNoExtraArgs(args.slice(1), 'remote auth login');
            await authLogin(config);
            return;
        case 'logout':
            assertNoExtraArgs(args.slice(1), 'remote auth logout');
            await authLogout(config);
            return;
        case 'status':
            assertNoExtraArgs(args.slice(1), 'remote auth status');
            await authStatus(config);
            return;
        default:
            throw new Error(`Unknown remote auth subcommand: ${command}\n\n${authUsage()}`);
    }
}

async function handleMachines(args: string[]): Promise<void> {
    const parsed = parseOptions(args, {
        boolean: new Set(['active', 'json']),
        value: new Set(),
    });
    if (parsed.help) {
        console.log('Usage: lyntty remote machines [--active] [--json]');
        return;
    }
    const config = loadConfig();
    const creds = requireCredentials(config);
    const machines = await listMachines(config, creds);
    const filtered = parsed.flags.active ? machines.filter(machine => machine.active) : machines;
    console.log(parsed.flags.json ? formatJson(filtered) : formatMachineTable(filtered));
}

async function handleList(args: string[]): Promise<void> {
    const parsed = parseOptions(args, {
        boolean: new Set(['active', 'json']),
        value: new Set(),
    });
    if (parsed.help) {
        console.log('Usage: lyntty remote list [--active] [--json]');
        return;
    }
    const config = loadConfig();
    const creds = requireCredentials(config);
    const sessions = parsed.flags.active
        ? await listActiveSessions(config, creds)
        : await listSessions(config, creds);
    console.log(parsed.flags.json ? formatJson(sessions) : formatSessionTable(sessions));
}

async function handleStatus(args: string[]): Promise<void> {
    const parsed = parseOptions(args, {
        boolean: new Set(['json']),
        value: new Set(),
    });
    if (parsed.help) {
        console.log('Usage: lyntty remote status [<session-id>] [--json]');
        console.log('       lyntty remote status          Show the installed Pi extension path');
        return;
    }

    // Keep the extension status behavior of the old command.  A session ID
    // turns the same verb into live relay session status.
    const sessionId = requireSinglePositional(parsed.positionals, 'session-id', false);
    if (!sessionId) {
        console.log(`Lyntty Pi extension path: ${lynttyPiExtensionPath()}`);
        return;
    }

    const config = loadConfig();
    const creds = requireCredentials(config);
    const session = await resolveSession(config, creds, sessionId);
    const client = createClient(session, creds, config);
    let liveData = false;
    try {
        await new Promise<void>(resolve => {
            let settled = false;
            const done = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                client.removeAllListeners('state-change');
                client.removeAllListeners('connect_error');
                resolve();
            };
            const timeout = setTimeout(done, 3_000);
            client.once('state-change', (data: { metadata: unknown; agentState: unknown }) => {
                session.metadata = data.metadata ?? session.metadata;
                session.agentState = data.agentState ?? session.agentState;
                liveData = true;
                done();
            });
            client.once('connect_error', done);
        });
    } finally {
        client.close();
    }

    if (parsed.flags.json) {
        console.log(formatJson(session));
    } else {
        if (!liveData) console.log('> Note: showing cached data (could not get live status).');
        console.log(formatSessionStatus(session));
    }
}

async function handleSpawn(args: string[]): Promise<void> {
    const parsed = parseOptions(args, {
        boolean: new Set(['create-dir', 'json']),
        value: new Set(['machine', 'path', 'agent']),
    });
    if (parsed.help) {
        console.log(`Usage: lyntty remote spawn --machine <machine-id> [--path <path>] [--create-dir] [--json]

Pi is always used; --agent is not a supported runtime selector.`);
        return;
    }
    const machineId = requiredValue(parsed, 'machine');
    if (parsed.values.agent !== undefined && parsed.values.agent !== 'pi') {
        throw new Error('lyntty remote spawn only supports agent `pi`; legacy agents are not supported.');
    }

    const config = loadConfig();
    const creds = requireCredentials(config);
    const machine = await resolveMachine(config, creds, machineId);
    const directory = resolveRemotePath(parsed.values.path, machine);
    const result = await spawnSessionOnMachine(config, machine, creds.token, {
        directory,
        approvedNewDirectoryCreation: parsed.flags['create-dir'] === true,
        agent: 'pi',
    });
    const payload = { machineId: machine.id, directory, agent: 'pi' as const, ...result };

    if (parsed.flags.json) {
        console.log(formatJson(payload));
        if (result.type !== 'success') process.exitCode = 1;
        return;
    }
    switch (result.type) {
        case 'success':
            console.log([
                '## Session Spawned',
                '',
                `- Machine ID: \`${machine.id}\``,
                `- Session ID: \`${result.sessionId}\``,
                `- Path: ${directory}`,
                '- Agent: pi',
            ].join('\n'));
            return;
        case 'requestToApproveDirectoryCreation':
            throw new Error(`The directory '${result.directory}' does not exist. Re-run with --create-dir to allow creating it.`);
        case 'error':
            throw new Error(result.errorMessage);
    }
}

async function handleResume(args: string[]): Promise<void> {
    const parsed = parseOptions(args, { boolean: new Set(['json']), value: new Set(['takeover']) });
    if (parsed.help) {
        console.log('Usage: lyntty remote resume <session-id> [--takeover wait|stop|interrupt] [--json]');
        return;
    }
    const sessionId = requireSessionId(parsed.positionals);
    const takeoverChoice = parseTakeoverChoice(parsed.values.takeover);
    const config = loadConfig();
    const creds = requireCredentials(config);
    const session = await resolveSession(config, creds, sessionId);
    const machineId = resolveSessionMachineId(session);
    const piSessionId = resolvePiSessionId(session);
    const directory = resolveSessionDirectory(session);
    const machine = await resolveMachine(config, creds, machineId);
    ensureMachineCanResume(machine);
    const result = await spawnSessionOnMachine(config, machine, creds.token, {
        directory,
        sessionId: piSessionId,
        approvedNewDirectoryCreation: false,
        agent: 'pi',
        takeoverChoice,
    });
    const payload = { sourceSessionId: session.id, machineId: machine.id, piSessionId, agent: 'pi' as const, ...result };

    if (parsed.flags.json) {
        console.log(formatJson(payload));
        if (result.type !== 'success') process.exitCode = 1;
        return;
    }
    switch (result.type) {
        case 'success':
            console.log([
                '## Session Resumed',
                '',
                `- Machine ID: \`${machine.id}\``,
                `- Source Session ID: \`${session.id}\``,
                `- Resumed Session ID: \`${result.sessionId}\``,
                '- Agent: pi',
            ].join('\n'));
            return;
        case 'requestToApproveDirectoryCreation':
            throw new Error(`Resume unexpectedly requested directory creation for '${result.directory}'. Resume should reuse the saved path.`);
        case 'error':
            throw new Error(result.errorMessage);
    }
}

async function handleCreate(args: string[]): Promise<void> {
    const parsed = parseOptions(args, { boolean: new Set(['json']), value: new Set(['tag', 'path']) });
    if (parsed.help) {
        console.log('Usage: lyntty remote create --tag <tag> [--path <path>] [--json]');
        return;
    }
    const tag = requiredValue(parsed, 'tag');
    const config = loadConfig();
    const creds = requireCredentials(config);
    const session = await createSession(config, creds, {
        tag,
        metadata: { tag, path: parsed.values.path ?? process.cwd(), host: hostname(), agent: 'pi' },
    });
    if (parsed.flags.json) {
        console.log(formatJson(session));
    } else {
        console.log(['## Session Created', '', `- Session ID: \`${session.id}\``, '- Agent: pi'].join('\n'));
    }
}

async function handleSend(args: string[]): Promise<void> {
    const parsed = parseOptions(args, { boolean: new Set(['yolo', 'wait', 'json']), value: new Set() });
    if (parsed.help) {
        console.log('Usage: lyntty remote send <session-id> <message> [--yolo] [--wait] [--json]');
        return;
    }
    if (parsed.positionals.length !== 2) {
        throw new Error('send requires exactly one session-id and one message');
    }
    const sessionId = parsed.positionals[0];
    const message = parsed.positionals[1];
    const config = loadConfig();
    const creds = requireCredentials(config);
    const session = await resolveSession(config, creds, sessionId);
    const permissionMode = parsed.flags.yolo ? 'yolo' : null;
    const localId = `remote:${randomUUID()}`;
    const client = parsed.flags.wait ? createClient(session, creds, config) : null;
    let completion: Promise<void> | null = null;
    try {
        if (client) {
            await client.waitForConnect();
            completion = client.waitForTurnCompletionAfter(localId);
            // The POST can fail before this promise is awaited. Keep its rejection
            // observed while still propagating it from the explicit await below.
            void completion.catch(() => undefined);
        }
        const persisted = await postSessionUserMessage(
            config,
            creds,
            session,
            message,
            localId,
            permissionMode ? { permissionMode } : undefined,
        );
        if (completion) await completion;
        const payload = {
            sessionId: session.id,
            message,
            localId: persisted.localId,
            seq: persisted.seq,
            persisted: true,
            permissionMode,
        };
        if (parsed.flags.json) console.log(formatJson(payload));
        else console.log([
            '## Message Persisted', '', `- Session ID: \`${session.id}\``,
            `- Relay Sequence: ${persisted.seq}`,
            `- Permission Mode: ${permissionMode ?? 'default'}`,
            `- Waited For This Turn: ${parsed.flags.wait ? 'yes' : 'no'}`,
        ].join('\n'));
    } finally {
        client?.close();
    }
}

async function handleHistory(args: string[]): Promise<void> {
    const parsed = parseOptions(args, { boolean: new Set(['json']), value: new Set(['limit']) });
    if (parsed.help) {
        console.log('Usage: lyntty remote history <session-id> [--limit <n>] [--json]');
        return;
    }
    const sessionId = requireSessionId(parsed.positionals);
    const limit = parsePositiveInt(parsed.values.limit, '--limit');
    const config = loadConfig();
    const creds = requireCredentials(config);
    const session = await resolveSession(config, creds, sessionId);
    let messages = await getSessionMessages(config, creds, session.id, session.encryption);
    messages.sort((a, b) => a.createdAt - b.createdAt);
    if (limit !== undefined) messages = messages.slice(-limit);
    console.log(parsed.flags.json ? formatJson(messages) : formatMessageHistory(messages));
}

async function handleStop(args: string[]): Promise<void> {
    const parsed = parseOptions(args, { boolean: new Set(), value: new Set() });
    if (parsed.help) {
        console.log('Usage: lyntty remote stop <session-id>');
        return;
    }
    const sessionId = requireSessionId(parsed.positionals);
    const config = loadConfig();
    const creds = requireCredentials(config);
    const session = await resolveSession(config, creds, sessionId);
    const client = createClient(session, creds, config);
    try {
        await client.waitForConnect();
        client.sendStop();
        await delay(500);
    } finally {
        client.close();
    }
    console.log(['## Session Stopped', '', `- Session ID: \`${session.id}\``, '- Agent: pi'].join('\n'));
}

async function handleWait(args: string[]): Promise<void> {
    const parsed = parseOptions(args, { boolean: new Set(), value: new Set(['timeout']) });
    if (parsed.help) {
        console.log('Usage: lyntty remote wait <session-id> [--timeout <seconds>]');
        return;
    }
    const sessionId = requireSessionId(parsed.positionals);
    const timeout = parsePositiveInt(parsed.values.timeout, '--timeout') ?? 300;
    const config = loadConfig();
    const creds = requireCredentials(config);
    const session = await resolveSession(config, creds, sessionId);
    const client = createClient(session, creds, config);
    try {
        await client.waitForConnect();
        await client.waitForIdle(timeout * 1000);
        console.log(['## Session Idle', '', `- Session ID: \`${session.id}\``, '- Agent: pi'].join('\n'));
    } finally {
        client.close();
    }
}

function createClient(session: DecryptedSession, creds: Credentials, config: Config): SessionClient {
    return new SessionClient({
        sessionId: session.id,
        encryptionKey: session.encryption.key,
        encryptionVariant: session.encryption.variant,
        token: creds.token,
        serverUrl: config.serverUrl,
        initialAgentState: session.agentState ?? null,
    });
}

function resolveByPrefix<T extends { id: string }>(items: T[], value: string, label: string): T {
    if (!value || value.trim().length === 0) throw new Error(`${label} is required`);
    const matches = items.filter(item => item.id.startsWith(value));
    if (matches.length === 0) throw new Error(`No ${label.toLowerCase()} found matching "${value}"`);
    if (matches.length > 1) throw new Error(`Ambiguous ${label.toLowerCase()} "${value}" matches ${matches.length} records. Be more specific.`);
    return matches[0];
}

async function resolveSession(config: Config, creds: Credentials, sessionId: string): Promise<DecryptedSession> {
    return resolveByPrefix(await listSessions(config, creds), sessionId, 'Session ID');
}

async function resolveMachine(config: Config, creds: Credentials, machineId: string): Promise<DecryptedMachine> {
    return resolveByPrefix(await listMachines(config, creds), machineId, 'Machine ID');
}

function resolveRemotePath(rawPath: string | undefined, machine: DecryptedMachine): string {
    const metadata = (machine.metadata ?? {}) as { homeDir?: unknown };
    const homeDir = typeof metadata.homeDir === 'string' && metadata.homeDir.trim().length > 0 ? metadata.homeDir : undefined;
    const path = rawPath ?? homeDir;
    if (!path) throw new Error('Machine metadata does not include a home directory. Pass --path explicitly.');
    if (path === '~') {
        if (!homeDir) throw new Error('Machine metadata does not include a home directory, so `~` cannot be resolved. Pass an absolute --path.');
        return homeDir;
    }
    if (path.startsWith('~/')) {
        if (!homeDir) throw new Error('Machine metadata does not include a home directory, so `~/...` cannot be resolved. Pass an absolute --path.');
        const normalizedHome = homeDir.endsWith('/') || homeDir.endsWith('\\') ? homeDir.slice(0, -1) : homeDir;
        const separator = normalizedHome.includes('\\') && !normalizedHome.includes('/') ? '\\' : '/';
        return join(normalizedHome, path.slice(2)).replaceAll('/', separator);
    }
    return path;
}

function resolveSessionMachineId(session: DecryptedSession): string {
    const metadata = (session.metadata ?? {}) as { machineId?: unknown };
    if (typeof metadata.machineId !== 'string' || metadata.machineId.trim().length === 0) {
        throw new Error(`Session ${session.id} is missing machine metadata and cannot be resumed.`);
    }
    return metadata.machineId;
}

function resolvePiSessionId(session: DecryptedSession): string {
    const metadata = (session.metadata ?? {}) as { piSessionId?: unknown };
    if (typeof metadata.piSessionId !== 'string' || metadata.piSessionId.trim().length === 0) {
        throw new Error(`Session ${session.id} has no Pi session ID and cannot be resumed.`);
    }
    return metadata.piSessionId;
}

function resolveSessionDirectory(session: DecryptedSession): string {
    const metadata = (session.metadata ?? {}) as { path?: unknown };
    if (typeof metadata.path !== 'string' || metadata.path.trim().length === 0) {
        throw new Error(`Session ${session.id} has no working directory and cannot be resumed.`);
    }
    return metadata.path;
}

function parseTakeoverChoice(value: string | undefined): 'wait' | 'stop' | 'interrupt' | undefined {
    if (value === undefined || value === 'wait' || value === 'stop' || value === 'interrupt') {
        return value;
    }
    throw new Error('--takeover must be wait, stop, or interrupt');
}

function ensureMachineCanResume(machine: DecryptedMachine): void {
    const metadata = (machine.metadata ?? {}) as { resumeSupport?: { rpcAvailable?: unknown; remoteAuthenticated?: unknown } };
    if (metadata.resumeSupport?.rpcAvailable === true) return;
    if (metadata.resumeSupport?.remoteAuthenticated === false) {
        throw new Error('Resume is unavailable on this machine. Run `lyntty remote auth login` in that machine environment first.');
    }
    throw new Error('Resume RPC is unavailable on this machine right now.');
}

function parseOptions(
    args: string[],
    spec: { boolean: Set<string>; value: Set<string> },
): { flags: Record<string, boolean>; values: Record<string, string | undefined>; positionals: string[]; help: boolean } {
    const flags: Record<string, boolean> = {};
    const values: Record<string, string | undefined> = {};
    const positionals: string[] = [];
    let help = false;
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (arg === '--help' || arg === '-h') {
            help = true;
            continue;
        }
        if (!arg.startsWith('--')) {
            positionals.push(arg);
            continue;
        }
        const raw = arg.slice(2);
        if (spec.boolean.has(raw)) {
            flags[raw] = true;
            continue;
        }
        if (spec.value.has(raw)) {
            const value = args[++i];
            if (!value || value.startsWith('-')) throw new Error(`--${raw} requires a value`);
            values[raw] = value;
            continue;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
    return { flags, values, positionals, help };
}

function requiredValue(parsed: { values: Record<string, string | undefined> }, name: string): string {
    const value = parsed.values[name];
    if (!value) throw new Error(`--${name} is required`);
    return value;
}

function requireSinglePositional(positionals: string[], name: string, required = true): string | undefined {
    if (required && !positionals[0]) throw new Error(`${name} is required`);
    if (positionals.length > (required ? 1 : 0)) throw new Error(`Expected at most one ${name}`);
    return positionals[0];
}

function requireSessionId(positionals: string[]): string {
    const sessionId = requireSinglePositional(positionals, 'session-id');
    if (!sessionId) throw new Error('session-id is required');
    return sessionId;
}

function parsePositiveInt(value: string | undefined, flag: string): number | undefined {
    if (value === undefined) return undefined;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${flag} must be a positive integer`);
    return parsed;
}

function assertNoExtraArgs(args: string[], command: string): void {
    if (args.length > 0) throw new Error(`Unknown argument for ${command}: ${args[0]}`);
}

function hasHelp(args: string[]): boolean {
    return args.includes('--help') || args.includes('-h');
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function authUsage(): string {
    return `Usage:
  lyntty remote auth login
  lyntty remote auth status
  lyntty remote auth logout`;
}

function remoteUsage(): string {
    return `Usage:
  lyntty remote auth login|status|logout
  lyntty remote machines [--active] [--json]
  lyntty remote list [--active] [--json]
  lyntty remote status [<session-id>] [--json]
  lyntty remote spawn --machine <machine-id> [--path <path>] [--create-dir] [--json]
  lyntty remote resume <session-id> [--takeover wait|stop|interrupt] [--json]
  lyntty remote create --tag <tag> [--path <path>] [--json]
  lyntty remote send <session-id> <message> [--yolo] [--wait] [--json]
  lyntty remote history <session-id> [--limit <n>] [--json]
  lyntty remote stop <session-id>
  lyntty remote wait <session-id> [--timeout <seconds>]
  lyntty remote install`;
}

function showAuthHelp(): void {
    console.log(`lyntty remote auth - Manage remote relay authentication\n\n${authUsage()}`);
}

function showRemoteHelp(): void {
    console.log(`lyntty remote - Pi session remote control\n\n${remoteUsage()}`);
}
