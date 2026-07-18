import { beforeEach, describe, expect, it, vi } from 'bun:test';

const { machineRPC, sessionRPC, sessions } = {
    machineRPC: vi.fn(),
    sessionRPC: vi.fn(),
    sessions: {} as Record<string, { metadata?: { flavor?: string } }>,
};

vi.mock('./apiSocket', () => ({
    apiSocket: { machineRPC, sessionRPC },
}));

vi.mock('./sync', () => ({
    sync: {},
}));

vi.mock('./storage', () => ({
    storage: { getState: () => ({ sessions }) },
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
        for (const key of Object.keys(sessions)) delete sessions[key];
        sessions['session-1'] = { metadata: { flavor: 'pi' } };
    });

    it('lists machine-wide Pi sessions through machine RPC', async () => {
        machineRPC.mockResolvedValue({
            type: 'success',
            sessions: [{ piSessionId: 'pi-1', state: 'discovered_local', name: 'Release fix' }],
        });

        const { machineListPiSessions } = await import('./ops');
        const result = await machineListPiSessions({ machineId: 'machine-1', limit: 100, cursor: '100' });

        expect(result as any).toEqual({
            type: 'success',
            sessions: [{ piSessionId: 'pi-1', state: 'discovered_local', name: 'Release fix' }],
        });
        expect(machineRPC).toHaveBeenCalledWith('machine-1', 'list-pi-sessions', {
            cwd: undefined,
            scope: 'machine',
            limit: 100,
            cursor: '100',
        }, expect.any(Function));
    });

    it('uses narrow worktree machine RPC methods instead of generic bash', async () => {
        machineRPC
            .mockResolvedValueOnce({ success: true, worktreePath: '/repo/.dev/worktree/test', branchName: 'test' })
            .mockResolvedValueOnce({ success: true, worktrees: [{ path: '/repo/.dev/worktree/test', branch: 'test' }] })
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

        expect(machineRPC).toHaveBeenNthCalledWith(1, 'machine-1', 'worktree-create', { basePath: '/repo', branchName: 'test' }, expect.any(Function));
        expect(machineRPC).toHaveBeenNthCalledWith(2, 'machine-1', 'worktree-list', { basePath: '/repo' }, expect.any(Function));
        expect(machineRPC).toHaveBeenNthCalledWith(3, 'machine-1', 'worktree-status', { worktreePath: '/repo/.dev/worktree/test' }, expect.any(Function));
        expect(machineRPC).toHaveBeenNthCalledWith(4, 'machine-1', 'worktree-remove', { worktreePath: '/repo/.dev/worktree/test' }, expect.any(Function));
    });

    it('fails closed on obsolete or malformed worktree-list RPC responses', async () => {
        machineRPC
            .mockImplementationOnce(async (_machineId, _method, _params, parse) => parse([
                { path: '/repo/.dev/worktree/legacy', branch: 'legacy' },
            ]))
            .mockImplementationOnce(async (_machineId, _method, _params, parse) => parse({}));

        const { machineWorktreeList } = await import('./ops');

        await expect(machineWorktreeList('machine-1', '/repo')).resolves.toMatchObject({
            success: false,
            error: expect.stringContaining('Invalid machine RPC response'),
        });
        await expect(machineWorktreeList('machine-1', '/repo')).resolves.toMatchObject({
            success: false,
            error: expect.stringContaining('Invalid machine RPC response'),
        });
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
        }), expect.any(Function));
    });

    it('first resumes Pi without takeover so an active extension runtime can be reused', async () => {
        machineRPC.mockResolvedValue({ type: 'success', sessionId: 'active-relay-session' });

        const chooseTakeover = vi.fn();
        const { machineResumePiWithActivationChoice } = await import('./ops');
        await expect(machineResumePiWithActivationChoice({
            machineId: 'machine-1',
            directory: '/repo',
            piSessionId: 'pi-existing',
        }, chooseTakeover)).resolves.toEqual({ type: 'success', sessionId: 'active-relay-session' });

        expect(chooseTakeover).not.toHaveBeenCalled();
        expect(machineRPC).toHaveBeenCalledTimes(1);
        expect(machineRPC).toHaveBeenCalledWith('machine-1', 'spawn-lyntty-session', expect.objectContaining({
            sessionId: 'pi-existing',
            agent: 'pi',
            takeoverChoice: undefined,
        }), expect.any(Function));
    });

    it('recognizes only the daemon remediation that requires explicit takeover', async () => {
        const { isPiResumeTakeoverRequired } = await import('./ops');

        expect(isPiResumeTakeoverRequired('Waiting for Pi extension. Retry or choose an explicit takeover.')).toBe(true);
        expect(isPiResumeTakeoverRequired('Waiting for Pi extension to finish reconnecting.')).toBe(true);
        expect(isPiResumeTakeoverRequired('Machine is offline')).toBe(false);
    });

    it('requires an explicit choice before activating an inactive Pi session', async () => {
        machineRPC
            .mockRejectedValueOnce(new Error('Waiting for Pi extension. Retry or choose an explicit takeover.'))
            .mockResolvedValueOnce({ type: 'success', sessionId: 'resumed-relay-session' });
        const chooseTakeover = vi.fn(async () => 'stop' as const);

        const { machineResumePiWithActivationChoice } = await import('./ops');
        await expect(machineResumePiWithActivationChoice({
            machineId: 'machine-1',
            directory: '/repo',
            piSessionId: 'pi-existing',
        }, chooseTakeover)).resolves.toEqual({ type: 'success', sessionId: 'resumed-relay-session' });

        expect(chooseTakeover).toHaveBeenCalledTimes(1);
        expect(machineRPC).toHaveBeenCalledTimes(2);
        expect(machineRPC.mock.calls[0][2]).toMatchObject({ takeoverChoice: undefined });
        expect(machineRPC.mock.calls[1][2]).toMatchObject({ takeoverChoice: 'stop' });
    });

    it('keeps waiting without spawning a duplicate runtime', async () => {
        machineRPC.mockRejectedValueOnce(new Error('Waiting for Pi extension. Retry or choose an explicit takeover.'));
        const chooseTakeover = vi.fn(async () => 'wait' as const);

        const { machineResumePiWithActivationChoice } = await import('./ops');
        await expect(machineResumePiWithActivationChoice({
            machineId: 'machine-1',
            directory: '/repo',
            piSessionId: 'pi-existing',
        }, chooseTakeover)).resolves.toBeNull();

        expect(chooseTakeover).toHaveBeenCalledTimes(1);
        expect(machineRPC).toHaveBeenCalledTimes(1);
    });

    it('does not spawn a duplicate runtime when takeover selection is cancelled', async () => {
        machineRPC.mockRejectedValueOnce(new Error('Waiting for Pi extension. Retry or choose an explicit takeover.'));
        const chooseTakeover = vi.fn(async () => null);

        const { machineResumePiWithActivationChoice } = await import('./ops');
        await expect(machineResumePiWithActivationChoice({
            machineId: 'machine-1',
            directory: '/repo',
            piSessionId: 'pi-existing',
        }, chooseTakeover)).resolves.toBeNull();

        expect(chooseTakeover).toHaveBeenCalledTimes(1);
        expect(machineRPC).toHaveBeenCalledTimes(1);
    });

    it('resumes Pi through the unified spawn activation path with explicit takeover', async () => {
        machineRPC.mockResolvedValue({ type: 'success', sessionId: 'lyntty-1' });

        const { machineResumeSession } = await import('./ops');
        const result = await machineResumeSession({
            machineId: 'machine-1',
            directory: '/repo',
            piSessionId: 'pi-existing',
            takeoverChoice: 'interrupt',
        });

        expect(result).toEqual({ type: 'success', sessionId: 'lyntty-1' });
        expect(machineRPC).toHaveBeenCalledWith('machine-1', 'spawn-lyntty-session', {
            type: 'spawn-in-directory',
            directory: '/repo',
            sessionId: 'pi-existing',
            approvedNewDirectoryCreation: false,
            machineId: 'machine-1',
            token: undefined,
            agent: 'pi',
            takeoverChoice: 'interrupt',
        }, expect.any(Function));
    });

    it('loads Pi history pages through a narrow session RPC', async () => {
        sessionRPC.mockResolvedValue({ type: 'success', sent: 4, nextCursor: 'entry-1', hasMore: true, totalMessages: 20 });

        const { sessionLoadPiHistoryPage } = await import('./ops');
        const result = await sessionLoadPiHistoryPage('session-1', 'entry-2');

        expect(result).toMatchObject({ type: 'success', sent: 4, nextCursor: 'entry-1', hasMore: true });
        expect(sessionRPC).toHaveBeenCalledWith('session-1', 'pi-history-page', { beforeEntryId: 'entry-2' });
    });
});
