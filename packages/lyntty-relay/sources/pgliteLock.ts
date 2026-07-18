import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { canonicalizePath } from "./canonicalPath";

export interface PGliteLease {
    release(): Promise<void>;
}

function resolveFlock(): string {
    for (const candidate of ["/usr/bin/flock", "/bin/flock"]) {
        if (existsSync(candidate)) return candidate;
    }
    throw new Error("flock is required for safe PGlite lifecycle operations");
}

export async function acquirePGliteLease(dataDir: string, purpose: string): Promise<PGliteLease> {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(dataDir)) {
        throw new Error("PGlite lifecycle locking requires a filesystem data directory");
    }
    const lockPath = `${await canonicalizePath(dataDir)}.lyntty.lock`;
    await mkdir(dirname(lockPath), { recursive: true, mode: 0o700 });
    const child = Bun.spawn([
        resolveFlock(),
        "--exclusive",
        "--nonblock",
        lockPath,
        "/bin/sh",
        "-c",
        "printf 'locked\\n'; cat >/dev/null",
    ], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
    });
    const reader = child.stdout.getReader();
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
        const outcome = await Promise.race([
            reader.read().then(result => result.done ? "closed" : new TextDecoder().decode(result.value).trim()),
            child.exited.then(code => `exit:${code}`),
            new Promise<string>(resolveTimeout => {
                timeout = setTimeout(() => resolveTimeout("timeout"), 5_000);
            }),
        ]);
        if (outcome !== "locked") {
            child.kill("SIGKILL");
            const stderr = await new Response(child.stderr).text().catch(() => "");
            throw new Error(`PGlite is busy; stop Relay before ${purpose}${stderr.trim() ? `: ${stderr.trim()}` : ""}`);
        }
    } finally {
        if (timeout) clearTimeout(timeout);
        reader.releaseLock();
    }

    let released = false;
    return {
        async release() {
            if (released) return;
            released = true;
            child.stdin.end();
            const exitCode = await child.exited;
            if (exitCode !== 0) throw new Error(`PGlite ${purpose} lease exited with code ${exitCode}`);
        },
    };
}
