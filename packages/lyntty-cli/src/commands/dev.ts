import {
    DEFAULT_APP_LOGS_HOST,
    DEFAULT_APP_LOGS_PORT,
    startAppLogsServer,
} from './dev/appLogs';

export async function handleDevCommand(args: string[]): Promise<void> {
    const subcommand = args[0] ?? 'help';
    if (subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
        showDevHelp();
        return;
    }
    if (subcommand !== 'app-logs') {
        throw new Error(`Unknown dev subcommand: ${subcommand}\n\nUsage: lyntty dev app-logs [--host <host>] [--port <port>]`);
    }

    const options = parseAppLogsOptions(args.slice(1));
    if (options.help) {
        showAppLogsHelp();
        return;
    }
    await startAppLogsServer(options);
}

function parseAppLogsOptions(args: string[]): {
    host?: string;
    port?: number;
    help: boolean;
} {
    let host: string | undefined;
    let port: number | undefined;
    let help = false;
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === '--help' || arg === '-h') {
            help = true;
        } else if (arg === '--host') {
            host = args[++index];
            if (!host) throw new Error('--host requires a value');
        } else if (arg === '--port' || arg === '-p') {
            const rawPort = args[++index];
            if (!rawPort) throw new Error('--port requires a value');
            port = Number.parseInt(rawPort, 10);
            if (!Number.isInteger(port) || port < 0 || port > 65_535) {
                throw new Error('--port must be an integer between 0 and 65535');
            }
        } else {
            throw new Error(`Unknown app-logs argument: ${arg}`);
        }
    }
    return { host, port, help };
}

function showDevHelp(): void {
    console.log(`lyntty dev - Local development tools\n\nUsage:\n  lyntty dev app-logs [--host <host>] [--port <port>]`);
}

function showAppLogsHelp(): void {
    console.log(`lyntty dev app-logs - Receive mobile app logs\n\nUsage:\n  lyntty dev app-logs [--host <host>] [--port <port>]\n\nOptions:\n  --host <host>       Bind address (default: ${DEFAULT_APP_LOGS_HOST})\n  --port, -p <port>   Port (default: ${DEFAULT_APP_LOGS_PORT})\n\nThe receiver binds to loopback by default. Use --host 0.0.0.0 explicitly for emulator/LAN access.`);
}
