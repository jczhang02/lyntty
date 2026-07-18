import { describe, expect, it } from 'bun:test';

import { resolveAndroidUpdateChannel } from './nativeUpdateChannel';

describe('resolveAndroidUpdateChannel', () => {
    it('binds production and preview to distinct package identities', () => {
        expect(resolveAndroidUpdateChannel('production', 'dev.jczhang.lyntty')).toBe('stable');
        expect(resolveAndroidUpdateChannel('preview', 'dev.jczhang.lyntty.preview')).toBe('preview');
    });

    it('fails closed for development and mismatched package identities', () => {
        expect(resolveAndroidUpdateChannel('development', 'dev.jczhang.lyntty.dev')).toBeNull();
        expect(resolveAndroidUpdateChannel('preview', 'dev.jczhang.lyntty')).toBeNull();
        expect(resolveAndroidUpdateChannel('production', 'dev.jczhang.lyntty.preview')).toBeNull();
        expect(resolveAndroidUpdateChannel(undefined, 'dev.jczhang.lyntty')).toBeNull();
    });
});
