import "reflect-metadata";

// Patch crypto.subtle.importKey to normalize base64 → base64url in JWK data.
// privacy-kit uses standard base64 for Ed25519 JWK keys, but Bun (correctly per spec)
// requires base64url. Node.js is lenient about this, Bun is not.
const origImportKey = crypto.subtle.importKey.bind(crypto.subtle);
crypto.subtle.importKey = function (format: any, keyData: any, algorithm: any, extractable: any, keyUsages: any) {
    if (format === 'jwk' && keyData && typeof keyData === 'object') {
        const fixed = { ...keyData };
        for (const field of ['d', 'x', 'y', 'n', 'e', 'p', 'q', 'dp', 'dq', 'qi', 'k']) {
            if (typeof fixed[field] === 'string') {
                fixed[field] = fixed[field].replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            }
        }
        return origImportKey(format, fixed, algorithm, extractable, keyUsages);
    }
    return origImportKey(format, keyData, algorithm, extractable, keyUsages);
} as any;

import * as fs from "fs";
import * as path from "path";
import { createHash } from "node:crypto";
import { Pool, PoolClient } from "pg";
import { createPGlite } from "./storage/pgliteLoader";
import { resolveDatabaseProvider } from "./storage/databaseProvider";
import { resolveMasterSecret } from "./masterSecret";
import { backupRelayDatabase, restoreRelayDatabase } from "./backup";
import { acquirePGliteLease, type PGliteLease } from "./pgliteLock";
import {
    inspectMigrationState,
    migrationSetChecksum,
    migrationStateFailure,
    RELAY_SCHEMA_COMPATIBILITY_VERSION,
    type RelayMigrationState,
} from "./migrationState";

const dataDir = process.env.DATA_DIR || "./data";
const pgliteDir = process.env.PGLITE_DIR || path.join(dataDir, "pglite");

interface MigrationQueryResult<Row> {
    rows: Row[];
}

interface MigrationDatabase {
    exec(sql: string): Promise<unknown>;
    query<Row>(sql: string, params?: unknown[]): Promise<MigrationQueryResult<Row>>;
}

interface MigrationFile {
    checksum: string;
    name: string;
    sql: string;
}

function resolveMigrations(migrationsDir?: string): MigrationFile[] {
    const candidates = [
        migrationsDir,
        path.join(process.cwd(), "prisma", "migrations"),
        path.join(process.cwd(), "packages", "lyntty-relay", "prisma", "migrations"),
        path.join(path.dirname(process.execPath), "prisma", "migrations"),
    ].filter((candidate): candidate is string => Boolean(candidate));
    const resolvedDir = candidates.find(candidate => fs.existsSync(candidate));
    if (!resolvedDir) {
        throw new Error(`Could not find prisma/migrations directory. Tried: ${candidates.join(", ")}`);
    }

    return fs.readdirSync(resolvedDir)
        .filter(name => fs.statSync(path.join(resolvedDir, name)).isDirectory())
        .sort()
        .flatMap(name => {
            if (!/^[0-9A-Za-z_]+$/.test(name)) throw new Error(`Unsafe migration directory name: ${name}`);
            const sqlFile = path.join(resolvedDir, name, "migration.sql");
            if (!fs.existsSync(sqlFile)) {
                return [];
            }
            const sql = fs.readFileSync(sqlFile, "utf8");
            return [{
                checksum: createHash("sha256").update(sql).digest("hex"),
                name,
                sql,
            }];
        });
}

async function prepareMigrationTable(database: MigrationDatabase): Promise<void> {
    await database.exec(`
        CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
            "id" TEXT PRIMARY KEY,
            "checksum" TEXT,
            "migration_name" TEXT NOT NULL UNIQUE,
            "finished_at" TIMESTAMPTZ,
            "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
            "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
            "logs" TEXT,
            "rolled_back_at" TIMESTAMPTZ
        );
        ALTER TABLE "_prisma_migrations" ADD COLUMN IF NOT EXISTS "checksum" TEXT;
        ALTER TABLE "_prisma_migrations" ADD COLUMN IF NOT EXISTS "rolled_back_at" TIMESTAMPTZ;
    `);
}

