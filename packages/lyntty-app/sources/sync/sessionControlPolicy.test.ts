import { describe, expect, it } from 'bun:test';

import { canControlSession } from './sessionControlPolicy';

describe('canControlSession', () => {
    it('allows only explicit current Pi sessions', () => {
        expect(canControlSession({ flavor: 'pi' })).toBe(true);
        expect(canControlSession({ flavor: ' PI ' })).toBe(false);
        expect(canControlSession({ flavor: 'Pi' })).toBe(false);
    });

    it('keeps unidentified and legacy provider sessions history-only', () => {
        expect(canControlSession({})).toBe(false);
        expect(canControlSession({ flavor: '' })).toBe(false);
        expect(canControlSession(null)).toBe(false);
        expect(canControlSession({ flavor: 'claude' })).toBe(false);
        expect(canControlSession({ flavor: 'codex' })).toBe(false);
        expect(canControlSession({ flavor: 'gemini' })).toBe(false);
        expect(canControlSession({ flavor: 'openclaw' })).toBe(false);
    });
});
