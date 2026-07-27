import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'bun:test';

const PAIRING_URL_PATTERN = /lyntty:\/\/terminal\?[^\s"'<>`]+/g;
const AUTH_PUBLIC_KEY_PATTERN = /publicKey=(?!\[REDACTED\])[A-Za-z0-9_-]{16,}/;
const SAFE_PAIRING_URL_PLACEHOLDERS = new Set([
  'lyntty://terminal?...',
  'lyntty://terminal?[REDACTED]',
]);
const IMAGE_PATTERN = /\.(?:gif|png|jpe?g|webp)$/i;
const SENSITIVE_IMAGE_PATH_PATTERN = /(?:auth|pair|terminal|manual-url|deeplink)/i;

const APPROVED_PUBLIC_SCREENSHOTS = new Map([
  ['docs/assets/readme/preview-onboarding-emulator.png', 'a4b9c068c988b69951f375e2eba0ddb1294d2e441209ca878d4515974a3e2725'],
]);

function trackedEvidenceFiles() {
  return execFileSync('git', ['-c', 'core.quotepath=false', 'ls-files', '-z', 'docs/evidence', 'docs/assets'], { encoding: 'buffer' })
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
}

export function findUnsafePairingUrls(content) {
  return [...content.toString('latin1').matchAll(PAIRING_URL_PATTERN)]
    .map((match) => match[0])
    .filter((url) => !SAFE_PAIRING_URL_PLACEHOLDERS.has(url));
}

test('tracked evidence contains no complete Lyntty pairing URL or auth public-key bytes', () => {
  const leaks = trackedEvidenceFiles().filter((path) => {
    const content = readFileSync(path);
    return findUnsafePairingUrls(content).length > 0 || AUTH_PUBLIC_KEY_PATTERN.test(content.toString('latin1'));
  });
  assert.deepEqual(leaks, [], `pairing URLs and auth public keys must be redacted in: ${leaks.join(', ')}`);
});

test('binary content and deceptive suffixes cannot bypass auth-material scanning', () => {
  const content = Buffer.from('\0prefix lyntty://terminal?real-secret... publicKey=auth_public_key_material suffix\0', 'latin1');
  assert.deepEqual(findUnsafePairingUrls(content), ['lyntty://terminal?real-secret...']);
  assert.equal(AUTH_PUBLIC_KEY_PATTERN.test(content.toString('latin1')), true);
});

test('auth and pairing screenshots must be removed or explicitly redacted before commit', () => {
  const unsafeImages = trackedEvidenceFiles().filter((path) => (
    IMAGE_PATTERN.test(path)
    && SENSITIVE_IMAGE_PATH_PATTERN.test(path)
    && !/redacted/i.test(path)
  ));
  assert.deepEqual(unsafeImages, [], `sensitive screenshots must be redacted or removed: ${unsafeImages.join(', ')}`);
});

test('public screenshots require an explicit reviewed digest', () => {
  const publicScreenshots = trackedEvidenceFiles().filter((path) => (
    path.startsWith('docs/assets/') && IMAGE_PATTERN.test(path)
  ));
  assert.deepEqual(publicScreenshots, [...APPROVED_PUBLIC_SCREENSHOTS.keys()]);
  for (const [path, expectedDigest] of APPROVED_PUBLIC_SCREENSHOTS) {
    const actualDigest = createHash('sha256').update(readFileSync(path)).digest('hex');
    assert.equal(actualDigest, expectedDigest, `${path} changed without reviewed redaction evidence`);
  }
});
