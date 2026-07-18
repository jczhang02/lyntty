import { describe, expect, it } from 'bun:test';
import { extractPiEdits } from './piEditInput';

describe('extractPiEdits', () => {
    it('extracts every edit from the current Pi tool input', () => {
        expect(extractPiEdits({
            path: 'sources/example.ts',
            edits: [
                { oldText: 'before one', newText: 'after one' },
                { oldText: 'before two', newText: 'after two' },
            ],
        })).toEqual([
            { oldText: 'before one', newText: 'after one' },
            { oldText: 'before two', newText: 'after two' },
        ]);
    });

    it('ignores malformed edits without hiding valid ones', () => {
        expect(extractPiEdits({
            edits: [
                { oldText: 'before', newText: 'after' },
                { oldText: 'missing new text' },
            ],
        })).toEqual([{ oldText: 'before', newText: 'after' }]);
    });
});
