import { beforeEach, describe, expect, it, vi } from 'bun:test';

import type { Session } from './storageTypes';
import { shouldStopBeforeArchive, stopAndArchiveSession } from './archiveSessionAction';

const mockedSessionKill = vi.fn();
const mockedSessionArchive = vi.fn();

vi.mock('./ops', () => ({
    sessionArchive: mockedSessionArchive,
    sessionKill: mockedSessionKill,
}));

function session(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 100,
        updatedAt: 200,
        activeAt: 200,
        active: false,
        metadata: {
            path: '/repo',
            host: 'thinkpad',
            flavor: 'pi',
            machineId: 'machine-1',
            piSessionId: 'pi-1',
            runtimeOwner: 'pi-extension',
            controlState: 'ready',
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 0,
        presence: 200,
        ...overrides,
    };
}

describe('archive session action', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedSessionKill.mockResolvedValue({ success: true, message: 'ok' });
        mockedSessionArchive.mockResolvedValue({ success: true });
    });

    it('archives inactive history sessions without stop', async () => {
        const result = await stopAndArchiveSession(session({
            active: false,
            metadata: { path: '/repo', host: 'thinkpad', flavor: 'pi', runtimeOwner: 'lyntty-sdk', controlState: 'queued' },
        }));

        expect(result).toEqual({ success: true, stopped: false, archived: true });
        expect(mockedSessionKill).not.toHaveBeenCalled();
        expect(mockedSessionArchive).toHaveBeenCalledWith('session-1');
    });

    it('stops active Pi sessions before archiving', async () => {
        const result = await stopAndArchiveSession(session({ active: true }));

        expect(result).toEqual({ success: true, stopped: true, archived: true });
        expect(mockedSessionKill).toHaveBeenCalledWith('session-1');
        expect(mockedSessionArchive).toHaveBeenCalledWith('session-1');
    });

    it('stops ready Pi extension sessions even when relay active is stale false', async () => {
        const result = await stopAndArchiveSession(session({ active: false }));

        expect(result).toEqual({ success: true, stopped: true, archived: true });
        expect(mockedSessionKill).toHaveBeenCalledWith('session-1');
        expect(mockedSessionArchive).toHaveBeenCalledWith('session-1');
    });

    it('does not archive active sessions when stop is unavailable', async () => {
        mockedSessionKill.mockResolvedValue({ success: false, message: 'RPC call failed for killSession: RPC method not available' });

        const result = await stopAndArchiveSession(session({ active: true }));

        expect(result).toMatchObject({
            success: false,
            stopped: false,
            archived: false,
            message: 'Unable to stop this Pi session from Lyntty. Make sure the Pi extension is loaded, then try again.',
        });
        expect(mockedSessionArchive).not.toHaveBeenCalled();
    });

    it('archives active legacy history without executing a runtime stop', async () => {
        const result = await stopAndArchiveSession(session({
            active: true,
            metadata: { path: '/repo', host: 'thinkpad', flavor: 'claude' },
        }));

        expect(result).toEqual({ success: true, stopped: false, archived: true });
        expect(mockedSessionKill).not.toHaveBeenCalled();
        expect(mockedSessionArchive).toHaveBeenCalledWith('session-1');
    });

    it('does not require stop for unavailable synthetic recovery states', () => {
        expect(shouldStopBeforeArchive(session({
            active: true,
            metadata: { path: '/repo', host: 'thinkpad', flavor: 'pi', controlState: 'missing_local_history' },
        }))).toBe(false);
    });
});
