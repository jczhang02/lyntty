import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = vi.hoisted(() => ({
    account: {
        findUnique: vi.fn(),
        update: vi.fn(),
    },
    revokedAuthToken: {
        findUnique: vi.fn(),
        delete: vi.fn(),
        upsert: vi.fn(),
    },
}));

vi.mock('@/storage/db', () => ({ db: dbMock }));
vi.mock('@/utils/log', () => ({ log: vi.fn() }));

describe('AuthModule token hardening', () => {
    beforeEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
        dbMock.account.findUnique.mockResolvedValue({ tokenVersion: 7 });
        dbMock.account.update.mockResolvedValue({ tokenVersion: 8 });
        dbMock.revokedAuthToken.findUnique.mockResolvedValue(null);
        dbMock.revokedAuthToken.delete.mockResolvedValue({});
        dbMock.revokedAuthToken.upsert.mockResolvedValue({});
    });

    async function buildAuth(overrides: Partial<any> = {}) {
        const { AuthModule } = await import('./auth');
        const auth = new AuthModule();
        const verifier = {
            verify: vi.fn(async (token: string) => JSON.parse(token)),
        };
        const generator = {
            publicKey: new Uint8Array([1, 2, 3]),
            new: vi.fn(async (payload: any) => JSON.stringify(payload)),
        };
        (auth as any).tokens = {
            generator,
            verifier,
            githubGenerator: { new: vi.fn() },
            githubVerifier: { verify: vi.fn() },
            ...overrides,
        };
        return { auth, generator, verifier };
    }

    it('creates expiring versioned tokens with client scopes', async () => {
        const { auth, generator } = await buildAuth();

        const token = await auth.createToken('account-1', { allowedClientTypes: ['user-scoped'] });
        const payload = JSON.parse(token);

        expect(generator.new).toHaveBeenCalledOnce();
        expect(payload).toMatchObject({
            user: 'account-1',
            tokenVersion: 7,
            extras: { allowedClientTypes: ['user-scoped'] },
        });
        expect(typeof payload.jti).toBe('string');
        expect(payload.exp).toBeGreaterThan(payload.iat);
    });

    it('rejects malformed token payloads without a user id', async () => {
        const { auth } = await buildAuth();
        const token = JSON.stringify({ jti: 'token-1', exp: Date.now() + 60_000, tokenVersion: 7 });

        await expect(auth.verifyToken(token)).resolves.toBeNull();
        expect(dbMock.account.findUnique).not.toHaveBeenCalled();
    });

    it('rejects tokens after account token version changes', async () => {
        const { auth } = await buildAuth();
        const token = await auth.createToken('account-1');
        dbMock.account.findUnique.mockResolvedValue({ tokenVersion: 8 });

        await expect(auth.verifyToken(token)).resolves.toBeNull();
    });

    it('rejects explicitly revoked token ids', async () => {
        const { auth } = await buildAuth();
        const token = JSON.stringify({
            user: 'account-1',
            jti: 'token-1',
            exp: Date.now() + 60_000,
            tokenVersion: 7,
            extras: { allowedClientTypes: ['user-scoped'] },
        });
        dbMock.revokedAuthToken.findUnique.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000) });

        await expect(auth.verifyToken(token)).resolves.toBeNull();
    });

    it('persists exact-token revocation by jti', async () => {
        const { auth } = await buildAuth();
        const token = JSON.stringify({
            user: 'account-1',
            jti: 'token-1',
            exp: Date.now() + 60_000,
            tokenVersion: 7,
        });

        await auth.invalidateToken(token);

        expect(dbMock.revokedAuthToken.upsert).toHaveBeenCalledWith(expect.objectContaining({
            where: { jti: 'token-1' },
            create: expect.objectContaining({ jti: 'token-1', accountId: 'account-1' }),
        }));
    });

    it('bumps account token version for user-wide revocation', async () => {
        const { auth } = await buildAuth();

        await auth.invalidateUserTokens('account-1');

        expect(dbMock.account.update).toHaveBeenCalledWith({
            where: { id: 'account-1' },
            data: { tokenVersion: { increment: 1 } },
        });
    });
});

describe('auth scope helpers', () => {
    it('allows only token-declared socket client types', async () => {
        const { isClientTypeAllowedByToken } = await import('./authScope');

        expect(isClientTypeAllowedByToken({ allowedClientTypes: ['user-scoped'] }, 'user-scoped')).toBe(true);
        expect(isClientTypeAllowedByToken({ allowedClientTypes: ['user-scoped'] }, 'machine-scoped')).toBe(false);
        expect(isClientTypeAllowedByToken(undefined, 'machine-scoped')).toBe(true);
    });
});
