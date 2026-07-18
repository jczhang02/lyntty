import { describe, expect, it, mock } from 'bun:test';
import { eventRouter, isSocketActivelyViewingSession } from './eventRouter';

const sessionId = 'session-1';

describe('session push presence', () => {
    it('suppresses only active non-machine sockets viewing the same session', () => {
        expect(isSocketActivelyViewingSession({
            clientType: 'user-scoped',
            appState: 'active',
            visibleSessionId: sessionId,
        }, sessionId)).toBe(true);

        expect(isSocketActivelyViewingSession({
            clientType: 'user-scoped',
            appState: 'active',
            visibleSessionId: 'other-session',
        }, sessionId)).toBe(false);
        expect(isSocketActivelyViewingSession({
            clientType: 'user-scoped',
            appState: 'background',
            visibleSessionId: sessionId,
        }, sessionId)).toBe(false);
        expect(isSocketActivelyViewingSession({
            clientType: 'user-scoped',
            appState: 'active',
        }, sessionId)).toBe(false);
        expect(isSocketActivelyViewingSession({
            clientType: 'machine-scoped',
            appState: 'active',
            visibleSessionId: sessionId,
        }, sessionId)).toBe(false);
    });

    it('queries sockets with fail-open same-session visibility semantics', async () => {
        const fetchSockets = mock(async () => ([
            { data: { clientType: 'user-scoped', appState: 'active', visibleSessionId: 'other-session' } },
            { data: { clientType: 'machine-scoped', appState: 'active', visibleSessionId: sessionId } },
            { data: { clientType: 'user-scoped', appState: 'active', visibleSessionId: sessionId } },
        ]));
        const inRoom = mock(() => ({ fetchSockets }));
        eventRouter.init({ in: inRoom } as never);

        await expect(eventRouter.hasActiveNonMachineSocketForSession('user-1', sessionId)).resolves.toBe(true);
        expect(inRoom).toHaveBeenCalledWith('user:user-1');
    });
});
