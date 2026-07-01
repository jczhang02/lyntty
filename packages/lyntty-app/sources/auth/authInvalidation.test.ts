import { describe, expect, it, beforeEach } from 'vitest';
import {
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
});
