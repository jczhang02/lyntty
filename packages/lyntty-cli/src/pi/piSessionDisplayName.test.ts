import { describe, expect, it } from 'bun:test';

import { reconcilePiSessionDisplayName, resolvePiSessionDisplayName } from './piSessionDisplayName';

describe('resolvePiSessionDisplayName', () => {
  it('uses user-facing names without falling back to an internal Pi id', () => {
    expect(resolvePiSessionDisplayName('Release fix', 'first prompt')).toBe('Release fix');
    expect(resolvePiSessionDisplayName(undefined, 'first prompt')).toBe('first prompt');
    expect(resolvePiSessionDisplayName(undefined, undefined)).toBe('Pi session');
    expect(resolvePiSessionDisplayName('  ', '  ')).toBe('Pi session');
    expect(resolvePiSessionDisplayName('(no messages)', 'first prompt')).toBe('first prompt');
    expect(resolvePiSessionDisplayName('PI SESSION', 'first prompt')).toBe('first prompt');
  });
});

describe('reconcilePiSessionDisplayName', () => {
  it('backfills a canonical local title over generic relay metadata', () => {
    expect(reconcilePiSessionDisplayName('Pi session', 'Canonical local title')).toBe('Canonical local title');
  });

  it('does not replace a useful relay title with a generic fallback', () => {
    expect(reconcilePiSessionDisplayName('Existing title', 'Pi session')).toBe('Existing title');
    expect(reconcilePiSessionDisplayName('Existing title', '(no messages)')).toBe('Existing title');
    expect(reconcilePiSessionDisplayName('Existing title', 'PI')).toBe('Existing title');
  });
});