async function updateSchemaCompatibility(
    database: MigrationDatabase,
    currentState: RelayMigrationState,
    migrations: readonly MigrationFile[],
): Promise<void> {
    // Never invent or advance compatibility metadata for unknown future
    // migrations. Their owning Relay must attest the complete applied set.
    if (currentState.unknownApplied.length > 0) return;
    const head = [...migrations].sort((left, right) => left.name.localeCompare(right.name)).at(-1);
    if (!head) throw new Error("No Relay migrations are available to attest");
    const setChecksum = migrationSetChecksum(migrations.map(migration => ({
        name: migration.name,
        checksum: migration.checksum,
    })));
    if (!setChecksum) throw new Error("Relay migrations cannot be attested without checksums");
    await database.exec(`
        CREATE TABLE IF NOT EXISTS "_lyntty_schema_compatibility" (
            "id" INTEGER PRIMARY KEY CHECK ("id" = 1),
            "minimum_relay_schema" INTEGER NOT NULL,
            "current_relay_schema" INTEGER NOT NULL,
            "attested_migration_head" TEXT,
            "attested_migration_checksum" TEXT,
            "attested_migration_count" INTEGER,
            "attested_migration_set_checksum" TEXT,
            "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        ALTER TABLE "_lyntty_schema_compatibility" ADD COLUMN IF NOT EXISTS "attested_migration_head" TEXT;
        ALTER TABLE "_lyntty_schema_compatibility" ADD COLUMN IF NOT EXISTS "attested_migration_checksum" TEXT;
        ALTER TABLE "_lyntty_schema_compatibility" ADD COLUMN IF NOT EXISTS "attested_migration_count" INTEGER;
        ALTER TABLE "_lyntty_schema_compatibility" ADD COLUMN IF NOT EXISTS "attested_migration_set_checksum" TEXT;
        INSERT INTO "_lyntty_schema_compatibility" (
            "id", "minimum_relay_schema", "current_relay_schema",
            "attested_migration_head", "attested_migration_checksum",
            "attested_migration_count", "attested_migration_set_checksum"
        ) VALUES (
            1, 1, ${RELAY_SCHEMA_COMPATIBILITY_VERSION},
            '${head.name}', '${head.checksum}',
            ${migrations.length}, '${setChecksum}'
        )
        ON CONFLICT ("id") DO UPDATE SET
            "current_relay_schema" = GREATEST(
                "_lyntty_schema_compatibility"."current_relay_schema",
                EXCLUDED."current_relay_schema"
            ),
            "attested_migration_head" = EXCLUDED."attested_migration_head",
            "attested_migration_checksum" = EXCLUDED."attested_migration_checksum",
            "attested_migration_count" = EXCLUDED."attested_migration_count",
            "attested_migration_set_checksum" = EXCLUDED."attested_migration_set_checksum",
            "updated_at" = now();
        ALTER TABLE "_lyntty_schema_compatibility" ALTER COLUMN "attested_migration_head" SET NOT NULL;
        ALTER TABLE "_lyntty_schema_compatibility" ALTER COLUMN "attested_migration_checksum" SET NOT NULL;
        ALTER TABLE "_lyntty_schema_compatibility" ALTER COLUMN "attested_migration_count" SET NOT NULL;
        ALTER TABLE "_lyntty_schema_compatibility" ALTER COLUMN "attested_migration_set_checksum" SET NOT NULL;
    `);
}

async function applyMigrations(database: MigrationDatabase, migrations: MigrationFile[]): Promise<number> {
    await prepareMigrationTable(database);
    const existing = await database.query<{
        checksum: string | null;
        finished_at: Date | null;
        migration_name: string;
        rolled_back_at: Date | null;
    }>(
        `SELECT "migration_name", "checksum", "finished_at", "rolled_back_at" FROM "_prisma_migrations"`,
    );

    const unfinished = existing.rows.filter(row => !row.finished_at && !row.rolled_back_at);
    if (unfinished.length > 0) {
        throw new Error(`Database has unfinished migrations: ${unfinished.map(row => row.migration_name).join(", ")}`);
    }

    const applied = new Map(existing.rows
        .filter(row => row.finished_at && !row.rolled_back_at)
        .map(row => [row.migration_name, row.checksum]));
    for (const migration of migrations) {
        if (!applied.has(migration.name)) {
            continue;
        }
        const recordedChecksum = applied.get(migration.name);
        if (recordedChecksum && recordedChecksum !== migration.checksum) {
            throw new Error(`Migration checksum mismatch: ${migration.name}`);
        }
        if (!recordedChecksum) {
            await database.query(
                `UPDATE "_prisma_migrations" SET "checksum" = $1 WHERE "migration_name" = $2 AND "checksum" IS NULL`,
                [migration.checksum, migration.name],
            );
        }
    }

    let appliedCount = 0;
    for (const migration of migrations) {
        if (applied.has(migration.name)) {
            continue;
        }

        console.log(`  Applying ${migration.name}...`);
        await database.exec("BEGIN");
        try {
            const transactionBody = migration.sql.replace(/^[\t ]*(?:BEGIN|COMMIT);[\t ]*$/gim, "");
            await database.exec(transactionBody);
            await database.query(
                `INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count") VALUES ($1, $2, $3, now(), 1)`,
                [crypto.randomUUID(), migration.checksum, migration.name],
            );
            await database.exec("COMMIT");
            appliedCount++;
        } catch (e: any) {
            await database.exec("ROLLBACK");
            throw new Error(`Failed to apply ${migration.name}: ${e.message}`);
        }
    }

    const stateBeforeCompatibilityUpdate = await inspectMigrationState(database, migrations);
    await updateSchemaCompatibility(database, stateBeforeCompatibilityUpdate, migrations);
    return appliedCount;
}

