import { describe, expect, it } from 'bun:test';
import { compareSessionsByRecencyDesc, nextSessionUpdatedAt, sessionRecencyAt } from './sessionRecency';

describe('session recency helpers', () => {
    it('uses updatedAt as the Sessions Home/archive recency time', () => {
        expect(sessionRecencyAt({ createdAt: 1_000, updatedAt: 9_000 })).toBe(9_000);
        expect([
            { id: 'new-created-old-message', createdAt: 8_000, updatedAt: 2_000 },
            { id: 'old-created-new-message', createdAt: 1_000, updatedAt: 9_000 },
        ].sort(compareSessionsByRecencyDesc).map((session) => session.id)).toEqual([
            'old-created-new-message',
            'new-created-old-message',
        ]);
    });

    it('bumps session recency from the latest message timestamp', () => {
        expect(nextSessionUpdatedAt(2_000, 10_000)).toBe(10_000);
        expect(nextSessionUpdatedAt(10_000, 2_000)).toBe(10_000);
    });
});
