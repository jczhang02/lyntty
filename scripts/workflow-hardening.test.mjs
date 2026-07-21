import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'bun:test';

const relayDeployPath = new URL('../.github/workflows/relay-deploy.yml', import.meta.url);
const relayImagePath = new URL('../.github/workflows/relay-image.yml', import.meta.url);
const androidReleasePath = new URL('../.github/workflows/android-release.yml', import.meta.url);
const androidPreviewCandidatePath = new URL('../.github/workflows/android-preview-candidate.yml', import.meta.url);
const androidPreviewPromotePath = new URL('../.github/workflows/android-preview-promote.yml', import.meta.url);
const releaseCandidatePath = new URL('../.github/workflows/release-candidate.yml', import.meta.url);
const releasePromotePath = new URL('../.github/workflows/release-promote.yml', import.meta.url);
const releaseRollbackPath = new URL('../.github/workflows/release-rollback.yml', import.meta.url);
const nativeSigningPath = new URL('../.github/workflows/native-signing.yml', import.meta.url);
const androidGradlePath = new URL('../packages/lyntty-app/android/app/build.gradle', import.meta.url);
const maestroRunnerPath = new URL('./e2e/run-maestro.sh', import.meta.url);
const codeownersPath = new URL('../.github/CODEOWNERS', import.meta.url);
const typecheckWorkflowPath = new URL('../.github/workflows/typecheck.yml', import.meta.url);
const cliSmokeWorkflowPath = new URL('../.github/workflows/cli-smoke-test.yml', import.meta.url);
const cliArtifactBuilderPath = new URL('../packages/lyntty-cli/scripts/build-artifact.ts', import.meta.url);
const rootPackagePath = new URL('../package.json', import.meta.url);
const previewRelayGatePath = new URL('../e2e/maestro/standalone/preview_first_run.yml', import.meta.url);
const previewReleaseNotesPath = new URL('../docs/release/preview-apk-release-notes.md', import.meta.url);
const previewBundleSmokePath = new URL('../packages/lyntty-app/scripts/bundle-smoke.ts', import.meta.url);

const [relayDeploy, relayImage, androidRelease, androidPreviewCandidate, androidPreviewPromote, releaseCandidate, releasePromote, releaseRollback, nativeSigning, androidGradle, maestroRunner, codeowners, typecheckWorkflow, cliSmokeWorkflow, cliArtifactBuilder, rootPackageText, previewRelayGate, previewBundleSmoke] = await Promise.all([
  readFile(relayDeployPath, 'utf8'),
  readFile(relayImagePath, 'utf8'),
  readFile(androidReleasePath, 'utf8'),
  readFile(androidPreviewCandidatePath, 'utf8'),
  readFile(androidPreviewPromotePath, 'utf8'),
  readFile(releaseCandidatePath, 'utf8'),
  readFile(releasePromotePath, 'utf8'),
  readFile(releaseRollbackPath, 'utf8'),
  readFile(nativeSigningPath, 'utf8'),
  readFile(androidGradlePath, 'utf8'),
  readFile(maestroRunnerPath, 'utf8'),
  readFile(codeownersPath, 'utf8'),
  readFile(typecheckWorkflowPath, 'utf8'),
  readFile(cliSmokeWorkflowPath, 'utf8'),
  readFile(cliArtifactBuilderPath, 'utf8'),
  readFile(rootPackagePath, 'utf8'),
  readFile(previewRelayGatePath, 'utf8'),
  readFile(previewBundleSmokePath, 'utf8'),
]);
const rootPackage = JSON.parse(rootPackageText);
const previewReleaseNotes = await readFile(previewReleaseNotesPath, 'utf8');
const resolvedPreviewReleaseNotes = previewReleaseNotes
  .replaceAll('{{VERSION_NAME}}', '1.2.0')
  .replaceAll('{{VERSION_CODE}}', '920001')
  .replaceAll('{{APK_NAME}}', 'lyntty-preview-v1.2.0-920001.apk')
  .replaceAll('{{APK_NAME_NO_EXT}}', 'lyntty-preview-v1.2.0-920001')
  .replaceAll('{{TAG}}', 'android-preview-v1.2.0-920001')
  .replaceAll('{{SHA256}}', '9025d83a142ded5a618ef15c56c9bdd5486fed8336a53f1b9f0c7336b325aae9')
  .replaceAll('{{SOURCE_COMMIT}}', '33d7a99c57cce0783d069e95ba6d4abc59a53c1d');

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

