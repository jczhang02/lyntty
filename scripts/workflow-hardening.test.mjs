import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const relayDeployPath = new URL('../.github/workflows/relay-deploy.yml', import.meta.url);
const relayImagePath = new URL('../.github/workflows/relay-image.yml', import.meta.url);
const androidReleasePath = new URL('../.github/workflows/android-release.yml', import.meta.url);

const [relayDeploy, relayImage, androidRelease] = await Promise.all([
  readFile(relayDeployPath, 'utf8'),
  readFile(relayImagePath, 'utf8'),
  readFile(androidReleasePath, 'utf8'),
]);

test('relay deploy accepts only a full commit image tag and passes it as an argument', () => {
  assert.match(relayDeploy, /\^sha-\[0-9a-f\]\{40\}\$/);
  assert.match(relayDeploy, /bash -se -- "?\$IMAGE_TAG"?/);
  assert.doesNotMatch(relayDeploy, /IMAGE_TAG='\$IMAGE_TAG' bash/);
  assert.doesNotMatch(relayDeploy, /sha-\[0-9a-fA-F\]\*/);
  assert.match(relayDeploy, /environment: production-relay/);
  assert.match(relayDeploy, /GITHUB_REF[^\n]*refs\/heads\/main/);
});

test('relay image verification never publishes from an ordinary main push', () => {
  assert.match(relayImage, /workflow_dispatch/);
  assert.match(relayImage, /pull_request/);
  assert.match(relayImage, /push: false/);
  assert.match(relayImage, /verify-\$\{\{ github\.sha \}\}/);
  assert.doesNotMatch(relayImage, /packages: write/);
  assert.doesNotMatch(relayImage, /docker\/login-action/);
  assert.doesNotMatch(relayImage, /refs\/heads\/main/);
});

test('Android release is main-only, validates SemVer, and avoids expression injection', () => {
  assert.match(androidRelease, /environment: production-android/);
  assert.match(androidRelease, /GITHUB_REF[^\n]*refs\/heads\/main/);
  assert.match(androidRelease, /\^\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\$/);
  assert.doesNotMatch(androidRelease, /-PlynttyVersionName='\$\{\{ inputs\.version_name \}\}'/);
});
