import { describe, expect, it } from 'bun:test';
import {
    getLynttyRelayHealthUrl,
    isLynttyRelayHealthResponse,
    probeLynttyRelay,
    replaceServerUrlWithAuthBoundary,
    requiresPreviewServerSetupForEnvironment,
    validateServerUrlForEnvironment,
} from './serverConfigUtils';

describe('serverConfig URL validation', () => {
    it('rejects cleartext HTTP in production builds', () => {
        expect(validateServerUrlForEnvironment('http://192.168.1.10:3005', 'production')).toEqual({
            valid: false,
            error: 'Production builds require an HTTPS Lyntty relay URL',
        });
    });

    it('allows cleartext HTTP outside production for local relay testing', () => {
        expect(validateServerUrlForEnvironment('http://10.0.2.2:3005', 'development')).toEqual({ valid: true });
    });

    it('allows Preview HTTP only for loopback and private LAN addresses', () => {
        for (const url of [
            'http://localhost:3005',
            'http://127.0.0.1:3005',
            'http://10.0.2.2:3005',
            'http://172.16.0.1:3005',
            'http://172.31.255.254:3005',
            'http://192.168.100.21:58821',
        ]) expect(validateServerUrlForEnvironment(url, 'preview'), url).toEqual({ valid: true });

        for (const url of [
            'http://relay.example.com:3005',
            'http://8.8.8.8:3005',
            'http://172.32.0.1:3005',
            'http://127.example.com:3005',
            'http://fcompany.example:3005',
        ]) expect(validateServerUrlForEnvironment(url, 'preview'), url).toEqual({
            valid: false,
            error: 'Preview HTTP requires a localhost or private LAN relay address',
            errorCode: 'preview-http-requires-local-network',
        });
        expect(validateServerUrlForEnvironment('https://relay.example.com', 'preview')).toEqual({ valid: true });
    });

    it('requires explicit Relay setup only for unconfigured Preview builds', () => {
        expect(requiresPreviewServerSetupForEnvironment('preview', null)).toBe(true);
        expect(requiresPreviewServerSetupForEnvironment('preview', '')).toBe(true);
        expect(requiresPreviewServerSetupForEnvironment('preview', 'http://192.168.1.2:3005')).toBe(false);
        expect(requiresPreviewServerSetupForEnvironment('preview', 'http://8.8.8.8:3005')).toBe(true);
        expect(requiresPreviewServerSetupForEnvironment('preview', 'not-a-url')).toBe(true);
        expect(requiresPreviewServerSetupForEnvironment('development', null)).toBe(false);
        expect(requiresPreviewServerSetupForEnvironment('production', null)).toBe(false);
    });

    it('clears old auth before persisting a Relay switch and leaves the old URL on failure', async () => {
        const events: string[] = [];
        await replaceServerUrlWithAuthBoundary({
            currentUrl: 'http://192.168.1.2:3005',
            nextUrl: 'http://192.168.1.3:3005',
            clearAuth: async () => { events.push('clear-auth'); },
            persistUrl: (url) => { events.push(`persist:${url}`); },
        });
        expect(events).toEqual(['clear-auth', 'persist:http://192.168.1.3:3005']);

        events.length = 0;
        await expect(replaceServerUrlWithAuthBoundary({
            currentUrl: 'http://192.168.1.2:3005',
            nextUrl: null,
            clearAuth: async () => { events.push('clear-auth'); throw new Error('credential deletion failed'); },
            persistUrl: (url) => { events.push(`persist:${url}`); },
        })).rejects.toThrow('credential deletion failed');
        expect(events).toEqual(['clear-auth']);
    });

    it('targets and recognizes only the canonical healthy Lyntty Relay endpoint', async () => {
        expect(getLynttyRelayHealthUrl('http://192.168.100.21:58821')).toBe('http://192.168.100.21:58821/health');
        expect(getLynttyRelayHealthUrl('https://relay.example.com/')).toBe('https://relay.example.com/health');
        expect(isLynttyRelayHealthResponse({ status: 'ok', service: 'lyntty-relay' })).toBe(true);
        expect(isLynttyRelayHealthResponse({ status: 'error', service: 'lyntty-relay' })).toBe(false);
        expect(isLynttyRelayHealthResponse({ status: 'ok', service: 'other' })).toBe(false);
        expect(isLynttyRelayHealthResponse('Welcome to Lyntty Relay!')).toBe(false);

        let requestedUrl = '';
        const result = await probeLynttyRelay('http://192.168.100.21:58821', async (input, init) => {
            requestedUrl = input.toString();
            expect(init?.headers).toEqual({ Accept: 'application/json' });
            return Response.json({ status: 'ok', service: 'lyntty-relay' });
        });
        expect(requestedUrl).toBe('http://192.168.100.21:58821/health');
        expect(result).toBe('ok');
    });

    it('rejects unhealthy, malformed, and non-Relay health responses', async () => {
        expect(await probeLynttyRelay('https://example.test', async () => new Response('', { status: 503 }))).toBe('server-error');
        expect(await probeLynttyRelay('https://example.test', async () => new Response('not json'))).toBe('not-relay');
        expect(await probeLynttyRelay('https://example.test', async () => Response.json({ status: 'ok', service: 'other' }))).toBe('not-relay');
    });
});
