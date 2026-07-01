import { beforeEach, describe, expect, it, vi } from 'vitest';

const { machineRPC } = vi.hoisted(() => ({
    machineRPC: vi.fn(),
}));

vi.mock('./apiSocket', () => ({
    apiSocket: { machineRPC },
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
});
