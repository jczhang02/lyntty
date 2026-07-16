import { describe, expect, it } from 'bun:test';
import { createBackoff } from './time';

describe('createBackoff', () => {
    it('does not retry authentication failures', async () => {
        let attempts = 0;
        const seenErrors: unknown[] = [];
        const backoff = createBackoff({
            onError: (error) => seenErrors.push(error),
        });

        await expect(backoff(async () => {
            attempts += 1;
            throw new Error('Failed to fetch sessions: 401');
        })).rejects.toThrow('Failed to fetch sessions: 401');

        expect(attempts).toBe(1);
        expect(seenErrors).toHaveLength(1);
    });
});
