import { beforeEach, describe, expect, it, vi } from 'bun:test';

const {
    machineWorktreeCreate,
    machineWorktreeList,
    machineWorktreeRemove,
} = {
    machineWorktreeCreate: vi.fn(),
    machineWorktreeList: vi.fn(),
    machineWorktreeRemove: vi.fn(),
};

vi.mock('@/sync/ops', () => ({
    machineWorktreeCreate,
    machineWorktreeList,
    machineWorktreeRemove,
}));

describe('worktree helpers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates worktrees through narrow machine RPC helpers', async () => {
        machineWorktreeCreate.mockResolvedValue({
            success: true,
            worktreePath: '/repo/.dev/worktree/test',
            branchName: 'test',
        });

        const { createWorktree } = await import('./worktree');
        const result = await createWorktree('machine-1', '/repo');

        expect(result).toMatchObject({ success: true, worktreePath: '/repo/.dev/worktree/test' });
        expect(machineWorktreeCreate).toHaveBeenCalledWith('machine-1', '/repo', expect.any(String));
        expect(machineWorktreeCreate.mock.calls[0][2]).toMatch(/^[a-z]+-[a-z]+$/);
    });

    it('preserves explicit worktree-list success and failure results', async () => {
        machineWorktreeList
            .mockResolvedValueOnce({ success: true, worktrees: [{ path: '/repo/.dev/worktree/test', branch: 'test' }] })
            .mockResolvedValueOnce({ success: false, error: 'machine offline' });

        const { listWorktrees } = await import('./worktree');
        await expect(listWorktrees('machine-1', '/repo')).resolves.toEqual({
            success: true,
            worktrees: [{ path: '/repo/.dev/worktree/test', branch: 'test' }],
        });
        await expect(listWorktrees('machine-1', '/repo')).resolves.toEqual({
            success: false,
            error: 'machine offline',
        });
        expect(machineWorktreeList).toHaveBeenCalledWith('machine-1', '/repo');
    });

    it('rejects non-managed worktree paths before remove RPC', async () => {
        const { removeWorktree } = await import('./worktree');

        await expect(removeWorktree('machine-1', '/repo/not-worktree')).resolves.toEqual({
            success: false,
            error: 'Not a worktree path',
        });
        expect(machineWorktreeRemove).not.toHaveBeenCalled();
    });

    it('removes managed worktrees through narrow machine RPC helpers', async () => {
        machineWorktreeRemove.mockResolvedValue({ success: true });

        const { removeWorktree } = await import('./worktree');
        await expect(removeWorktree('machine-1', '/repo/.dev/worktree/test')).resolves.toEqual({ success: true });
        expect(machineWorktreeRemove).toHaveBeenCalledWith('machine-1', '/repo/.dev/worktree/test');
    });
});
