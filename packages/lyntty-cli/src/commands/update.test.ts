import { describe, expect, it } from 'bun:test';

import { parseUpdateApplyOptions } from './update';

describe('update apply arguments', () => {
  it('requires a trusted manifest digest', () => {
    expect(() => parseUpdateApplyOptions([])).toThrow('--manifest-sha256 is required');
  });

  it('parses explicit install and replacement intent', () => {
    expect(parseUpdateApplyOptions([
      '--manifest-sha256', 'a'.repeat(64),
      '--install-root', '/home/tester/install',
      '--replace-extension',
    ])).toEqual({
      manifestSha256: 'a'.repeat(64),
      installRoot: '/home/tester/install',
      replaceExtension: true,
    });
  });

  it('rejects unknown and missing-value arguments', () => {
    expect(() => parseUpdateApplyOptions(['--manifest-sha256'])).toThrow('requires a value');
    expect(() => parseUpdateApplyOptions(['--wat'])).toThrow('Unknown update install argument');
  });
});
