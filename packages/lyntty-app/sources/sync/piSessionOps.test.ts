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
