import { describe, expect, it, mock, spyOn, jest } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatAppLogTime, startAppLogsServer } from './appLogs';

async function request(
    port: number,
    path: string,
    options: RequestInit = {},
): Promise<Response> {
    return fetch(`http://127.0.0.1:${port}${path}`, options);
}

describe('app log receiver', () => {
    it('defaults to loopback and accepts an explicit host', async () => {
        const homeDir = await mkdtemp(join(tmpdir(), 'lyntty-app-logs-'));
        const output = { write: mock() };
        const appLogs = await startAppLogsServer({ port: 0, homeDir, stdout: output });
        try {
            expect(appLogs.host).toBe('127.0.0.1');
            expect(appLogs.port).toBeGreaterThan(0);
        } finally {
            await appLogs.close();
            await rm(homeDir, { recursive: true, force: true });
        }

        const explicit = await startAppLogsServer({
            host: '0.0.0.0',
            port: 0,
            homeDir: await mkdtemp(join(tmpdir(), 'lyntty-app-logs-host-')),
            stdout: output,
        });
        try {
            expect(explicit.host).toBe('0.0.0.0');
        } finally {
            await explicit.close();
            await rm(join(explicit.logPath, '..', '..'), { recursive: true, force: true });
        }
    });

    it('writes formatted POST lines to stdout and the per-home file', async () => {
        const homeDir = await mkdtemp(join(tmpdir(), 'lyntty-app-logs-'));
        const output = { write: mock() };
        const appLogs = await startAppLogsServer({ port: 0, homeDir, stdout: output });
        try {
            const response = await request(appLogs.port, '/logs', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    timestamp: '2026-07-15T12:34:56.789Z',
                    level: 'error',
                    message: 'hello',
                    source: 'mobile',
                    platform: 'android',
                }),
            });
            expect(response.status).toBe(200);
            expect(await response.text()).toBe('{"ok":true}');
        } finally {
            await appLogs.close();
        }

        const expected = `[${formatAppLogTime('2026-07-15T12:34:56.789Z')}] [ERROR] [mobile/android] hello\n`;
        expect(output.write).toHaveBeenCalledWith(expected);
        expect(await readFile(appLogs.logPath, 'utf8')).toBe(expected);
        await rm(homeDir, { recursive: true, force: true });
    });

    it('preserves OPTIONS, bad-request, and not-found behavior', async () => {
        const homeDir = await mkdtemp(join(tmpdir(), 'lyntty-app-logs-'));
        const appLogs = await startAppLogsServer({ port: 0, homeDir, stdout: { write: mock() } });
        try {
            const options = await request(appLogs.port, '/logs', { method: 'OPTIONS' });
            expect(options.status).toBe(204);
            expect(options.headers.get('access-control-allow-origin')).toBe('*');

            const bad = await request(appLogs.port, '/logs', {
                method: 'POST',
                body: '{not-json',
            });
            expect(bad.status).toBe(400);
            expect(await bad.text()).toBe('{"error":"bad request"}');

            const missing = await request(appLogs.port, '/other', { method: 'GET' });
            expect(missing.status).toBe(404);
            expect(await missing.text()).toBe('{"error":"not found"}');
        } finally {
            await appLogs.close();
            await rm(homeDir, { recursive: true, force: true });
        }
    });
});
