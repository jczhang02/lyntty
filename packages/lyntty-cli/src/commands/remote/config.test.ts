import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from './config';

describe('config', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        delete process.env.LYNTTY_SERVER_URL;
        delete process.env.LYNTTY_HOME_DIR;
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    describe('defaults', () => {
        it('uses default server URL', () => {
            const config = loadConfig();
            expect(config.serverUrl).toBe('https://relay.jczhang.cc');
        });

        it('uses default home directory', () => {
            const config = loadConfig();
            expect(config.homeDir).toBe(join(homedir(), '.lyntty'));
        });

        it('derives credential path from home directory', () => {
            const config = loadConfig();
            expect(config.credentialPath).toBe(join(homedir(), '.lyntty', 'agent.key'));
        });
    });

    describe('env var overrides', () => {
        it('overrides server URL with LYNTTY_SERVER_URL', () => {
            process.env.LYNTTY_SERVER_URL = 'https://custom-server.example.com';
            const config = loadConfig();
            expect(config.serverUrl).toBe('https://custom-server.example.com');
        });

        it('overrides home directory with LYNTTY_HOME_DIR', () => {
            process.env.LYNTTY_HOME_DIR = '/tmp/custom-lyntty';
            const config = loadConfig();
            expect(config.homeDir).toBe('/tmp/custom-lyntty');
        });

        it('derives credential path from overridden home directory', () => {
            process.env.LYNTTY_HOME_DIR = '/tmp/custom-lyntty';
            const config = loadConfig();
            expect(config.credentialPath).toBe('/tmp/custom-lyntty/agent.key');
        });

        it('allows both overrides simultaneously', () => {
            process.env.LYNTTY_SERVER_URL = 'https://other.example.com';
            process.env.LYNTTY_HOME_DIR = '/opt/lyntty';
            const config = loadConfig();
            expect(config.serverUrl).toBe('https://other.example.com');
            expect(config.homeDir).toBe('/opt/lyntty');
            expect(config.credentialPath).toBe('/opt/lyntty/agent.key');
        });
    });
});
