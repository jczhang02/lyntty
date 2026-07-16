import { describe, expect, it } from 'bun:test';

import { shouldHideGenericToolPayload } from './toolPayloadPolicy';

describe('shouldHideGenericToolPayload', () => {
    it('hides unknown Pi tool payloads in generic full views', () => {
        expect(shouldHideGenericToolPayload({ flavor: 'pi' } as any, false)).toBe(true);
    });

    it('keeps specialized and legacy generic tool payloads available', () => {
        expect(shouldHideGenericToolPayload({ flavor: 'pi' } as any, true)).toBe(false);
        expect(shouldHideGenericToolPayload({ flavor: 'gemini' } as any, false)).toBe(false);
        expect(shouldHideGenericToolPayload({ flavor: 'claude' } as any, false)).toBe(false);
        expect(shouldHideGenericToolPayload(null, false)).toBe(false);
    });
});