class PostgresMigrationDatabase implements MigrationDatabase {
    constructor(private readonly client: PoolClient) {}

    exec(sql: string): Promise<unknown> {
        return this.client.query(sql);
    }

    query<Row>(sql: string, params?: unknown[]): Promise<MigrationQueryResult<Row>> {
        return this.client.query(sql, params) as unknown as Promise<MigrationQueryResult<Row>>;
    }
}

interface PostgresSchemaLease {
    database: PostgresMigrationDatabase;
    release(): Promise<void>;
}

async function acquirePostgresSchemaLease(connectionString: string, shared: boolean): Promise<PostgresSchemaLease> {
    const pool = new Pool({ connectionString, max: 1 });
    const client = await pool.connect();
    const lockFunction = shared ? "pg_advisory_lock_shared" : "pg_advisory_lock";
    const unlockFunction = shared ? "pg_advisory_unlock_shared" : "pg_advisory_unlock";
    try {
        await client.query(
            `SELECT ${lockFunction}(hashtext($1), hashtext($2))`,
            ["lyntty-relay", "schema-migrations"],
        );
    } catch (error) {
        client.release();
        await pool.end();
        throw error;
    }
    let released = false;
    return {
        database: new PostgresMigrationDatabase(client),
        async release() {
            if (released) return;
            released = true;
            try {
                await client.query(
                    `SELECT ${unlockFunction}(hashtext($1), hashtext($2))`,
                    ["lyntty-relay", "schema-migrations"],
                );
            } finally {
                client.release();
                await pool.end();
            }
        },
    };
}

export async function runMigrations(opts: {
    pgliteDir: string;
    migrationsDir?: string;
    pgliteLeaseHeld?: boolean;
} = { pgliteDir }) {
    const migrations = resolveMigrations(opts.migrationsDir);
    const provider = resolveDatabaseProvider();
    let appliedCount: number;
    let finalState: RelayMigrationState;

    if (provider === "postgres") {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            throw new Error("DATABASE_URL is required when DB_PROVIDER=postgres");
        }
        console.log("Migrating external PostgreSQL database...");
        const pool = new Pool({ connectionString, max: 1 });
        const client = await pool.connect();
        let migrationLockAcquired = false;
        try {
            await client.query(
                `SELECT pg_advisory_lock(hashtext($1), hashtext($2))`,
                ["lyntty-relay", "schema-migrations"],
            );
            migrationLockAcquired = true;
            const database = new PostgresMigrationDatabase(client);
            appliedCount = await applyMigrations(database, migrations);
            finalState = await inspectMigrationState(database, migrations);
        } finally {
            try {
                if (migrationLockAcquired) {
                    await client.query(
                        `SELECT pg_advisory_unlock(hashtext($1), hashtext($2))`,
                        ["lyntty-relay", "schema-migrations"],
                    );
                }
            } finally {
                client.release();
                await pool.end();
            }
        }
    } else if (provider === "pglite") {
        console.log(`Migrating database in ${opts.pgliteDir}...`);
        fs.mkdirSync(opts.pgliteDir, { recursive: true });
        const lease = opts.pgliteLeaseHeld ? null : await acquirePGliteLease(opts.pgliteDir, "migration");
        let database: ReturnType<typeof createPGlite> | null = null;
        try {
            database = createPGlite(opts.pgliteDir);
            appliedCount = await applyMigrations(database, migrations);
            finalState = await inspectMigrationState(database, migrations);
        } finally {
            await database?.close();
            await lease?.release();
        }
    } else {
        throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
    }

    if (!finalState!.compatible) {
        throw new Error(`Database remains incompatible after migration: ${migrationStateFailure(finalState!)}`);
    }
    if (appliedCount === 0) {
        console.log("No new migrations to apply.");
    } else {
        console.log(`Applied ${appliedCount} migration(s).`);
    }
}

