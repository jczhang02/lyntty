import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const PAIRING_URL_PATTERN = /lyntty:\/\/terminal\?[^\s"'<>`]+/g;
const SAFE_PAIRING_URL_PLACEHOLDERS = new Set([
  'lyntty://terminal?...',
  'lyntty://terminal?[REDACTED]',
]);
const IMAGE_PATTERN = /\.(?:png|jpe?g|webp)$/i;
const SENSITIVE_IMAGE_PATH_PATTERN = /(?:auth|pair|terminal|manual-url|deeplink)/i;

function trackedEvidenceFiles() {
  return execFileSync('git', ['-c', 'core.quotepath=false', 'ls-files', '-z', 'docs/evidence'], { encoding: 'buffer' })
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
}

export function findUnsafePairingUrls(content) {
  return [...content.toString('latin1').matchAll(PAIRING_URL_PATTERN)]
    .map((match) => match[0])
    .filter((url) => !SAFE_PAIRING_URL_PLACEHOLDERS.has(url));
}

test('tracked evidence contains no complete Lyntty pairing URL bytes', () => {
  const leaks = trackedEvidenceFiles().filter((path) => findUnsafePairingUrls(readFileSync(path)).length > 0);
  assert.deepEqual(leaks, [], `pairing URLs must be redacted in: ${leaks.join(', ')}`);
});

test('binary content and deceptive suffixes cannot bypass pairing URL scanning', () => {
  const content = Buffer.from('\0prefix lyntty://terminal?real-secret... suffix\0', 'latin1');
  assert.deepEqual(findUnsafePairingUrls(content), ['lyntty://terminal?real-secret...']);
});

test('auth and pairing screenshots must be removed or explicitly redacted before commit', () => {
  const unsafeImages = trackedEvidenceFiles().filter((path) => (
    IMAGE_PATTERN.test(path)
    && SENSITIVE_IMAGE_PATH_PATTERN.test(path)
    && !/redacted/i.test(path)
  ));
  assert.deepEqual(unsafeImages, [], `sensitive screenshots must be redacted or removed: ${unsafeImages.join(', ')}`);
});
