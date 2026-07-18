import { describe, expect, it } from 'bun:test';

import { shouldOpenPiSessionImmediately, shouldReportPiSpawnError } from './piSessionOpenRequest';
import type { SessionRowData } from './storage';

function row(overrides: Partial<SessionRowData>): SessionRowData {
    return {
        id: 'pi-local:machine:pi-session',
        name: 'Pi session',
        subtitle: '~/repo',
        path: '/home/jc/repo',
        state: 'disconnected',
        avatarId: 'pi',
        flavor: 'pi',
        updatedAt: Date.now(),
        createdAt: Date.now(),
        activeAt: Date.now(),
        hasDraft: false,
        active: false,
        machineId: 'machine',
        piSessionId: 'pi-session',
        piSynthetic: true,
        completedTodosCount: 0,
        totalTodosCount: 0,
        hasUnread: false,
        ...overrides,
    } as SessionRowData;
}

describe('shouldReportPiSpawnError', () => {
    it('suppresses late spawn errors after a relay session already attached', () => {
        expect(shouldReportPiSpawnError('relay-session')).toBe(false);
    });

    it('reports spawn errors when no relay session was resolved', () => {
        expect(shouldReportPiSpawnError(null)).toBe(true);
    });
});

describe('shouldOpenPiSessionImmediately', () => {
    it('opens active synthetic Pi rows before node attach completes', () => {
        expect(shouldOpenPiSessionImmediately(row({ active: true }))).toBe(true);
    });

    it('opens inactive synthetic Pi rows immediately with a loading shell', () => {
        expect(shouldOpenPiSessionImmediately(row({ active: false }))).toBe(true);
    });

    it('does not short-circuit real relay sessions', () => {
        expect(shouldOpenPiSessionImmediately(row({ id: 'relay-session', piSynthetic: false }))).toBe(false);
    });
});
