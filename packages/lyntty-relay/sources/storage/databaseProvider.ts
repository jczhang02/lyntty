export type DatabaseProvider = "pglite" | "postgres";

type DatabaseEnvironment = Partial<Record<"DATABASE_URL" | "DB_PROVIDER", string | undefined>>;

export function resolveDatabaseProvider(
    environment: DatabaseEnvironment = process.env as DatabaseEnvironment,
): DatabaseProvider {
    const configuredProvider = environment.DB_PROVIDER?.trim().toLowerCase();
    if (configuredProvider) {
        if (configuredProvider === "pglite" || configuredProvider === "postgres") {
            return configuredProvider;
        }
        throw new Error(`Unsupported DB_PROVIDER: ${environment.DB_PROVIDER}`);
    }

    return environment.DATABASE_URL ? "postgres" : "pglite";
}
