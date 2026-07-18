import { afterEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdir, rm, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";

import { acquirePGliteLease } from "./pgliteLock";

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe("PGlite lifecycle lease", () => {
    it("excludes backup/restore while another Relay process holds the data directory", async () => {
        const root = resolve(import.meta.dir, "../dist/test-state", `pglite-lock-${randomUUID()}`);
        roots.push(root);
        await mkdir(root, { recursive: true });
        const dataDir = join(root, "pglite");
        await mkdir(dataDir);
        const alias = join(root, "pglite-alias");
        await symlink(dataDir, alias, "dir");
        const first = await acquirePGliteLease(dataDir, "serve");
        await expect(acquirePGliteLease(dataDir, "backup")).rejects.toThrow("PGlite is busy");
        await expect(acquirePGliteLease(alias, "restore")).rejects.toThrow("PGlite is busy");
        await first.release();
        const next = await acquirePGliteLease(dataDir, "restore");
        await next.release();
    });
});
