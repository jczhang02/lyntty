import { beforeEach, describe, expect, it, vi } from 'vitest';

const { machineRPC, sessionRPC } = vi.hoisted(() => ({
    machineRPC: vi.fn(),
    sessionRPC: vi.fn(),
}));

vi.mock('./apiSocket', () => ({
    apiSocket: { machineRPC, sessionRPC },
}));

vi.mock('./sync', () => ({
    sync: {},
}));

describe('Pi session open helpers', () => {
    it('builds spawn requests for synthetic Pi history rows', async () => {
        const { buildPiSessionSpawnRequest, resolveOptimisticPiPath } = await import('./piSessionOpenRequest');
        const session: any = {
            id: 'pi-local:machine-1:pi-1',
            machineId: 'machine-1',
            piSessionId: 'pi-1',
            path: '~/repo',
            homeDir: '/home/jc',
        };

        expect(buildPiSessionSpawnRequest(session)).toEqual({
            machineId: 'machine-1',
            directory: '~/repo',
            sessionId: 'pi-1',
            agent: 'pi',
            approvedNewDirectoryCreation: true,
        });
        expect(resolveOptimisticPiPath(session)).toBe('/home/jc/repo');
    });
});

describe('Pi machine session ops', () => {
    beforeEach(() => {
        machineRPC.mockReset();
        sessionRPC.mockReset();
    });

    it('lists machine-wide Pi sessions through machine RPC', async () => {
        machineRPC.mockResolvedValue({
            type: 'success',
            sessions: [{ piSessionId: 'pi-1', state: 'discovered_local', name: 'Release fix' }],
        });

        const { machineListPiSessions } = await import('./ops');
        const result = await machineListPiSessions({ machineId: 'machine-1', limit: 100, cursor: '100' });

        expect(result).toEqual({
            type: 'success',
            sessions: [{ piSessionId: 'pi-1', state: 'discovered_local', name: 'Release fix' }],
        });
        expect(machineRPC).toHaveBeenCalledWith('machine-1', 'list-pi-sessions', {
            cwd: undefined,
            scope: 'machine',
            limit: 100,
            cursor: '100',
        });
    });

    it('uses narrow worktree machine RPC methods instead of generic bash', async () => {
        machineRPC
            .mockResolvedValueOnce({ success: true, worktreePath: '/repo/.dev/worktree/test', branchName: 'test' })
            .mockResolvedValueOnce({ worktrees: [{ path: '/repo/.dev/worktree/test', branch: 'test' }] })
            .mockResolvedValueOnce({ success: true, clean: true })
            .mockResolvedValueOnce({ success: true });

        const {
            machineWorktreeCreate,
            machineWorktreeList,
            machineWorktreeStatus,
            machineWorktreeRemove,
        } = await import('./ops');

        await expect(machineWorktreeCreate('machine-1', '/repo', 'test')).resolves.toMatchObject({ success: true });
        await expect(machineWorktreeList('machine-1', '/repo')).resolves.toMatchObject({ worktrees: [{ branch: 'test' }] });
        await expect(machineWorktreeStatus('machine-1', '/repo/.dev/worktree/test')).resolves.toMatchObject({ clean: true });
        await expect(machineWorktreeRemove('machine-1', '/repo/.dev/worktree/test')).resolves.toMatchObject({ success: true });

        expect(machineRPC).toHaveBeenNthCalledWith(1, 'machine-1', 'worktree-create', { basePath: '/repo', branchName: 'test' });
        expect(machineRPC).toHaveBeenNthCalledWith(2, 'machine-1', 'worktree-list', { basePath: '/repo' });
        expect(machineRPC).toHaveBeenNthCalledWith(3, 'machine-1', 'worktree-status', { worktreePath: '/repo/.dev/worktree/test' });
        expect(machineRPC).toHaveBeenNthCalledWith(4, 'machine-1', 'worktree-remove', { worktreePath: '/repo/.dev/worktree/test' });
    });

    it('normalizes legacy or malformed worktree-list RPC responses to an array', async () => {
        machineRPC
            .mockResolvedValueOnce([{ path: '/repo/.dev/worktree/legacy', branch: 'legacy' }])
            .mockResolvedValueOnce({});

        const { machineWorktreeList } = await import('./ops');

        await expect(machineWorktreeList('machine-1', '/repo')).resolves.toEqual({
            worktrees: [{ path: '/repo/.dev/worktree/legacy', branch: 'legacy' }],
        });
        await expect(machineWorktreeList('machine-1', '/repo')).resolves.toEqual({ worktrees: [] });
    });

    it('passes an existing Pi session id when spawning from history', async () => {
        machineRPC.mockResolvedValue({ type: 'success', sessionId: 'lyntty-1' });

        const { machineSpawnNewSession } = await import('./ops');
        const result = await machineSpawnNewSession({
            machineId: 'machine-1',
            directory: '/repo',
            agent: 'pi',
            sessionId: 'pi-existing',
        });

        expect(result).toEqual({ type: 'success', sessionId: 'lyntty-1' });
        expect(machineRPC).toHaveBeenCalledWith('machine-1', 'spawn-lyntty-session', expect.objectContaining({
            directory: '/repo',
            agent: 'pi',
            sessionId: 'pi-existing',
        }));
    });

    it('loads Pi history pages through a narrow session RPC', async () => {
        sessionRPC.mockResolvedValue({ type: 'success', sent: 4, nextCursor: 'entry-1', hasMore: true, totalMessages: 20 });

        const { sessionLoadPiHistoryPage } = await import('./ops');
        const result = await sessionLoadPiHistoryPage('session-1', 'entry-2');

        expect(result).toMatchObject({ type: 'success', sent: 4, nextCursor: 'entry-1', hasMore: true });
        expect(sessionRPC).toHaveBeenCalledWith('session-1', 'pi-history-page', { beforeEntryId: 'entry-2' });
    });
});
