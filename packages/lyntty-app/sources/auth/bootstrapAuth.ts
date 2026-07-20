import { clearPersistence } from '@/sync/persistence';
import { syncReset, syncRestore } from '@/sync/sync';
import { AuthCredentials, TokenStorage } from './tokenStorage';

export async function clearStoredAuthState(): Promise<void> {
    syncReset();
    clearPersistence();
    await TokenStorage.removeCredentials();
}

export async function bootstrapAuth(options: {
    requiresServerSetup: boolean;
    devCredentials: AuthCredentials | null;
}): Promise<AuthCredentials | null> {
    if (options.requiresServerSetup) {
        await clearStoredAuthState();
        return null;
    }

    let credentials = await TokenStorage.getCredentials();
    const development = options.devCredentials;
    if (development) {
        const changed = credentials?.token !== development.token
            || credentials?.secret !== development.secret;
        if (changed && await TokenStorage.setCredentials(development)) {
            credentials = development;
        }
    }

    if (credentials) await syncRestore(credentials);
    return credentials;
}
