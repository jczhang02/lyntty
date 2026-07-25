import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'bun:test';

const paths = {
  security: new URL('../SECURITY.md', import.meta.url),
  securityZh: new URL('../SECURITY.zh.md', import.meta.url),
  contributing: new URL('../CONTRIBUTING.md', import.meta.url),
  contributingZh: new URL('../CONTRIBUTING.zh.md', import.meta.url),
  privacy: new URL('../PRIVACY.md', import.meta.url),
  readme: new URL('../README.md', import.meta.url),
  pullRequestTemplate: new URL('../.github/PULL_REQUEST_TEMPLATE.md', import.meta.url),
  codeowners: new URL('../.github/CODEOWNERS', import.meta.url),
  packageJson: new URL('../package.json', import.meta.url),
  issueConfig: new URL('../.github/ISSUE_TEMPLATE/config.yml', import.meta.url),
  bugForm: new URL('../.github/ISSUE_TEMPLATE/bug.yml', import.meta.url),
  featureForm: new URL('../.github/ISSUE_TEMPLATE/feature.yml', import.meta.url),
  securityContactForm: new URL('../.github/ISSUE_TEMPLATE/security-contact.yml', import.meta.url),
  agents: new URL('../AGENTS.md', import.meta.url),
};

const PRIVATE_REPORT_URL = 'https://github.com/jczhang02/lyntty/security/advisories/new';
const SECURITY_CONTACT_URL =
  'https://github.com/jczhang02/lyntty/issues/new?template=security-contact.yml';

async function read(path) {
  return readFile(path, 'utf8');
}

async function readYaml(path) {
  return Bun.YAML.parse(await read(path));
}

function formText(form) {
  return JSON.stringify(form);
}

function assertUniqueFieldIds(form) {
  const ids = form.body.flatMap((field) => (field.id ? [field.id] : []));
  assert.equal(new Set(ids).size, ids.length, `${form.name} field ids must be unique`);
}

test('security policy provides one private, redaction-safe reporting path', async () => {
  const [security, securityZh, privacy, readme] = await Promise.all([
    read(paths.security),
    read(paths.securityZh),
    read(paths.privacy),
    read(paths.readme),
  ]);

  for (const document of [security, securityZh]) {
    assert.match(document, /current Stable|当前 Stable/i);
    assert.match(document, /Preview.*not supported|Preview.*不受支持/is);
    assert.match(document, /owner-operated|维护者个人运营/i);
    assert.match(document, /best-effort|尽力处理/i);
    assert.match(document, /no (?:response )?SLA|不承诺.*SLA/i);
    assert.match(document, /pairing URL|配对 URL/i);
    assert.match(document, /auth(?:entication)? header|认证请求头/i);
    assert.match(document, /signing key|签名密钥/i);
    assert.match(document, /private code|私有代码/i);
    assert.equal(document.includes(PRIVATE_REPORT_URL), true);
    assert.equal(document.includes(SECURITY_CONTACT_URL), true);
    assert.match(document, /if.*(?:available|unavailable)|如果.*(?:可用|不可用)/is);
    assert.doesNotMatch(document, /report.*secret.*public issue|在公开 issue.*(?:提交|报告).*秘密/is);
  }

  assert.match(security, /\[简体中文\]\(\.\/SECURITY\.zh\.md\)/);
  assert.match(securityZh, /\[English\]\(\.\/SECURITY\.md\)/);
  assert.match(privacy, /SECURITY\.md/);
  assert.match(readme, /SECURITY\.md/);
});

