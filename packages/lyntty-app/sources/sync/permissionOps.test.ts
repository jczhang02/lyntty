import { beforeEach, describe, expect, it, vi } from 'bun:test';

const mocks = {
    sessionRPC: vi.fn(),
    sessions: {} as Record<string, { metadata?: { flavor?: string } }>,
};

vi.mock('./apiSocket', () => ({
    apiSocket: { sessionRPC: mocks.sessionRPC, machineRPC: vi.fn() },
}));
vi.mock('./sync', () => ({ sync: {} }));
vi.mock('./storage', () => ({
    storage: { getState: () => ({ sessions: mocks.sessions }) },
}));

describe('permission session operations', () => {
    beforeEach(() => {
        mocks.sessionRPC.mockReset();
        for (const key of Object.keys(mocks.sessions)) delete mocks.sessions[key];
    });

    it('allows Pi permission decisions', async () => {
        mocks.sessions['pi-session'] = { metadata: { flavor: 'pi' } };
        const { sessionAllow, sessionDeny } = await import('./ops');

        await sessionAllow('pi-session', 'permission-1');
        await sessionDeny('pi-session', 'permission-2');

        expect(mocks.sessionRPC).toHaveBeenNthCalledWith(1, 'pi-session', 'permission', expect.objectContaining({
            id: 'permission-1',
            approved: true,
        }));
        expect(mocks.sessionRPC).toHaveBeenNthCalledWith(2, 'pi-session', 'permission', expect.objectContaining({
            id: 'permission-2',
            approved: false,
        }));
    });

    it('rejects explicit legacy-provider and missing sessions before RPC', async () => {
        mocks.sessions['legacy-session'] = { metadata: { flavor: 'claude' } };
        const { sessionAllow, sessionDeny } = await import('./ops');

        await expect(sessionAllow('legacy-session', 'permission-1')).rejects.toThrow('history only');
        await expect(sessionDeny('missing-session', 'permission-2')).rejects.toThrow('history only');
        expect(mocks.sessionRPC).not.toHaveBeenCalled();
    });

    it('rejects every runtime control operation for flavorless history sessions', async () => {
        mocks.sessions['history-session'] = { metadata: {} };
        const {
            sessionAbort,
            sessionAllow,
            sessionBash,
            sessionDeny,
            sessionGetDirectoryTree,
            sessionKill,
            sessionListDirectory,
            sessionLoadPiHistoryPage,
            sessionReadFile,
            sessionRipgrep,
            sessionSwitch,
            sessionWriteFile,
        } = await import('./ops');

        const operations = [
            () => sessionAbort('history-session'),
            () => sessionAllow('history-session', 'permission-1'),
            () => sessionDeny('history-session', 'permission-2'),
            () => sessionSwitch('history-session', 'local'),
            () => sessionBash('history-session', { command: 'pwd' }),
            () => sessionReadFile('history-session', '/tmp/a'),
            () => sessionWriteFile('history-session', '/tmp/a', 'YQ=='),
            () => sessionListDirectory('history-session', '/tmp'),
            () => sessionGetDirectoryTree('history-session', '/tmp', 1),
            () => sessionRipgrep('history-session', ['needle']),
            () => sessionKill('history-session'),
            () => sessionLoadPiHistoryPage('history-session'),
        ];

        for (const operation of operations) {
            await expect(operation()).rejects.toThrow('history only');
        }
        expect(mocks.sessionRPC).not.toHaveBeenCalled();
    });
});
