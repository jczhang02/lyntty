import { describe, expect, it } from 'bun:test';
import { createManagedWorktree, getManagedWorktreeStatus, removeManagedWorktree } from './worktreeRpc';

describe('managed worktree RPC helpers', () => {
  it('rejects branch names that could escape the managed worktree directory', async () => {
    await expect(createManagedWorktree({
      basePath: '/repo',
      branchName: '../escape',
    })).rejects.toThrow('branchName is invalid');

    await expect(createManagedWorktree({
      basePath: '/repo',
      branchName: 'feature/escape',
    })).rejects.toThrow('branchName is invalid');
  });

  it('rejects remove/status requests outside managed worktree paths', async () => {
    await expect(removeManagedWorktree({ worktreePath: '/repo/not-worktree' })).rejects.toThrow('Not a managed worktree path');
    await expect(getManagedWorktreeStatus({ worktreePath: '/repo/not-worktree' })).rejects.toThrow('Not a managed worktree path');
  });
});
