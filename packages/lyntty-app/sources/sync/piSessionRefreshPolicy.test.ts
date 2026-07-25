import { describe, expect, it } from 'bun:test';

import {
    resolvePiSessionRetryDelay,
    shouldRefreshPiSessionsForMachineTransition,
} from './piSessionRefreshPolicy';

describe('Pi session machine refresh policy', () => {
    it('refreshes when a machine appears online, but not on active heartbeats', () => {
        expect(shouldRefreshPiSessionsForMachineTransition(undefined, true)).toBe(true);
        expect(shouldRefreshPiSessionsForMachineTransition(false, true)).toBe(true);
        expect(shouldRefreshPiSessionsForMachineTransition(true, true)).toBe(false);
        expect(shouldRefreshPiSessionsForMachineTransition(true, false)).toBe(false);
        expect(shouldRefreshPiSessionsForMachineTransition(false, false)).toBe(false);
    });

    it('uses capped exponential delays and eventually stops automatic retries', () => {
        expect(resolvePiSessionRetryDelay(0, 3)).toBe(1_000);
        expect(resolvePiSessionRetryDelay(1, 3)).toBe(2_000);
        expect(resolvePiSessionRetryDelay(2, 3)).toBe(4_000);
        expect(resolvePiSessionRetryDelay(3, 3)).toBeUndefined();
        expect(resolvePiSessionRetryDelay(8, 12)).toBe(5_000);
        expect(resolvePiSessionRetryDelay(12, 12)).toBeUndefined();
    });
});