test('Preview APK candidate builds audited dual-ABI bytes without publishing', () => {
  assert.match(androidPreviewCandidate, /workflow_dispatch/);
  assert.match(androidPreviewCandidate, /GITHUB_REF[^\n]*refs\/heads\/main/);
  assert.match(androidPreviewCandidate, /APP_ENV: preview/);
  assert.match(androidPreviewCandidate, /reactNativeArchitectures=x86_64,arm64-v8a/);
  assert.match(androidPreviewCandidate, /dev\.jczhang\.lyntty\.preview/);
  assert.match(androidPreviewCandidate, /ebd23c222b690e2be635fe3e52bd70b6fb86c5570ab279bc4e8c1f22ed90ef9c/);
  assert.match(androidPreviewCandidate, /Refusing unreviewed Preview build input/);
  assert.match(androidPreviewCandidate, /EXPO_PUBLIC_\*/);
  assert.match(androidPreviewCandidate, /gradle-runtime-audit\.sh/);
  assert.match(androidPreviewCandidate, /apk-audit\.sh/);
  assert.match(androidPreviewCandidate, /GITHUB_REF_PROTECTED/);
  assert.match(androidPreviewCandidate, /\[\[ "\$VERSION_CODE" == 920001 \]\]/);
  assert.match(androidPreviewCandidate, /\[\[ "\$version_name" == 1\.2\.0 \]\]/);
  assert.match(androidPreviewCandidate, /arm64-v8a,x86_64/);
  assert.match(androidPreviewCandidate, /source_commit=%s/);
  assert.match(androidPreviewCandidate, /sha256=%s/);
  assert.match(androidPreviewCandidate, /candidate-manifest\.json/);
  assert.match(androidPreviewCandidate, /\(HTTP 404\)/);
  assert.match(androidPreviewCandidate, /release_list_json="\$\(gh release list/);
  assert.doesNotMatch(androidPreviewCandidate, /done < <\(gh release list/);
  assert.match(androidPreviewCandidate, /subject-path:[^\n]*candidate-manifest\.json/);
  assert.match(androidPreviewCandidate, /actions\/attest@/);
  assert.match(androidPreviewCandidate, /actions\/upload-artifact@/);
  assert.doesNotMatch(androidPreviewCandidate, /contents: write/);
  assert.doesNotMatch(androidPreviewCandidate, /gh release create/);
  assert.match(rootPackage.scripts['ci:app'], /bun run --filter lyntty-app test:bundle/);
  assert.match(previewBundleSmoke, /EXPO_NO_DOTENV: '1'/);
  assert.match(previewBundleSmoke, /startsWith\('EXPO_PUBLIC_'\)/);
  assert.match(previewBundleSmoke, /finally \{\s+await rm\(outputRoot/);
});

test('Preview APK promotion publishes only exact tested candidate bytes', () => {
  assert.match(androidPreviewPromote, /workflow_dispatch/);
  assert.match(androidPreviewPromote, /candidate_run_id/);
  assert.match(androidPreviewPromote, /expected_sha256/);
  assert.match(androidPreviewPromote, /physical_phone_accepted/);
  assert.match(androidPreviewPromote, /unverified_release_waiver/);
  assert.match(androidPreviewPromote, /I accept publishing this exact Candidate without physical Android validation/);
  assert.match(androidPreviewPromote, /release_mode=physical-phone/);
  assert.match(androidPreviewPromote, /release_mode=owner-waiver-unverified/);
  assert.match(androidPreviewPromote, /\[\[ -z "\$UNVERIFIED_RELEASE_WAIVER" \]\]/);
  assert.match(androidPreviewPromote, /\[\[ "\$UNVERIFIED_RELEASE_WAIVER" == "\$waiver_phrase" \]\]/);
  assert.doesNotMatch(androidPreviewPromote, /^\s*\[\[ "\$PHYSICAL_PHONE_ACCEPTED" == true \]\]$/m);
  assert.match(androidPreviewPromote, /Physical Android validation was not completed for this exact Candidate\./);
  assert.match(androidPreviewPromote, /此精确 Candidate 未完成实体 Android 验证。/);
  assert.match(androidPreviewPromote, /notes="\$RELEASE_NOTES"/);
  assert.match(androidPreviewPromote, /release_notes_sha256/);
  assert.match(androidPreviewPromote, /GITHUB_ACTOR/);
  assert.equal((androidPreviewPromote.match(/cmp -s "\$RELEASE_NOTES"/g) ?? []).length, 2);
  assert.match(androidPreviewPromote, /LYNTTY_IMMUTABLE_RELEASES_ENABLED/);
  assert.match(androidPreviewPromote, /LYNTTY_PREVIEW_TAG_RULESET_ID/);
  assert.match(androidPreviewPromote, /GITHUB_REF_PROTECTED/g);
  assert.match(androidPreviewPromote, /contents: write/);
  assert.match(androidPreviewPromote, /actions: read/);
  assert.match(androidPreviewPromote, /android-preview-candidate\.yml/);
  assert.match(androidPreviewPromote, /gh run download/);
  assert.match(androidPreviewPromote, /gh attestation verify/);
  assert.match(androidPreviewPromote, /native_abis=arm64-v8a,x86_64/);
  assert.match(androidPreviewPromote, /debuggable=false/);
  assert.match(androidPreviewPromote, /signer_count=1/);
  assert.match(androidPreviewPromote, /Node-family execve matches: 0/);
  assert.match(androidPreviewPromote, /candidate-manifest\.json/);
  assert.match(androidPreviewPromote, /scripts\/preview-apk-allowlist\.json/);
  assert.match(androidPreviewPromote, /docs\/evidence\/r86-preview-apk-candidate\.md/);
  assert.match(androidPreviewPromote, /git diff --no-renames --name-status/);
  assert.match(androidPreviewPromote, /A\s+docs\/evidence\/r86-preview-apk-candidate\.md/);
  assert.match(androidPreviewPromote, /M\s+scripts\/preview-apk-allowlist\.json/);
  for (const path of [
    '.github/workflows/android-preview-promote.yml',
    'docs/release/android-apk.md',
    'docs/release/android-apk.zh.md',
    'scripts/workflow-hardening.test.mjs',
  ]) {
    assert.equal(androidPreviewPromote.split(`M\t${path}`).length - 1, 2, `${path} must be in both exact-delta checks`);
  }
  assert.match(androidPreviewPromote, /sourceTree/);
  assert.match(androidPreviewPromote, /isImmutable/);
  assert.match(androidPreviewPromote, /bypass_actors/);
  assert.match(androidPreviewPromote, /\["deletion", "update"\]/);
  assert.match(androidPreviewPromote, /release_list_json="\$\(gh release list/g);
  assert.match(androidPreviewPromote, /jq -j '\.body \/\/ ""'/);
  assert.doesNotMatch(androidPreviewPromote, /jq -r '\.body \/\/ ""'/);
  assert.match(androidPreviewPromote, /\(HTTP 404\)/);
  assert.match(androidPreviewPromote, /\.name/);
  assert.match(androidPreviewPromote, /already_published/);
  assert.doesNotMatch(androidPreviewPromote, /--json[^\n]*\btitle\b/);
  assert.match(androidPreviewPromote, /git\/refs/);
  assert.match(androidPreviewPromote, /refs\/tags\/\$RELEASE_TAG/);
  assert.match(androidPreviewPromote, /gh release create[\s\S]{0,240}--draft[^\n]*--prerelease/);
  assert.match(androidPreviewPromote, /pre-publish-assets/);
  assert.match(androidPreviewPromote, /post-publish-assets/);
  assert.match(androidPreviewPromote, /gh release edit[^\n]*--draft=false[^\n]*--prerelease[^\n]*--latest=false/);
  assert.match(androidPreviewPromote, /android-preview-v/);
  assert.doesNotMatch(androidPreviewPromote, /gradlew|assembleRelease/);
});

test('Preview waiver authorization is explicit and mutually exclusive', () => {
  const authorizationBlock = androidPreviewPromote.match(
    /waiver_phrase='I accept publishing this exact Candidate without physical Android validation'[\s\S]*?\n\s+esac/,
  )?.[0];
  assert.ok(authorizationBlock);

  const authorize = (physicalPhoneAccepted, waiver) => {
    const result = Bun.spawnSync({
      cmd: ['bash', '-c', `set -euo pipefail\n${authorizationBlock}\nprintf '%s' "$release_mode"`],
      env: {
        ...process.env,
        PHYSICAL_PHONE_ACCEPTED: physicalPhoneAccepted,
        UNVERIFIED_RELEASE_WAIVER: waiver,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    return {
      exitCode: result.exitCode,
      stdout: new TextDecoder().decode(result.stdout),
    };
  };

  assert.deepEqual(authorize('true', ''), { exitCode: 0, stdout: 'physical-phone' });
  assert.deepEqual(
    authorize('false', 'I accept publishing this exact Candidate without physical Android validation'),
    { exitCode: 0, stdout: 'owner-waiver-unverified' },
  );
  assert.notEqual(authorize('false', '').exitCode, 0);
  assert.notEqual(
    authorize('true', 'I accept publishing this exact Candidate without physical Android validation').exitCode,
    0,
  );
  assert.notEqual(authorize('unknown', '').exitCode, 0);
});

test('Preview waiver release body is generated byte-for-byte with a leading warning', async () => {
  const generationBlock = androidPreviewPromote.match(
    /          release_notes="\$RUNNER_TEMP\/android-preview-release-notes\.md"[\s\S]*?\n          fi/,
  )?.[0].split('\n').map(line => line.startsWith('          ') ? line.slice(10) : line).join('\n');
  assert.ok(generationBlock);
  const root = await mkdtemp(join(tmpdir(), 'lyntty-preview-waiver-notes-'));
  try {
    const notes = join(root, 'candidate-release-notes.md');
    assert.doesNotMatch(resolvedPreviewReleaseNotes, /\{\{/);
    await writeFile(notes, resolvedPreviewReleaseNotes);
    const generate = async (releaseMode) => {
      const runnerTemp = join(root, releaseMode);
      await mkdir(runnerTemp);
      const child = Bun.spawn({
        cmd: ['bash', '-c', `set -euo pipefail\n${generationBlock}`],
        env: { ...process.env, RUNNER_TEMP: runnerTemp, release_mode: releaseMode, notes },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const [stderr, exitCode] = await Promise.all([
        new Response(child.stderr).text(),
        child.exited,
      ]);
      assert.equal(exitCode, 0, stderr);
      return readFile(join(runnerTemp, 'android-preview-release-notes.md'), 'utf8');
    };

    assert.equal(await generate('physical-phone'), resolvedPreviewReleaseNotes);
    const waiverBody = await generate('owner-waiver-unverified');
    assert.match(waiverBody, /^> \[!WARNING\]\n/);
    assert.equal(waiverBody.split('Physical Android validation was not completed for this exact Candidate.').length - 1, 1);
    assert.equal(waiverBody.split('此精确 Candidate 未完成实体 Android 验证。').length - 1, 1);
    assert.ok(waiverBody.endsWith(resolvedPreviewReleaseNotes));
    const hasher = new Bun.CryptoHasher('sha256');
    hasher.update(waiverBody);
    assert.equal(hasher.digest('hex'), '087c0ab469b7a08ee09eada6c28db1ef77346eb628ad305184fcc8926f59b7e8');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Preview release body extraction preserves exact trailing bytes', () => {
  assert.match(previewReleaseNotes, /\n$/);
  const apiPayload = JSON.stringify({ body: previewReleaseNotes });
  assert.equal(JSON.parse(apiPayload).body, previewReleaseNotes);
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
  assert.match(releaseCandidate, /signed native archive identity\/source mismatch/);
  assert.match(releaseCandidate, /manifest\.sourceCommit!==process\.env\.EXPECTED_SOURCE/);
  assert.match(cliArtifactBuilder, /git', 'status', '--porcelain=v1', '--untracked-files=all'/);
  assert.match(cliArtifactBuilder, /Refusing to attribute an artifact to a dirty source tree/);
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
  assert.ok((nativeSigning.match(/manifest\.sourceCommit!==process\.env\.SOURCE_SHA/g) ?? []).length >= 2);
  assert.doesNotMatch(nativeSigning, /^\s*! printf '%s\\n'/m);
  assert.match(nativeSigning, /actions\/attest@36051bcae73b7c2a8a6945a48cbf80953c6baa35/);
  assert.match(nativeSigning, /bun install --frozen-lockfile/);
});

test('required PR hygiene verifies lifecycle trust and release contracts', () => {
  assert.match(typecheckWorkflow, /bun pm untrusted/);
  assert.match(typecheckWorkflow, /Found 0 untrusted dependencies with scripts/);
  assert.match(typecheckWorkflow, /bun test scripts\/release\.test\.ts/);
});

test('supported CLI artifacts run on every release architecture in PR CI', () => {
  assert.match(cliSmokeWorkflow, /pull_request:/);
  for (const target of ['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64']) {
    assert.match(cliSmokeWorkflow, new RegExp(`target: ${target}`));
  }
  assert.match(cliSmokeWorkflow, /--target windows-x64/);
  assert.match(cliSmokeWorkflow, /runner: ubuntu-24\.04-arm/);
  assert.match(cliSmokeWorkflow, /CLI artifact smoke \(\$\{\{ matrix\.target \}\}\)/);
  assert.match(cliSmokeWorkflow, /--self-check --json/);
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
  assert.equal(
    rootPackage.scripts['e2e:maestro:preview-first-run'],
    'LYNTTY_MAESTRO_APP_ID=dev.jczhang.lyntty.preview scripts/e2e/run-maestro.sh e2e/maestro/standalone/preview_first_run.yml',
  );
  assert.match(previewRelayGate, /visible: "Connect to Relay"/);
  assert.match(previewRelayGate, /assertNotVisible: "Create account"/);
  assert.doesNotMatch(previewRelayGate, /optional: true/);
  assert.match(maestroRunner, /maestro-daemon-restart\.sh/);
  assert.match(maestroRunner, /maestro-reload-ownership\.sh/);
  assert.match(maestroRunner, /Run scripts\/e2e\/maestro-daemon-restart\.sh/);
  assert.match(maestroRunner, /Run scripts\/e2e\/maestro-reload-ownership\.sh/);
});
