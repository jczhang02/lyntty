import { homedir } from 'node:os';
import { join } from 'node:path';

export type Config = {
    serverUrl: string;
    homeDir: string;
    credentialPath: string;
};

export function loadConfig(): Config {
    const serverUrl = (process.env.LYNTTY_SERVER_URL ?? 'https://api.cluster-fluster.com').replace(/\/+$/, '');
    const homeDir = process.env.LYNTTY_HOME_DIR ?? join(homedir(), '.lyntty');
    const credentialPath = join(homeDir, 'agent.key');
    return { serverUrl, homeDir, credentialPath };
}
