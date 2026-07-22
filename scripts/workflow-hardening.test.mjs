import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'bun:test';
import {
  createStableAndroidValidation,
  renderStableAndroidValidationWarning,
  STABLE_ANDROID_WAIVER_PHRASE,
} from './stable-release-validation.ts';

const relayDeployPath = new URL('../.github/workflows/relay-deploy.yml', import.meta.url);
const relayImagePath = new URL('../.github/workflows/relay-image.yml', import.meta.url);
const androidReleasePath = new URL('../.github/workflows/android-release.yml', import.meta.url);
const androidPreviewCandidatePath = new URL('../.github/workflows/android-preview-candidate.yml', import.meta.url);
const androidPreviewPromotePath = new URL('../.github/workflows/android-preview-promote.yml', import.meta.url);
const releaseCandidatePath = new URL('../.github/workflows/release-candidate.yml', import.meta.url);
const releasePromotePath = new URL('../.github/workflows/release-promote.yml', import.meta.url);
const releaseRollbackPath = new URL('../.github/workflows/release-rollback.yml', import.meta.url);
const nativeSigningPath = new URL('../.github/workflows/native-signing.yml', import.meta.url);
const nativeSigningProducerPath = new URL('../.github/workflows/native-signing-producer.yml', import.meta.url);
const githubReleasePath = new URL('./github-release.ts', import.meta.url);
const relayOciSbomPath = new URL('./relay-oci-sbom.ts', import.meta.url);
const androidGradlePath = new URL('../packages/lyntty-app/android/app/build.gradle', import.meta.url);
const maestroRunnerPath = new URL('./e2e/run-maestro.sh', import.meta.url);
const codeownersPath = new URL('../.github/CODEOWNERS', import.meta.url);
const typecheckWorkflowPath = new URL('../.github/workflows/typecheck.yml', import.meta.url);
const cliSmokeWorkflowPath = new URL('../.github/workflows/cli-smoke-test.yml', import.meta.url);
const cliArtifactBuilderPath = new URL('../packages/lyntty-cli/scripts/build-artifact.ts', import.meta.url);
const rootPackagePath = new URL('../package.json', import.meta.url);
const bunLockPath = new URL('../bun.lock', import.meta.url);
const previewRelayGatePath = new URL('../e2e/maestro/standalone/preview_first_run.yml', import.meta.url);
const previewReleaseNotesPath = new URL('../docs/release/preview-apk-release-notes.md', import.meta.url);
const previewBundleSmokePath = new URL('../packages/lyntty-app/scripts/bundle-smoke.ts', import.meta.url);

