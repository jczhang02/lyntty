import assert from 'node:assert/strict';
import { lstat, readFile, readlink, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'bun:test';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const agentGuidePath = new URL('../AGENTS.md', import.meta.url);
const claudeGuidePath = new URL('../CLAUDE.md', import.meta.url);
const releaseFlowDirectoryPath = new URL('../.agents/skills/release-flow', import.meta.url);
const releaseNotesDirectoryPath = new URL('../.agents/skills/release-notes', import.meta.url);
const releaseFlowPath = new URL('./release-flow/SKILL.md', releaseFlowDirectoryPath);
const releaseNotesPath = new URL('./release-notes/SKILL.md', releaseNotesDirectoryPath);
const claudeReleaseFlowPath = new URL('../.claude/skills/release-flow', import.meta.url);
const claudeReleaseNotesPath = new URL('../.claude/skills/release-notes', import.meta.url);

function runGit(args) {
  const result = Bun.spawnSync({
    cmd: ['git', ...args],
    cwd: repositoryRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return result;
}

function isIgnored(path) {
  const result = runGit(['check-ignore', '--no-index', '--quiet', '--', path]);
  assert.ok(
    result.exitCode === 0 || result.exitCode === 1,
    `git check-ignore failed for ${path}: ${result.stderr.toString()}`,
  );
  return result.exitCode === 0;
}

function trackedFiles(path) {
  const result = runGit(['ls-files', '-z', '--', path]);
  assert.equal(result.exitCode, 0, result.stderr.toString());
  return result.stdout.toString().split('\0').filter(Boolean);
}

async function assertSymlink(path, expectedTarget, expectedRealPath) {
  const metadata = await lstat(path);
  assert.equal(metadata.isSymbolicLink(), true, `${fileURLToPath(path)} must remain a symlink`);
  assert.equal(await readlink(path), expectedTarget);
  assert.equal(await realpath(path), fileURLToPath(expectedRealPath));
}

test('release guidance has one canonical cross-agent source', async () => {
  await assertSymlink(claudeGuidePath, 'AGENTS.md', agentGuidePath);
  await assertSymlink(claudeReleaseFlowPath, '../../.agents/skills/release-flow', releaseFlowDirectoryPath);
  await assertSymlink(claudeReleaseNotesPath, '../../.agents/skills/release-notes', releaseNotesDirectoryPath);

  const agentGuide = await readFile(agentGuidePath, 'utf8');
  assert.match(agentGuide, /\.agents\/skills\/release-flow\/SKILL\.md/);
  assert.match(agentGuide, /\.agents\/skills\/release-notes\/SKILL\.md/);
  assert.match(agentGuide, /CLAUDE\.md/);
  assert.match(agentGuide, /does not grant permission/i);
  assert.match(agentGuide, /Pure Actions Artifact work[\s\S]*is excluded/);
});

test('gitignore exposes only the shared release guidance', () => {
  for (const path of [
    'CLAUDE.md',
    '.agents/skills/release-flow/SKILL.md',
    '.agents/skills/release-notes/SKILL.md',
    '.claude/skills/release-flow',
    '.claude/skills/release-notes',
  ]) {
    assert.equal(isIgnored(path), false, `${path} must be trackable`);
  }

  for (const path of [
    '.agents/local.md',
    '.agents/skills/other/SKILL.md',
    '.agents/skills/release-flow/private.md',
    '.claude/settings.local.json',
    '.claude/skills/other',
    '.pi/skills/release-flow/SKILL.md',
  ]) {
    assert.equal(isIgnored(path), true, `${path} must stay local`);
  }

  assert.deepEqual(trackedFiles('.pi'), [], '.pi mirrors must never be tracked');
});

test('release-flow separates channels, authority, and immutable state', async () => {
  const skill = await readFile(releaseFlowPath, 'utf8');
  assert.match(skill, /^---\nname: release-flow\ndescription:/);
  assert.doesNotMatch(skill, /disable-model-invocation:\s*true/);

  for (const term of [
    'Stable Compatibility',
    'Compatibility Preview',
    'APK-only Preview',
    'Expo Dev',
    'Rollback',
    'Actions Artifact',
    'Release deletion',
    'release-notes',
    'gh release edit',
    'gh release delete',
  ]) {
    assert.match(skill, new RegExp(term, 'i'));
  }

  assert.match(skill, /explicit current-task authorization/i);
  assert.match(skill, /If classification finds pure Actions Artifact work, stop applying this skill/);
  assert.match(skill, /Expo Dev has no repository publication workflow/);
  assert.match(skill, /Never run `gh release create`/);
  assert.doesNotMatch(skill, /^\s*gh release create\b/m);
  const deletionBlock = skill.match(/```bash\n(gh release delete[\s\S]*?)\n```/);
  assert.ok(deletionBlock, 'release-flow must contain one bounded Release deletion command');
  assert.equal(deletionBlock[1], 'gh release delete "$tag" --repo jczhang02/lyntty --yes');
  assert.doesNotMatch(deletionBlock[1], /--cleanup-tag/);
  assert.match(skill, /Expo Dev.*creation, edit, deletion or cleanup, or audit/is);
  assert.match(skill, /explicitly authorizes deletion of each exact existing tag/i);
  assert.match(skill, /deletes the Release object and every attached asset/i);
  assert.match(skill, /--cleanup-tag.*separate explicit authorization|separate explicit authorization.*--cleanup-tag/is);
  assert.match(skill, /Snapshot each target Release's numeric\/node ID.*every asset's ID, name, size, and digest/is);
  assert.match(skill, /HTTP 404 for the deleted Release by tag and former numeric ID/i);
  assert.match(skill, /HTTP 404 for every former Release asset ID/i);
  assert.match(skill, /direct tag object.*remain structurally equal/i);
  assert.match(skill, /all preserved Releases.*asset tuples.*GitHub Latest identity.*remain equal/is);
  assert.match(skill, /preserve that workflow-mandated disclosure verbatim as a leading prefix/i);
  assert.match(skill, /tag.*assets.*target.*draft.*prerelease.*immutable.*latest/is);
  assert.match(skill, /Metro.*8081.*cannot run standalone/is);
  assert.match(skill, /Rollback.*must not use.*CodeName/is);
});

test('release-notes is explicit-only and fail-closed', async () => {
  const skill = await readFile(releaseNotesPath, 'utf8');
  assert.match(skill, /^---\nname: release-notes\ndescription:/);
  assert.match(skill, /disable-model-invocation:\s*true/);
  assert.match(skill, /\/skill:release-notes <version> <CodeName> <emoji> <channel-or-tag>/);
  assert.match(skill, /must not infer.*version.*CodeName.*emoji.*channel/is);
  assert.match(skill, /V<version> <CodeName> <emoji>/);
  const publishBlock = skill.match(/```bash\n(gh release edit[\s\S]*?)\n```/);
  assert.ok(publishBlock, 'release-notes must contain one bounded edit command');
  assert.equal(publishBlock[1], [
    'gh release edit "$tag" --repo jczhang02/lyntty \\',
    '  --title "$title" \\',
    '  --notes-file "$draft_file"',
  ].join('\n'), 'only repo, title, and notes-file options are allowed');
  assert.match(skill, /Release deletion belongs to `release-flow`/);
  assert.match(skill, /Never run `gh release create` or `gh release delete`/);
  assert.doesNotMatch(skill, /^\s*gh release create\b/m);
  assert.doesNotMatch(skill, /^\s*gh release delete\b/m);

  assert.match(skill, /<div align="center">/);
  assert.match(skill, /<h1[^>]*>Lyntty<\/h1>/);
  assert.match(skill, /### Changelog/);
  assert.match(skill, /### 更新日志/);
  assert.match(skill, /### Thanks/);
  assert.doesNotMatch(skill, /—/);
  assert.match(skill, /same number.*same order/is);
  assert.match(skill, /Preserve every workflow-mandated disclosure verbatim at the beginning of the body/);
  assert.match(skill, /Expo Dev.*first.*Metro.*8081.*cannot run standalone/is);
  assert.match(skill, /Rollback.*release-flow/is);
  assert.match(skill, /asset.*id.*name.*size.*digest/is);
  assert.match(skill, /release ID.*tag.*target.*draft.*prerelease.*immutable.*latest/is);
});
