import { describe, expect, it, beforeEach } from 'vitest';
import {
    isAuthInvalidationMessage,
    requestAuthInvalidation,
    resetAuthInvalidationForTests,
    subscribeAuthInvalidation,
} from './authInvalidation';

describe('authInvalidation', () => {
    beforeEach(() => {
        resetAuthInvalidationForTests();
    });

    it('notifies listeners that subscribe after invalidation was requested', () => {
        requestAuthInvalidation('Failed to fetch sessions: 401');

        const reasons: string[] = [];
        subscribeAuthInvalidation((reason) => {
            reasons.push(reason);
        });

        expect(reasons).toEqual(['authentication was invalidated before listener registration']);
    });

    it('recognizes socket authentication failure messages', () => {
        expect(isAuthInvalidationMessage('Invalid token provided')).toBe(true);
        expect(isAuthInvalidationMessage('Invalid authentication token')).toBe(true);
        expect(isAuthInvalidationMessage('websocket Unauthorized')).toBe(true);
        expect(isAuthInvalidationMessage('Failed to fetch sessions: 401')).toBe(true);
        expect(isAuthInvalidationMessage('transient websocket disconnect')).toBe(false);
    });
});
