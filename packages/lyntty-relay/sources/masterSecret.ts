import { RELAY_SCHEMA_COMPATIBILITY_VERSION } from "./migrationState";

export const LEGACY_MASTER_SECRET_LAST_SCHEMA = 1;

type MasterSecretEnvironment = Partial<Record<
    'LYNTTY_MASTER_SECRET' | 'HANDY_MASTER_SECRET',
    string | undefined
>>;

export function resolveMasterSecret(
    env: MasterSecretEnvironment = process.env as MasterSecretEnvironment,
    relaySchemaVersion = RELAY_SCHEMA_COMPATIBILITY_VERSION,
): string {
    if (env.LYNTTY_MASTER_SECRET) return env.LYNTTY_MASTER_SECRET;
    if (env.HANDY_MASTER_SECRET && relaySchemaVersion <= LEGACY_MASTER_SECRET_LAST_SCHEMA) {
        return env.HANDY_MASTER_SECRET;
    }
    throw new Error('LYNTTY_MASTER_SECRET is required');
}
