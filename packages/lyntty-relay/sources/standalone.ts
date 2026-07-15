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

export async function runMigrations(opts: { pgliteDir: string; migrationsDir?: string } = { pgliteDir }) {
    const migrations = resolveMigrations(opts.migrationsDir);
    const provider = resolveDatabaseProvider();
    let appliedCount: number;

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
            appliedCount = await applyMigrations(new PostgresMigrationDatabase(client), migrations);
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
        const database = createPGlite(opts.pgliteDir);
        try {
            appliedCount = await applyMigrations(database, migrations);
        } finally {
            await database.close();
        }
    } else {
        throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
    }

    if (appliedCount === 0) {
        console.log("No new migrations to apply.");
    } else {
        console.log(`Applied ${appliedCount} migration(s).`);
    }
}

async function serve() {
    // Resolve once so serve and migrate cannot choose different databases.
    const provider = resolveDatabaseProvider();
    process.env.DB_PROVIDER = provider;
    if (provider === "pglite") {
        process.env.PGLITE_DIR = process.env.PGLITE_DIR || pgliteDir;
    }

    const masterSecret = process.env.HANDY_MASTER_SECRET;
    if (!masterSecret) {
        throw new Error("HANDY_MASTER_SECRET is required");
    }

    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3005;
    const host = process.env.HOST || "0.0.0.0";
    const staticDir = findStaticDir();
    let injectHtmlConfig: Record<string, unknown> | undefined;
    if (process.env.LYNTTY_INJECT_HTML_CONFIG) {
        try {
            injectHtmlConfig = JSON.parse(process.env.LYNTTY_INJECT_HTML_CONFIG);
        } catch {
            // ignore malformed input
        }
    }

    const { awaitShutdown } = await import("./utils/shutdown");
    const shutdown = awaitShutdown();
    const { startServer } = await import("./index");
    await startServer({
        pgliteDir: process.env.PGLITE_DIR!,
        masterSecret,
        port,
        host,
        staticDir,
        injectHtmlConfig,
    });

    // Block until shutdown so the process stays alive.
    await shutdown;
    process.exit(0);
}

function findStaticDir(): string | undefined {
    const candidates = [
        process.env.LYNTTY_STATIC_DIR,
        path.join(process.cwd(), "webapp"),
        path.join(path.dirname(process.execPath), "webapp"),
    ].filter(Boolean) as string[];

    for (const candidate of candidates) {
        if (fs.existsSync(path.join(candidate, "index.html"))) {
            return candidate;
        }
    }

    return undefined;
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

const invokedFile = process.argv[1] || "";
const isDirectInvocation = isStandaloneEntrypoint(invokedFile);

if (isDirectInvocation) {
    const command = process.argv[2];

    switch (command) {
        case "migrate":
            runMigrations({ pgliteDir }).catch(e => {
                console.error(e);
                process.exit(1);
            });
            break;
        case "serve":
            serve().catch(e => {
                console.error(e);
                process.exit(1);
            });
            break;
        default:
            console.log(`lyntty-relay - portable distribution

Usage:
  lyntty-relay migrate    Apply database migrations
  lyntty-relay serve      Start the server

Environment variables:
  DATA_DIR          Base data directory (default: ./data)
  PGLITE_DIR        PGlite database directory (default: DATA_DIR/pglite)
  DATABASE_URL      PostgreSQL URL (if set, uses external Postgres instead of PGlite)
  REDIS_URL         Redis URL (optional, not required for standalone)
  PORT              Server port (default: 3005)
  HANDY_MASTER_SECRET  Required: master secret for auth/encryption
`);
            process.exit(command === "--help" || command === "-h" ? 0 : 1);
    }
}
