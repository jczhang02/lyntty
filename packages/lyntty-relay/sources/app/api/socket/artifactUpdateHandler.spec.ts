import { describe, expect, it } from 'vitest';

import { isOversizedArtifactField } from './artifactUpdateHandler';

describe('artifact socket payload caps', () => {
    it('detects oversized artifact base64 fields', () => {
        expect(isOversizedArtifactField('x'.repeat(5_000_000))).toBe(false);
        expect(isOversizedArtifactField('x'.repeat(5_000_001))).toBe(true);
    });
});
