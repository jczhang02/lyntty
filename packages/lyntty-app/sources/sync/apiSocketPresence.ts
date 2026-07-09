export type AppPresenceState = 'active' | 'background';

export type AppPresencePayload = {
    state: AppPresenceState;
    visibleSessionId: string | null;
};

export function normalizeAppPresenceState(state: string): AppPresenceState {
    return state === 'active' ? 'active' : 'background';
}

export function buildAppPresencePayload(state: string, visibleSessionId: string | null): AppPresencePayload {
    const normalizedState = normalizeAppPresenceState(state);
    return {
        state: normalizedState,
        visibleSessionId: normalizedState === 'active' ? visibleSessionId : null,
    };
}
