import { describe, expect, it } from 'vitest';

import { shouldHideGenericToolPayload } from './toolPayloadPolicy';

describe('shouldHideGenericToolPayload', () => {
    it('hides unknown Pi and Gemini tool payloads in generic full views', () => {
        expect(shouldHideGenericToolPayload({ flavor: 'pi' } as any, false)).toBe(true);
        expect(shouldHideGenericToolPayload({ flavor: 'gemini' } as any, false)).toBe(true);
    });

    it('keeps specialized and non-Pi generic tool payloads available', () => {
        expect(shouldHideGenericToolPayload({ flavor: 'pi' } as any, true)).toBe(false);
        expect(shouldHideGenericToolPayload({ flavor: 'claude' } as any, false)).toBe(false);
        expect(shouldHideGenericToolPayload(null, false)).toBe(false);
    });
});
