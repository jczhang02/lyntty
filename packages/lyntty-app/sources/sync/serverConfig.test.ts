import { describe, expect, it } from 'bun:test';
import {
    getLynttyRelayHealthUrl,
    isLynttyRelayHealthResponse,
    probeLynttyRelay,
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

    it('targets the canonical Relay health endpoint', () => {
        expect(getLynttyRelayHealthUrl('http://192.168.100.21:58821')).toBe('http://192.168.100.21:58821/health');
        expect(getLynttyRelayHealthUrl('https://relay.example.test/')).toBe('https://relay.example.test/health');
    });

    it('accepts only current healthy Lyntty Relay responses', () => {
        expect(isLynttyRelayHealthResponse({ status: 'ok', service: 'lyntty-relay' })).toBe(true);
        expect(isLynttyRelayHealthResponse({ status: 'error', service: 'lyntty-relay' })).toBe(false);
        expect(isLynttyRelayHealthResponse({ status: 'ok', service: 'another-service' })).toBe(false);
        expect(isLynttyRelayHealthResponse({ status: 'ok' })).toBe(false);
        expect(isLynttyRelayHealthResponse('Lyntty Relay API')).toBe(false);
        expect(isLynttyRelayHealthResponse(null)).toBe(false);
    });

    it('probes the current Relay health contract instead of the removed root marker', async () => {
        let requestedUrl = '';
        const result = await probeLynttyRelay('http://192.168.100.21:58821', async (input, init) => {
            requestedUrl = input.toString();
            expect(init?.headers).toEqual({ Accept: 'application/json' });
            return Response.json({ status: 'ok', service: 'lyntty-relay' });
        });

        expect(requestedUrl).toBe('http://192.168.100.21:58821/health');
        expect(result).toBe('ok');
    });

    it('rejects HTTP errors, malformed JSON, and non-Relay health responses', async () => {
        expect(await probeLynttyRelay('https://example.test', async () => new Response('', { status: 503 }))).toBe('server-error');
        expect(await probeLynttyRelay('https://example.test', async () => new Response('not json'))).toBe('not-relay');
        expect(await probeLynttyRelay('https://example.test', async () => Response.json({ status: 'ok', service: 'other' }))).toBe('not-relay');
    });
});