export function pgliteDataDirectoryInitialized(directory: string): boolean {
    try {
        return fs.statSync(directory).isDirectory() && fs.readdirSync(directory).length > 0;
    } catch {
        return false;
    }
}

export async function inspectConfiguredDatabase(
    opts: {
        pgliteDir: string;
        migrationsDir?: string;
        pgliteLeaseHeld?: boolean;
        postgresDatabase?: PostgresMigrationDatabase;
    } = { pgliteDir },
): Promise<RelayMigrationState> {
    const migrations = resolveMigrations(opts.migrationsDir);
    const provider = resolveDatabaseProvider();
    if (provider === "postgres") {
        if (opts.postgresDatabase) return inspectMigrationState(opts.postgresDatabase, migrations);
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) throw new Error("DATABASE_URL is required when DB_PROVIDER=postgres");
        const lease = await acquirePostgresSchemaLease(connectionString, true);
        try {
            return await inspectMigrationState(lease.database, migrations);
        } finally {
            await lease.release();
        }
    }
    if (!pgliteDataDirectoryInitialized(opts.pgliteDir)) {
        throw new Error(`PGlite database is not initialized: ${opts.pgliteDir}`);
    }
    const lease = opts.pgliteLeaseHeld ? null : await acquirePGliteLease(opts.pgliteDir, "doctor");
    let database: ReturnType<typeof createPGlite> | null = null;
    try {
        database = createPGlite(opts.pgliteDir);
        return await inspectMigrationState(database, migrations);
    } finally {
        await database?.close();
        await lease?.release();
    }
}

async function doctor(json: boolean): Promise<RelayMigrationState> {
    resolveMasterSecret();
    const provider = resolveDatabaseProvider();
    const state = await inspectConfiguredDatabase({ pgliteDir });
    const result = { ok: state.compatible, provider, ...state };
    if (json) console.log(JSON.stringify(result));
    else {
        console.log(`Relay database provider: ${provider}`);
        console.log(`Applied migrations: ${state.applied.length}`);
        console.log(`Pending migrations: ${state.pending.length}`);
        console.log(`Schema compatibility: ${state.compatible ? "ok" : "failed"}`);
        if (state.missingChecksums.length) {
            console.log(`Legacy checksums to backfill: ${state.missingChecksums.join(", ")}`);
        }
    }
    if (!state.compatible) throw new Error(migrationStateFailure(state));
    return state;
}

async function serve() {
    // Resolve once so serve and migrate cannot choose different databases.
    const provider = resolveDatabaseProvider();
    process.env.DB_PROVIDER = provider;
    const masterSecret = resolveMasterSecret();
    let pgliteLease: PGliteLease | null = null;
    let postgresLease: PostgresSchemaLease | null = null;
    try {
        if (provider === "pglite") {
            process.env.PGLITE_DIR = process.env.PGLITE_DIR || pgliteDir;
            pgliteLease = await acquirePGliteLease(process.env.PGLITE_DIR, "serve");
            await runMigrations({ pgliteDir: process.env.PGLITE_DIR, pgliteLeaseHeld: true });
        } else {
            const connectionString = process.env.DATABASE_URL;
            if (!connectionString) throw new Error("DATABASE_URL is required when DB_PROVIDER=postgres");
            // Hold a shared schema lease for the full server lifetime. Every
            // migration takes the exclusive form, closing inspect/start races.
            postgresLease = await acquirePostgresSchemaLease(connectionString, true);
            const state = await inspectConfiguredDatabase({ pgliteDir, postgresDatabase: postgresLease.database });
            if (!state.compatible) {
                throw new Error(`PostgreSQL schema is not ready: ${migrationStateFailure(state)}. Run the explicit migration job.`);
            }
        }

        const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3005;
        const host = process.env.HOST || "0.0.0.0";
        const { awaitShutdown } = await import("./utils/shutdown");
        const shutdown = awaitShutdown();
        const { startServer } = await import("./index");
        await startServer({
            pgliteDir: process.env.PGLITE_DIR!,
            masterSecret,
            port,
            host,
        });
        await shutdown;
    } finally {
        await postgresLease?.release().catch(() => undefined);
        await pgliteLease?.release().catch(() => undefined);
    }
}

