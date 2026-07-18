import { describe, expect, it } from 'bun:test';

import { apkSha256Matches, validApkSha256 } from './apkUpdateIntegrity';

describe('APK update integrity', () => {
    const digest = 'a'.repeat(64);

    it('accepts only exact SHA-256 hex digests', () => {
        expect(validApkSha256(digest)).toBe(true);
        expect(validApkSha256('A'.repeat(64))).toBe(true);
        expect(validApkSha256('a'.repeat(63))).toBe(false);
        expect(validApkSha256(`${'a'.repeat(63)}g`)).toBe(false);
    });

    it('blocks a downloaded APK whose digest differs', () => {
        expect(apkSha256Matches(digest, digest.toUpperCase())).toBe(true);
        expect(apkSha256Matches(digest, 'b'.repeat(64))).toBe(false);
        expect(apkSha256Matches('invalid', digest)).toBe(false);
    });
});
