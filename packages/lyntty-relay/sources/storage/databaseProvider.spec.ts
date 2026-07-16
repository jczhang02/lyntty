import { describe, expect, it } from "bun:test";
import { resolveDatabaseProvider } from "./databaseProvider";

describe("resolveDatabaseProvider", () => {
    it("defaults to PGlite without an external database URL", () => {
        expect(resolveDatabaseProvider({})).toBe("pglite");
    });

    it("selects PostgreSQL when DATABASE_URL is configured", () => {
        expect(resolveDatabaseProvider({ DATABASE_URL: "postgresql://example.invalid/lyntty" })).toBe("postgres");
    });

    it("honors an explicit provider", () => {
        expect(resolveDatabaseProvider({
            DATABASE_URL: "postgresql://example.invalid/lyntty",
            DB_PROVIDER: "pglite",
        })).toBe("pglite");
    });

    it("rejects unknown providers", () => {
        expect(() => resolveDatabaseProvider({ DB_PROVIDER: "sqlite" })).toThrow("Unsupported DB_PROVIDER");
    });
});
