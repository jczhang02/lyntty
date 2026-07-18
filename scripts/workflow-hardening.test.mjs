import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'bun:test';

const relayDeployPath = new URL('../.github/workflows/relay-deploy.yml', import.meta.url);
const relayImagePath = new URL('../.github/workflows/relay-image.yml', import.meta.url);
const androidReleasePath = new URL('../.github/workflows/android-release.yml', import.meta.url);
const releaseCandidatePath = new URL('../.github/workflows/release-candidate.yml', import.meta.url);
const releasePromotePath = new URL('../.github/workflows/release-promote.yml', import.meta.url);
const releaseRollbackPath = new URL('../.github/workflows/release-rollback.yml', import.meta.url);
const nativeSigningPath = new URL('../.github/workflows/native-signing.yml', import.meta.url);
const androidGradlePath = new URL('../packages/lyntty-app/android/app/build.gradle', import.meta.url);
const maestroRunnerPath = new URL('./e2e/run-maestro.sh', import.meta.url);
const codeownersPath = new URL('../.github/CODEOWNERS', import.meta.url);
const typecheckWorkflowPath = new URL('../.github/workflows/typecheck.yml', import.meta.url);

const [relayDeploy, relayImage, androidRelease, releaseCandidate, releasePromote, releaseRollback, nativeSigning, androidGradle, maestroRunner, codeowners, typecheckWorkflow] = await Promise.all([
  readFile(relayDeployPath, 'utf8'),
  readFile(relayImagePath, 'utf8'),
  readFile(androidReleasePath, 'utf8'),
  readFile(releaseCandidatePath, 'utf8'),
  readFile(releasePromotePath, 'utf8'),
  readFile(releaseRollbackPath, 'utf8'),
  readFile(nativeSigningPath, 'utf8'),
  readFile(androidGradlePath, 'utf8'),
  readFile(maestroRunnerPath, 'utf8'),
  readFile(codeownersPath, 'utf8'),
  readFile(typecheckWorkflowPath, 'utf8'),
]);

