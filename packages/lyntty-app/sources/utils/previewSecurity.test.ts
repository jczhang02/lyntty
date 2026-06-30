import { describe, expect, it } from 'vitest';

import { createSafePreviewConfig, normalizeSafePreviewUri, validatePreviewAccess } from './previewSecurity';

describe('normalizeSafePreviewUri', () => {
    it('allows http and https preview URLs and strips fragments', () => {
        expect(normalizeSafePreviewUri('https://example.com/preview#secret')).toBe('https://example.com/preview');
        expect(normalizeSafePreviewUri('http://127.0.0.1:3000/index.html')).toBe('http://127.0.0.1:3000/index.html');
    });

    it('rejects javascript, data, file, malformed, and credential-bearing URLs', () => {
        expect(normalizeSafePreviewUri('javascript:alert(1)')).toBeNull();
        expect(normalizeSafePreviewUri('data:text/html,<script>1</script>')).toBeNull();
        expect(normalizeSafePreviewUri('file:///etc/passwd')).toBeNull();
        expect(normalizeSafePreviewUri('not a url')).toBeNull();
        expect(normalizeSafePreviewUri('https://user:pass@example.com')).toBeNull();
    });
});

describe('createSafePreviewConfig', () => {
    it('hardens WebView-style preview defaults', () => {
        expect(createSafePreviewConfig('https://example.com')).toEqual({
            uri: 'https://example.com/',
            originWhitelist: ['http://*', 'https://*'],
            javaScriptEnabled: false,
            allowFileAccess: false,
            allowUniversalAccessFromFileURLs: false,
            allowsInlineMediaPlayback: false,
            nativeBridgeEnabled: false,
        });
    });
});

describe('validatePreviewAccess', () => {
    it('allows read-only access inside the realpath jail before token expiry', () => {
        expect(validatePreviewAccess({
            rootRealPath: '/repo/preview',
            requestedRealPath: '/repo/preview/dist/index.html',
            method: 'GET',
            tokenExpiresAt: 2000,
            now: 1000,
        })).toEqual({ allowed: true });
        expect(validatePreviewAccess({
            rootRealPath: '/repo/preview',
            requestedRealPath: '/repo/preview',
            method: 'HEAD',
            tokenExpiresAt: 2000,
            now: 1000,
        })).toEqual({ allowed: true });
    });

    it('rejects path traversal after realpath resolution leaves the jail', () => {
        expect(validatePreviewAccess({
            rootRealPath: '/repo/preview',
            requestedRealPath: '/repo/secrets.env',
            method: 'GET',
            tokenExpiresAt: 2000,
            now: 1000,
        })).toEqual({ allowed: false, reason: 'outside_jail' });
    });

    it('rejects expired tokens', () => {
        expect(validatePreviewAccess({
            rootRealPath: '/repo/preview',
            requestedRealPath: '/repo/preview/index.html',
            method: 'GET',
            tokenExpiresAt: 1000,
            now: 2000,
        })).toEqual({ allowed: false, reason: 'expired_token' });
    });

    it('enforces read-only preview access', () => {
        expect(validatePreviewAccess({
            rootRealPath: '/repo/preview',
            requestedRealPath: '/repo/preview/index.html',
            method: 'POST',
            tokenExpiresAt: 2000,
            now: 1000,
        })).toEqual({ allowed: false, reason: 'write_method' });
    });
});
