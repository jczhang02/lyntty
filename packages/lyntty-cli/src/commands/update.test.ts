import { describe, expect, it } from 'bun:test';

import { parseUpdateApplyOptions, parseUpdateCheckOptions } from './update';

describe('update check arguments', () => {
  it('defaults to stable and accepts explicit preview discovery inputs', () => {
    expect(parseUpdateCheckOptions([])).toEqual({
      channel: 'stable',
      json: false,
    });
    expect(parseUpdateCheckOptions([
      '--channel', 'preview',
      '--bom-url', 'https://example.invalid/bom.json',
      '--signature-url', 'https://example.invalid/bom.sig.json',
      '--trust-store', '/tmp/roots.json',
      '--json',
    ])).toEqual({
      channel: 'preview',
      bomUrl: 'https://example.invalid/bom.json',
      signatureUrl: 'https://example.invalid/bom.sig.json',
      trustStorePath: '/tmp/roots.json',
      json: true,
    });
  });

  it('rejects unknown channels and arguments', () => {
    expect(() => parseUpdateCheckOptions(['--channel', 'development'])).toThrow('--channel must be stable or preview');
    expect(() => parseUpdateCheckOptions(['--wat'])).toThrow('Unknown update check argument');
  });
});

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
