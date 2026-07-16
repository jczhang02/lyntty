type MasterSecretEnvironment = Partial<Record<
    'LYNTTY_MASTER_SECRET' | 'HANDY_MASTER_SECRET',
    string | undefined
>>;

export function resolveMasterSecret(
    env: MasterSecretEnvironment = process.env as MasterSecretEnvironment,
): string {
    const secret = env.LYNTTY_MASTER_SECRET || env.HANDY_MASTER_SECRET;
    if (!secret) {
        throw new Error('LYNTTY_MASTER_SECRET is required');
    }
    return secret;
}