// CLI — only when this file is invoked directly, not when imported as a library.
const standaloneEntrypoints = new Set([
    "standalone.ts",
    "standalone.js",
    "standalone.mjs",
    "standalone.cjs",
    "lyntty-relay",
    "lyntty-relay.exe",
]);

export function isStandaloneEntrypoint(invokedFile: string): boolean {
    // win32.basename splits on both "/" and "\", so a Windows-style argv[1] is
    // parsed correctly even on a POSIX host (and vice-versa). The POSIX basename
    // would leave backslashes intact and miss Windows entrypoints like
    // lyntty-relay.exe when tests or tooling run cross-platform.
    return standaloneEntrypoints.has(path.win32.basename(invokedFile).toLowerCase());
}

export function standaloneCommandFromArgv(argv: readonly string[]): string | undefined {
    return standaloneArgumentsFromArgv(argv)[0];
}

export function standaloneArgumentsFromArgv(argv: readonly string[]): string[] {
    const firstArgument = argv[1];
    // Source execution: [bun, standalone.ts, command]. Compiled execution:
    // [lyntty-relay, command]. Bun compiled executables do not retain a script
    // path in argv, so the old argv[2]-only dispatch silently became a no-op.
    return firstArgument && isStandaloneEntrypoint(firstArgument)
        ? [...argv.slice(2)]
        : [...argv.slice(1)];
}

function printStandaloneHelp(): void {
    console.log(`lyntty-relay - portable distribution

Usage:
  lyntty-relay migrate              Apply database migrations
  lyntty-relay doctor [--json]      Check secret, provider, and schema compatibility
  lyntty-relay backup <path>        Create an atomic PGlite or PostgreSQL backup
  lyntty-relay restore <path> --force
                                    Restore a verified backup while Relay is stopped
  lyntty-relay serve                Migrate PGlite or fail closed on PostgreSQL schema, then serve

Environment variables:
  DATA_DIR              Base data directory (default: ./data)
  PGLITE_DIR            PGlite database directory (default: DATA_DIR/pglite)
  DATABASE_URL          PostgreSQL URL (if set, uses external Postgres instead of PGlite)
  REDIS_URL             Redis URL (optional, not required for standalone)
  PORT                  Server port (default: 3005)
  LYNTTY_MASTER_SECRET  Required: master secret for auth/encryption
`);
}

export async function runStandaloneCommand(command: string | undefined, args: readonly string[] = []): Promise<number> {
    switch (command) {
        case "migrate":
            if (args.length) throw new Error("Usage: lyntty-relay migrate");
            await runMigrations({ pgliteDir });
            return 0;
        case "doctor": {
            if (args.some(arg => arg !== "--json") || args.filter(arg => arg === "--json").length > 1) {
                throw new Error("Usage: lyntty-relay doctor [--json]");
            }
            await doctor(args.includes("--json"));
            return 0;
        }
        case "backup": {
            const force = args.includes("--force");
            const positional = args.filter(arg => arg !== "--force");
            if (positional.length !== 1 || args.filter(arg => arg === "--force").length > 1) {
                throw new Error("Usage: lyntty-relay backup <path> [--force]");
            }
            const provider = resolveDatabaseProvider();
            const result = await backupRelayDatabase({
                provider,
                destination: positional[0]!,
                pgliteDir,
                databaseUrl: process.env.DATABASE_URL,
                force,
            });
            console.log(JSON.stringify(result));
            return 0;
        }
        case "restore": {
            const force = args.includes("--force");
            const positional = args.filter(arg => arg !== "--force");
            if (!force || positional.length !== 1 || args.filter(arg => arg === "--force").length > 1) {
                throw new Error("Usage: lyntty-relay restore <path> --force");
            }
            const provider = resolveDatabaseProvider();
            await restoreRelayDatabase({
                provider,
                source: positional[0]!,
                pgliteDir,
                databaseUrl: process.env.DATABASE_URL,
                force: true,
            });
            console.log(JSON.stringify({ ok: true, provider, restoredFrom: path.resolve(positional[0]!) }));
            return 0;
        }
        case "serve":
            if (args.length) throw new Error("Usage: lyntty-relay serve");
            await serve();
            return 0;
        default:
            printStandaloneHelp();
            return command === "--help" || command === "-h" ? 0 : 1;
    }
}

if (import.meta.main) {
    const standaloneArguments = standaloneArgumentsFromArgv(process.argv);
    runStandaloneCommand(standaloneArguments[0], standaloneArguments.slice(1))
        .then(code => process.exit(code))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}
