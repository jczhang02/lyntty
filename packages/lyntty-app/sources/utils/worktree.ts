/**
 * Git worktree operations: create, list, remove
 */

import { machineWorktreeCreate, machineWorktreeList, machineWorktreeRemove } from '@/sync/ops';

/** Relative path prefix where worktrees are stored inside a repo */
export const WORKTREE_DIR = '.dev/worktree';

/** Absolute path marker used to detect worktree paths */
export const WORKTREE_PATH_MARKER = `/${WORKTREE_DIR}/`;

// --- Name generation ---

const adjectives = [
    'clever', 'lyntty', 'swift', 'bright', 'calm',
    'bold', 'quiet', 'brave', 'wise', 'eager',
    'gentle', 'quick', 'sharp', 'smooth', 'fresh'
];

const nouns = [
    'ocean', 'forest', 'cloud', 'star', 'river',
    'mountain', 'valley', 'bridge', 'beacon', 'harbor',
    'garden', 'meadow', 'canyon', 'island', 'desert'
];

function generateWorktreeName(): string {
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adjective}-${noun}`;
}

// --- Operations ---

export async function createWorktree(
    machineId: string,
    basePath: string
): Promise<{
    success: boolean;
    worktreePath: string;
    branchName: string;
    error?: string;
}> {
    const name = generateWorktreeName();

    for (const branchName of [name, `${name}-2`, `${name}-3`, `${name}-4`]) {
        const result = await machineWorktreeCreate(machineId, basePath, branchName);
        if (result.success) {
            return result;
        }
        if (!result.error?.includes('already exists')) {
            return result;
        }
    }

    return {
        success: false,
        worktreePath: '',
        branchName: '',
        error: 'Failed to create unique worktree'
    };
}

export interface WorktreeInfo {
    path: string;
    branch: string;
}

export async function listWorktrees(
    machineId: string,
    basePath: string
): Promise<
    | { success: true; worktrees: WorktreeInfo[] }
    | { success: false; error: string }
> {
    return machineWorktreeList(machineId, basePath);
}

export async function removeWorktree(
    machineId: string,
    worktreePath: string
): Promise<{ success: boolean; error?: string }> {
    if (!isWorktreePath(worktreePath)) {
        return { success: false, error: 'Not a worktree path' };
    }

    const result = await machineWorktreeRemove(machineId, worktreePath);
    return {
        success: result.success,
        error: result.success ? undefined : (result.error || 'Failed to remove worktree'),
    };
}

/** Check if a path is inside a worktree */
export function isWorktreePath(path: string): boolean {
    return path.includes(WORKTREE_PATH_MARKER);
}

/** Extract the main repository checkout path from a possibly-worktree path */
export function getRepoPath(path: string): string {
    const idx = path.indexOf(WORKTREE_PATH_MARKER);
    if (idx === -1) return path;
    return path.slice(0, idx);
}

/** Extract the worktree name from a worktree path, or null if not a worktree */
export function getWorktreeName(path: string): string | null {
    const idx = path.indexOf(WORKTREE_PATH_MARKER);
    if (idx === -1) return null;
    return path.slice(idx + WORKTREE_PATH_MARKER.length);
}
