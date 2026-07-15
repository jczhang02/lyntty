import { describe, expect, it, vi } from 'vitest';

import { deliverNewSessionPrompt } from './newSessionPrompt';

describe('deliverNewSessionPrompt', () => {
    it('clears the unchanged draft only after the prompt is queued', async () => {
        const send = vi.fn(async () => true);
        const clearIfUnchanged = vi.fn();
        const preserveForSession = vi.fn();

        await expect(deliverNewSessionPrompt({
            rawPrompt: '  inspect this  ',
            send,
            clearIfUnchanged,
            preserveForSession,
        })).resolves.toEqual({ queued: true });

        expect(send).toHaveBeenCalledWith('inspect this');
        expect(clearIfUnchanged).toHaveBeenCalledWith('  inspect this  ');
        expect(preserveForSession).not.toHaveBeenCalled();
    });

    it('preserves the draft in the created session when queueing returns false', async () => {
        const preserveForSession = vi.fn();

        await expect(deliverNewSessionPrompt({
            rawPrompt: 'retry me',
            send: vi.fn(async () => false),
            clearIfUnchanged: vi.fn(),
            preserveForSession,
        })).resolves.toEqual({ queued: false });

        expect(preserveForSession).toHaveBeenCalledWith('retry me');
    });

    it('preserves the draft and reports send errors', async () => {
        const error = new Error('encryption unavailable');
        const preserveForSession = vi.fn();

        const result = await deliverNewSessionPrompt({
            rawPrompt: 'retry me',
            send: vi.fn(async () => { throw error; }),
            clearIfUnchanged: vi.fn(),
            preserveForSession,
        });

        expect(result).toEqual({ queued: false, error });
        expect(preserveForSession).toHaveBeenCalledWith('retry me');
    });
});
