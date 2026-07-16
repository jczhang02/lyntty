import { describe, expect, it } from 'bun:test';

import { splitSessionTextByScript } from './sessionTextRuns';

describe('splitSessionTextByScript', () => {
    it('keeps English and Chinese prose in separate font runs', () => {
        expect(splitSessionTextByScript('Hello，世界 from Lyntty。')).toEqual([
            { text: 'Hello', script: 'latin' },
            { text: '，世界', script: 'cjk' },
            { text: ' from Lyntty', script: 'latin' },
            { text: '。', script: 'cjk' },
        ]);
    });

    it('keeps emoji and ascii punctuation with the surrounding latin run', () => {
        expect(splitSessionTextByScript('ok ✅ -> 中文')).toEqual([
            { text: 'ok ✅ -> ', script: 'latin' },
            { text: '中文', script: 'cjk' },
        ]);
    });
});
