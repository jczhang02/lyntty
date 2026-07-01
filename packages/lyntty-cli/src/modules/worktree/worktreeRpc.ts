import { execFile } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const WORKTREE_DIR = '.dev/worktree';
const WORKTREE_PATH_MARKER = `/${WORKTREE_DIR}/`;
const BRANCH_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
const MAX_GIT_OUTPUT_CHARS = 200_000;

interface GitResult {
  stdout: string;
  stderr: string;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
}

export interface WorktreeCreateResult {
  success: boolean;
  worktreePath: string;
  branchName: string;
  error?: string;
}

export interface WorktreeRemoveResult {
  success: boolean;
  error?: string;
}

export interface WorktreeStatusResult {
  success: boolean;
  clean: boolean;
  error?: string;
}

function normalizeAbsolutePath(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new Error(`${name} is required`);
  }
  const normalized = resolve(value);
  if (!isAbsolute(normalized)) {
    throw new Error(`${name} must be an absolute path`);
  }
  return normalized;
}

function validateBranchName(value: unknown): string {
  if (typeof value !== 'string' || !BRANCH_NAME_RE.test(value) || value.includes('..') || value.endsWith('/')) {
    throw new Error('branchName is invalid');
  }
  return value;
}

function repoPathForWorktree(worktreePath: string): string {
  const idx = worktreePath.indexOf(WORKTREE_PATH_MARKER);
  if (idx === -1) {
    throw new Error('Not a managed worktree path');
  }
  const repoPath = worktreePath.slice(0, idx);
  if (!repoPath) {
    throw new Error('Invalid managed worktree path');
  }
  return repoPath;
}

async function runGit(cwd: string, args: string[]): Promise<GitResult> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      timeout: 30_000,
      maxBuffer: MAX_GIT_OUTPUT_CHARS,
      windowsHide: true,
    });
    return { stdout: stdout.toString(), stderr: stderr.toString() };
  } catch (error) {
    const execError = error as NodeJS.ErrnoException & { stdout?: string | Buffer; stderr?: string | Buffer };
    const stderr = execError.stderr ? execError.stderr.toString() : execError.message || 'git command failed';
    throw new Error(stderr);
  }
}

export async function createManagedWorktree(params: { basePath: unknown; branchName: unknown }): Promise<WorktreeCreateResult> {
  const basePath = normalizeAbsolutePath(params.basePath, 'basePath');
  const branchName = validateBranchName(params.branchName);
  const relativeWorktreePath = `${WORKTREE_DIR}/${branchName}`;

  try {
    await runGit(basePath, ['rev-parse', '--git-dir']);
    await runGit(basePath, ['worktree', 'add', '-b', branchName, relativeWorktreePath]);
    return {
      success: true,
      worktreePath: `${basePath}/${relativeWorktreePath}`,
      branchName,
    };
  } catch (error) {
    return {
      success: false,
      worktreePath: '',
      branchName: '',
      error: error instanceof Error ? error.message : 'Failed to create worktree',
    };
  }
}

export async function listManagedWorktrees(params: { basePath: unknown }): Promise<WorktreeInfo[]> {
  const basePath = normalizeAbsolutePath(params.basePath, 'basePath');
  const result = await runGit(basePath, ['worktree', 'list', '--porcelain']);
  const blocks = result.stdout.split('\n\n').slice(1);
  const worktrees: WorktreeInfo[] = [];

  for (const block of blocks) {
    let path = '';
    let branch = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) {
        path = line.slice('worktree '.length);
      } else if (line.startsWith('branch refs/heads/')) {
        branch = line.slice('branch refs/heads/'.length);
      }
    }
    if (path.includes(WORKTREE_PATH_MARKER)) {
      worktrees.push({ path, branch: branch || path });
    }
  }

  return worktrees;
}

export async function removeManagedWorktree(params: { worktreePath: unknown }): Promise<WorktreeRemoveResult> {
  const worktreePath = normalizeAbsolutePath(params.worktreePath, 'worktreePath');
  const basePath = repoPathForWorktree(worktreePath);

  try {
    await runGit(basePath, ['worktree', 'remove', worktreePath, '--force']);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove worktree',
    };
  }
}

export async function getManagedWorktreeStatus(params: { worktreePath: unknown }): Promise<WorktreeStatusResult> {
  const worktreePath = normalizeAbsolutePath(params.worktreePath, 'worktreePath');
  repoPathForWorktree(worktreePath);

  try {
    const result = await runGit(worktreePath, ['status', '--porcelain']);
    return { success: true, clean: result.stdout.trim().length === 0 };
  } catch (error) {
    return {
      success: false,
      clean: false,
      error: error instanceof Error ? error.message : 'Failed to read worktree status',
    };
  }
}
