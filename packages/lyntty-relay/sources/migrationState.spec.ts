import { describe, expect, it } from "bun:test";

import {
    inspectMigrationState,
    migrationSetChecksum,
    migrationStateFailure,
    type MigrationInspectionDatabase,
} from "./migrationState";

const migrations = [
    { name: "001_first", checksum: "a".repeat(64) },
    { name: "002_second", checksum: "b".repeat(64) },
];

function database(options: {
    rows?: Array<{ migration_name: string; checksum: string | null; finished_at: Date | null; rolled_back_at: Date | null }>;
    compatibility?: {
        minimum_relay_schema: number;
        current_relay_schema: number;
        attested_migration_head?: string | null;
        attested_migration_checksum?: string | null;
        attested_migration_count?: number | null;
        attested_migration_set_checksum?: string | null;
    } | null;
}): MigrationInspectionDatabase {
    return {
        async query<Row>(sql: string) {
            const rows = sql.includes("_lyntty_schema_compatibility")
                ? (options.compatibility ? [options.compatibility] : [])
                : (options.rows ?? []);
            return { rows: rows as Row[] };
        },
    };
}

function applied(name: string, checksum: string | null) {
    return { migration_name: name, checksum, finished_at: new Date(), rolled_back_at: null };
}

function compatibilityFor(
    rows: ReturnType<typeof applied>[],
    minimumRelaySchema = 1,
    currentRelaySchema = 2,
) {
    const latest = [...rows].sort((left, right) => left.migration_name.localeCompare(right.migration_name)).at(-1)!;
    return {
        minimum_relay_schema: minimumRelaySchema,
        current_relay_schema: currentRelaySchema,
        attested_migration_head: latest.migration_name,
        attested_migration_checksum: latest.checksum,
        attested_migration_count: rows.length,
        attested_migration_set_checksum: migrationSetChecksum(rows.map(row => ({
            name: row.migration_name,
            checksum: row.checksum,
        }))),
    };
}

describe("Relay migration compatibility", () => {
    it("reports pending and unfinished migrations as incompatible", async () => {
        const state = await inspectMigrationState(database({
            rows: [applied("001_first", "a".repeat(64)), {
                migration_name: "unfinished",
                checksum: null,
                finished_at: null,
                rolled_back_at: null,
            }],
        }), migrations);
        expect(state.compatible).toBe(false);
        expect(state.pending).toEqual(["002_second"]);
        expect(state.unfinished).toEqual(["unfinished"]);
        expect(migrationStateFailure(state)).toContain("pending migrations");
    });

    it("fails known migration checksum mismatches", async () => {
        const state = await inspectMigrationState(database({
            rows: [applied("001_first", "bad"), applied("002_second", "b".repeat(64))],
        }), migrations);
        expect(state.compatible).toBe(false);
        expect(state.checksumMismatches).toEqual(["001_first"]);
    });

    it("requires migrate to backfill legacy null checksums before serve", async () => {
        const state = await inspectMigrationState(database({
            rows: [applied("001_first", null), applied("002_second", "b".repeat(64))],
        }), migrations);
        expect(state.compatible).toBe(false);
        expect(state.missingChecksums).toEqual(["001_first"]);
        expect(migrationStateFailure(state)).toContain("missing migration checksums");
    });

    it("allows additive future migrations only with an explicit compatible minimum", async () => {
        const rows = [
            applied("001_first", "a".repeat(64)),
            applied("002_second", "b".repeat(64)),
            applied("003_future_expand", "c".repeat(64)),
        ];
        expect((await inspectMigrationState(database({ rows }), migrations)).compatible).toBe(false);
        expect((await inspectMigrationState(database({
            rows,
            compatibility: compatibilityFor(rows),
        }), migrations)).compatible).toBe(true);
        const stale = await inspectMigrationState(database({
            rows,
            compatibility: compatibilityFor(rows.slice(0, 2), 1, 1),
        }), migrations);
        expect(stale.compatible).toBe(false);
        expect(migrationStateFailure(stale)).toContain("valid complete-set attestation");

        const prependedUnknown = [applied("000_future_expand", "0".repeat(64)), ...rows];
        const prependedState = await inspectMigrationState(database({
            rows: prependedUnknown,
            compatibility: compatibilityFor(rows),
        }), migrations);
        expect(prependedState.compatible).toBe(false);

        const multipleUnknown = [...rows, applied("004_future_expand", "d".repeat(64))];
        expect((await inspectMigrationState(database({
            rows: multipleUnknown,
            compatibility: compatibilityFor(multipleUnknown),
        }), migrations)).compatible).toBe(true);
    });

    it("rejects a contract schema requiring a newer Relay binary", async () => {
        const rows = [applied("001_first", "a".repeat(64)), applied("002_second", "b".repeat(64))];
        const state = await inspectMigrationState(database({
            rows,
            compatibility: compatibilityFor(rows, 2, 2),
        }), migrations);
        expect(state.compatible).toBe(false);
        expect(migrationStateFailure(state)).toContain("requires Relay schema 2");
    });
});
