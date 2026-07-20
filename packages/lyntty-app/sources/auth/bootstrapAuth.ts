import type { AuthCredentials } from './tokenStorage';
import { TokenStorage } from './tokenStorage';

async function removeStoredCredentials(): Promise<void> {
    const removed = await TokenStorage.removeCredentials();
    if (!removed) {
        throw new Error('Failed to remove stored credentials');
    }
}

export async function clearStoredCredentialsForServerSetup(): Promise<void> {
    await removeStoredCredentials();
    const { clearPersistence } = await import('@/sync/persistence');
    clearPersistence();
}

export async function clearStoredAuthState(): Promise<void> {
    await removeStoredCredentials();
    const [{ clearPersistence }, { syncReset }] = await Promise.all([
        import('@/sync/persistence'),
        import('@/sync/sync'),
    ]);
    syncReset();
    clearPersistence();
}

export type BootstrapRouteGate = 'wait' | 'redirect-to-server' | 'render';

export function getBootstrapRouteGate(
    initialized: boolean,
    requiresServerSetup: boolean,
    pathname: string,
): BootstrapRouteGate {
    if (!initialized) return 'wait';
    if (requiresServerSetup && pathname !== '/server') return 'redirect-to-server';
    return 'render';
}

export async function bootstrapAuth(options: {
    requiresServerSetup: boolean;
    devCredentials: AuthCredentials | null;
}): Promise<AuthCredentials | null> {
    if (options.requiresServerSetup) {
        await clearStoredCredentialsForServerSetup();
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

    if (credentials) {
        const { syncRestore } = await import('@/sync/sync');
        await syncRestore(credentials);
    }
    return credentials;
}
