import { describe, expect, it, vi } from 'bun:test';

vi.mock('react-native', () => ({
    Platform: { OS: 'android' },
}));

import { FontFamilies, Typography, getCjkFont, getDefaultFont, getSerifFont } from './Typography';

describe('Typography', () => {
    it('uses Source Sans for compact UI text', () => {
        expect(getDefaultFont()).toBe('SourceSans3-Regular');
        expect(getDefaultFont('semiBold')).toBe('SourceSans3-SemiBold');
        expect(Typography.default()).toEqual({ fontFamily: 'SourceSans3-Regular' });
    });

    it('uses Source Serif for session English prose and LXGW Neo ZhiSong for session Chinese prose', () => {
        expect(getSerifFont()).toBe('SourceSerif4-Regular');
        expect(getSerifFont('semiBold')).toBe('SourceSerif4-SemiBold');
        expect(getCjkFont()).toBe('LXGWNeoZhiSong-Regular');
        expect(Typography.cjk()).toEqual({ fontFamily: 'LXGWNeoZhiSong-Regular' });
        expect(Typography.header()).toEqual({ fontFamily: 'SourceSerif4-SemiBold' });
        expect(Typography.body()).toEqual({ fontFamily: 'SourceSerif4-Regular' });
    });

    it('keeps IBM Plex Mono for dense tool and code output', () => {
        expect(FontFamilies.mono.regular).toBe('IBMPlexMono-Regular');
        expect(Typography.mono()).toEqual({ fontFamily: 'IBMPlexMono-Regular' });
    });
});
