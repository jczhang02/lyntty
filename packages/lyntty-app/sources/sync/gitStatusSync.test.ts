import { beforeEach, describe, expect, it, vi } from 'bun:test';

const mocks = {
    sessionBash: vi.fn(),
    sessions: {} as Record<string, { metadata?: { machineId?: string; path?: string; flavor?: string } }>,
    applyGitStatus: vi.fn(),
};

vi.mock('./ops', () => ({ sessionBash: mocks.sessionBash }));
vi.mock('./storage', () => ({
    storage: {
        getState: () => ({
            sessions: mocks.sessions,
            applyGitStatus: mocks.applyGitStatus,
        }),
    },
}));

describe('GitStatusSync control identity', () => {
    beforeEach(() => {
        mocks.sessionBash.mockReset();
        mocks.applyGitStatus.mockReset();
        for (const key of Object.keys(mocks.sessions)) delete mocks.sessions[key];
        mocks.sessionBash.mockImplementation(async (_sessionId: string, request: { command: string }) => {
            if (request.command.includes('rev-parse')) {
                return { success: true, stdout: 'true\n', stderr: '', exitCode: 0 };
            }
            return { success: true, stdout: '', stderr: '', exitCode: 0 };
        });
    });

    it('never registers flavorless or legacy history for git RPC', async () => {
        mocks.sessions.legacy = { metadata: { machineId: 'machine-1', path: '/repo', flavor: 'claude' } };
        const { GitStatusSync } = await import('./gitStatusSync');
        const git = new GitStatusSync();

        const sync = git.getSync('legacy');
        sync.invalidate();
        await sync.awaitQueue();

        expect(mocks.sessionBash).not.toHaveBeenCalled();
    });

    it('switches to a remaining Pi session when a shared-path view unmounts mid-refresh', async () => {
        mocks.sessions['pi-old'] = { metadata: { machineId: 'machine-1', path: '/repo', flavor: 'pi' } };
        mocks.sessions['pi-current'] = { metadata: { machineId: 'machine-1', path: '/repo', flavor: 'pi' } };
        const { GitStatusSync } = await import('./gitStatusSync');
        const git = new GitStatusSync();
        let callCount = 0;
        mocks.sessionBash.mockImplementation(async (_sessionId: string, request: { command: string }) => {
            callCount += 1;
            if (callCount === 1) git.stop('pi-old');
            if (request.command.includes('rev-parse')) {
                return { success: true, stdout: 'true\n', stderr: '', exitCode: 0 };
            }
            return { success: true, stdout: '', stderr: '', exitCode: 0 };
        });

        const sharedSync = git.getSync('pi-old');
        git.getSync('pi-current');
        sharedSync.invalidate();
        await sharedSync.awaitQueue();

        expect(mocks.sessionBash.mock.calls[0][0]).toBe('pi-old');
        expect(mocks.sessionBash.mock.calls.slice(1).every(call => call[0] === 'pi-current')).toBe(true);
    });
});
