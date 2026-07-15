import { describe, expect, it } from 'vitest';

import { resolvePiSessionDisplayName } from './piSessionDisplayName';

describe('resolvePiSessionDisplayName', () => {
  it('uses user-facing names without falling back to an internal Pi id', () => {
    expect(resolvePiSessionDisplayName('Release fix', 'first prompt')).toBe('Release fix');
    expect(resolvePiSessionDisplayName(undefined, 'first prompt')).toBe('first prompt');
    expect(resolvePiSessionDisplayName(undefined, undefined)).toBe('Pi session');
    expect(resolvePiSessionDisplayName('  ', '  ')).toBe('Pi session');
  });
});
