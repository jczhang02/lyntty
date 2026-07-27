import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { createPGlite } from "./storage/pgliteLoader";
import {
    isStandaloneEntrypoint,
    inspectConfiguredDatabase,
    pgliteDataDirectoryInitialized,
    relayBuildInfo,
    runMigrations,
    standaloneArgumentsFromArgv,
    standaloneCommandFromArgv,
} from "./standalone";

describe("isStandaloneEntrypoint", () => {
    it("recognizes standalone script paths on Windows and POSIX", () => {
        expect(isStandaloneEntrypoint("C:\\Projects\\Work\\lyntty\\packages\\lyntty-relay\\sources\\standalone.ts")).toBe(true);
        expect(isStandaloneEntrypoint("/repo/packages/lyntty-relay/sources/standalone.ts")).toBe(true);
        expect(isStandaloneEntrypoint("/repo/packages/lyntty-relay/dist/lyntty-relay")).toBe(true);
        expect(isStandaloneEntrypoint("C:\\repo\\packages\\lyntty-relay\\dist\\lyntty-relay.exe")).toBe(true);
    });

    it("rejects unrelated entrypoints", () => {
        expect(isStandaloneEntrypoint("C:\\repo\\node_modules\\test-runner\\runner.mjs")).toBe(false);
        expect(isStandaloneEntrypoint("/repo/packages/lyntty-relay/sources/main.ts")).toBe(false);
    });

    it("does not initialize a missing PGlite directory during diagnostics", () => {
        const missing = resolve(import.meta.dir, "../dist/test-state", `missing-doctor-${randomUUID()}`);
        expect(pgliteDataDirectoryInitialized(missing)).toBe(false);
        expect(existsSync(missing)).toBe(false);
    });

    it("upgrades an old PGlite database without losing account data", async () => {
        const root = resolve(import.meta.dir, "../dist/test-state", `old-pglite-${randomUUID()}`);
        const dataDir = resolve(root, "data");
        const previousProvider = process.env.DB_PROVIDER;
        process.env.DB_PROVIDER = "pglite";
        try {
            await runMigrations({ pgliteDir: dataDir });
            const database = createPGlite(dataDir);
            await database.exec(`
                INSERT INTO "Account" ("id", "publicKey", "updatedAt")
                VALUES ('preserved-account', 'preserved-public-key', now());
                DROP TABLE "_lyntty_schema_compatibility";
                UPDATE "_prisma_migrations" SET "checksum" = NULL
                WHERE "migration_name" = (SELECT MIN("migration_name") FROM "_prisma_migrations");
            `);
            await database.close();

            await runMigrations({ pgliteDir: dataDir });
            const reopened = createPGlite(dataDir);
            const result = await reopened.query<{ id: string }>(
                `SELECT "id" FROM "Account" WHERE "id" = 'preserved-account'`,
            );
            await reopened.close();
            expect(result.rows).toEqual([{ id: "preserved-account" }]);
            expect((await inspectConfiguredDatabase({ pgliteDir: dataDir })).compatible).toBe(true);
        } finally {
            if (previousProvider === undefined) delete process.env.DB_PROVIDER;
            else process.env.DB_PROVIDER = previousProvider;
            await rm(root, { recursive: true, force: true });
        }
    });

    it('reports independent Relay, schema, and Wire build identity', () => {
        expect(relayBuildInfo()).toMatchObject({
            component: 'lyntty-relay',
            version: '1.2.2',
            relaySchema: 1,
            minimumRelaySchema: 1,
            wire: { protocolMajor: 1, protocolMinor: 1 },
        });
    });

    it("resolves source and compiled executable argument layouts", () => {
        expect(standaloneCommandFromArgv(["bun", "/repo/sources/standalone.ts", "migrate"])).toBe("migrate");
        expect(standaloneCommandFromArgv(["/repo/dist/lyntty-relay", "serve"])).toBe("serve");
        expect(standaloneCommandFromArgv(["C:\\repo\\dist\\lyntty-relay.exe", "--help"])).toBe("--help");
        expect(standaloneCommandFromArgv(["/repo/dist/lyntty-relay"])).toBeUndefined();
        expect(standaloneArgumentsFromArgv(["bun", "/repo/sources/standalone.ts", "backup", "/safe/relay.dump", "--force"]))
            .toEqual(["backup", "/safe/relay.dump", "--force"]);
        expect(standaloneArgumentsFromArgv(["/repo/dist/lyntty-relay", "doctor", "--json"]))
            .toEqual(["doctor", "--json"]);
    });
});
