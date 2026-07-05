import { describe, expect, it } from 'vitest';

import { formatSessionRpcFailure } from './apiSocketErrors';

describe('formatSessionRpcFailure', () => {
    it('preserves method and relay error details', () => {
        expect(formatSessionRpcFailure('abort', { ok: false, error: 'RPC method not available' }))
            .toBe('RPC call failed for abort: RPC method not available');
    });

    it('falls back when relay sends no detail', () => {
        expect(formatSessionRpcFailure('pi-history-page', { ok: false }))
            .toBe('RPC call failed for pi-history-page: unknown error');
    });
});
