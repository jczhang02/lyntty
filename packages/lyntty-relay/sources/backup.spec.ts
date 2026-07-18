import { afterEach, describe, expect, it } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, readlink, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { backupRelayDatabase, postgresBackupEnvironment, restoreRelayDatabase } from "./backup";
import { PGlite } from "@electric-sql/pglite";
import { acquirePGliteLease } from "./pgliteLock";
import { createPGlite } from "./storage/pgliteLoader";

const roots: string[] = [];

async function testRoot(): Promise<string> {
    const root = resolve(import.meta.dir, "../dist/test-state", `backup-${randomUUID()}`);
    roots.push(root);
    await mkdir(root, { recursive: true });
    return root;
}

afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe("Relay database backup", () => {
    it("creates a private atomic PGlite data-dir dump and checksum", async () => {
        const root = await testRoot();
        const pgliteDir = join(root, "pglite");
        const database = createPGlite(pgliteDir);
        await database.exec("CREATE TABLE backup_probe (value TEXT NOT NULL); INSERT INTO backup_probe VALUES ('preserved');");
        await database.close();

        const destination = join(root, "backups", "relay.tar.gz");
        const result = await backupRelayDatabase({ provider: "pglite", destination, pgliteDir });
        expect(result.provider).toBe("pglite");
        expect(result.size).toBeGreaterThan(100);
        expect(result.sha256).toHaveLength(64);
        expect((await stat(destination)).mode & 0o777).toBe(0o600);
        expect((await stat(`${destination}.sha256`)).mode & 0o777).toBe(0o600);
        expect(await readFile(`${destination}.sha256`, "utf8")).toContain(result.sha256);
        const restored = await PGlite.create({
            dataDir: join(root, "restored"),
            loadDataDir: new Blob([await readFile(destination)]),
        });
        expect((await restored.query<{ value: string }>("SELECT value FROM backup_probe")).rows).toEqual([{ value: "preserved" }]);
        await restored.close();

        const changed = createPGlite(pgliteDir);
        await changed.exec("INSERT INTO backup_probe VALUES ('later-change');");
        await changed.close();
        await restoreRelayDatabase({ provider: "pglite", source: destination, pgliteDir, force: true });
        const restoredInPlace = createPGlite(pgliteDir);
        expect((await restoredInPlace.query<{ value: string }>("SELECT value FROM backup_probe ORDER BY value")).rows)
            .toEqual([{ value: "preserved" }]);
        await restoredInPlace.close();

        await expect(backupRelayDatabase({ provider: "pglite", destination, pgliteDir })).rejects.toThrow("already exists");
        await expect(backupRelayDatabase({ provider: "pglite", destination, pgliteDir, force: true })).resolves.toMatchObject({ provider: "pglite" });
        await writeFile(destination, "corrupted");
        await expect(restoreRelayDatabase({ provider: "pglite", source: destination, pgliteDir, force: true }))
            .rejects.toThrow("SHA-256");
        const preservedAfterRejectedRestore = createPGlite(pgliteDir);
        expect((await preservedAfterRejectedRestore.query<{ value: string }>("SELECT value FROM backup_probe")).rows)
            .toEqual([{ value: "preserved" }]);
        await preservedAfterRejectedRestore.close();
    });

    it("rejects live PGlite access and destinations inside the data directory", async () => {
        const root = await testRoot();
        const pgliteDir = join(root, "pglite");
        const database = createPGlite(pgliteDir);
        await database.exec("CREATE TABLE lock_probe (id INTEGER)");
        await database.close();
        const lease = await acquirePGliteLease(pgliteDir, "serve");
        try {
            await expect(backupRelayDatabase({
                provider: "pglite",
                destination: join(root, "relay.tar.gz"),
                pgliteDir,
            })).rejects.toThrow("PGlite is busy");
        } finally {
            await lease.release();
        }
        await expect(backupRelayDatabase({
            provider: "pglite",
            destination: join(pgliteDir, "unsafe.tar.gz"),
            pgliteDir,
        })).rejects.toThrow("outside the PGlite data directory");
        const alias = join(root, "pglite-alias");
        await symlink(pgliteDir, alias, "dir");
        await expect(backupRelayDatabase({
            provider: "pglite",
            destination: join(alias, "unsafe-through-symlink.tar.gz"),
            pgliteDir,
        })).rejects.toThrow("outside the PGlite data directory");

        const finalSymlink = join(pgliteDir, "force-backup-link.tar.gz");
        const outsideTarget = join(root, "outside-target.tar.gz");
        await symlink(outsideTarget, finalSymlink, "file");
        await expect(backupRelayDatabase({
            provider: "pglite",
            destination: finalSymlink,
            pgliteDir,
            force: true,
        })).rejects.toThrow("outside the PGlite data directory");
        expect(await readlink(finalSymlink)).toBe(outsideTarget);
    });

    it("keeps PostgreSQL credentials out of pg_dump arguments", async () => {
        const root = await testRoot();
        const pgDump = join(root, "pg_dump");
        const invocation = join(root, "invocation.txt");
        await writeFile(pgDump, `#!/bin/sh\nprintf '%s\\n' "$*" > "$PG_DUMP_TEST_INVOCATION"\nwhile [ "$#" -gt 0 ]; do\n  if [ "$1" = '--file' ]; then printf 'postgres-backup' > "$2"; exit 0; fi\n  shift\ndone\nexit 2\n`);
        await chmod(pgDump, 0o755);
        const previous = process.env.PG_DUMP_TEST_INVOCATION;
        process.env.PG_DUMP_TEST_INVOCATION = invocation;
        try {
            const result = await backupRelayDatabase({
                provider: "postgres",
                destination: join(root, "relay.dump"),
                pgliteDir: join(root, "unused"),
                databaseUrl: "postgresql://relay-user:sensitive-password@example.invalid:5433/relay-db?sslmode=require",
                pgDumpExecutable: pgDump,
            });
            expect(result.provider).toBe("postgres");
            const args = await readFile(invocation, "utf8");
            expect(args).not.toContain("sensitive-password");
            expect(args).not.toContain("postgresql://");
            expect(args).toContain("--format=custom");
        } finally {
            if (previous === undefined) delete process.env.PG_DUMP_TEST_INVOCATION;
            else process.env.PG_DUMP_TEST_INVOCATION = previous;
        }
    });

    it("restores PostgreSQL through one transaction without credential arguments", async () => {
        const root = await testRoot();
        const source = join(root, "relay.dump");
        const content = "postgres-backup";
        await writeFile(source, content);
        await writeFile(`${source}.sha256`, `${createHash("sha256").update(content).digest("hex")}  relay.dump\n`);
        const pgRestore = join(root, "pg_restore");
        const invocation = join(root, "restore-invocation.txt");
        await writeFile(pgRestore, `#!/bin/sh\nprintf '%s\\n' "$*" > "$PG_RESTORE_TEST_INVOCATION"\nexit 0\n`);
        await chmod(pgRestore, 0o755);
        const previous = process.env.PG_RESTORE_TEST_INVOCATION;
        process.env.PG_RESTORE_TEST_INVOCATION = invocation;
        try {
            await restoreRelayDatabase({
                provider: "postgres",
                source,
                pgliteDir: join(root, "unused"),
                databaseUrl: "postgresql://relay-user:sensitive-password@example.invalid:5433/relay-db",
                force: true,
                pgRestoreExecutable: pgRestore,
            });
            const args = await readFile(invocation, "utf8");
            expect(args).toContain("--single-transaction");
            expect(args).toContain("--exit-on-error");
            expect(args).toContain("--dbname");
            expect(args).toContain("relay-db");
            expect(args).not.toContain("sensitive-password");
            expect(args).not.toContain("postgresql://");
        } finally {
            if (previous === undefined) delete process.env.PG_RESTORE_TEST_INVOCATION;
            else process.env.PG_RESTORE_TEST_INVOCATION = previous;
        }
    });

    it("maps PostgreSQL URLs into libpq environment", () => {
        expect(postgresBackupEnvironment("postgres://user:p%40ss@db.example:5433/relay?sslmode=verify-full")).toEqual({
            PGHOST: "db.example",
            PGPORT: "5433",
            PGDATABASE: "relay",
            PGCONNECT_TIMEOUT: "10",
            PGUSER: "user",
            PGPASSWORD: "p@ss",
            PGSSLMODE: "verify-full",
        });
    });
});
