import { describe, expect, it } from 'bun:test';

import { shouldShowAbortControl } from './agentInputControls';

describe('shouldShowAbortControl', () => {
    it('hides stop control when session is idle even if abort handler exists', () => {
        expect(shouldShowAbortControl(false, true)).toBe(false);
    });

    it('shows stop control only when the session is abortable and handler exists', () => {
        expect(shouldShowAbortControl(true, true)).toBe(true);
        expect(shouldShowAbortControl(true, false)).toBe(false);
    });
});
