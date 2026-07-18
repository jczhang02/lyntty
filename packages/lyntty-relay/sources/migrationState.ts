import { createHash } from "node:crypto";

export const RELAY_SCHEMA_COMPATIBILITY_VERSION = 1;

export interface MigrationDescriptor {
    checksum: string;
    name: string;
}

export interface MigrationQueryResult<Row> {
    rows: Row[];
}

export interface MigrationInspectionDatabase {
    query<Row>(sql: string, params?: unknown[]): Promise<MigrationQueryResult<Row>>;
}

export interface RelayMigrationState {
    compatible: boolean;
    relaySchemaVersion: number;
    databaseMinimumRelaySchema: number | null;
    databaseCurrentRelaySchema: number | null;
    databaseAttestedMigrationHead: string | null;
    databaseAttestedMigrationChecksum: string | null;
    databaseAttestedMigrationCount: number | null;
    databaseAttestedMigrationSetChecksum: string | null;
    migrationAttestationValid: boolean;
    applied: string[];
    pending: string[];
    unknownApplied: string[];
    unfinished: string[];
    checksumMismatches: string[];
    missingChecksums: string[];
}

function missingTable(error: unknown): boolean {
    const code = (error as { code?: unknown }).code;
    return code === "42P01" || String((error as Error)?.message ?? error).includes("does not exist");
}

async function migrationRows(database: MigrationInspectionDatabase): Promise<Array<{
    checksum: string | null;
    finished_at: Date | null;
    migration_name: string;
    rolled_back_at: Date | null;
}>> {
    try {
        return (await database.query<{
            checksum: string | null;
            finished_at: Date | null;
            migration_name: string;
            rolled_back_at: Date | null;
        }>(`SELECT "migration_name", "checksum", "finished_at", "rolled_back_at" FROM "_prisma_migrations"`)).rows;
    } catch (error) {
        if (missingTable(error)) return [];
        throw error;
    }
}

async function compatibilityRow(database: MigrationInspectionDatabase): Promise<{
    attested_migration_checksum: string | null;
    attested_migration_count: number | null;
    attested_migration_head: string | null;
    attested_migration_set_checksum: string | null;
    current_relay_schema: number;
    minimum_relay_schema: number;
} | null> {
    try {
        return (await database.query<{
            attested_migration_checksum: string | null;
            attested_migration_count: number | null;
            attested_migration_head: string | null;
            attested_migration_set_checksum: string | null;
            current_relay_schema: number;
            minimum_relay_schema: number;
        }>(`SELECT "minimum_relay_schema", "current_relay_schema", "attested_migration_head", "attested_migration_checksum", "attested_migration_count", "attested_migration_set_checksum" FROM "_lyntty_schema_compatibility" WHERE "id" = 1`)).rows[0] ?? null;
    } catch (error) {
        if (missingTable(error)) return null;
        if ((error as { code?: unknown }).code !== "42703") throw error;
        const legacy = (await database.query<{
            current_relay_schema: number;
            minimum_relay_schema: number;
        }>(`SELECT "minimum_relay_schema", "current_relay_schema" FROM "_lyntty_schema_compatibility" WHERE "id" = 1`)).rows[0];
        return legacy ? {
            ...legacy,
            attested_migration_head: null,
            attested_migration_checksum: null,
            attested_migration_count: null,
            attested_migration_set_checksum: null,
        } : null;
    }
}

export function migrationSetChecksum(
    migrations: readonly { checksum: string | null; name: string }[],
): string | null {
    if (migrations.some(migration => !migration.checksum)) return null;
    const canonical = [...migrations]
        .sort((left, right) => left.name.localeCompare(right.name) || left.checksum!.localeCompare(right.checksum!))
        .map(migration => `${migration.name}:${migration.checksum}\n`)
        .join("");
    return createHash("sha256").update(canonical).digest("hex");
}

