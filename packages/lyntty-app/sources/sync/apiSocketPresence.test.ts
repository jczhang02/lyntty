import { describe, expect, it } from 'vitest';

import { buildAppPresencePayload, normalizeAppPresenceState } from './apiSocketPresence';

describe('api socket presence payload', () => {
    it('reports visibleSessionId only while active', () => {
        expect(buildAppPresencePayload('active', 'session-1')).toEqual({
            state: 'active',
            visibleSessionId: 'session-1',
        });
        expect(buildAppPresencePayload('background', 'session-1')).toEqual({
            state: 'background',
            visibleSessionId: null,
        });
        expect(buildAppPresencePayload('inactive', 'session-1')).toEqual({
            state: 'background',
            visibleSessionId: null,
        });
    });

    it('normalizes unknown states to background', () => {
        expect(normalizeAppPresenceState('active')).toBe('active');
        expect(normalizeAppPresenceState('extension')).toBe('background');
    });
});
