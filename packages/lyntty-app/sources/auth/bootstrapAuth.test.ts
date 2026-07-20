import { beforeEach, describe, expect, it, vi } from 'bun:test';

const mocks = {
    getCredentials: vi.fn(),
    setCredentials: vi.fn(),
    removeCredentials: vi.fn(),
    syncRestore: vi.fn(),
    syncReset: vi.fn(),
    clearPersistence: vi.fn(),
};

vi.mock('./tokenStorage', () => ({
    TokenStorage: {
        getCredentials: mocks.getCredentials,
        setCredentials: mocks.setCredentials,
        removeCredentials: mocks.removeCredentials,
    },
}));

vi.mock('@/sync/sync', () => ({
    syncRestore: mocks.syncRestore,
    syncReset: mocks.syncReset,
}));

vi.mock('@/sync/persistence', () => ({
    clearPersistence: mocks.clearPersistence,
}));

const { bootstrapAuth } = await import('./bootstrapAuth');

describe('bootstrapAuth', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCredentials.mockResolvedValue(null);
        mocks.setCredentials.mockResolvedValue(true);
        mocks.removeCredentials.mockResolvedValue(undefined);
        mocks.syncRestore.mockResolvedValue(undefined);
    });

    it('clears stale state without reading credentials or restoring sync while Preview setup is required', async () => {
        const credentials = await bootstrapAuth({
            requiresServerSetup: true,
            devCredentials: { token: 'must-not-load', secret: 'must-not-load' },
        });

        expect(credentials).toBeNull();
        expect(mocks.syncReset).toHaveBeenCalledTimes(1);
        expect(mocks.clearPersistence).toHaveBeenCalledTimes(1);
        expect(mocks.removeCredentials).toHaveBeenCalledTimes(1);
        expect(mocks.getCredentials).not.toHaveBeenCalled();
        expect(mocks.setCredentials).not.toHaveBeenCalled();
        expect(mocks.syncRestore).not.toHaveBeenCalled();
    });

    it('restores stored credentials when Relay setup is complete', async () => {
        const stored = { token: 'stored-token', secret: 'stored-secret' };
        mocks.getCredentials.mockResolvedValue(stored);

        const credentials = await bootstrapAuth({
            requiresServerSetup: false,
            devCredentials: null,
        });

        expect(credentials).toEqual(stored);
        expect(mocks.syncRestore).toHaveBeenCalledWith(stored);
        expect(mocks.removeCredentials).not.toHaveBeenCalled();
    });

    it('persists and restores changed development credentials after setup', async () => {
        mocks.getCredentials.mockResolvedValue({ token: 'old', secret: 'old' });
        const development = { token: 'development-token', secret: 'development-secret' };

        const credentials = await bootstrapAuth({
            requiresServerSetup: false,
            devCredentials: development,
        });

        expect(mocks.setCredentials).toHaveBeenCalledWith(development);
        expect(credentials).toEqual(development);
        expect(mocks.syncRestore).toHaveBeenCalledWith(development);
    });
});