test('contributing guides expose the supported repository workflow', async () => {
  const [contributing, contributingZh, readme, pullRequestTemplate, agents] = await Promise.all([
    read(paths.contributing),
    read(paths.contributingZh),
    read(paths.readme),
    read(paths.pullRequestTemplate),
    read(paths.agents),
  ]);

  for (const document of [contributing, contributingZh]) {
    assert.match(document, /bun install --frozen-lockfile/);
    assert.match(document, /bun run ci:fast/);
    assert.match(document, /docs:check/);
    assert.match(document, /docs:build/);
    assert.match(document, /fork/i);
    assert.match(document, /git switch -c/);
    assert.match(document, /git push/);
    assert.match(document, /AGENTS\.md/);
    assert.match(document, /worktree/i);
    assert.match(document, /Beads?.*(?:optional|not required|maintainer)|Beads?.*(?:可选|不要求|维护者)/is);
    assert.match(document, /Conventional Commit|Conventional Commits/);
    assert.match(document, /(?:OpenPGP|GPG).*(?:not required|optional|不要求|可选)/is);
    assert.match(document, /SECURITY\.md/);
    assert.doesNotMatch(document, /Do not push|不得 push/i);
  }

  assert.match(contributing, /\[简体中文\]\(\.\/CONTRIBUTING\.zh\.md\)/);
  assert.match(contributingZh, /\[English\]\(\.\/CONTRIBUTING\.md\)/);
  assert.match(readme, /CONTRIBUTING\.md/);
  assert.match(agents, /external fork.*(?:exempt|optional)/is);
  assert.match(agents, /Beads.*worktree.*(?:OpenPGP|GPG)/is);
  assert.match(
    pullRequestTemplate,
    /https:\/\/github\.com\/jczhang02\/lyntty\/blob\/main\/SECURITY\.md/,
  );
});

test('public security and contribution contracts stay in repository hardening ownership', async () => {
  const [codeowners, packageJson] = await Promise.all([
    read(paths.codeowners),
    read(paths.packageJson).then(JSON.parse),
  ]);

  assert.match(codeowners, /^\/SECURITY\*\.md @jczhang02$/m);
  assert.match(codeowners, /^\/CONTRIBUTING\*\.md @jczhang02$/m);
  assert.match(codeowners, /^\/PRIVACY\*\.md @jczhang02$/m);
  assert.match(codeowners, /^\/\.github\/ISSUE_TEMPLATE\/ @jczhang02$/m);
  assert.match(codeowners, /^\/\.github\/PULL_REQUEST_TEMPLATE\.md @jczhang02$/m);
  assert.match(packageJson.scripts['test:repo-hardening'], /public-project-surface\.test\.mjs/);
});

test('issue forms route security reports without pretending private reporting is enabled', async () => {
  const [config, bug, feature, securityContact] = await Promise.all([
    readYaml(paths.issueConfig),
    readYaml(paths.bugForm),
    readYaml(paths.featureForm),
    readYaml(paths.securityContactForm),
  ]);

  assert.equal(config.blank_issues_enabled, false);
  assert.deepEqual(config.contact_links, [
    {
      name: 'Request a private security contact',
      url: SECURITY_CONTACT_URL,
      about: 'Open a detail-free request when GitHub private vulnerability reporting is unavailable.',
    },
  ]);

  assert.deepEqual(securityContact.labels, ['needs-triage']);
  assertUniqueFieldIds(securityContact);
  assert.equal(
    securityContact.body.every((field) => ['markdown', 'checkboxes'].includes(field.type)),
    true,
  );
  assert.doesNotMatch(formText(securityContact), /textarea|reproduction steps|affected version|logs/i);
  assert.match(formText(securityContact), /Do not include vulnerability details/i);

  for (const form of [bug, feature]) {
    assert.equal(typeof form.name, 'string');
    assert.equal(typeof form.description, 'string');
    assert.equal(form.labels.includes('needs-triage'), true);
    assert.equal(Array.isArray(form.body), true);
    assertUniqueFieldIds(form);
    assert.match(formText(form), /credentials|pairing URLs|auth headers|encryption keys|private code/i);
    assert.match(formText(form), /SECURITY\.md/);
  }

  assert.match(formText(bug), /Android App/);
  assert.match(formText(bug), /CLI \/ `lynttyd`/);
  assert.match(formText(bug), /Pi extension/);
  assert.match(formText(bug), /relay/);
  assert.match(formText(bug), /current Stable|Preview|development build/i);
  assert.match(formText(bug), /redact/i);

  assert.match(formText(feature), /Android control of local `pi` sessions/i);
  assert.match(formText(feature), /self-hosted operation/i);
  assert.match(formText(feature), /phone -> relay -> lynttyd -> Pi extension -> pi/);
  const boundaryField = feature.body.find((field) => field.id === 'boundaries');
  assert.equal(boundaryField.validations?.required ?? false, false);
  assert.match(JSON.stringify(boundaryField), /N\/A|not applicable/i);
});
