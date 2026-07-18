import { createHash } from "node:crypto";
import { accessSync, constants, createReadStream, existsSync, statSync } from "node:fs";
import { chmod, link, mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { canonicalizePath, canonicalizeWritePath } from "./canonicalPath";
import { acquirePGliteLease, type PGliteLease } from "./pgliteLock";
import { createPGlite, createPGliteFromDump } from "./storage/pgliteLoader";
import type { DatabaseProvider } from "./storage/databaseProvider";

export interface RelayBackupResult {
    provider: DatabaseProvider;
    path: string;
    sha256: string;
    size: number;
}

function safeDestination(destination: string): string {
    const resolved = resolve(destination);
    if (!isAbsolute(resolved)) throw new Error("Backup destination must resolve to an absolute path");
    return resolved;
}

async function destinationAvailable(path: string, force: boolean): Promise<void> {
    try {
        await stat(path);
        if (!force) throw new Error(`Backup destination already exists: ${path}`);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
}

async function createPrivateFile(path: string, content?: string): Promise<void> {
    const handle = await open(path, "wx", 0o600);
    try {
        if (content !== undefined) await handle.writeFile(content, "utf8");
        await handle.sync();
    } finally {
        await handle.close();
    }
}

async function fsyncFile(path: string): Promise<void> {
    const handle = await open(path, "r");
    try {
        await handle.sync();
    } finally {
        await handle.close();
    }
}

async function acquireDestinationLock(
    destination: string,
    followFinalComponent: boolean,
): Promise<() => Promise<void>> {
    const canonicalDestination = followFinalComponent
        ? await canonicalizePath(destination)
        : await canonicalizeWritePath(destination);
    const lockPath = `${canonicalDestination}.operation.lock`;
    let handle: Awaited<ReturnType<typeof open>>;
    try {
        handle = await open(lockPath, "wx", 0o600);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
            throw new Error(`Another backup or restore owns ${lockPath}; remove it only after verifying no operation is running`);
        }
        throw error;
    }
    return async () => {
        await handle.close().catch(() => undefined);
        await rm(lockPath, { force: true });
    };
}

async function commitBackup(
    temporaryPath: string,
    temporaryChecksumPath: string,
    destination: string,
    force: boolean,
): Promise<RelayBackupResult["size"]> {
    const checksumPath = `${destination}.sha256`;
    await destinationAvailable(destination, force);
    await destinationAvailable(checksumPath, force);
    if (force) {
        // POSIX rename replaces each prior regular file atomically; never unlink
        // the last good backup before its complete replacement exists.
        await rename(temporaryPath, destination);
        await rename(temporaryChecksumPath, checksumPath);
    } else {
        await link(temporaryPath, destination).catch(error => {
            if ((error as NodeJS.ErrnoException).code === "EEXIST") {
                throw new Error(`Backup destination already exists: ${destination}`);
            }
            throw error;
        });
        try {
            await link(temporaryChecksumPath, checksumPath);
        } catch (error) {
            await rm(destination, { force: true });
            throw error;
        }
        await rm(temporaryPath, { force: true });
        await rm(temporaryChecksumPath, { force: true });
    }
    const directoryHandle = await open(dirname(destination), "r").catch(() => null);
    if (directoryHandle) {
        await directoryHandle.sync().catch(() => undefined);
        await directoryHandle.close();
    }
    return (await stat(destination)).size;
}

async function pathIsInside(parent: string, candidate: string, writePath: boolean): Promise<boolean> {
    const [canonicalParent, canonicalCandidate] = await Promise.all([
        canonicalizePath(parent),
        writePath ? canonicalizeWritePath(candidate) : canonicalizePath(candidate),
    ]);
    const fromParent = relative(canonicalParent, canonicalCandidate);
    return fromParent === ""
        || (fromParent !== ".." && !fromParent.startsWith(`..${sep}`) && !isAbsolute(fromParent));
}

export function postgresBackupEnvironment(databaseUrl: string): Record<string, string> {
    const parsed = new URL(databaseUrl);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
        throw new Error("DATABASE_URL must use postgres:// or postgresql://");
    }
    const database = parsed.pathname.replace(/^\//, "");
    if (!parsed.hostname || !database) throw new Error("DATABASE_URL must include a host and database name");
    const environment: Record<string, string> = {
        PGHOST: parsed.hostname,
        PGPORT: parsed.port || "5432",
        PGDATABASE: decodeURIComponent(database),
        PGCONNECT_TIMEOUT: "10",
    };
    if (parsed.username) environment.PGUSER = decodeURIComponent(parsed.username);
    if (parsed.password) environment.PGPASSWORD = decodeURIComponent(parsed.password);
    const sslMode = parsed.searchParams.get("sslmode");
    if (sslMode) environment.PGSSLMODE = sslMode;
    return environment;
}

function resolvePostgresTool(name: "pg_dump" | "pg_restore", candidates: string[]): string {
    for (const candidate of candidates) {
        try {
            if (existsSync(candidate) && statSync(candidate).isFile()) {
                accessSync(candidate, constants.X_OK);
                return candidate;
            }
        } catch {
            // Try the next fixed native-tool location.
        }
    }
    throw new Error(`${name} is required for PostgreSQL ${name === "pg_dump" ? "backups" : "restores"}`);
}

export function resolvePgDumpExecutable(candidates = ["/usr/bin/pg_dump", "/usr/local/bin/pg_dump"]): string {
    return resolvePostgresTool("pg_dump", candidates);
}

export function resolvePgRestoreExecutable(candidates = ["/usr/bin/pg_restore", "/usr/local/bin/pg_restore"]): string {
    return resolvePostgresTool("pg_restore", candidates);
}

async function backupPGlite(pgliteDir: string, temporaryPath: string): Promise<void> {
    const database = createPGlite(pgliteDir);
    try {
        const dump = await database.dumpDataDir("gzip");
        await Bun.write(temporaryPath, dump);
        await chmod(temporaryPath, 0o600);
    } finally {
        await database.close();
    }
}

async function backupPostgres(databaseUrl: string, temporaryPath: string, pgDumpExecutable: string): Promise<void> {
    const child = Bun.spawn([
        pgDumpExecutable,
        "--format=custom",
        "--no-owner",
        "--no-acl",
        "--file",
        temporaryPath,
    ], {
        env: { ...process.env, ...postgresBackupEnvironment(databaseUrl) },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
    ]);
    if (exitCode !== 0) {
        throw new Error(`pg_dump failed (${exitCode}): ${stderr.trim() || stdout.trim()}`);
    }
}

async function sha256File(path: string): Promise<string> {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest("hex");
}

async function verifyBackupChecksum(source: string): Promise<void> {
    const checksumPath = `${source}.sha256`;
    let expected: string;
    try {
        expected = (await readFile(checksumPath, "utf8")).trim().split(/\s+/)[0] ?? "";
    } catch (error) {
        throw new Error(`Backup checksum sidecar is required: ${checksumPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error(`Backup checksum sidecar is malformed: ${checksumPath}`);
    if (await sha256File(source) !== expected) throw new Error("Backup SHA-256 does not match its sidecar");
}

export async function backupRelayDatabase(options: {
    provider: DatabaseProvider;
    destination: string;
    pgliteDir: string;
    databaseUrl?: string;
    force?: boolean;
    pgDumpExecutable?: string;
}): Promise<RelayBackupResult> {
    const destination = safeDestination(options.destination);
    if (options.provider === "pglite" && await pathIsInside(options.pgliteDir, destination, true)) {
        throw new Error("PGlite backup destination must be outside the PGlite data directory");
    }
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    const releaseDestinationLock = await acquireDestinationLock(destination, false);
    let pgliteLease: PGliteLease | null = null;
    const temporaryPath = join(dirname(destination), `.${crypto.randomUUID()}.backup.tmp`);
    const temporaryChecksumPath = `${temporaryPath}.sha256`;
    try {
        await destinationAvailable(destination, options.force === true);
        await destinationAvailable(`${destination}.sha256`, options.force === true);
        await createPrivateFile(temporaryPath);
        if (options.provider === "pglite") {
            pgliteLease = await acquirePGliteLease(options.pgliteDir, "backup");
            await backupPGlite(options.pgliteDir, temporaryPath);
        } else {
            if (!options.databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL backups");
            await backupPostgres(
                options.databaseUrl,
                temporaryPath,
                options.pgDumpExecutable ?? resolvePgDumpExecutable(),
            );
        }
        await fsyncFile(temporaryPath);
        const sha256 = await sha256File(temporaryPath);
        await createPrivateFile(temporaryChecksumPath, `${sha256}  ${basename(destination)}\n`);
        const size = await commitBackup(
            temporaryPath,
            temporaryChecksumPath,
            destination,
            options.force === true,
        );
        return { provider: options.provider, path: destination, sha256, size };
    } finally {
        await pgliteLease?.release().catch(() => undefined);
        await rm(temporaryPath, { force: true });
        await rm(temporaryChecksumPath, { force: true });
        await releaseDestinationLock();
    }
}

async function restorePGlite(source: string, pgliteDir: string, force: boolean): Promise<void> {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(pgliteDir)) throw new Error("PGlite restore requires a filesystem data directory");
    const existing = existsSync(pgliteDir);
    if (existing && !force) throw new Error(`PGlite data directory already exists: ${pgliteDir}`);
    await mkdir(dirname(pgliteDir), { recursive: true, mode: 0o700 });
    const previousPath = `${pgliteDir}.${crypto.randomUUID()}.restore-previous`;
    if (existing) await rename(pgliteDir, previousPath);
    try {
        const database = createPGliteFromDump(pgliteDir, Bun.file(source));
        try {
            await database.query("SELECT 1");
        } finally {
            await database.close();
        }
        if (existing) await rm(previousPath, { recursive: true, force: true });
    } catch (error) {
        await rm(pgliteDir, { recursive: true, force: true });
        if (existing) await rename(previousPath, pgliteDir);
        throw error;
    }
}

async function restorePostgres(
    source: string,
    databaseUrl: string,
    pgRestoreExecutable: string,
): Promise<void> {
    const environment = postgresBackupEnvironment(databaseUrl);
    const child = Bun.spawn([
        pgRestoreExecutable,
        "--clean",
        "--if-exists",
        "--single-transaction",
        "--exit-on-error",
        "--no-owner",
        "--no-acl",
        "--dbname",
        environment.PGDATABASE!,
        source,
    ], {
        env: { ...process.env, ...environment },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
    ]);
    if (exitCode !== 0) throw new Error(`pg_restore failed (${exitCode}): ${stderr.trim() || stdout.trim()}`);
}

export async function restoreRelayDatabase(options: {
    provider: DatabaseProvider;
    source: string;
    pgliteDir: string;
    databaseUrl?: string;
    force: boolean;
    pgRestoreExecutable?: string;
}): Promise<void> {
    const source = safeDestination(options.source);
    if (!statSync(source).isFile()) throw new Error(`Backup source is not a regular file: ${source}`);
    if (options.provider === "pglite" && await pathIsInside(options.pgliteDir, source, false)) {
        throw new Error("PGlite restore source must be outside the PGlite data directory");
    }
    const releaseDestinationLock = await acquireDestinationLock(source, true);
    let pgliteLease: PGliteLease | null = null;
    try {
        await verifyBackupChecksum(source);
        if (!options.force) throw new Error("Restore is destructive and requires --force");
        if (options.provider === "pglite") {
            pgliteLease = await acquirePGliteLease(options.pgliteDir, "restore");
            await restorePGlite(source, options.pgliteDir, true);
            return;
        }
        if (!options.databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL restore");
        await restorePostgres(
            source,
            options.databaseUrl,
            options.pgRestoreExecutable ?? resolvePgRestoreExecutable(),
        );
    } finally {
        await pgliteLease?.release().catch(() => undefined);
        await releaseDestinationLock();
    }
}
