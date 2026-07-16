import { describe, expect, it } from "bun:test";
import { isStandaloneEntrypoint, standaloneCommandFromArgv } from "./standalone";

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

    it("resolves source and compiled executable argument layouts", () => {
        expect(standaloneCommandFromArgv(["bun", "/repo/sources/standalone.ts", "migrate"])).toBe("migrate");
        expect(standaloneCommandFromArgv(["/repo/dist/lyntty-relay", "serve"])).toBe("serve");
        expect(standaloneCommandFromArgv(["C:\\repo\\dist\\lyntty-relay.exe", "--help"])).toBe("--help");
        expect(standaloneCommandFromArgv(["/repo/dist/lyntty-relay"])).toBeUndefined();
    });
});
