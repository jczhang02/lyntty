import { describe, expect, it } from 'bun:test';

import { fetchJsonWithTimeout } from './boundedJsonRequest';

describe('fetchJsonWithTimeout', () => {
    it('keeps the timeout active while the response body is read', async () => {
        let signal: AbortSignal | undefined;
        const request = fetchJsonWithTimeout({
            url: 'https://relay.test/v1/sessions',
            timeoutMs: 5,
            label: 'Session list request',
            fetcher: async (_url, init) => {
                signal = init?.signal as AbortSignal;
                return {
                    ok: true,
                    status: 200,
                    json: () => new Promise((_resolve, reject) => {
                        signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
                    }),
                } as Response;
            },
        });

        await expect(request).rejects.toThrow('Session list request timed out after 5ms');
        expect(signal?.aborted).toBe(true);
    });

    it('rejects non-success responses', async () => {
        await expect(fetchJsonWithTimeout({
            url: 'https://relay.test/v1/machines',
            timeoutMs: 50,
            label: 'Machine list request',
            fetcher: async () => ({ ok: false, status: 503 }) as Response,
        })).rejects.toThrow('Machine list request failed: 503');
    });
});
