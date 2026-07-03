import { describe, expect, it } from 'vitest';

import { shouldCheckForUpdates } from './useUpdatesUtils';

describe('shouldCheckForUpdates', () => {
    it('checks updates only outside development when Expo Updates is enabled', () => {
        expect(shouldCheckForUpdates(true, true)).toBe(false);
        expect(shouldCheckForUpdates(false, false)).toBe(false);
        expect(shouldCheckForUpdates(false, true)).toBe(true);
    });
});
