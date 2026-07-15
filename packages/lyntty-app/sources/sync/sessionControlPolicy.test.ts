import { describe, expect, it } from 'vitest';

import { canControlSession } from './sessionControlPolicy';

describe('canControlSession', () => {
    it('allows current Pi and flavorless legacy Pi sessions', () => {
        expect(canControlSession({ flavor: 'pi' })).toBe(true);
        expect(canControlSession({})).toBe(true);
        expect(canControlSession(null)).toBe(true);
    });

    it('keeps explicit legacy provider sessions history-only', () => {
        expect(canControlSession({ flavor: 'claude' })).toBe(false);
        expect(canControlSession({ flavor: 'codex' })).toBe(false);
        expect(canControlSession({ flavor: 'gemini' })).toBe(false);
        expect(canControlSession({ flavor: 'openclaw' })).toBe(false);
    });
});
