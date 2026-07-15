import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    sessionRPC: vi.fn(),
    sessions: {} as Record<string, { metadata?: { flavor?: string } }>,
}));

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
});
