export type DatabaseProvider = "pglite" | "postgres";

type DatabaseEnvironment = Partial<Pick<NodeJS.ProcessEnv, "DATABASE_URL" | "DB_PROVIDER">>;

export function resolveDatabaseProvider(environment: DatabaseEnvironment = process.env): DatabaseProvider {
    const configuredProvider = environment.DB_PROVIDER?.trim().toLowerCase();
    if (configuredProvider) {
        if (configuredProvider === "pglite" || configuredProvider === "postgres") {
            return configuredProvider;
        }
        throw new Error(`Unsupported DB_PROVIDER: ${environment.DB_PROVIDER}`);
    }

    return environment.DATABASE_URL ? "postgres" : "pglite";
}
