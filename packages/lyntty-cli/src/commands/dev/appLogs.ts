import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const DEFAULT_APP_LOGS_HOST = '127.0.0.1';
export const DEFAULT_APP_LOGS_PORT = 8787;

type WritableOutput = Pick<NodeJS.WriteStream, 'write'>;

export type AppLogsServerOptions = {
    host?: string;
    port?: number;
    homeDir?: string;
    stdout?: WritableOutput;
    now?: Date;
};

export type AppLogsServer = {
    server: Server;
    logPath: string;
    host: string;
    port: number;
    close: () => Promise<void>;
};

function resolveHomeDir(homeDir = process.env.LYNTTY_HOME_DIR): string {
    if (homeDir) return homeDir.replace(/^~/, homedir());
    return join(homedir(), '.lyntty');
}

function createLogPath(homeDir: string, now: Date): string {
    const logsDir = join(homeDir, 'app-logs');
    mkdirSync(logsDir, { recursive: true });
    const pad = (value: number) => String(value).padStart(2, '0');
    const filename = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.log`;
    return join(logsDir, filename);
}

export function formatAppLogTime(iso: string): string {
    try {
        const date = new Date(iso);
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
        return `${hours}:${minutes}:${seconds}.${milliseconds}`;
    } catch {
        return iso;
    }
}

function setCors(res: ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk: Buffer | string) => {
            body += chunk;
        });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

function writeJson(res: ServerResponse, status: number, body: string): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(body);
}

function createLogHandler(stream: WriteStream, stdout: WritableOutput) {
    return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        setCors(res);

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        if (req.method !== 'POST' || req.url !== '/logs') {
            writeJson(res, 404, '{"error":"not found"}');
            return;
        }

        try {
            const raw = await readBody(req);
            const { timestamp, level, message, source, platform } = JSON.parse(raw) as {
                timestamp?: string;
                level?: string;
                message?: unknown;
                source?: string;
                platform?: string;
            };
            const time = formatAppLogTime(timestamp || new Date().toISOString());
            const levelText = (level || 'info').toUpperCase().padEnd(5);
            const sourceText = source || 'app';
            const platformText = platform || '?';
            const line = `[${time}] [${levelText}] [${sourceText}/${platformText}] ${message}\n`;

            stream.write(line);
            stdout.write(line);
            writeJson(res, 200, '{"ok":true}');
        } catch {
            writeJson(res, 400, '{"error":"bad request"}');
        }
    };
}

/**
 * Create a testable app-log HTTP server.  It does not listen until
 * `startAppLogsServer` is called, and `close` closes both the HTTP server and
 * the per-process log stream.
 */
export function createAppLogsServer(options: AppLogsServerOptions = {}): AppLogsServer {
    const host = options.host ?? DEFAULT_APP_LOGS_HOST;
    const configuredPort = options.port ?? DEFAULT_APP_LOGS_PORT;
    const logPath = createLogPath(resolveHomeDir(options.homeDir), options.now ?? new Date());
    const stream = createWriteStream(logPath, { flags: 'a' });
    const stdout = options.stdout ?? process.stdout;
    const server = createServer(createLogHandler(stream, stdout));
    let listening = false;
    let closed = false;

    const close = async (): Promise<void> => {
        if (closed) return;
        closed = true;
        await new Promise<void>((resolve, reject) => {
            const finishStream = () => stream.end(() => resolve());
            if (!listening) {
                finishStream();
                return;
            }
            server.close(error => {
                if (error) {
                    reject(error);
                    return;
                }
                listening = false;
                finishStream();
            });
        });
    };

    // `port` is updated after the server binds; exposing the configured value
    // here keeps the seam useful for callers that pass a fixed port.
    const result: AppLogsServer = { server, logPath, host, port: configuredPort, close };
    server.once('listening', () => {
        listening = true;
        const address = server.address();
        if (address && typeof address === 'object') result.port = address.port;
    });
    return result;
}

export async function startAppLogsServer(options: AppLogsServerOptions = {}): Promise<AppLogsServer> {
    const appLogs = createAppLogsServer(options);
    await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
            appLogs.server.off('listening', onListening);
            reject(error);
        };
        const onListening = () => {
            appLogs.server.off('error', onError);
            resolve();
        };
        appLogs.server.once('error', onError);
        appLogs.server.once('listening', onListening);
        appLogs.server.listen(appLogs.port, appLogs.host);
    });
    console.log(`📱 App log receiver listening on http://${appLogs.host}:${appLogs.port}`);
    console.log(`📝 Writing to ${appLogs.logPath}`);
    return appLogs;
}