export async function inspectMigrationState(
    database: MigrationInspectionDatabase,
    migrations: readonly MigrationDescriptor[],
): Promise<RelayMigrationState> {
    const [rows, compatibility] = await Promise.all([
        migrationRows(database),
        compatibilityRow(database),
    ]);
    const activeRows = rows.filter(row => row.finished_at && !row.rolled_back_at);
    const unfinished = rows.filter(row => !row.finished_at && !row.rolled_back_at).map(row => row.migration_name).sort();
    const known = new Map(migrations.map(migration => [migration.name, migration.checksum]));
    const applied = activeRows.map(row => row.migration_name).filter(name => known.has(name)).sort();
    const appliedSet = new Set(applied);
    const pending = migrations.map(migration => migration.name).filter(name => !appliedSet.has(name)).sort();
    const unknownApplied = activeRows.map(row => row.migration_name).filter(name => !known.has(name)).sort();
    const checksumMismatches = activeRows
        .filter(row => known.has(row.migration_name) && row.checksum && row.checksum !== known.get(row.migration_name))
        .map(row => row.migration_name)
        .sort();
    const missingChecksums = activeRows
        .filter(row => known.has(row.migration_name) && !row.checksum)
        .map(row => row.migration_name)
        .sort();
    const minimumSchema = compatibility?.minimum_relay_schema ?? null;
    const latestApplied = [...activeRows].sort((left, right) => left.migration_name.localeCompare(right.migration_name)).at(-1) ?? null;
    const activeSetChecksum = migrationSetChecksum(activeRows.map(row => ({
        name: row.migration_name,
        checksum: row.checksum,
    })));
    const migrationAttestationValid = latestApplied !== null
        && latestApplied.checksum !== null
        && activeSetChecksum !== null
        && compatibility?.attested_migration_head === latestApplied.migration_name
        && compatibility?.attested_migration_checksum === latestApplied.checksum
        && compatibility?.attested_migration_count === activeRows.length
        && compatibility?.attested_migration_set_checksum === activeSetChecksum;
    const unknownMigrationsCompatible = unknownApplied.length === 0
        || (minimumSchema !== null
            && minimumSchema <= RELAY_SCHEMA_COMPATIBILITY_VERSION
            && migrationAttestationValid);
    const compatible = pending.length === 0
        && unfinished.length === 0
        && checksumMismatches.length === 0
        && missingChecksums.length === 0
        && unknownMigrationsCompatible
        && (minimumSchema === null || minimumSchema <= RELAY_SCHEMA_COMPATIBILITY_VERSION);

    return {
        compatible,
        relaySchemaVersion: RELAY_SCHEMA_COMPATIBILITY_VERSION,
        databaseMinimumRelaySchema: minimumSchema,
        databaseCurrentRelaySchema: compatibility?.current_relay_schema ?? null,
        databaseAttestedMigrationHead: compatibility?.attested_migration_head ?? null,
        databaseAttestedMigrationChecksum: compatibility?.attested_migration_checksum ?? null,
        databaseAttestedMigrationCount: compatibility?.attested_migration_count ?? null,
        databaseAttestedMigrationSetChecksum: compatibility?.attested_migration_set_checksum ?? null,
        migrationAttestationValid,
        applied,
        pending,
        unknownApplied,
        unfinished,
        checksumMismatches,
        missingChecksums,
    };
}

export function migrationStateFailure(state: RelayMigrationState): string {
    const reasons: string[] = [];
    if (state.pending.length) reasons.push(`pending migrations: ${state.pending.join(", ")}`);
    if (state.unfinished.length) reasons.push(`unfinished migrations: ${state.unfinished.join(", ")}`);
    if (state.checksumMismatches.length) reasons.push(`checksum mismatches: ${state.checksumMismatches.join(", ")}`);
    if (state.missingChecksums.length) reasons.push(`missing migration checksums: ${state.missingChecksums.join(", ")}`);
    if (state.unknownApplied.length && !state.migrationAttestationValid) {
        reasons.push(`unknown migrations without a valid complete-set attestation: ${state.unknownApplied.join(", ")}`);
    }
    if (state.databaseMinimumRelaySchema !== null && state.databaseMinimumRelaySchema > state.relaySchemaVersion) {
        reasons.push(`database requires Relay schema ${state.databaseMinimumRelaySchema}, binary supports ${state.relaySchemaVersion}`);
    }
    return reasons.join("; ") || "database schema is not compatible";
}
