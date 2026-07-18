import { describe, expect, it } from 'bun:test';

import { resolveMasterSecret } from './masterSecret';

describe('resolveMasterSecret', () => {
    it('prefers the Lyntty-namespaced secret', () => {
        expect(resolveMasterSecret({
            LYNTTY_MASTER_SECRET: 'current',
            HANDY_MASTER_SECRET: 'legacy',
        })).toBe('current');
    });

    it('accepts the legacy name during the compatibility window', () => {
        expect(resolveMasterSecret({
            HANDY_MASTER_SECRET: 'legacy',
        })).toBe('legacy');
    });

    it('closes the legacy-name window at Relay schema 2', () => {
        expect(() => resolveMasterSecret({ HANDY_MASTER_SECRET: 'legacy' }, 2))
            .toThrow('LYNTTY_MASTER_SECRET is required');
        expect(resolveMasterSecret({ LYNTTY_MASTER_SECRET: 'current' }, 2)).toBe('current');
    });

    it('fails closed when no secret is configured', () => {
        expect(() => resolveMasterSecret({})).toThrow('LYNTTY_MASTER_SECRET is required');
    });
});
