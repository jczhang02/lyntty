import { describe, expect, it } from "vitest";
import { isStandaloneEntrypoint } from "./standalone";

describe("isStandaloneEntrypoint", () => {
    it("recognizes standalone script paths on Windows and POSIX", () => {
        expect(isStandaloneEntrypoint("C:\\Projects\\Work\\lyntty\\packages\\lyntty-relay\\sources\\standalone.ts")).toBe(true);
        expect(isStandaloneEntrypoint("/repo/packages/lyntty-relay/sources/standalone.ts")).toBe(true);
        expect(isStandaloneEntrypoint("/repo/packages/lyntty-relay/dist/lyntty-relay")).toBe(true);
        expect(isStandaloneEntrypoint("C:\\repo\\packages\\lyntty-relay\\dist\\lyntty-relay.exe")).toBe(true);
    });

    it("rejects unrelated entrypoints", () => {
        expect(isStandaloneEntrypoint("C:\\repo\\node_modules\\vitest\\vitest.mjs")).toBe(false);
        expect(isStandaloneEntrypoint("/repo/packages/lyntty-relay/sources/main.ts")).toBe(false);
    });
});
