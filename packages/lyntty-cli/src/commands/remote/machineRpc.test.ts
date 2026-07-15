import { describe, expect, it } from 'vitest';

import { parseSpawnMachineSessionResult } from './machineRpc';

describe('parseSpawnMachineSessionResult', () => {
    it('accepts complete result variants', () => {
        expect(parseSpawnMachineSessionResult({ type: 'success', sessionId: 'session-1' })).toEqual({
            type: 'success',
            sessionId: 'session-1',
        });
        expect(parseSpawnMachineSessionResult({
            type: 'requestToApproveDirectoryCreation',
            directory: '/repo',
        })).toEqual({ type: 'requestToApproveDirectoryCreation', directory: '/repo' });
        expect(parseSpawnMachineSessionResult({ type: 'error', errorMessage: 'blocked' })).toEqual({
            type: 'error',
            errorMessage: 'blocked',
        });
    });

    it.each([
        null,
        { type: 'success' },
        { type: 'success', sessionId: '' },
        { type: 'requestToApproveDirectoryCreation' },
        { type: 'error', errorMessage: '' },
        { type: 'other' },
    ])('rejects incomplete or unknown RPC data: %j', (value) => {
        expect(() => parseSpawnMachineSessionResult(value)).toThrow();
    });
});