const [relayDeploy, relayImage, androidRelease, androidPreviewCandidate, androidPreviewPromote, releaseCandidate, releasePromote, releaseRollback, nativeSigning, nativeSigningProducer, githubRelease, relayOciSbom, androidGradle, maestroRunner, codeowners, typecheckWorkflow, cliSmokeWorkflow, cliArtifactBuilder, rootPackageText, bunLockText, previewRelayGate, previewBundleSmoke] = await Promise.all([
  readFile(relayDeployPath, 'utf8'),
  readFile(relayImagePath, 'utf8'),
  readFile(androidReleasePath, 'utf8'),
  readFile(androidPreviewCandidatePath, 'utf8'),
  readFile(androidPreviewPromotePath, 'utf8'),
  readFile(releaseCandidatePath, 'utf8'),
  readFile(releasePromotePath, 'utf8'),
  readFile(releaseRollbackPath, 'utf8'),
  readFile(nativeSigningPath, 'utf8'),
  readFile(nativeSigningProducerPath, 'utf8'),
  readFile(githubReleasePath, 'utf8'),
  readFile(relayOciSbomPath, 'utf8'),
  readFile(androidGradlePath, 'utf8'),
  readFile(maestroRunnerPath, 'utf8'),
  readFile(codeownersPath, 'utf8'),
  readFile(typecheckWorkflowPath, 'utf8'),
  readFile(cliSmokeWorkflowPath, 'utf8'),
  readFile(cliArtifactBuilderPath, 'utf8'),
  readFile(rootPackagePath, 'utf8'),
  readFile(bunLockPath, 'utf8'),
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
  .replaceAll('{{SHA256}}', '7139219f0051ab0ad705932f15175ea1e5d8903f91e0491b19f800aa97d4038b')
  .replaceAll('{{SOURCE_COMMIT}}', 'ef0853524fb78ecf31697103ff5597a0b20b1ed6');

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const obsoleteBrandingPaths = [
  'logo.png',
  'packages/lyntty-app/logo.png',
  '.github/mascot.png',
  '.github/header.png',
  '.github/logotype-dark.png',
  '.github/logotype-light.png',
];
const obsoleteNeonIconSha256 = '6bf41612ebe282a6813cc02fca02c92ae169c854ae285b0249d776fc0105dc17';

test('repository keeps the current launcher icon and rejects obsolete neon branding', async () => {
  for (const path of obsoleteBrandingPaths) {
    await assert.rejects(stat(join(repositoryRoot, path)), error => error?.code === 'ENOENT');
  }

  const appConfigUrl = new URL('../packages/lyntty-app/app.config.js', import.meta.url).href;
  const resolvedConfig = Bun.spawnSync({
    cmd: [
      process.execPath,
      '-e',
      `const config = (await import(${JSON.stringify(appConfigUrl)})).default; process.stdout.write(JSON.stringify(config.expo.icon));`,
    ],
    cwd: repositoryRoot,
    env: { ...process.env, APP_ENV: 'development' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  assert.equal(resolvedConfig.exitCode, 0, resolvedConfig.stderr.toString());
  assert.equal(JSON.parse(resolvedConfig.stdout.toString()), './sources/assets/images/icon.png');
  await stat(join(repositoryRoot, 'packages/lyntty-app/sources/assets/images/icon-source.svg'));
  await stat(join(repositoryRoot, 'packages/lyntty-app/sources/assets/images/icon.png'));

  const tracked = Bun.spawnSync({
    cmd: ['git', 'ls-files', '-z', '--', '*.png'],
    cwd: repositoryRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  assert.equal(tracked.exitCode, 0, tracked.stderr.toString());
  for (const path of tracked.stdout.toString().split('\0').filter(Boolean)) {
    const blob = Bun.spawnSync({
      cmd: ['git', 'show', `:${path}`],
      cwd: repositoryRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    assert.equal(blob.exitCode, 0, blob.stderr.toString());
    const digest = createHash('sha256').update(blob.stdout).digest('hex');
    assert.notEqual(digest, obsoleteNeonIconSha256, `obsolete neon icon remains tracked at ${path}`);
  }
});

test('relay deploy resolves only a signed stable BOM to an immutable image', () => {
  assert.match(relayDeploy, /environment: production-relay/);
  assert.match(relayDeploy, /group: compatibility-promotion-stable/);
  assert.match(relayDeploy, /GITHUB_REF[^\n]*refs\/heads\/main/);
  assert.match(relayDeploy, /GITHUB_REF_PROTECTED/);
  assert.match(relayDeploy, /git rev-parse HEAD/);
  assert.match(relayDeploy, /git rev-parse origin\/main/);
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
  assert.match(relayDeploy, /recorded deployed sequence must be one root-private regular file/);
  assert.match(relayDeploy, /recorded deployed BOM identity is invalid/);
  assert.match(relayDeploy, /recorded_deployed_reference/);
  assert.match(relayDeploy, /trap 'exit 130' HUP INT TERM/);
  assert.match(relayDeploy, /remains fail-stopped after migration began/);
  assert.match(relayDeploy, /LYNTTY_RELEASE_TRUST_ROOTS/);
  assert.match(relayDeploy, /LYNTTY_STABLE_MINIMUM_BOM_SEQUENCE/);
  assert.match(relayDeploy, /\[\[ ! -L \.env \]\]/);
  assert.match(relayDeploy, /\[\[ ! -L docker-compose\.yml \]\]/);
  assert.match(relayDeploy, /\.env-canonicalization\.log/);
  assert.match(relayDeploy, /\.RepoDigests/);
  assert.match(relayDeploy, /2eb926b37741e9b047b6e6f178ffdb0e84ed41c6649180421b3f4861838ff715/);
  assert.match(relayDeploy, /fe3bf95fd7e19cd34c3f94ff2aedeced9497535db797f07ba37241083dd8e83d/);
  assert.match(relayDeploy, /--project-name lyntty/);
  assert.match(relayDeploy, /grep -vE '[^']*LYNTTY_RELAY_IMAGE_TAG/);
  assert.match(relayDeploy, /HANDY_MASTER_SECRET: \$\{LYNTTY_MASTER_SECRET\}/);
  assert.match(relayDeploy, /Relay deployment preflight failed during phase=%s/);
  assert.match(relayDeploy, /legacy Relay source image-tag syntax category=%s/);
  for (const diagnostic of [
    'rendered legacy Relay Compose must contain only the lyntty-relay service',
    'rendered legacy Relay Compose has no scalar image reference',
    'rendered legacy Relay Compose has an unexpected persistent-volume model',
    'legacy Relay image tag must have one canonical source assignment',
    'legacy Relay source image tag is not a supported syntax for the documented R65 value',
  ]) {
    assert.match(relayDeploy, new RegExp(diagnostic));
  }
  assert.match(relayDeploy, /preflight_phase=legacy-image-layout/);
  for (const phase of ['source-model', 'rendered-model', 'running-container', 'repository-digest', 'staging', 'install']) {
    assert.match(relayDeploy, new RegExp(`preflight_phase=legacy-image-${phase}`));
  }
  assert.match(relayDeploy, /\.Config\.Image/);
  assert.match(relayDeploy, /\/v1\/version/);
  assert.match(relayDeploy, /bom_release_id/);
  assert.match(relayDeploy, /bom_sequence/);
  assert.match(relayDeploy, /bun install --frozen-lockfile/);
  assert.match(relayDeploy, /bun --no-install scripts\/release\.ts/);
  assert.match(relayDeploy, /read -r source relay_source[\s\S]*?console\.log\(`/);
  assert.doesNotMatch(relayDeploy, /read -r source relay_source[\s\S]*?process\.stdout\.write/);
  assert.match(relayDeploy, / backup /);
  assert.match(relayDeploy, / migrate/);
  assert.match(relayDeploy, / doctor/);
});

test('Relay env normalization preserves one supported secret assignment and rejects ambiguity', async () => {
  const functionBlock = relayDeploy.match(
    /(          compose\(\) \{[\s\S]*?\n          \})\n          restore_private_backup\(\) \{/,
  )?.[1].split('\n').map(line => line.startsWith('          ') ? line.slice(10) : line).join('\n');
  assert.ok(functionBlock);
  const block = `${functionBlock}\ncanonicalize_required_assignment LYNTTY_MASTER_SECRET HANDY_MASTER_SECRET\ncanonicalize_required_assignment LYNTTY_RELAY_IMAGE`;
  const root = await mkdtemp(join(tmpdir(), 'lyntty-relay-env-normalize-'));
  try {
    const execute = (dir, mockDockerFail = false) => {
      const result = Bun.spawnSync({
        cmd: ['bash', '-c', `set -euo pipefail\ncd "$ROOT"\n${block}`],
        env: {
          ...process.env,
          ROOT: dir,
          PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
          MOCK_DOCKER_FAIL: String(mockDockerFail),
          LYNTTY_MASTER_SECRET: 'ambient-master-must-not-win',
          HANDY_MASTER_SECRET: 'ambient-legacy-must-not-win',
          LYNTTY_RELAY_IMAGE: 'ambient-image-must-not-win',
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      return {
        exitCode: result.exitCode,
        stdout: new TextDecoder().decode(result.stdout),
        stderr: new TextDecoder().decode(result.stderr),
      };
    };
    const run = async (name, content, mockDockerFail = false) => {
      const dir = join(root, name);
      await mkdir(join(dir, 'bin'), { recursive: true });
      const mockDocker = join(dir, 'bin', 'docker');
      await writeFile(mockDocker, `#!/usr/bin/env bun
if (process.env.MOCK_DOCKER_FAIL === 'true') process.exit(1);
if (process.argv.slice(2).join(' ') !== 'compose --project-directory /opt/lyntty --project-name lyntty --file /opt/lyntty/docker-compose.yml --env-file /opt/lyntty/.env config --format json') process.exit(2);
const text = await Bun.file('.env').text();
const values = {};
for (const line of text.split('\\n')) {
  const match = line.replace(/^\\uFEFF/, '').match(/^(LYNTTY_MASTER_SECRET|LYNTTY_RELAY_IMAGE)=(.*)$/);
  if (!match) continue;
  let value = match[2].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  else value = value.replace(/\\s+#.*$/, '').trim();
  values[match[1]] = value;
}
const master = process.env.LYNTTY_MASTER_SECRET ?? values.LYNTTY_MASTER_SECRET;
const image = process.env.LYNTTY_RELAY_IMAGE ?? values.LYNTTY_RELAY_IMAGE;
console.log(JSON.stringify({ services: { 'lyntty-relay': { image, environment: { LYNTTY_MASTER_SECRET: master } } } }));
`);
      await chmod(mockDocker, 0o755);
      const mockJq = join(dir, 'bin', 'jq');
      await writeFile(mockJq, `#!/usr/bin/env bun
const args = process.argv.slice(2);
const keyIndex = args.indexOf('--arg');
if (keyIndex < 0 || args[keyIndex + 1] !== 'key' || !args[keyIndex + 2]) process.exit(2);
const key = args[keyIndex + 2];
const value = await Bun.stdin.json();
if (args.at(-1).includes('has($key) | not')) {
  const result = !Object.hasOwn(value.services?.['lyntty-relay']?.environment ?? {}, key);
  console.log(result);
  process.exit(result ? 0 : 1);
}
const result = key === 'LYNTTY_MASTER_SECRET'
  ? value.services?.['lyntty-relay']?.environment?.[key]
  : key === 'LYNTTY_RELAY_IMAGE'
    ? value.services?.['lyntty-relay']?.image
    : undefined;
if (result === undefined || result === null) process.exit(4);
console.log(result);
`);
      await chmod(mockJq, 0o755);
      await writeFile(join(dir, '.env'), content, { mode: 0o600 });
      await chmod(join(dir, '.env'), 0o600);
      return { dir, ...execute(dir, mockDockerFail) };
    };

    const original = [
      ' export   LYNTTY_MASTER_SECRET =secret=value',
      'export LYNTTY_RELAY_IMAGE=ghcr.io/example/relay@sha256:' + 'a'.repeat(64),
      '',
    ].join('\n');
    const normalized = await run('normalized', original);
    assert.equal(normalized.exitCode, 0, normalized.stderr);
    assert.doesNotMatch(`${normalized.stdout}\n${normalized.stderr}`, /secret=value/);
    const normalizedEnv = await readFile(join(normalized.dir, '.env'), 'utf8');
    assert.match(normalizedEnv, /^LYNTTY_MASTER_SECRET=secret=value$/m);
    assert.match(normalizedEnv, /^LYNTTY_RELAY_IMAGE=ghcr\.io\/example\/relay@sha256:[a-f0-9]{64}$/m);
    assert.doesNotMatch(normalizedEnv, /export[\s]+LYNTTY_MASTER_SECRET/);
    assert.equal((await stat(join(normalized.dir, '.env'))).mode & 0o777, 0o600);
    const normalizedNames = await readdir(normalized.dir);
    assert.equal(normalizedNames.filter(name => name.startsWith('.env-precanonical-LYNTTY_MASTER_SECRET-')).length, 1);
    assert.equal(normalizedNames.filter(name => name.startsWith('.env-precanonical-LYNTTY_RELAY_IMAGE-')).length, 1);
    for (const name of normalizedNames.filter(name => name.startsWith('.env-precanonical-'))) {
      assert.equal((await stat(join(normalized.dir, name))).mode & 0o777, 0o600);
    }
    const masterBackup = normalizedNames.find(name => name.startsWith('.env-precanonical-LYNTTY_MASTER_SECRET-'));
    assert.equal(await readFile(join(normalized.dir, masterBackup), 'utf8'), original);
    const receipt = await readFile(join(normalized.dir, '.env-canonicalization.log'), 'utf8');
    assert.match(receipt, /key=LYNTTY_MASTER_SECRET source_key=LYNTTY_MASTER_SECRET source_form=export target_form=canonical/);
    assert.match(receipt, /key=LYNTTY_RELAY_IMAGE source_key=LYNTTY_RELAY_IMAGE source_form=export target_form=canonical/);
    assert.doesNotMatch(receipt, /secret=value/);
    const namesBeforeRetry = (await readdir(normalized.dir)).sort();
    const receiptBeforeRetry = receipt;
    assert.equal(execute(normalized.dir).exitCode, 0);
    assert.deepEqual((await readdir(normalized.dir)).sort(), namesBeforeRetry);
    assert.equal(await readFile(join(normalized.dir, '.env-canonicalization.log'), 'utf8'), receiptBeforeRetry);

    const duplicateContent = [
      'export LYNTTY_MASTER_SECRET=first',
      'LYNTTY_MASTER_SECRET=second',
      'LYNTTY_RELAY_IMAGE=ghcr.io/example/relay@sha256:' + 'b'.repeat(64),
      '',
    ].join('\n');
    const duplicate = await run('duplicate', duplicateContent);
    assert.notEqual(duplicate.exitCode, 0);
    assert.equal(await readFile(join(duplicate.dir, '.env'), 'utf8'), duplicateContent);
    assert.deepEqual((await readdir(duplicate.dir)).filter(name => name.startsWith('.env-precanonical-')), []);

    const canonical = await run('canonical', [
      'LYNTTY_MASTER_SECRET=already-canonical',
      'LYNTTY_RELAY_IMAGE=ghcr.io/example/relay@sha256:' + 'c'.repeat(64),
      '',
    ].join('\n'));
    assert.equal(canonical.exitCode, 0);
    assert.deepEqual((await readdir(canonical.dir)).filter(name => name.startsWith('.env-precanonical-')), []);

    const legacyContent = [
      'HANDY_MASTER_SECRET=legacy-secret=value',
      'LYNTTY_RELAY_IMAGE=ghcr.io/example/relay@sha256:' + '2'.repeat(64),
      '',
    ].join('\n');
    const legacy = await run('legacy-master-secret', legacyContent);
    assert.equal(legacy.exitCode, 0, legacy.stderr);
    const legacyEnv = await readFile(join(legacy.dir, '.env'), 'utf8');
    assert.match(legacyEnv, /^LYNTTY_MASTER_SECRET=legacy-secret=value$/m);
    assert.doesNotMatch(legacyEnv, /HANDY_MASTER_SECRET/);
    assert.doesNotMatch(`${legacy.stdout}\n${legacy.stderr}`, /legacy-secret=value/);
    const legacyNames = await readdir(legacy.dir);
    const legacyBackup = legacyNames.find(name => name.startsWith('.env-precanonical-LYNTTY_MASTER_SECRET-'));
    assert.ok(legacyBackup);
    assert.equal(await readFile(join(legacy.dir, legacyBackup), 'utf8'), legacyContent);
    assert.equal((await stat(join(legacy.dir, legacyBackup))).mode & 0o777, 0o600);
    assert.equal((await stat(join(legacy.dir, '.env'))).mode & 0o777, 0o600);
    const legacyReceipt = await readFile(join(legacy.dir, '.env-canonicalization.log'), 'utf8');
    assert.match(legacyReceipt, /key=LYNTTY_MASTER_SECRET source_key=HANDY_MASTER_SECRET source_form=legacy target_form=canonical/);
    assert.doesNotMatch(legacyReceipt, /legacy-secret=value/);
    const legacyNamesBeforeRetry = (await readdir(legacy.dir)).sort();
    assert.equal(execute(legacy.dir).exitCode, 0);
    assert.deepEqual((await readdir(legacy.dir)).sort(), legacyNamesBeforeRetry);

    const legacyExport = await run('legacy-exported-master-secret', [
      " export HANDY_MASTER_SECRET='quoted legacy value'",
      'LYNTTY_RELAY_IMAGE=ghcr.io/example/relay@sha256:' + '3'.repeat(64),
      '',
    ].join('\n'));
    assert.equal(legacyExport.exitCode, 0, legacyExport.stderr);
    assert.match(await readFile(join(legacyExport.dir, '.env'), 'utf8'), /^LYNTTY_MASTER_SECRET='quoted legacy value'$/m);
    assert.doesNotMatch(`${legacyExport.stdout}\n${legacyExport.stderr}`, /quoted legacy value/);

    for (const [name, masterLines] of [
      ['coexisting-master-aliases', ['LYNTTY_MASTER_SECRET=current', 'HANDY_MASTER_SECRET=legacy']],
      ['duplicate-legacy-master', ['HANDY_MASTER_SECRET=first', 'export HANDY_MASTER_SECRET=second']],
      ['bom-hidden-current-master', ['\uFEFFLYNTTY_MASTER_SECRET=current', 'HANDY_MASTER_SECRET=legacy']],
    ]) {
      const content = [...masterLines, 'LYNTTY_RELAY_IMAGE=ghcr.io/example/relay@sha256:' + '4'.repeat(64), ''].join('\n');
      const ambiguous = await run(name, content);
      assert.notEqual(ambiguous.exitCode, 0, name);
      assert.equal(await readFile(join(ambiguous.dir, '.env'), 'utf8'), content, name);
      assert.deepEqual((await readdir(ambiguous.dir)).filter(entry => entry.startsWith('.env-precanonical-')), [], name);
    }

    const legacySemanticEmptyContent = [
      'HANDY_MASTER_SECRET=""',
      'LYNTTY_RELAY_IMAGE=ghcr.io/example/relay@sha256:' + '5'.repeat(64),
      '',
    ].join('\n');
    const legacySemanticEmpty = await run('legacy-semantic-empty', legacySemanticEmptyContent);
    assert.notEqual(legacySemanticEmpty.exitCode, 0);
    assert.equal(await readFile(join(legacySemanticEmpty.dir, '.env'), 'utf8'), legacySemanticEmptyContent);
    assert.doesNotMatch(`${legacySemanticEmpty.stdout}\n${legacySemanticEmpty.stderr}`, /HANDY_MASTER_SECRET=/);

    const missing = await run('missing', 'LYNTTY_RELAY_IMAGE=ghcr.io/example/relay@sha256:' + 'd'.repeat(64) + '\n');
    assert.notEqual(missing.exitCode, 0);
    assert.deepEqual((await readdir(missing.dir)).filter(name => name.startsWith('.env-precanonical-')), []);

    const empty = await run('empty', [
      'export LYNTTY_MASTER_SECRET=',
      'LYNTTY_RELAY_IMAGE=ghcr.io/example/relay@sha256:' + 'e'.repeat(64),
      '',
    ].join('\n'));
    assert.notEqual(empty.exitCode, 0);
    assert.deepEqual((await readdir(empty.dir)).filter(name => name.startsWith('.env-precanonical-')), []);

    for (const [name, rawValue] of [['double-quoted-empty', '""'], ['single-quoted-empty', "''"], ['whitespace-empty', '   '], ['comment-empty', ' # comment']]) {
      const content = [
        `export LYNTTY_MASTER_SECRET=${rawValue}`,
        'LYNTTY_RELAY_IMAGE=ghcr.io/example/relay@sha256:' + 'f'.repeat(64),
        '',
      ].join('\n');
      const semanticEmpty = await run(name, content);
      assert.notEqual(semanticEmpty.exitCode, 0, name);
      assert.equal(await readFile(join(semanticEmpty.dir, '.env'), 'utf8'), content, name);
      assert.doesNotMatch(`${semanticEmpty.stdout}\n${semanticEmpty.stderr}`, /comment|LYNTTY_MASTER_SECRET=.*["']/);
      const backupName = (await readdir(semanticEmpty.dir)).find(entry => entry.startsWith('.env-precanonical-LYNTTY_MASTER_SECRET-'));
      assert.ok(backupName);
      assert.equal(await readFile(join(semanticEmpty.dir, backupName), 'utf8'), content);
    }

    const restoreContent = [
      'export LYNTTY_MASTER_SECRET=restore-without-leak',
      'LYNTTY_RELAY_IMAGE=ghcr.io/example/relay@sha256:' + '1'.repeat(64),
      '',
    ].join('\n');
    const restored = await run('restore-on-parser-failure', restoreContent, true);
    assert.notEqual(restored.exitCode, 0);
    assert.equal(await readFile(join(restored.dir, '.env'), 'utf8'), restoreContent);
    assert.equal((await stat(join(restored.dir, '.env'))).mode & 0o777, 0o600);
    assert.doesNotMatch(`${restored.stdout}\n${restored.stderr}`, /restore-without-leak/);

    const guard = relayDeploy.match(/          \[\[ ! -L \.env-canonicalization\.log[^\n]+/)?.[0].trim();
    assert.ok(guard);
    const danglingDir = join(root, 'dangling-log');
    await mkdir(danglingDir);
    const danglingTarget = join(danglingDir, 'created-through-link');
    await symlink(danglingTarget, join(danglingDir, '.env-canonicalization.log'));
    const dangling = Bun.spawnSync({ cmd: ['bash', '-c', `cd "$ROOT"\n${guard}`], env: { ...process.env, ROOT: danglingDir } });
    assert.notEqual(dangling.exitCode, 0);
    assert.equal(await Bun.file(danglingTarget).exists(), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Relay legacy image layout migration binds the running bytes to one prior digest', async () => {
  const deindent = (value) => value.split('\n').map(line => line.startsWith('          ') ? line.slice(10) : line).join('\n');
  const recordBlock = relayDeploy.match(/(          deployed_sequence=0[\s\S]*?)\n          compose\(\) \{/)?.[1];
  const sequenceGate = relayDeploy.match(/          (\(\( BOM_SEQUENCE > deployed_sequence \)\) \|\| \{[^\n]+\})/)?.[1];
  const functionBlock = relayDeploy.match(
    /(          compose\(\) \{[\s\S]*?\n          \})\n          preflight_phase=master-secret-canonicalization/,
  )?.[1].split('\n').map(line => line.startsWith('          ') ? line.slice(10) : line).join('\n');
  assert.ok(recordBlock);
  assert.ok(sequenceGate);
  assert.ok(functionBlock);
  const block = `${functionBlock}\nmigrate_legacy_relay_image_layout`;
  const root = await mkdtemp(join(tmpdir(), 'lyntty-relay-image-layout-'));
  const imageId = `sha256:${'1'.repeat(64)}`;
  const priorDigest = 'ghcr.io/jczhang02/lyntty-relay@sha256:2eb926b37741e9b047b6e6f178ffdb0e84ed41c6649180421b3f4861838ff715';
  const legacyTag = 'ghcr.io/jczhang02/lyntty-relay:sha-9752c689c927';
  const successorDigest = 'ghcr.io/jczhang02/lyntty-relay@sha256:fe3bf95fd7e19cd34c3f94ff2aedeced9497535db797f07ba37241083dd8e83d';
  const successorTag = 'ghcr.io/jczhang02/lyntty-relay:sha-e243429200bd';
  const signedTargetDigest = 'ghcr.io/jczhang02/lyntty-relay@sha256:a2fb96b60c48767b242f920a8a6e4f9637d0d50607a5787bc67a503cc39c64ed';
  const recordedPredecessorDigest = `ghcr.io/jczhang02/lyntty-relay@sha256:${'7'.repeat(64)}`;
  const legacyImageScalar = 'ghcr.io/jczhang02/lyntty-relay:${LYNTTY_RELAY_IMAGE_TAG}';
  const composeContent = [
    'services:',
    '  lyntty-relay:',
    `    image: ${legacyImageScalar}`,
    '    restart: unless-stopped',
    '    env_file:',
    '      - /opt/lyntty/.env',
    '    volumes:',
    '      - /opt/lyntty/data:/data',
    '',
  ].join('\n');
  const canonicalCompose = (content) => content
    .replace(/^    image: .+$/m, '    image: ${LYNTTY_RELAY_IMAGE}')
    .replace('      - /opt/lyntty/data:/data', '      - /opt/lyntty/data:/data\n      - /opt/lyntty/backups:/backups');
  try {
    const execute = (dir, overrides = {}) => {
      const result = Bun.spawnSync({
        cmd: ['bash', '-c', `set -Eeuo pipefail\ncd "$ROOT"\nBOM_TAG=compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1\nBOM_SEQUENCE="${'${MOCK_BOM_SEQUENCE:-1}'}"\nIMAGE_REFERENCE=${signedTargetDigest}\nrollback_marker=.rollback-incomplete\npreflight_phase=legacy-image-layout\n${deindent(recordBlock)}\n${sequenceGate}\n${block}`],
        env: {
          ...process.env,
          ROOT: dir,
          PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
          MOCK_IMAGE_ID: imageId,
          MOCK_REPO_DIGESTS: JSON.stringify([priorDigest]),
          MOCK_REPO_TAGS: JSON.stringify([legacyTag]),
          ...overrides,
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      return {
        exitCode: result.exitCode,
        stdout: new TextDecoder().decode(result.stdout),
        stderr: new TextDecoder().decode(result.stderr),
      };
    };
    const createFixture = async (name, options = {}) => {
      const dir = join(root, name);
      await mkdir(join(dir, 'bin'), { recursive: true });
      const envContent = options.envContent ?? 'LYNTTY_MASTER_SECRET=fixture-secret-never-log\nLYNTTY_RELAY_IMAGE_TAG=sha-9752c689c927\n';
      await writeFile(join(dir, '.env'), envContent, { mode: 0o600 });
      await writeFile(join(dir, 'docker-compose.yml'), options.composeContent ?? composeContent, { mode: 0o600 });
      if (options.deployedSequence !== undefined) {
        await writeFile(join(dir, 'deployed-sequence.txt'), options.deployedSequence, { mode: options.deployedSequenceMode ?? 0o600 });
        await chmod(join(dir, 'deployed-sequence.txt'), options.deployedSequenceMode ?? 0o600);
      }
      if (options.deployedBom !== undefined) {
        await writeFile(join(dir, 'deployed-bom.txt'), options.deployedBom, { mode: options.deployedBomMode ?? 0o600 });
        await chmod(join(dir, 'deployed-bom.txt'), options.deployedBomMode ?? 0o600);
      }
      await chmod(join(dir, '.env'), 0o600);
      await chmod(join(dir, 'docker-compose.yml'), 0o600);
      await writeFile(join(dir, 'bin', 'docker'), `#!/usr/bin/env bun
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync('.commands.log', args.join(' ') + '\\n');
const valueAfter = (flag) => args[args.indexOf(flag) + 1];
const localPath = (value) => value === '/opt/lyntty/.env' ? '.env' : value === '/opt/lyntty/docker-compose.yml' ? 'docker-compose.yml' : value;
if (args[0] === 'compose') {
  const command = args.find(value => ['config', 'ps', 'stop', 'run', 'pull', 'up'].includes(value));
  if (command === 'ps') {
    const count = Number(process.env.MOCK_CONTAINER_COUNT ?? '1');
    for (let index = 0; index < count; index += 1) console.log('container-' + index);
    process.exit(0);
  }
  if (command !== 'config') process.exit(90);
  const composePath = localPath(valueAfter('--file'));
  const envPath = localPath(valueAfter('--env-file'));
  const compose = readFileSync(composePath, 'utf8');
  const env = readFileSync(envPath, 'utf8');
  const rawImage = compose.match(/^    image: (.+)$/m)?.[1];
  const parseEnvValue = (raw) => {
    let value = raw?.trim();
    if (value?.length >= 2 && ((value[0] === "'" && value.at(-1) === "'") || (value[0] === '"' && value.at(-1) === '"'))) return value.slice(1, -1);
    value = value?.replace(/\\s+#.*$/, '').trim();
    return value?.replace(/\\$\\{([A-Z_][A-Z0-9_]*)\\}/g, (_, key) => process.env[key] ?? '');
  };
  const envImage = parseEnvValue(env.match(/^LYNTTY_RELAY_IMAGE=(.+)$/m)?.[1]);
  const legacyTagValue = parseEnvValue(env.match(/^LYNTTY_RELAY_IMAGE_TAG=(.+)$/m)?.[1]);
  const targetVariable = '$' + '{LYNTTY_RELAY_IMAGE}';
  const legacyVariable = 'ghcr.io/jczhang02/lyntty-relay:' + '$' + '{LYNTTY_RELAY_IMAGE_TAG}';
  const image = rawImage === targetVariable ? envImage : rawImage === legacyVariable ? 'ghcr.io/jczhang02/lyntty-relay:' + legacyTagValue : rawImage;
  const volumes = [];
  if (compose.includes('      - /opt/lyntty/data:/data')) volumes.push({ type: 'bind', source: '/opt/lyntty/data', target: '/data' });
  if (compose.includes('      - /opt/lyntty/backups:/backups')) volumes.push({ type: 'bind', source: '/opt/lyntty/backups', target: '/backups' });
  console.log(JSON.stringify({ services: { 'lyntty-relay': { image, volumes, environment: { LYNTTY_MASTER_SECRET: 'redacted-fixture' } } } }));
  process.exit(0);
}
if (args[0] === 'inspect') {
  const format = valueAfter('--format');
  if (format === '{{.State.Running}}') console.log(process.env.MOCK_CONTAINER_RUNNING ?? 'true');
  else if (format === '{{.Config.Image}}') console.log(process.env.MOCK_CONTAINER_REFERENCE ?? '${legacyTag}');
  else if (format === '{{.Image}}') console.log(process.env.MOCK_CONTAINER_IMAGE_ID ?? process.env.MOCK_IMAGE_ID);
  else if (format === '{{.State.Running}} {{.Image}}') {
    if (process.env.MOCK_POST_STATE_ONCE && !existsSync('.post-state-failed-once')) {
      writeFileSync('.post-state-failed-once', '');
      console.log(process.env.MOCK_POST_STATE_ONCE);
    } else console.log('true ' + process.env.MOCK_IMAGE_ID);
  }
  else process.exit(91);
  process.exit(0);
}
if (args[0] === 'image' && args[1] === 'inspect') {
  const format = valueAfter('--format');
  if (format === '{{.Id}}') console.log(process.env.MOCK_CONFIGURED_IMAGE_ID ?? process.env.MOCK_IMAGE_ID);
  else if (format === '{{json .RepoDigests}}') console.log(process.env.MOCK_REPO_DIGESTS);
  else if (format === '{{json .RepoTags}}') console.log(process.env.MOCK_REPO_TAGS);
  else process.exit(92);
  process.exit(0);
}
if (args[0] === 'pull') process.exit(0);
process.exit(93);
`);
      await writeFile(join(dir, 'bin', 'jq'), `#!/usr/bin/env bun
const args = process.argv.slice(2);
const input = JSON.parse(await Bun.stdin.text());
const query = args.at(-1);
const arg = (name) => { const index = args.findIndex((value, offset) => (value === '--arg' || value === '--argjson') && args[offset + 1] === name); if (index < 0) return undefined; return args[index] === '--argjson' ? JSON.parse(args[index + 2]) : args[index + 2]; };
let result;
const backupVolumes = input.services?.['lyntty-relay']?.volumes?.filter(value => value.target === '/backups' && value.type === 'bind' && value.source === '/opt/lyntty/backups') ?? [];
if (query.includes('keys == ["lyntty-relay"]') && query.includes('.image == $image')) result = Object.keys(input.services ?? {}).join(',') === 'lyntty-relay' && input.services['lyntty-relay'].image === arg('image') && (!query.includes('/backups') || backupVolumes.length === 1);
else if (query.includes('keys == ["lyntty-relay"]') && query.includes('.image == $expected')) result = Object.keys(input.services ?? {}).join(',') === 'lyntty-relay' && input.services['lyntty-relay'].image === arg('expected');
else if (query.includes('keys == ["lyntty-relay"]')) result = Object.keys(input.services ?? {}).join(',') === 'lyntty-relay';
else if (query.includes('.services["lyntty-relay"].image')) result = input.services?.['lyntty-relay']?.image;
else if (query.includes('$backups')) result = (input.services?.['lyntty-relay']?.volumes?.filter(value => value.type === 'bind' && value.source === '/opt/lyntty/data' && value.target === '/data').length ?? 0) === 1 && backupVolumes.length === arg('backups');
else if (query.includes('select(.target == "/backups"')) result = backupVolumes.length === 1;
else if (query.includes('length == 1')) result = Array.isArray(input) && input.length === 1;
else if (query.trim() === '.[0]') result = input[0];
else if (query.includes('index($expected)')) result = Array.isArray(input) && input.includes(arg('expected')) && input.every(value => /^ghcr\\.io\\/jczhang02\\/lyntty-relay:[0-9A-Za-z._-]+$/.test(value));
else process.exit(94);
if (result === undefined || result === null || result === false) process.exit(1);
if (typeof result !== 'boolean') console.log(result);
process.exit(0);
`);
      await writeFile(join(dir, 'bin', 'stat'), `#!/usr/bin/env bash
if [[ "$1" == -c && "$2" == %U:%a ]]; then
  printf 'root:%s\\n' "$(/usr/bin/stat -c %a "$3")"
else
  exec /usr/bin/stat "$@"
fi
`);
      await writeFile(join(dir, 'bin', 'mv'), `#!/usr/bin/env bash
set -euo pipefail
source_path="${'${@: -2:1}'}"
target_path="${'${@: -1}'}"
if [[ "${'${MOCK_FAIL_ENV_INSTALL:-false}'}" == true && "$source_path" == ./.env-image-layout-* && "$target_path" == .env && ! -e .mv-env-failed-once ]]; then
  : > .mv-env-failed-once
  exit 95
fi
if [[ "${'${MOCK_FAIL_COMPOSE_INSTALL:-false}'}" == true && "$source_path" == ./.compose-image-layout-* && "$target_path" == docker-compose.yml && ! -e .mv-failed-once ]]; then
  : > .mv-failed-once
  exit 95
fi
if [[ "${'${MOCK_SIGNAL_TAG_REPAIR_AFTER_INSTALL:-false}'}" == true && "$source_path" == ./.env-tag-repair-* && "$target_path" == .env && ! -e .mv-tag-signalled-once ]]; then
  : > .mv-tag-signalled-once
  /usr/bin/mv "$@"
  kill -TERM "$PPID"
  exit 0
fi
if [[ "${'${MOCK_FAIL_TAG_RECEIPT_INSTALL:-false}'}" == true && "$source_path" == ./.env-tag-receipt-* && "$target_path" == .env-canonicalization.log && ! -e .mv-tag-receipt-failed-once ]]; then
  : > .mv-tag-receipt-failed-once
  exit 95
fi
if [[ "${'${MOCK_FAIL_TAG_REPAIR_RESTORE:-false}'}" == true && "$source_path" == ./..env.restore-* && "$target_path" == .env && ! -e .mv-tag-restore-failed-once ]]; then
  : > .mv-tag-restore-failed-once
  exit 95
fi
exec /usr/bin/mv "$@"
`);
      for (const name of ['docker', 'jq', 'stat', 'mv']) await chmod(join(dir, 'bin', name), 0o755);
      return { dir, envContent, composeContent: options.composeContent ?? composeContent };
    };

    const fixture = await createFixture('legacy');
    const migrated = execute(fixture.dir);
    assert.equal(migrated.exitCode, 0, migrated.stderr);
    assert.doesNotMatch(`${migrated.stdout}\n${migrated.stderr}`, /fixture-secret-never-log/);
    const migratedEnv = await readFile(join(fixture.dir, '.env'), 'utf8');
    assert.equal(migratedEnv, `${fixture.envContent}LYNTTY_RELAY_IMAGE=${priorDigest}\n`);
    const migratedCompose = await readFile(join(fixture.dir, 'docker-compose.yml'), 'utf8');
    assert.equal(migratedCompose, canonicalCompose(composeContent));
    const migratedNames = await readdir(fixture.dir);
    const envBackup = migratedNames.find(name => name.startsWith('.env-precanonical-LYNTTY_RELAY_IMAGE-'));
    const composeBackup = migratedNames.find(name => name.startsWith('.compose-precanonical-LYNTTY_RELAY_IMAGE-'));
    assert.ok(envBackup);
    assert.ok(composeBackup);
    assert.equal(await readFile(join(fixture.dir, envBackup), 'utf8'), fixture.envContent);
    assert.equal(await readFile(join(fixture.dir, composeBackup), 'utf8'), composeContent);
    assert.equal((await stat(join(fixture.dir, envBackup))).mode & 0o777, 0o600);
    assert.equal((await stat(join(fixture.dir, composeBackup))).mode & 0o777, 0o600);
    const receipt = await readFile(join(fixture.dir, '.env-canonicalization.log'), 'utf8');
    assert.match(receipt, /source_form=legacy-compose-tag-variable target_form=env-digest/);
    assert.doesNotMatch(receipt, /fixture-secret-never-log/);
    const commandLog = await readFile(join(fixture.dir, '.commands.log'), 'utf8');
    assert.doesNotMatch(commandLog, /\b(stop|run|migrate|backup|up)\b/);
    const namesBeforeRetry = (await readdir(fixture.dir)).filter(name => name !== '.commands.log').sort();
    assert.equal(execute(fixture.dir).exitCode, 0);
    assert.deepEqual((await readdir(fixture.dir)).filter(name => name !== '.commands.log').sort(), namesBeforeRetry);

    const successorEnv = 'LYNTTY_MASTER_SECRET=fixture-secret-never-log\nLYNTTY_RELAY_IMAGE_TAG=sha-e243429200bd\n';
    const successor = await createFixture('documented-successor', { envContent: successorEnv });
    const successorResult = execute(successor.dir, {
      MOCK_CONTAINER_REFERENCE: successorTag,
      MOCK_REPO_DIGESTS: JSON.stringify([successorDigest]),
      MOCK_REPO_TAGS: JSON.stringify([successorTag]),
    });
    assert.equal(successorResult.exitCode, 0, successorResult.stderr);
    assert.equal(
      await readFile(join(successor.dir, '.env'), 'utf8'),
      `${successorEnv}LYNTTY_RELAY_IMAGE=${successorDigest}\n`,
    );
    assert.equal(await readFile(join(successor.dir, 'docker-compose.yml'), 'utf8'), canonicalCompose(composeContent));
    assert.doesNotMatch(`${successorResult.stdout}\n${successorResult.stderr}`, /fixture-secret-never-log/);

    const signedTarget = await createFixture('signed-target-retry', {
      envContent: `LYNTTY_MASTER_SECRET=fixture-secret-never-log\nLYNTTY_RELAY_IMAGE=${signedTargetDigest}\n`,
      composeContent: canonicalCompose(composeContent),
    });
    assert.equal(execute(signedTarget.dir).exitCode, 0);

    const recordedPredecessor = await createFixture('recorded-predecessor-upgrade', {
      envContent: `LYNTTY_MASTER_SECRET=fixture-secret-never-log\nLYNTTY_RELAY_IMAGE=${recordedPredecessorDigest}\n`,
      composeContent: canonicalCompose(composeContent),
      deployedSequence: '1\n',
      deployedBom: `compat-v1.0.0_1.0.0_1.0.0_0.1.0-s1 ${recordedPredecessorDigest}\n`,
    });
    assert.equal(execute(recordedPredecessor.dir, { MOCK_BOM_SEQUENCE: '2' }).exitCode, 0);

    for (const [name, envContent] of [
      ['single-quoted-tag', "LYNTTY_MASTER_SECRET=fixture-secret-never-log\nLYNTTY_RELAY_IMAGE_TAG='sha-9752c689c927'\n"],
      ['double-quoted-spaced-tag', 'LYNTTY_MASTER_SECRET=fixture-secret-never-log\nLYNTTY_RELAY_IMAGE_TAG=  "sha-9752c689c927"  \n'],
      ['crlf-tag', 'LYNTTY_MASTER_SECRET=fixture-secret-never-log\r\nLYNTTY_RELAY_IMAGE_TAG=sha-9752c689c927\r\n'],
    ]) {
      const ornamented = await createFixture(name, { envContent });
      const result = execute(ornamented.dir);
      assert.equal(result.exitCode, 0, `${name}: ${result.stderr}`);
      assert.equal(await readFile(join(ornamented.dir, '.env'), 'utf8'), `${envContent}LYNTTY_RELAY_IMAGE=${priorDigest}\n`, name);
      assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /fixture-secret-never-log/, name);
    }

    const driftEnv = 'LYNTTY_MASTER_SECRET=fixture-secret-never-log\nLYNTTY_RELAY_IMAGE_TAG=sha-aaaaaaaaaaaa\n';
    const drift = await createFixture('stale-tag-drift', { envContent: driftEnv });
    const repaired = execute(drift.dir);
    assert.equal(repaired.exitCode, 0, repaired.stderr);
    assert.equal(
      await readFile(join(drift.dir, '.env'), 'utf8'),
      `LYNTTY_MASTER_SECRET=fixture-secret-never-log\nLYNTTY_RELAY_IMAGE_TAG=sha-9752c689c927\nLYNTTY_RELAY_IMAGE=${priorDigest}\n`,
    );
    const repairedNames = await readdir(drift.dir);
    const driftBackup = repairedNames.find(name => name.startsWith('.env-precanonical-LYNTTY_RELAY_IMAGE_TAG-'));
    assert.ok(driftBackup);
    assert.equal(await readFile(join(drift.dir, driftBackup), 'utf8'), driftEnv);
    assert.equal((await stat(join(drift.dir, driftBackup))).mode & 0o777, 0o600);
    const driftReceipt = await readFile(join(drift.dir, '.env-canonicalization.log'), 'utf8');
    assert.match(driftReceipt, /key=LYNTTY_RELAY_IMAGE_TAG source_form=alternate-sha-config-drift target_form=documented-r65-tag/);
    assert.doesNotMatch(`${repaired.stdout}\n${repaired.stderr}\n${driftReceipt}`, /fixture-secret-never-log|sha-aaaaaaaaaaaa/);
    const driftNamesBeforeRetry = (await readdir(drift.dir)).filter(name => name !== '.commands.log').sort();
    assert.equal(execute(drift.dir).exitCode, 0);
    assert.deepEqual((await readdir(drift.dir)).filter(name => name !== '.commands.log').sort(), driftNamesBeforeRetry);

    const repairRollback = await createFixture('stale-tag-repair-rollback', { envContent: driftEnv });
    const repairRollbackResult = execute(repairRollback.dir, { MOCK_POST_STATE_ONCE: `false ${imageId}` });
    assert.notEqual(repairRollbackResult.exitCode, 0);
    assert.equal(await readFile(join(repairRollback.dir, '.env'), 'utf8'), driftEnv);
    assert.equal(await readFile(join(repairRollback.dir, 'docker-compose.yml'), 'utf8'), composeContent);
    assert.equal(await Bun.file(join(repairRollback.dir, '.rollback-incomplete')).exists(), false);
    assert.doesNotMatch(`${repairRollbackResult.stdout}\n${repairRollbackResult.stderr}`, /fixture-secret-never-log|sha-aaaaaaaaaaaa/);

    for (const [name, overrides] of [
      ['stale-tag-receipt-install-failure', { MOCK_FAIL_TAG_RECEIPT_INSTALL: 'true' }],
      ['stale-tag-repair-signal', { MOCK_SIGNAL_TAG_REPAIR_AFTER_INSTALL: 'true' }],
    ]) {
      const interruptedRepair = await createFixture(name, { envContent: driftEnv });
      const interruptedResult = execute(interruptedRepair.dir, overrides);
      assert.notEqual(interruptedResult.exitCode, 0, name);
      assert.equal(await readFile(join(interruptedRepair.dir, '.env'), 'utf8'), driftEnv, `${name}: ${interruptedResult.stderr}`);
      assert.equal(await Bun.file(join(interruptedRepair.dir, '.env-canonicalization.log')).exists(), false, name);
      assert.equal(await Bun.file(join(interruptedRepair.dir, '.rollback-incomplete')).exists(), false, name);
      assert.match(interruptedResult.stderr, /original configuration restored/, name);
      assert.doesNotMatch(`${interruptedResult.stdout}\n${interruptedResult.stderr}`, /fixture-secret-never-log|sha-aaaaaaaaaaaa/, name);
    }

    const failedRestore = await createFixture('stale-tag-repair-restore-failure', { envContent: driftEnv });
    const failedRestoreResult = execute(failedRestore.dir, {
      MOCK_POST_STATE_ONCE: `false ${imageId}`,
      MOCK_FAIL_TAG_REPAIR_RESTORE: 'true',
    });
    assert.notEqual(failedRestoreResult.exitCode, 0);
    const repairMarker = join(failedRestore.dir, '.rollback-incomplete');
    assert.equal(await Bun.file(repairMarker).text(), 'compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1 legacy-image-tag-repair-restore-failed\n');
    assert.equal((await stat(repairMarker)).mode & 0o777, 0o600);
    assert.match(failedRestoreResult.stderr, /retry is blocked/);
    assert.doesNotMatch(`${failedRestoreResult.stdout}\n${failedRestoreResult.stderr}`, /fixture-secret-never-log|sha-aaaaaaaaaaaa/);
    const retryGuard = '[[ ! -e "$rollback_marker" && ! -L "$rollback_marker" ]] || { echo \'incomplete pre-migration rollback marker exists; repair the prior runtime explicitly\' >&2; exit 1; }';
    assert.ok(relayDeploy.includes(retryGuard));
    const blockedRetry = Bun.spawnSync({
      cmd: ['bash', '-c', `cd "$ROOT"\nrollback_marker=.rollback-incomplete\n${retryGuard}`],
      env: { ...process.env, ROOT: failedRestore.dir },
    });
    assert.notEqual(blockedRetry.exitCode, 0);

    const interruptedEnv = `LYNTTY_MASTER_SECRET=fixture-secret-never-log\nLYNTTY_RELAY_IMAGE_TAG=sha-9752c689c927\nLYNTTY_RELAY_IMAGE=${priorDigest}\n`;
    const interrupted = await createFixture('env-first-retry', { envContent: interruptedEnv });
    assert.equal(execute(interrupted.dir).exitCode, 0);
    assert.equal(await readFile(join(interrupted.dir, '.env'), 'utf8'), interruptedEnv);
    assert.equal(await readFile(join(interrupted.dir, 'docker-compose.yml'), 'utf8'), canonicalCompose(composeContent));

    const hardcodedCompose = composeContent.replace(legacyImageScalar, legacyTag);
    const hardcoded = await createFixture('hardcoded-tag', { composeContent: hardcodedCompose });
    assert.equal(execute(hardcoded.dir).exitCode, 0);
    assert.equal(await readFile(join(hardcoded.dir, 'docker-compose.yml'), 'utf8'), canonicalCompose(hardcodedCompose));

    for (const [name, fixtureOptions, overrides] of [
      ['record-missing-pair', { deployedSequence: '1\n' }, { MOCK_BOM_SEQUENCE: '2' }],
      ['record-nul-sequence', { deployedSequence: '1\0\n', deployedBom: `compat-v1.0.0_1.0.0_1.0.0_0.1.0-s1 ${recordedPredecessorDigest}\n` }, { MOCK_BOM_SEQUENCE: '2' }],
      ['record-nul-bom', { deployedSequence: '1\n', deployedBom: `compat-v1.0.0_1.0.0_1.0.0_0.1.0-s1 ${recordedPredecessorDigest}\0\n` }, { MOCK_BOM_SEQUENCE: '2' }],
      ['record-sequence-mismatch', { deployedSequence: '1\n', deployedBom: `compat-v1.0.0_1.0.0_1.0.0_0.1.0-s2 ${recordedPredecessorDigest}\n` }, { MOCK_BOM_SEQUENCE: '2' }],
      ['record-public-mode', { deployedSequence: '1\n', deployedSequenceMode: 0o644, deployedBom: `compat-v1.0.0_1.0.0_1.0.0_0.1.0-s1 ${recordedPredecessorDigest}\n` }, { MOCK_BOM_SEQUENCE: '2' }],
      ['duplicate-image', { composeContent: composeContent.replace('    restart: unless-stopped', `    image: ${legacyTag}`) }, {}],
      ['bom-compose', { composeContent: `\uFEFF${composeContent}` }, {}],
      ['anchor-compose', { composeContent: composeContent.replace('services:', 'services: &services') }, {}],
      ['quoted-include', { composeContent: `"include" : extra.yml\n${composeContent}` }, {}],
      ['escaped-include', { composeContent: `"\\u0069nclude": extra.yml\n${composeContent}` }, {}],
      ['tagged-include', { composeContent: `!unsafe include: extra.yml\n${composeContent}` }, {}],
      ['explicit-include', { composeContent: `? include\n: extra.yml\n${composeContent}` }, {}],
      ['spaced-extends', { composeContent: composeContent.replace('    restart: unless-stopped', '    extends : legacy-base') }, {}],
      ['interpolated-legacy-tag', { envContent: 'LYNTTY_MASTER_SECRET=fixture-secret-never-log\nLYNTTY_RELAY_IMAGE_TAG=${UNTRUSTED_TAG}\n' }, { UNTRUSTED_TAG: 'sha-9752c689c927' }],
      ['commented-legacy-tag', { envContent: 'LYNTTY_MASTER_SECRET=fixture-secret-never-log\nLYNTTY_RELAY_IMAGE_TAG=sha-9752c689c927 # unrecorded syntax\n' }, {}],
      ['wrong-legacy-tag', { envContent: 'LYNTTY_MASTER_SECRET=fixture-secret-never-log\nLYNTTY_RELAY_IMAGE_TAG=sha-aaaaaaaaaaaa\n' }, { MOCK_CONTAINER_REFERENCE: 'ghcr.io/jczhang02/lyntty-relay:sha-aaaaaaaaaaaa' }],
      ['repository-qualified-legacy-tag', { envContent: 'LYNTTY_MASTER_SECRET=fixture-secret-never-log\nLYNTTY_RELAY_IMAGE_TAG=ghcr.io/jczhang02/lyntty-relay:sha-9752c689c927\n' }, {}],
      ['successor-mismatched-digest', { envContent: successorEnv }, { MOCK_CONTAINER_REFERENCE: successorTag, MOCK_REPO_DIGESTS: JSON.stringify([priorDigest]), MOCK_REPO_TAGS: JSON.stringify([successorTag]) }],
      ['unknown-canonical-digest', { envContent: `LYNTTY_MASTER_SECRET=fixture-secret-never-log\nLYNTTY_RELAY_IMAGE=ghcr.io/jczhang02/lyntty-relay@sha256:${'8'.repeat(64)}\n`, composeContent: canonicalCompose(composeContent) }, {}],
      ['mismatched-target', { envContent: `LYNTTY_MASTER_SECRET=fixture-secret-never-log\nLYNTTY_RELAY_IMAGE_TAG=sha-9752c689c927\nLYNTTY_RELAY_IMAGE=ghcr.io/jczhang02/lyntty-relay@sha256:${'9'.repeat(64)}\n` }, {}],
      ['multiple-digests', {}, { MOCK_REPO_DIGESTS: JSON.stringify([priorDigest, `ghcr.io/jczhang02/lyntty-relay@sha256:${'3'.repeat(64)}`]) }],
      ['foreign-digest', {}, { MOCK_REPO_DIGESTS: JSON.stringify([`ghcr.io/other/relay@sha256:${'2'.repeat(64)}`]) }],
      ['mismatched-image-id', {}, { MOCK_CONTAINER_IMAGE_ID: `sha256:${'4'.repeat(64)}` }],
      ['multiple-containers', {}, { MOCK_CONTAINER_COUNT: '2' }],
      ['stopped-container', {}, { MOCK_CONTAINER_RUNNING: 'false' }],
    ]) {
      const rejected = await createFixture(name, fixtureOptions);
      const beforeEnv = await readFile(join(rejected.dir, '.env'), 'utf8');
      const beforeCompose = await readFile(join(rejected.dir, 'docker-compose.yml'), 'utf8');
      const result = execute(rejected.dir, overrides);
      assert.notEqual(result.exitCode, 0, name);
      assert.equal(await readFile(join(rejected.dir, '.env'), 'utf8'), beforeEnv, name);
      assert.equal(await readFile(join(rejected.dir, 'docker-compose.yml'), 'utf8'), beforeCompose, name);
      assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /fixture-secret-never-log/, name);
      const expectedRecordError = {
        'record-missing-pair': /recorded deployed BOM must be one root-private regular file/,
        'record-nul-sequence': /forbidden BOM, CR, tab, or NUL byte/,
        'record-nul-bom': /forbidden BOM, CR, tab, or NUL byte/,
        'record-sequence-mismatch': /recorded deployed BOM identity is invalid/,
        'record-public-mode': /recorded deployed sequence must be one root-private regular file/,
      }[name];
      if (expectedRecordError) assert.match(result.stderr, expectedRecordError, name);
      const expectedTagCategory = {
        'interpolated-legacy-tag': 'interpolation',
        'commented-legacy-tag': 'expected-value-inline-comment',
        'wrong-legacy-tag': 'alternate-sha-tag',
        'repository-qualified-legacy-tag': 'repository-qualified-tag',
      }[name];
      if (expectedTagCategory) {
        assert.match(result.stderr, new RegExp(`syntax category=${expectedTagCategory}`), name);
        if (name === 'wrong-legacy-tag') {
          assert.match(result.stderr, /drift repair requires the running documented R65 container reference/, name);
        } else {
          assert.match(result.stderr, /not a supported syntax for the documented R65 value/, name);
        }
      }
      const commands = await readFile(join(rejected.dir, '.commands.log'), 'utf8').catch(() => '');
      assert.doesNotMatch(commands, /\b(stop|run|migrate|backup|up)\b/, name);
    }

    for (const [name, overrides] of [
      ['restore-after-env-rename-failure', { MOCK_FAIL_ENV_INSTALL: 'true' }],
      ['restore-after-first-install', { MOCK_FAIL_COMPOSE_INSTALL: 'true' }],
      ['restore-after-both-installs', { MOCK_POST_STATE_ONCE: `false ${imageId}` }],
    ]) {
      const rejected = await createFixture(name);
      const result = execute(rejected.dir, overrides);
      assert.notEqual(result.exitCode, 0, name);
      assert.equal(await readFile(join(rejected.dir, '.env'), 'utf8'), rejected.envContent, name);
      assert.equal(await readFile(join(rejected.dir, 'docker-compose.yml'), 'utf8'), composeContent, name);
      assert.equal(await Bun.file(join(rejected.dir, '.rollback-incomplete')).exists(), false, name);
      assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /fixture-secret-never-log/, name);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);

test('Relay pre-schema rollback supplies the legacy master-secret alias without exposing it', async () => {
  const deindent = (value) => value.split('\n').map(line => line.startsWith('          ') ? line.slice(10) : line).join('\n');
  const composeBlock = relayDeploy.match(/(          compose\(\) \{[\s\S]*?\n          \})\n          restore_env_backup/)?.[1];
  const verifyBlock = relayDeploy.match(/(          verify_previous_runtime\(\) \{[\s\S]*?\n          \})\n          if \(\( BOM_SEQUENCE/)?.[1];
  const rollbackBlock = relayDeploy.match(/(          legacy_rollback_override="\$\(mktemp[\s\S]*?\n          trap 'exit 130' HUP INT TERM)\n          compose stop/)?.[1];
  assert.ok(composeBlock);
  assert.ok(verifyBlock);
  assert.ok(rollbackBlock);
  const root = await mkdtemp(join(tmpdir(), 'lyntty-relay-rollback-alias-'));
  const priorDigest = `ghcr.io/jczhang02/lyntty-relay@sha256:${'2'.repeat(64)}`;
  const imageId = `sha256:${'1'.repeat(64)}`;
  const successorPriorDigest = 'ghcr.io/jczhang02/lyntty-relay@sha256:fe3bf95fd7e19cd34c3f94ff2aedeced9497535db797f07ba37241083dd8e83d';
  const successorTag = 'ghcr.io/jczhang02/lyntty-relay:sha-e243429200bd';
  const script = `${deindent(composeBlock)}\n${deindent(verifyBlock)}\nverify_previous_runtime\n${deindent(rollbackBlock)}\nfalse`;
  try {
    const run = async (name, upFails = false, options = {}) => {
      const selectedPriorDigest = options.priorDigest ?? priorDigest;
      const containerReference = options.containerReference ?? selectedPriorDigest;
      const dir = join(root, name);
      await mkdir(join(dir, 'bin'), { recursive: true });
      await writeFile(join(dir, '.env'), `LYNTTY_MASTER_SECRET=rollback-fixture-secret\nLYNTTY_RELAY_IMAGE=${selectedPriorDigest}\n`, { mode: 0o600 });
      await writeFile(join(dir, 'docker-compose.yml'), [
        'services:',
        '  lyntty-relay:',
        '    image: ${LYNTTY_RELAY_IMAGE}',
        '    env_file:',
        '      - /opt/lyntty/.env',
        '    volumes:',
        '      - /opt/lyntty/data:/data',
        '      - /opt/lyntty/backups:/backups',
        '',
      ].join('\n'), { mode: 0o600 });
      await writeFile(join(dir, 'bin', 'docker'), `#!/usr/bin/env bun
import { appendFileSync, readFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync('.commands.log', args.join(' ') + '\\n');
const after = (flag) => args[args.indexOf(flag) + 1];
if (args[0] === 'compose') {
  const command = args.find(value => ['config', 'ps', 'stop', 'pull', 'up'].includes(value));
  if (command === 'config' && args.includes('--images')) { console.log(process.env.PRIOR_DIGEST); process.exit(0); }
  if (command === 'config') {
    const files = args.flatMap((value, index) => value === '--file' ? [args[index + 1]] : []);
    const hasOverride = files.length === 2;
    if (hasOverride && !readFileSync(files[1], 'utf8').includes('HANDY_MASTER_SECRET: $' + '{LYNTTY_MASTER_SECRET}')) process.exit(81);
    const environment = { LYNTTY_MASTER_SECRET: 'rollback-fixture-secret' };
    if (hasOverride) environment.HANDY_MASTER_SECRET = environment.LYNTTY_MASTER_SECRET;
    console.log(JSON.stringify({ services: { 'lyntty-relay': { image: process.env.PRIOR_DIGEST, environment } } }));
    process.exit(0);
  }
  if (command === 'ps') { console.log('container-0'); process.exit(0); }
  if (command === 'up' && process.env.MOCK_UP_FAIL === 'true') process.exit(82);
  if (['stop', 'pull', 'up'].includes(command)) process.exit(0);
}
if (args[0] === 'inspect') {
  const format = after('--format');
  if (format === '{{.State.Running}}') console.log('true');
  else if (format === '{{.Config.Image}}') console.log(process.env.CONTAINER_REFERENCE);
  else if (format === '{{.Image}}') console.log(process.env.IMAGE_ID);
  else process.exit(83);
  process.exit(0);
}
if (args[0] === 'image' && args[1] === 'inspect' && after('--format') === '{{.Id}}') { console.log(process.env.IMAGE_ID); process.exit(0); }
process.exit(84);
`);
      await writeFile(join(dir, 'bin', 'jq'), `#!/usr/bin/env bun
const input = JSON.parse(await Bun.stdin.text());
const environment = input.services?.['lyntty-relay']?.environment;
process.exit(typeof environment?.LYNTTY_MASTER_SECRET === 'string' && environment.LYNTTY_MASTER_SECRET.length > 0 && environment.HANDY_MASTER_SECRET === environment.LYNTTY_MASTER_SECRET ? 0 : 1);
`);
      await writeFile(join(dir, 'bin', 'curl'), '#!/usr/bin/env bash\nexit 0\n');
      await writeFile(join(dir, 'bin', 'chown'), '#!/usr/bin/env bash\nexit 0\n');
      for (const file of ['docker', 'jq', 'curl', 'chown']) await chmod(join(dir, 'bin', file), 0o755);
      const result = Bun.spawnSync({
        cmd: ['bash', '-c', `set -Eeuo pipefail\ncd "$ROOT"\nBOM_TAG=compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1\nrollback_marker=.rollback-incomplete\nprevious_reference="$PRIOR_DIGEST"\n${script}`],
        env: {
          ...process.env,
          ROOT: dir,
          PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
          PRIOR_DIGEST: selectedPriorDigest,
          CONTAINER_REFERENCE: containerReference,
          IMAGE_ID: imageId,
          MOCK_UP_FAIL: String(upFails),
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      return {
        dir,
        exitCode: result.exitCode,
        stdout: new TextDecoder().decode(result.stdout),
        stderr: new TextDecoder().decode(result.stderr),
      };
    };

    const restored = await run('success');
    assert.notEqual(restored.exitCode, 0);
    assert.equal(await Bun.file(join(restored.dir, '.rollback-incomplete')).exists(), false);
    assert.deepEqual((await readdir(restored.dir)).filter(name => name.startsWith('.rollback-master-compat.')), [], `${restored.stderr}\n${await readFile(join(restored.dir, '.commands.log'), 'utf8')}`);
    const commands = await readFile(join(restored.dir, '.commands.log'), 'utf8');
    assert.match(commands, /--file \.\/\.rollback-master-compat\.[^ ]+\.yml/);
    assert.match(commands, /\bup -d lyntty-relay\b/);
    assert.doesNotMatch(`${restored.stdout}\n${restored.stderr}\n${commands}`, /rollback-fixture-secret/);

    const successor = await run('successor', false, { priorDigest: successorPriorDigest, containerReference: successorTag });
    assert.notEqual(successor.exitCode, 0);
    assert.equal(await Bun.file(join(successor.dir, '.rollback-incomplete')).exists(), false);
    assert.match(await readFile(join(successor.dir, '.commands.log'), 'utf8'), /\bup -d lyntty-relay\b/);

    const mismatchedSuccessor = await run('successor-mismatched-prior', false, { containerReference: successorTag });
    assert.notEqual(mismatchedSuccessor.exitCode, 0);
    assert.doesNotMatch(await readFile(join(mismatchedSuccessor.dir, '.commands.log'), 'utf8'), /\bup -d lyntty-relay\b/);

    const blocked = await run('failure', true);
    assert.notEqual(blocked.exitCode, 0);
    assert.equal(await Bun.file(join(blocked.dir, '.rollback-incomplete')).exists(), true);
    assert.equal((await stat(join(blocked.dir, '.rollback-incomplete'))).mode & 0o777, 0o600);
    const override = (await readdir(blocked.dir)).find(name => name.startsWith('.rollback-master-compat.'));
    assert.ok(override);
    assert.match(await readFile(join(blocked.dir, override), 'utf8'), /HANDY_MASTER_SECRET: \$\{LYNTTY_MASTER_SECRET\}/);
    assert.doesNotMatch(`${blocked.stdout}\n${blocked.stderr}`, /rollback-fixture-secret/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 10_000);

test('relay image verification never publishes from an ordinary main push', () => {
  assert.match(relayImage, /workflow_dispatch/);
  assert.match(relayImage, /pull_request/);
  assert.match(relayImage, /push: false/);
  assert.match(relayImage, /verify-\$\{\{ github\.sha \}\}/);
  assert.match(relayImage, /type=oci,dest=/);
  assert.match(relayImage, /--platform linux\/amd64/);
  assert.match(relayImage, /--platform linux\/arm64/);
  assert.match(relayImage, /relay-linux-amd64\.spdx\.json/);
  assert.match(relayImage, /relay-linux-arm64\.spdx\.json/);
  assert.doesNotMatch(relayImage, /syft scan "oci-archive:/);
  assert.doesNotMatch(relayImage, /packages: write/);
  assert.doesNotMatch(relayImage, /docker\/login-action/);
  assert.doesNotMatch(relayImage, /refs\/heads\/main/);
});

test('Android component workflow verifies a candidate but cannot publish', () => {
  assert.match(androidRelease, /environment: production-android/);
  assert.match(androidRelease, /GITHUB_REF[^\n]*refs\/heads\/main/);
  assert.match(androidRelease, /GITHUB_REF_PROTECTED/);
  assert.match(androidRelease, /version_code > 5/);
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
  assert.match(androidPreviewPromote, /\[\[ "\$GITHUB_ACTOR" == jczhang02 \]\]/);
  assert.equal((androidPreviewPromote.match(/cmp -s "\$RELEASE_NOTES"/g) ?? []).length, 3);
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
  assert.match(androidPreviewPromote, /M\s+docs\/evidence\/r86-preview-apk-candidate\.md/);
  assert.match(androidPreviewPromote, /M\s+scripts\/preview-apk-allowlist\.json/);
  for (const path of [
    '.github/workflows/android-preview-promote.yml',
    'docs/evidence/artifacts/r86-preview-apk-candidate/android-preview-apk-audit.txt',
    'docs/evidence/artifacts/r86-preview-apk-candidate/android-preview-apk.sha256',
    'docs/evidence/artifacts/r86-preview-apk-candidate/android-preview-provenance.json',
    'docs/evidence/artifacts/r86-preview-apk-candidate/candidate-manifest.json',
    'docs/evidence/r86-preview-apk-candidate.md',
    'docs/evidence/r86-preview-apk-candidate.zh.md',
    'docs/release/android-apk.md',
    'docs/release/android-apk.zh.md',
    'scripts/preview-apk-allowlist.json',
    'scripts/workflow-hardening.test.mjs',
  ]) {
    assert.equal(androidPreviewPromote.split(`M\t${path}`).length - 1, 2, `${path} must be in both exact-delta checks`);
  }
  assert.doesNotMatch(androidPreviewPromote, /M\s+docs\/evidence\/artifacts\/r86-preview-apk-candidate\/android-preview-runtime-audit\.txt/);
  assert.match(androidPreviewPromote, /sourceTree/);
  assert.match(androidPreviewPromote, /jq -r \.immutable <<< "\$published"/);
  assert.match(androidPreviewPromote, /bypass_actors/);
  assert.match(androidPreviewPromote, /\["deletion", "update"\]/);
  assert.match(androidPreviewPromote, /release_list_json="\$\(gh release list/g);
  assert.match(androidPreviewPromote, /jq -j '\.body \/\/ ""'/);
  assert.doesNotMatch(androidPreviewPromote, /jq -r '\.body \/\/ ""'/);
  assert.match(androidPreviewPromote, /\(HTTP 404\)/);
  assert.match(androidPreviewPromote, /\.name/);
  assert.match(androidPreviewPromote, /already_published/);
  assert.doesNotMatch(androidPreviewPromote, /--json[^\n]*\btitle\b/);
  assert.match(androidPreviewPromote, /tag_error="\$RUNNER_TEMP\/tag-lookup\.err"/);
  assert.match(androidPreviewPromote, /elif grep -Fq '\(HTTP 404\)' "\$tag_error"/);
  assert.doesNotMatch(androidPreviewPromote, /gh api --method POST[^\n]*git\/refs/);
  assert.match(androidPreviewPromote, /This one Release-ID update retargets, publishes, and creates the missing tag/);
  assert.equal(androidPreviewPromote.split('recovery_draft_id=357064582').length - 1, 1);
  assert.equal(androidPreviewPromote.split('recovery_target_sha=47351659bd8e6862abde1521854a8965919c4691').length - 1, 2);
  assert.doesNotMatch(androidPreviewPromote, /gh release (?:create|upload|download|delete|view)/);
  assert.match(androidPreviewPromote, /pre-publish-assets/);
  assert.match(androidPreviewPromote, /final-draft-assets false/);
  assert.match(androidPreviewPromote, /post-publish-assets/);
  for (const assetId of ['484098553', '484098498', '484098319', '484098422', '484098446']) {
    assert.equal(androidPreviewPromote.split(`expected_id=${assetId}`).length - 1, 2);
  }
  assert.match(androidPreviewPromote, /gh api -H 'Accept: application\/octet-stream'/);
  assert.match(androidPreviewPromote, /\{tag_name: \$tag_name, target_commitish: \$target_commitish, name: \$name,[\s\S]{0,120}draft: false, prerelease: true, make_latest: "false"\}/);
  assert.match(androidPreviewPromote, /gh api --method PATCH "\$release_api" --input "\$publication_payload"/);
  const finalNotesIndex = androidPreviewPromote.indexOf('final-draft-notes.md');
  const finalAssetsIndex = androidPreviewPromote.indexOf('verify_release_assets final-draft-assets false');
  const finalMainIndex = androidPreviewPromote.indexOf('git fetch --no-tags origin main', finalAssetsIndex);
  const finalTagIndex = androidPreviewPromote.indexOf('tag_error="$RUNNER_TEMP/tag-lookup.err"', finalMainIndex);
  const publicationIndex = androidPreviewPromote.indexOf('gh api --method PATCH "$release_api" --input "$publication_payload"');
  assert.ok(finalNotesIndex < finalAssetsIndex && finalAssetsIndex < finalMainIndex && finalMainIndex < finalTagIndex && finalTagIndex < publicationIndex);
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

test('Preview draft recovery delegates tag creation to exact Release publication', async () => {
  const recoveryBlock = androidPreviewPromote.match(
    /(          tag_api="repos\/\$GITHUB_REPOSITORY\/git\/ref\/tags\/\$RELEASE_TAG"[\s\S]*?\n          fi)\n\n          \[\[ "\$\(jq -r \.id <<< "\$published"\)/,
  )?.[1].split('\n').map(line => line.startsWith('          ') ? line.slice(10) : line).join('\n');
  assert.ok(recoveryBlock);
  const root = await mkdtemp(join(tmpdir(), 'lyntty-preview-draft-recovery-'));
  try {
    const recover = async (name, tagMode, alreadyPublished = false) => {
      const runnerTemp = join(root, name);
      await mkdir(runnerTemp);
      const child = Bun.spawn({
        cmd: ['bash', '-c', `set -euo pipefail
gh() {
  printf '%s\\n' "$*" >> "$RUNNER_TEMP/gh-calls"
  if [[ "$1 $2 \${3:-}" == 'api --method PATCH' ]]; then : > "$RUNNER_TEMP/release-published"; return 0; fi
  if [[ "$1" == api ]]; then
    case "$TAG_MODE" in
      exact|wrong) printf '{}\\n'; return 0 ;;
      missing) printf '%s\\n' 'gh: Not Found (HTTP 404)' >&2; return 1 ;;
      error) printf '%s\\n' 'gh: internal server error (HTTP 500)' >&2; return 1 ;;
      *) return 1 ;;
    esac
  fi
  return 1
}
jq() {
  if [[ "$1" == -n ]]; then printf '{}\\n'; return 0; fi
  if [[ "$*" == *'.object.type'* ]]; then printf 'commit\\n'; return 0; fi
  if [[ "$*" == *'.object.sha'* ]]; then
    if [[ "$TAG_MODE" == wrong ]]; then printf 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\\n'; else printf '%s\\n' "$GITHUB_SHA"; fi
    return 0
  fi
  if [[ "$*" == *'.draft'* ]]; then
    if [[ "$ALREADY_PUBLISHED" == true ]]; then printf 'false\\n'; else printf 'true\\n'; fi
    return 0
  fi
  return 1
}
${recoveryBlock}`],
        env: {
          ...process.env,
          RUNNER_TEMP: runnerTemp,
          TAG_MODE: tagMode,
          ALREADY_PUBLISHED: String(alreadyPublished),
          RELEASE_TAG: 'android-preview-v1.2.0-920001',
          RELEASE_TITLE: 'V1.2.0 Local First 📡',
          RELEASE_NOTES: join(runnerTemp, 'release-notes.md'),
          GITHUB_REPOSITORY: 'jczhang02/lyntty',
          GITHUB_SHA: '47351659bd8e6862abde1521854a8965919c4691',
          RELEASE_ID: '357064582',
          release_api: 'repos/jczhang02/lyntty/releases/357064582',
          release_json: '{}',
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const [stderr, exitCode] = await Promise.all([
        new Response(child.stderr).text(),
        child.exited,
      ]);
      const calls = await readFile(join(runnerTemp, 'gh-calls'), 'utf8');
      return { exitCode, stderr, calls, published: await Bun.file(join(runnerTemp, 'release-published')).exists() };
    };

    const missingTag = await recover('missing-tag', 'missing');
    assert.equal(missingTag.exitCode, 0, missingTag.stderr);
    assert.equal(missingTag.published, true);
    assert.match(missingTag.calls, /api --method PATCH repos\/jczhang02\/lyntty\/releases\/357064582 --input \/.*release-publication\.json/);
    assert.doesNotMatch(missingTag.calls, /api --method POST/);

    const exactTag = await recover('exact-tag', 'exact');
    assert.notEqual(exactTag.exitCode, 0);
    assert.equal(exactTag.published, false);

    const wrongTag = await recover('wrong-tag', 'wrong');
    assert.notEqual(wrongTag.exitCode, 0);
    assert.equal(wrongTag.published, false);

    const publishedWrongTag = await recover('published-wrong-tag', 'wrong', true);
    assert.notEqual(publishedWrongTag.exitCode, 0);
    assert.equal(publishedWrongTag.published, false);
    assert.doesNotMatch(publishedWrongTag.calls, /api --method PATCH/);

    const publishedRetry = await recover('published-retry', 'exact', true);
    assert.equal(publishedRetry.exitCode, 0, publishedRetry.stderr);
    assert.equal(publishedRetry.published, false);
    assert.doesNotMatch(publishedRetry.calls, /api --method PATCH/);

    const lookupFailure = await recover('lookup-failure', 'error');
    assert.notEqual(lookupFailure.exitCode, 0);
    assert.equal(lookupFailure.published, false);
    assert.doesNotMatch(lookupFailure.calls, /api --method PATCH/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Preview Draft target accepts only the reviewed prior or current protected main', () => {
  const targetChecks = [...androidPreviewPromote.matchAll(
    /(release_target="\$\(jq -r \.target_commitish <<< "\$release_json"\)"\n\s*\[\[ "\$release_target" == "\$recovery_target_sha" \|\| "\$release_target" == "\$GITHUB_SHA" \]\])/g,
  )].map(match => match[1]);
  assert.equal(targetChecks.length, 3);
  assert.match(androidPreviewPromote, /git merge-base --is-ancestor "\$recovery_target_sha" "\$GITHUB_SHA"/);

  const authorize = (block, target) => Bun.spawnSync({
    cmd: ['bash', '-c', `set -euo pipefail
jq() { printf '%s\\n' "$DRAFT_TARGET"; }
${block}`],
    env: {
      ...process.env,
      DRAFT_TARGET: target,
      release_json: '{}',
      recovery_target_sha: '47351659bd8e6862abde1521854a8965919c4691',
      GITHUB_SHA: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  }).exitCode;

  for (const block of targetChecks) {
    assert.equal(authorize(block, '47351659bd8e6862abde1521854a8965919c4691'), 0);
    assert.equal(authorize(block, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), 0);
    assert.notEqual(authorize(block, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'), 0);
  }
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
    assert.equal(hasher.digest('hex'), '9cdc3d6fade06530de3440cfe3e6df1f4f35ae9ae7a86dda2b312b899094f08a');
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
  assert.match(releaseCandidate, /GITHUB_REF_PROTECTED/);
  assert.match(releaseCandidate, /\(\( SEQUENCE > 0 \)\)/);
  assert.match(releaseCandidate, /\[\[ "\$SEQUENCE" == 1 \]\]/);
  assert.match(releaseCandidate, /\[\[ "\$ANDROID_VERSION_CODE" == 6 \]\]/);
  assert.match(releaseCandidate, /compat-v1\.2\.0_1\.2\.0_1\.2\.0_0\.2\.0-s1/);
  assert.match(releaseCandidate, /gradle-production-guard-test\.sh "\$RUNNER_TEMP\/candidate\/evidence\/android-production-guard\.txt"/);
  assert.match(releaseCandidate, /LYNTTY_EXPO_PROJECT_ID[^\n]*\^\[0-9a-fA-F\]/);
  assert.match(releaseCandidate, /release-stable-candidate/);
  assert.match(releaseCandidate, /release-preview-candidate/);
  assert.match(releaseCandidate, /build-artifact\.ts --all/);
  assert.doesNotMatch(releaseCandidate, /LYNTTY_SIGNED_(?:DARWIN|WINDOWS)/);
  assert.doesNotMatch(releaseCandidate, /native-signing\.yml/);
  assert.match(releaseCandidate, /platformCodeSigning:[\s\S]*policy: 'not-required-self-use'[\s\S]*evidence: \[\]/);
  assert.match(releaseCandidate, /--platform linux\/amd64/);
  assert.match(releaseCandidate, /--platform linux\/arm64/);
  assert.match(relayOciSbom, /externalDocumentRefs/);
  assert.match(relayOciSbom, /VARIANT_OF/);
  assert.match(releaseCandidate, /relay-linux-amd64\.spdx\.json/);
  assert.match(releaseCandidate, /relay-linux-arm64\.spdx\.json/);
  assert.match(releaseCandidate, /supplementary:[\s\S]*relay-oci-platforms\.json/);
  assert.doesNotMatch(releaseCandidate, /syft scan "oci-archive:/);
  assert.match(cliArtifactBuilder, /git', 'status', '--porcelain=v1', '--untracked-files=all'/);
  assert.match(cliArtifactBuilder, /Refusing to attribute an artifact to a dirty source tree/);
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
  assert.match(releaseCandidate, /CANDIDATE="\$RUNNER_TEMP\/candidate"\n\s+export CANDIDATE\n\s+bun - <<'BUN'/);
  assert.doesNotMatch(releaseCandidate, /CANDIDATE="\$RUNNER_TEMP\/candidate" bun - <<'BUN'/);
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
  assert.match(releasePromote, /physical_phone_accepted/);
  assert.match(releasePromote, /stable_unverified_release_waiver/);
  assert.match(releasePromote, /accepted_android_apk_sha256/);
  assert.match(releasePromote, /immutable_releases_enabled/);
  assert.match(releasePromote, /LYNTTY_STABLE_TAG_RULESET_ID/);
  assert.match(releasePromote, /GITHUB_REF_PROTECTED/);
  const setupBunIndex = releasePromote.indexOf('- name: Setup Bun');
  assert.ok(setupBunIndex > 0);
  assert.doesNotMatch(releasePromote.slice(0, setupBunIndex), /^\s*(?:[A-Z_]+="[^"]*"\s+)*bun(?:\s|$)/m);
  assert.match(releasePromote.slice(0, setupBunIndex), /\.workflowName == "Compatibility release candidate"/);
  assert.match(releasePromote, /release-stable/);
  assert.match(releasePromote, /release-preview/);
  assert.match(releasePromote, /actions\/download-artifact@/);
  assert.match(releasePromote, /gh attestation verify/);
  assert.match(releasePromote, /skopeo copy --all/);
  assert.match(releasePromote, /remote_digest/);
  assert.match(releasePromote, /cosign verify/);
  assert.match(releasePromote, /scripts\/github-release\.ts publish/);
  assert.match(releasePromote, /--expected-current-latest/);
  assert.match(releasePromote, /release-publication-audit\.json/);
  assert.doesNotMatch(releasePromote, /gh release create/);
  assert.doesNotMatch(releasePromote, /gh release edit/);
  assert.doesNotMatch(releasePromote, /gh release upload/);
  assert.match(releasePromote, /latest_tag.*!=.*compat-preview/);
  assert.match(releasePromote, /candidate source is no longer current protected main/);
  assert.doesNotMatch(releasePromote, /native-signing\.yml/);
  assert.match(releasePromote, /intentionally not platform code-signed/);
  assert.match(releasePromote, /candidate predecessor chain is stale/);
  assert.match(releasePromote, /candidate Android versionCode does not advance/);
  assert.match(releasePromote, /release_rows=.*gh api[\s\S]*--paginate/);
  assert.match(releasePromote, /info\.relaySchema!==bom\.components\.relay\.schema\.current/);
  assert.match(releasePromote, /existing candidate image tag has a different digest/);
  assert.match(releasePromote, /read -r repository digest[\s\S]*?console\.log\(`/);
  assert.doesNotMatch(releasePromote, /read -r repository digest[\s\S]*?process\.stdout\.write/);
  assert.match(releasePromote, /android-validation\.json/);
  assert.match(releasePromote, /Physical Android validation: not performed; explicit owner self-use waiver/);
  const auditIndex = releasePromote.indexOf('stable-release-validation.ts audit');
  const checksumsIndex = releasePromote.indexOf('sha256sum * | sort -k2 > release-checksums.txt');
  const warningIndex = releasePromote.indexOf('stable-release-validation.ts warning');
  const headerIndex = releasePromote.indexOf('echo "# Lyntty Compatibility release');
  assert.ok(auditIndex > 0 && auditIndex < checksumsIndex);
  assert.ok(warningIndex > 0 && warningIndex < headerIndex);
  assert.match(releasePromote, /bun install --frozen-lockfile/);
  assert.doesNotMatch(releasePromote, /gradlew|build-artifact\.ts|docker buildx|build-push-action/);
});

test('Stable physical acceptance and owner waiver are explicit and mutually exclusive', () => {
  const authorizationBlock = releasePromote.match(
    /stable_waiver_phrase='I accept publishing this exact Stable Candidate without physical Android validation'[\s\S]*?\n\s+esac/,
  )?.[0];
  assert.ok(authorizationBlock);

  const authorize = (physicalPhoneAccepted, waiver, acceptedSha256) => {
    const result = Bun.spawnSync({
      cmd: ['bash', '-c', `set -euo pipefail\n${authorizationBlock}`],
      env: {
        ...process.env,
        PHYSICAL_PHONE_ACCEPTED: physicalPhoneAccepted,
        STABLE_UNVERIFIED_RELEASE_WAIVER: waiver,
        ACCEPTED_ANDROID_APK_SHA256: acceptedSha256,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    return result.exitCode;
  };

  const digest = 'a'.repeat(64);
  const phrase = 'I accept publishing this exact Stable Candidate without physical Android validation';
  assert.equal(authorize('true', '', digest), 0);
  assert.equal(authorize('false', phrase, ''), 0);
  assert.notEqual(authorize('false', '', ''), 0);
  assert.notEqual(authorize('false', phrase, digest), 0);
  assert.notEqual(authorize('true', phrase, digest), 0);
  assert.notEqual(authorize('true', '', ''), 0);
  assert.notEqual(authorize('unknown', '', ''), 0);
});

test('Stable validation audit and public warning stay truthful and deterministic', () => {
  const digest = 'b'.repeat(64);
  const waiver = createStableAndroidValidation({
    physicalPhoneAccepted: 'false',
    acceptedApkSha256: '',
    actualApkSha256: digest,
    ownerWaiverAcknowledgement: STABLE_ANDROID_WAIVER_PHRASE,
  });
  assert.deepEqual(waiver, {
    schemaVersion: 1,
    mode: false,
    authorizationMode: 'owner-waiver-unverified',
    physicalPhoneAccepted: false,
    apkSha256: digest,
    ownerWaiverAcknowledgement: STABLE_ANDROID_WAIVER_PHRASE,
  });
  const warning = renderStableAndroidValidationWarning(waiver);
  assert.match(warning, /^> \[!WARNING\]\n/);
  assert.match(warning, /was not physically validated/);
  assert.match(warning, /未完成实体机验收/);
  assert.doesNotMatch(warning, /Physical Android validation: accepted|实体机验收已通过/);
  assert.match(warning, /\n\n$/);

  const physical = createStableAndroidValidation({
    physicalPhoneAccepted: 'true',
    acceptedApkSha256: digest,
    actualApkSha256: digest,
    ownerWaiverAcknowledgement: '',
  });
  assert.equal(physical.mode, true);
  assert.equal(physical.authorizationMode, 'physical-phone');
  assert.equal(physical.physicalPhoneAccepted, true);
  assert.equal(physical.ownerWaiverAcknowledgement, null);
  assert.equal(renderStableAndroidValidationWarning(physical), '');

  assert.throws(() => createStableAndroidValidation({
    physicalPhoneAccepted: 'false', acceptedApkSha256: digest, actualApkSha256: digest,
    ownerWaiverAcknowledgement: STABLE_ANDROID_WAIVER_PHRASE,
  }), /empty physically accepted/);
  assert.throws(() => renderStableAndroidValidationWarning({ ...waiver, mode: true }), /inconsistent/);
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
  assert.ok((releaseRollback.match(/git rev-parse origin\/main/g) ?? []).length >= 2);
  assert.match(releaseRollback, /scripts\/release\.ts verify-history/);
  assert.equal((releaseRollback.match(/secrets\.LYNTTY_BOM_PRIVATE_KEY_SEED_BASE64/g) ?? []).length, 1);
  assert.match(releaseRollback, /GITHUB_REF_PROTECTED/);
  assert.match(releaseRollback, /scripts\/github-release\.ts publish/);
  assert.match(releaseRollback, /--expected-current-latest/);
  assert.match(releaseRollback, /release-publication-audit\.json/);
  assert.doesNotMatch(releaseRollback, /gh release create/);
  assert.doesNotMatch(releaseRollback, /gh release edit/);
  assert.doesNotMatch(releaseRollback, /gh release upload/);
  assert.match(releaseRollback, /bun install --frozen-lockfile/);
  assert.doesNotMatch(releaseRollback, /gradlew|build-artifact\.ts|docker buildx|build-push-action/);
});

test('exact Release publication is centralized behind one Release-ID transaction', () => {
  assert.match(githubRelease, /Release ID/);
  assert.match(githubRelease, /GITHUB_REF_PROTECTED/);
  assert.match(githubRelease, /expectedCurrentLatest/);
  assert.match(githubRelease, /Release asset ID changed/);
  assert.match(githubRelease, /make_latest/);
  assert.match(githubRelease, /immutable=true|immutable !== true/);
  assert.match(githubRelease, /git fetch/);
  assert.match(githubRelease, /git', 'push'|git", "push"|git push/);
  assert.match(githubRelease, /git\/ref\/heads\/main/);
  assert.doesNotMatch(githubRelease, /method:\s*['"]DELETE['"]/);
  assert.doesNotMatch(githubRelease, /git\/refs/);
});

test('native signing producer uses current native runners and immutable exact staging', () => {
  assert.match(nativeSigningProducer, /workflow_dispatch/);
  assert.match(nativeSigningProducer, /environment: release-native-signing/);
  assert.match(nativeSigningProducer, /macos-26-intel/);
  assert.match(nativeSigningProducer, /macos-26/);
  assert.match(nativeSigningProducer, /windows-/);
  assert.match(nativeSigningProducer, /--finalize-existing/);
  assert.match(nativeSigningProducer, /codesign/);
  assert.match(nativeSigningProducer, /notarytool/);
  assert.match(nativeSigningProducer, /signtool/i);
  assert.match(nativeSigningProducer, /scripts\/github-release\.ts publish/);
  assert.match(nativeSigningProducer, /native-signing-/);
  assert.match(nativeSigningProducer, /LYNTTY_NATIVE_SIGNING_TAG_RULESET_ID/);
  assert.doesNotMatch(nativeSigningProducer, /gh release (?:create|edit|upload|delete)/);
});

test('native signature verification pins platform identities and attests exact archives', () => {
  assert.match(nativeSigning, /environment: release-native-signing/);
  assert.match(nativeSigning, /GITHUB_REF_PROTECTED/);
  assert.match(nativeSigning, /macos-26-intel/);
  assert.match(nativeSigning, /macos-26/);
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

test('dependency audit pins patched transitive releases', () => {
  const patchedVersions = {
    '@hono/node-server': '2.0.11',
    'fast-uri': '3.1.4',
    'fast-xml-parser': '5.10.1',
    'hono': '4.12.27',
    'shell-quote': '1.9.0',
  };
  for (const [name, version] of Object.entries(patchedVersions)) {
    assert.equal(rootPackage.overrides[name], version);
    assert.match(bunLockText, new RegExp(`"${name.replace('/', '\\/')}": \\["${name.replace('/', '\\/')}@${version.replaceAll('.', '\\.')}"`));
  }
  assert.doesNotMatch(bunLockText, /shell-quote@1\.8\.4/);
});

test('required PR hygiene verifies lifecycle trust and release contracts', () => {
  assert.match(typecheckWorkflow, /bun pm untrusted/);
  assert.match(typecheckWorkflow, /Found 0 untrusted dependencies with scripts/);
  assert.match(typecheckWorkflow, /bun test scripts\/release\.test\.ts scripts\/github-release\.test\.ts scripts\/relay-oci-sbom\.test\.ts packages\/lyntty-cli\/scripts\/build-artifact\.test\.ts/);
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
    '/config/native-signing/', '/config/release-trust-roots/', '/scripts/github-release.ts', '/scripts/relay-oci-sbom.ts',
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
