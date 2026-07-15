import { describe, expect, it } from 'vitest';

import { formatSessionRpcFailure, unwrapRpcHandlerResponse } from './apiSocketErrors';

describe('unwrapRpcHandlerResponse', () => {
    it('throws exact encrypted handler-error envelopes', () => {
        expect(() => unwrapRpcHandlerResponse({ error: 'Waiting for Pi extension' }))
            .toThrow('Waiting for Pi extension');
    });

    it('preserves typed business results that contain error details', () => {
        expect(unwrapRpcHandlerResponse({ type: 'error', errorMessage: 'typed error' })).toEqual({
            type: 'error',
            errorMessage: 'typed error',
        });
        expect(unwrapRpcHandlerResponse({ success: false, error: 'worktree error' })).toEqual({
            success: false,
            error: 'worktree error',
        });
    });
});

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
