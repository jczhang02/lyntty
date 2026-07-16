import * as privacyKit from "privacy-kit";
import { randomUUID } from "crypto";
import { db } from "@/storage/db";
import { log } from "@/utils/log";
import type { SocketClientType } from "./authScope";
import { resolveMasterSecret } from "@/masterSecret";

/** Cache entries expire after 24 hours */
const TOKEN_CACHE_TTL = 24 * 60 * 60 * 1000;
/** Hard cap to prevent unbounded growth */
const MAX_CACHE_SIZE = 10_000;
/** Run cleanup every 10 minutes */
const CLEANUP_INTERVAL = 10 * 60 * 1000;

interface TokenCacheEntry {
    userId: string;
    extras?: any;
    jti?: string;
    exp?: number;
    tokenVersion: number;
    cachedAt: number;
}

export interface AuthTokenExtras {
    session?: string;
    allowedClientTypes?: SocketClientType[];
    [key: string]: unknown;
}

export interface VerifiedAuthToken {
    userId: string;
    extras?: AuthTokenExtras;
    jti?: string;
    exp?: number;
    tokenVersion: number;
}

const DEFAULT_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface AuthTokens {
    generator: Awaited<ReturnType<typeof privacyKit.createPersistentTokenGenerator>>;
    verifier: Awaited<ReturnType<typeof privacyKit.createPersistentTokenVerifier>>;
}

export class AuthModule {
    private tokenCache = new Map<string, TokenCacheEntry>();
    private tokens: AuthTokens | null = null;
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;

    async init(): Promise<void> {
        if (this.tokens) {
            return; // Already initialized
        }

        log({ module: 'auth' }, 'Initializing auth module...');

        const generator = await privacyKit.createPersistentTokenGenerator({
            // Stable cryptographic domain retained so existing auth tokens remain valid.
            service: 'handy',
            seed: resolveMasterSecret(),
        });


        const verifier = await privacyKit.createPersistentTokenVerifier({
            service: 'handy',
            publicKey: Uint8Array.from(generator.publicKey)
        });

        this.tokens = { generator, verifier };

        // Start periodic cleanup of expired cache entries
        this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL);

