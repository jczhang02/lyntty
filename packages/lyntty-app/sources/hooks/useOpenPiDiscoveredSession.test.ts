import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    ensureMirror: vi.fn(),
    spawn: vi.fn(),
    alert: vi.fn(),
    navigate: vi.fn(),
    refreshSessions: vi.fn(),
    flushSyntheticMessages: vi.fn(),
    applyOptimistic: vi.fn(),
}));

vi.mock('react', () => ({
    default: { useCallback: (callback: unknown) => callback },
}));
vi.mock('@/modal', () => ({ Modal: { alert: mocks.alert } }));
vi.mock('@/text', () => ({ t: (key: string) => key }));
vi.mock('@/sync/ops', () => ({
    machineEnsurePiSessionMirror: mocks.ensureMirror,
    machineSpawnNewSession: mocks.spawn,
}));
vi.mock('@/sync/piSessionOpen', () => ({
    applyOptimisticPiSession: mocks.applyOptimistic,
    buildPiSessionSpawnRequest: () => ({ machineId: 'machine-1', piSessionId: 'pi-1' }),
    shouldOpenPiSessionImmediately: () => false,
    shouldReportPiSpawnError: () => true,
}));
vi.mock('@/sync/sync', () => ({
    sync: {
        refreshSessions: mocks.refreshSessions,
        flushSyntheticMessages: mocks.flushSyntheticMessages,
    },
}));
vi.mock('./useNavigateToSession', () => ({ useNavigateToSession: () => mocks.navigate }));

import { useOpenPiDiscoveredSession } from './useOpenPiDiscoveredSession';

describe('useOpenPiDiscoveredSession', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.ensureMirror.mockResolvedValue({ type: 'error', errorMessage: 'Waiting for Pi extension' });
    });

    it('shows the mirror failure and never starts a duplicate managed runtime', async () => {
        const open = useOpenPiDiscoveredSession();
        await open({
            id: 'pi:machine-1:pi-1',
            machineId: 'machine-1',
            piSessionId: 'pi-1',
            path: '/repo',
            piSynthetic: true,
        } as never);

        expect(mocks.alert).toHaveBeenCalledWith('common.error', 'Waiting for Pi extension');
        expect(mocks.spawn).not.toHaveBeenCalled();
    });
});