test('relay deploy resolves only a signed stable BOM to an immutable image', () => {
  assert.match(relayDeploy, /environment: production-relay/);
  assert.match(relayDeploy, /group: compatibility-promotion-stable/);
  assert.match(relayDeploy, /GITHUB_REF[^\n]*refs\/heads\/main/);
  assert.match(relayDeploy, /scripts\/release\.ts verify/);
  assert.match(relayDeploy, /ghcr\\\.io\/jczhang02\/lyntty-relay@sha256:/);
  assert.match(relayDeploy, /StrictHostKeyChecking=yes/);
  assert.doesNotMatch(relayDeploy, /StrictHostKeyChecking=accept-new/);
  assert.match(relayDeploy, /LYNTTY_VPS_KNOWN_HOSTS/);
  assert.match(relayDeploy, /cosign verify/);
  assert.match(relayDeploy, /gh attestation verify "oci:\/\/\$image"/);
  assert.match(relayDeploy, /schema_mutation_started=true/);
  assert.match(relayDeploy, /\.migration-incomplete/);
  assert.match(relayDeploy, /sudo \/bin\/bash -se/);
  assert.match(relayDeploy, /production deploy requires the current signed Stable head/);
  assert.match(relayDeploy, /deployed-sequence\.txt/);
  assert.match(relayDeploy, /trap 'exit 130' HUP INT TERM/);
  assert.match(relayDeploy, /remains fail-stopped after migration began/);
  assert.match(relayDeploy, /bun install --frozen-lockfile/);
  assert.match(relayDeploy, /bun --no-install scripts\/release\.ts/);
  assert.match(relayDeploy, / backup /);
  assert.match(relayDeploy, / migrate/);
  assert.match(relayDeploy, / doctor/);
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

test('Android component workflow verifies a candidate but cannot publish', () => {
  assert.match(androidRelease, /environment: production-android/);
  assert.match(androidRelease, /GITHUB_REF[^\n]*refs\/heads\/main/);
  assert.match(androidRelease, /\^\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\$/);
  assert.doesNotMatch(androidRelease, /-PlynttyVersionName='\$\{\{ inputs\.version_name \}\}'/);
  assert.match(androidRelease, /gradle-runtime-audit\.sh/);
  assert.match(androidRelease, /apk-audit\.sh/);
  assert.match(androidRelease, /gradle-production-guard-test\.sh/);
  assert.match(androidRelease, /LYNTTY_ANDROID_CERT_SHA256/);
  assert.match(androidRelease, /releaseChannel: 'stable'/);
  assert.match(androidRelease, /actions\/upload-artifact@/);
  assert.doesNotMatch(androidRelease, /contents: write/);
  assert.doesNotMatch(androidRelease, /gh release create/);
  assert.doesNotMatch(androidRelease, /LYNTTY_EAS_PROJECT_ID/);
});

test('candidate builds once under channel isolation and never publishes', () => {
  assert.match(releaseCandidate, /workflow_dispatch/);
  assert.doesNotMatch(releaseCandidate, /\non:\n  push:/);
  assert.match(releaseCandidate, /release-stable-candidate/);
  assert.match(releaseCandidate, /release-preview-candidate/);
  assert.match(releaseCandidate, /build-artifact\.ts --all/);
  assert.match(releaseCandidate, /LYNTTY_SIGNED_DARWIN_X64_URL/);
  assert.match(releaseCandidate, /LYNTTY_SIGNED_DARWIN_ARM64_URL/);
  assert.match(releaseCandidate, /LYNTTY_SIGNED_WINDOWS_X64_URL/);
  assert.match(releaseCandidate, /gh attestation verify "\$archive"/);
  assert.match(releaseCandidate, /native-signing\.yml/);
  assert.match(releaseCandidate, /--signer-digest "\$GITHUB_SHA"/);
  assert.match(releaseCandidate, /native-\$\{target\}-attestation\.json/);
  assert.match(releaseCandidate, /signed native archive identity mismatch/);
  assert.match(releaseCandidate, /signed native archive trust roots do not match candidate/);
  assert.match(releaseCandidate, /test fixture BOM roots are never publishable/);
  assert.ok(releaseCandidate.indexOf('test fixture BOM roots are never publishable') > releaseCandidate.indexOf('bun install --frozen-lockfile'));
  assert.doesNotMatch(releaseCandidate, /^\s*! printf '%s\\n'/m);
  assert.match(releaseCandidate, /retained CLI runtime identity mismatch/);
  assert.match(releaseCandidate, /retained Relay runtime identity mismatch/);
  assert.match(releaseCandidate, /relay-schema-doctor\.json/);
  assert.match(releaseCandidate, /cleanup_android_secrets/);
  assert.match(releaseCandidate, /packages\/lyntty-app\/google-services\.json/);
  assert.match(releaseCandidate, /release_rows=.*gh api[\s\S]*--paginate/);
  assert.match(releaseCandidate, /--self-check --json/);
  assert.match(releaseCandidate, /runtime-sentinel/);
  assert.match(releaseCandidate, /outputs: type=oci/);
  assert.match(releaseCandidate, /gradle-runtime-audit\.sh/);
  assert.match(releaseCandidate, /scripts\/release\.ts sign/);
  assert.equal((releaseCandidate.match(/secrets\.LYNTTY_BOM_PRIVATE_KEY_SEED_BASE64/g) ?? []).length, 1);
  assert.equal((releaseCandidate.match(/^  attestations: write$/gm) ?? []).length, 1);
  assert.match(releaseCandidate, /actions\/attest@/);
  assert.match(releaseCandidate, /actions\/upload-artifact@/);
  assert.doesNotMatch(releaseCandidate, /packages: write/);
  assert.doesNotMatch(releaseCandidate, /gh release create/);
  assert.doesNotMatch(releaseCandidate, /docker\/login-action/);
});

test('promotion publishes exact candidate bytes with protected stable/preview separation', () => {
  assert.match(releasePromote, /workflow_dispatch/);
  assert.match(releasePromote, /release-stable/);
  assert.match(releasePromote, /release-preview/);
  assert.match(releasePromote, /actions\/download-artifact@/);
  assert.match(releasePromote, /gh attestation verify/);
  assert.match(releasePromote, /skopeo copy --all/);
  assert.match(releasePromote, /remote_digest/);
  assert.match(releasePromote, /cosign verify/);
  assert.match(releasePromote, /--draft=false --latest/);
  assert.match(releasePromote, /--draft=false --prerelease/);
  assert.match(releasePromote, /latest_tag.*!=.*compat-preview/);
  assert.match(releasePromote, /candidate source is no longer current protected main/);
  assert.match(releasePromote, /native-signing\.yml/);
  assert.match(releasePromote, /--signer-digest "\$source_sha"/);
  assert.match(releasePromote, /candidate predecessor chain is stale/);
  assert.match(releasePromote, /candidate Android versionCode does not advance/);
  assert.match(releasePromote, /release_rows=.*gh api[\s\S]*--paginate/);
  assert.match(releasePromote, /info\.relaySchema!==bom\.components\.relay\.schema\.current/);
  assert.match(releasePromote, /existing candidate image tag has a different digest/);
  assert.match(releasePromote, /existing release is not the exact resumable draft/);
  assert.match(releasePromote, /gh release create "\$CANDIDATE_TAG" --draft/);
  assert.match(releasePromote, /gh release edit "\$CANDIDATE_TAG" --draft=false/);
  assert.match(releasePromote, /bun install --frozen-lockfile/);
  assert.doesNotMatch(releasePromote, /gradlew|build-artifact\.ts|docker buildx|build-push-action/);
});

test('stable rollback creates a higher signed BOM and reuses retained bytes', () => {
  assert.match(releaseRollback, /environment: release-stable/);
  assert.match(releaseRollback, /per_page=100/);
  assert.match(releaseRollback, /release_rows=.*gh api[\s\S]*--paginate/);
  assert.match(releaseRollback, /NR <= 3/);
  assert.match(releaseRollback, /components\.app = current\.components\.app/);
  assert.match(releaseRollback, /components\.cli = target\.components\.cli/);
  assert.match(releaseRollback, /components\.relay = target\.components\.relay/);
  assert.match(releaseRollback, /SEQUENCE > current_sequence/);
  assert.ok((releaseRollback.match(/git rev-parse origin\/main/g) ?? []).length >= 3);
  const rollbackPublish = releaseRollback.indexOf('gh release edit "$RELEASE_TAG" --draft=false --latest');
  const rollbackFinalMainCheck = releaseRollback.lastIndexOf('git rev-parse origin/main');
  assert.ok(rollbackFinalMainCheck > releaseRollback.indexOf('published_names='));
  assert.ok(rollbackFinalMainCheck < rollbackPublish);
  assert.match(releaseRollback, /scripts\/release\.ts verify-history/);
  assert.equal((releaseRollback.match(/secrets\.LYNTTY_BOM_PRIVATE_KEY_SEED_BASE64/g) ?? []).length, 1);
  assert.match(releaseRollback, /--latest/);
  assert.match(releaseRollback, /bun install --frozen-lockfile/);
  assert.match(releaseRollback, /existing rollback release is not the exact resumable draft/);
  assert.match(releaseRollback, /gh release create "\$RELEASE_TAG" --draft/);
  assert.match(releaseRollback, /gh release edit "\$RELEASE_TAG" --draft=false --latest/);
  assert.doesNotMatch(releaseRollback, /gradlew|build-artifact\.ts|docker buildx|build-push-action/);
});

test('native signature verification pins platform identities and attests exact archives', () => {
  assert.match(nativeSigning, /environment: release-native-signing/);
  assert.match(nativeSigning, /codesign --verify --deep --strict --verbose=2 "\$root\/lyntty"/);
  assert.match(nativeSigning, /spctl --assess --type execute --verbose=4 "\$root\/lyntty"/);
  assert.match(nativeSigning, /grep -F "Authority=\$APPLE_SIGNING_AUTHORITY"/);
  const macSigningBlock = nativeSigning.slice(0, nativeSigning.indexOf('verify-windows:'));
  assert.ok(macSigningBlock.indexOf('--self-check --json') > macSigningBlock.indexOf('done < "$extract/executables.txt"'));
  assert.match(nativeSigning, /xcrun notarytool info/);
  assert.match(nativeSigning, /\.status == "Accepted"/);
  assert.match(nativeSigning, /TeamIdentifier=\$APPLE_TEAM_ID/);
  assert.match(nativeSigning, /\$primarySignature = Get-AuthenticodeSignature -LiteralPath \$primary/);
  assert.match(nativeSigning, /WINDOWS_CERT_THUMBPRINT/);
  assert.match(nativeSigning, /primarySignature\.TimeStamperCertificate/);
  assert.doesNotMatch(nativeSigning, /^\s*! printf '%s\\n'/m);
  assert.match(nativeSigning, /actions\/attest@36051bcae73b7c2a8a6945a48cbf80953c6baa35/);
  assert.match(nativeSigning, /bun install --frozen-lockfile/);
});

test('isolated development lifecycle runs on Linux and macOS CI', () => {
  assert.match(typecheckWorkflow, /dev-isolation:/);
  assert.match(typecheckWorkflow, /os: \[ubuntu-latest, macos-15\]/);
  assert.match(typecheckWorkflow, /bun install --frozen-lockfile/);
  assert.match(typecheckWorkflow, /bun run ci:dev/);
});

test('CODEOWNERS covers release trust inputs and its own policy', () => {
  for (const path of [
    '/.github/CODEOWNERS', '/.dockerignore', '/Dockerfile', '/bun.lock',
    '/packages/lyntty-app/android/app/build.gradle',
    '/packages/lyntty-cli/scripts/build-artifact.ts',
    '/packages/lyntty-cli/src/distribution/',
    '/scripts/dev.ts',
    '/packages/lyntty-relay/sources/',
    '/packages/lyntty-wire/src/',
  ]) assert.match(codeowners, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
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