        log({ module: 'auth' }, 'Auth module initialized');
    }

    async createToken(userId: string, extras?: AuthTokenExtras): Promise<string> {
        if (!this.tokens) {
            throw new Error('Auth module not initialized');
        }

        const account = await db.account.findUnique({
            where: { id: userId },
            select: { tokenVersion: true },
        });
        if (!account) {
            throw new Error(`Account not found while creating token: ${userId}`);
        }

        const now = Date.now();
        const payload: any = {
            user: userId,
            iat: now,
            exp: now + DEFAULT_TOKEN_TTL_MS,
            jti: randomUUID(),
            tokenVersion: account.tokenVersion,
        };
        payload.extras = {
            ...(extras ?? {}),
            allowedClientTypes: extras?.allowedClientTypes ?? ['user-scoped', 'session-scoped', 'machine-scoped'],
        } satisfies AuthTokenExtras;

        const token = await this.tokens.generator.new(payload);

        // Cache the token immediately
        this.tokenCache.set(token, {
            userId,
            extras: payload.extras,
            jti: payload.jti,
            exp: payload.exp,
            tokenVersion: payload.tokenVersion,
            cachedAt: Date.now()
        });

        return token;
    }

    private async isTokenStateValid(input: { userId: string; jti?: string; exp?: number; tokenVersion: number }): Promise<boolean> {
        const now = Date.now();
        if (input.exp && input.exp <= now) {
            return false;
        }

        const account = await db.account.findUnique({
            where: { id: input.userId },
            select: { tokenVersion: true },
        });
        if (!account || account.tokenVersion !== input.tokenVersion) {
            return false;
        }

        if (input.jti) {
            const revoked = await db.revokedAuthToken.findUnique({
                where: { jti: input.jti },
                select: { expiresAt: true },
            });
            if (revoked) {
                if (revoked.expiresAt.getTime() <= now) {
                    await db.revokedAuthToken.delete({ where: { jti: input.jti } }).catch(() => undefined);
                } else {
                    return false;
                }
            }
        }

        return true;
    }

    async verifyToken(token: string): Promise<VerifiedAuthToken | null> {
        // Check cache first (with TTL)
        const cached = this.tokenCache.get(token);
        if (cached) {
            if (Date.now() - cached.cachedAt > TOKEN_CACHE_TTL) {
                this.tokenCache.delete(token);
            } else if (await this.isTokenStateValid(cached)) {
                return {
                    userId: cached.userId,
                    extras: cached.extras,
                    jti: cached.jti,
                    exp: cached.exp,
                    tokenVersion: cached.tokenVersion,
                };
            } else {
                this.tokenCache.delete(token);
                return null;
            }
        }

        // Cache miss - verify token
        if (!this.tokens) {
            throw new Error('Auth module not initialized');
        }

        try {
            const verified = await this.tokens.verifier.verify(token);
            if (!verified) {
                return null;
            }

            const payload = verified as typeof verified & { jti?: unknown; exp?: unknown; tokenVersion?: unknown };
            if (typeof payload.user !== 'string' || payload.user.length === 0) {
                return null;
            }
            const userId = payload.user;
            const extras = payload.extras as AuthTokenExtras | undefined;
            const jti = typeof payload.jti === 'string' ? payload.jti : undefined;
            const exp = typeof payload.exp === 'number' ? payload.exp : undefined;
            const tokenVersion = typeof payload.tokenVersion === 'number' ? payload.tokenVersion : 0;

            if (!await this.isTokenStateValid({ userId, jti, exp, tokenVersion })) {
                return null;
            }

            // Evict oldest entries if cache is at capacity
            if (this.tokenCache.size >= MAX_CACHE_SIZE) {
                const oldest = [...this.tokenCache.entries()]
                    .sort((a, b) => a[1].cachedAt - b[1].cachedAt)
                    .slice(0, Math.floor(MAX_CACHE_SIZE * 0.2));
                for (const [key] of oldest) {
                    this.tokenCache.delete(key);
                }
            }

            this.tokenCache.set(token, {
                userId,
                extras,
                jti,
                exp,
                tokenVersion,
                cachedAt: Date.now()
            });

            return { userId, extras, jti, exp, tokenVersion };

        } catch (error) {
            log({ module: 'auth', level: 'error' }, `Token verification failed: ${error}`);
            return null;
        }
    }

    async invalidateUserTokens(userId: string): Promise<void> {
        await db.account.update({
            where: { id: userId },
            data: { tokenVersion: { increment: 1 } },
        });

        // Remove all tokens for a specific user
        // This is expensive but rarely needed
        for (const [token, entry] of this.tokenCache.entries()) {
            if (entry.userId === userId) {
                this.tokenCache.delete(token);
            }
        }

        log({ module: 'auth' }, `Invalidated tokens for user: ${userId}`);
    }

    async invalidateToken(token: string): Promise<void> {
        if (this.tokens) {
            try {
                const verified = await this.tokens.verifier.verify(token);
                const payload = verified as typeof verified & { jti?: unknown; exp?: unknown };
                const jti = typeof payload?.jti === 'string' ? payload.jti : undefined;
                const userId = typeof payload?.user === 'string' ? payload.user : undefined;
                const exp = typeof payload?.exp === 'number' ? payload.exp : Date.now() + DEFAULT_TOKEN_TTL_MS;
                if (jti && userId && exp > Date.now()) {
                    await db.revokedAuthToken.upsert({
                        where: { jti },
                        update: { expiresAt: new Date(exp) },
                        create: { jti, accountId: userId, expiresAt: new Date(exp) },
                    });
                }
            } catch (error) {
                log({ module: 'auth', level: 'error' }, `Token revocation verification failed: ${error}`);
            }
        }
        this.tokenCache.delete(token);
    }

    getCacheStats(): { size: number; oldestEntry: number | null } {
        if (this.tokenCache.size === 0) {
            return { size: 0, oldestEntry: null };
        }

        let oldest = Date.now();
        for (const entry of this.tokenCache.values()) {
            if (entry.cachedAt < oldest) {
                oldest = entry.cachedAt;
            }
        }

        return {
            size: this.tokenCache.size,
            oldestEntry: oldest
        };
    }

    /** Remove expired entries from the cache */
    cleanup(): void {
        const now = Date.now();
        let removed = 0;
        for (const [token, entry] of this.tokenCache.entries()) {
            if (now - entry.cachedAt > TOKEN_CACHE_TTL) {
                this.tokenCache.delete(token);
                removed++;
            }
        }
        if (removed > 0) {
            log({ module: 'auth' }, `Token cache cleanup: removed ${removed}, remaining ${this.tokenCache.size}`);
        }
    }
}

// Global instance
export const auth = new AuthModule();
