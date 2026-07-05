import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Metadata } from '@/sync/storageTypes';
import { abortSessionFromMobile, usesPiExtensionControl } from './sessionAbortAction';

const mocks = vi.hoisted(() => ({
    sessionAbort: vi.fn(),
    sendMessage: vi.fn(),
}));

vi.mock('@/sync/ops', () => ({
    sessionAbort: mocks.sessionAbort,
}));

vi.mock('@/sync/sync', () => ({
    sync: {
        sendMessage: mocks.sendMessage,
    },
}));

describe('abortSessionFromMobile', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.sessionAbort.mockResolvedValue(undefined);
        mocks.sendMessage.mockResolvedValue(undefined);
    });

    it('routes pi-extension sessions through shared-control abort commands', async () => {
        await abortSessionFromMobile('session-1', { runtimeOwner: 'pi-extension' } as Metadata);

        expect(mocks.sendMessage).toHaveBeenCalledWith('session-1', '/abort', {
            source: 'chat',
            displayText: 'Stop current Pi turn',
        });
        expect(mocks.sessionAbort).not.toHaveBeenCalled();
    });

    it('uses legacy session RPC abort for SDK-owned sessions', async () => {
        await abortSessionFromMobile('session-2', { runtimeOwner: 'lyntty-sdk' } as Metadata);

        expect(mocks.sessionAbort).toHaveBeenCalledWith('session-2');
        expect(mocks.sendMessage).not.toHaveBeenCalled();
    });

    it('normalizes legacy external_pi metadata to pi-extension control', () => {
        expect(usesPiExtensionControl({ lifecycleState: 'external_pi' } as Metadata)).toBe(true);
    });
});
