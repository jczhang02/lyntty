import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'bun:test';

const relayDeployPath = new URL('../.github/workflows/relay-deploy.yml', import.meta.url);
const relayImagePath = new URL('../.github/workflows/relay-image.yml', import.meta.url);
const androidReleasePath = new URL('../.github/workflows/android-release.yml', import.meta.url);
const androidGradlePath = new URL('../packages/lyntty-app/android/app/build.gradle', import.meta.url);
const maestroRunnerPath = new URL('./e2e/run-maestro.sh', import.meta.url);

const [relayDeploy, relayImage, androidRelease, androidGradle, maestroRunner] = await Promise.all([
  readFile(relayDeployPath, 'utf8'),
  readFile(relayImagePath, 'utf8'),
  readFile(androidReleasePath, 'utf8'),
  readFile(androidGradlePath, 'utf8'),
  readFile(maestroRunnerPath, 'utf8'),
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
  assert.match(androidRelease, /gradle-runtime-audit\.sh/);
  assert.match(androidRelease, /apk-audit\.sh/);
  assert.match(androidRelease, /gradle-production-guard-test\.sh/);
  assert.match(androidRelease, /LYNTTY_ANDROID_CERT_SHA256/);
  assert.match(androidRelease, /releaseChannel: 'stable'/);
  assert.doesNotMatch(androidRelease, /LYNTTY_EAS_PROJECT_ID/);
});

test('Android Gradle binds stable, preview, and development to distinct identities', () => {
  assert.match(androidGradle, /development: 'dev\.jczhang\.lyntty\.dev'/);
  assert.match(androidGradle, /preview: 'dev\.jczhang\.lyntty\.preview'/);
  assert.match(androidGradle, /production: 'dev\.jczhang\.lyntty'/);
  assert.match(androidGradle, /APP_ENV=production permits explicit Release tasks only/);
  assert.match(androidGradle, /taskGraph\.whenReady/);
  assert.doesNotMatch(androidGradle, /applicationIdSuffix/);
});

test('Maestro reliability flows cannot bypass guarded orchestration', () => {
  assert.match(maestroRunner, /maestro-daemon-restart\.sh/);
  assert.match(maestroRunner, /maestro-reload-ownership\.sh/);
  assert.match(maestroRunner, /Run scripts\/e2e\/maestro-daemon-restart\.sh/);
  assert.match(maestroRunner, /Run scripts\/e2e\/maestro-reload-ownership\.sh/);
});
