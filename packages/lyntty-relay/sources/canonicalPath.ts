import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

/** Resolve symlinks through the nearest existing ancestor of a possibly-new path. */
export async function canonicalizePath(path: string): Promise<string> {
    let existing = resolve(path);
    const suffix: string[] = [];
    while (!existsSync(existing)) {
        const parent = dirname(existing);
        if (parent === existing) break;
        suffix.unshift(basename(existing));
        existing = parent;
    }
    const canonicalAncestor = await realpath(existing);
    return resolve(canonicalAncestor, ...suffix);
}

/** Resolve the parent but never follow an existing final component to be replaced. */
export async function canonicalizeWritePath(path: string): Promise<string> {
    return resolve(await canonicalizePath(dirname(resolve(path))), basename(path));
}
