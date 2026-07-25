import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'bun:test';

const repositoryRoot = new URL('../', import.meta.url);
const CODEQL_ACTION_SHA = 'e4fba868fa4b1b91e1fdab776edc8cfbe6e9fb81';
const CHECKOUT_ACTION_SHA = '34e114876b0b11c390a56381ad16ebd13914f8d5';

async function read(path) {
  return readFile(new URL(path, repositoryRoot), 'utf8');
}

async function readYaml(path) {
  return Bun.YAML.parse(await read(path));
}

test('Dependabot keeps root Bun, docs Bun, and Actions updates bounded', async () => {
  const config = await readYaml('.github/dependabot.yml');
  assert.equal(config.version, 2);
  assert.equal(config.updates.length, 3);

  const expected = new Map([
    ['bun:/', 'root-bun-minor-patch'],
    ['bun:/docs/.site', 'docs-bun-minor-patch'],
    ['github-actions:/', 'actions-minor-patch'],
  ]);
  const schedules = new Set();

  for (const update of config.updates) {
    const key = `${update['package-ecosystem']}:${update.directory}`;
    const groupName = expected.get(key);
    assert.ok(groupName, `unexpected Dependabot target: ${key}`);
    expected.delete(key);

    assert.equal(update.schedule.interval, 'weekly');
    assert.equal(update.schedule.timezone, 'UTC');
    assert.match(update.schedule.time, /^\d{2}:\d{2}$/);
    schedules.add(`${update.schedule.day}:${update.schedule.time}`);
    assert.equal(Number.isInteger(update['open-pull-requests-limit']), true);
    assert.equal(update['open-pull-requests-limit'] > 0, true);
    assert.equal(update['open-pull-requests-limit'] <= 3, true);
    assert.deepEqual(update['commit-message'], { prefix: 'chore', include: 'scope' });
    assert.deepEqual(Object.keys(update.groups), [groupName]);
    assert.deepEqual(update.groups[groupName], {
      patterns: ['*'],
      'update-types': ['minor', 'patch'],
    });
    assert.equal(update['target-branch'], undefined);
  }

  assert.equal(expected.size, 0);
  assert.equal(schedules.size, 3, 'maintenance windows should be staggered');
  assert.equal(config.registries, undefined);
});

test('CodeQL is a pinned non-required JavaScript and TypeScript baseline', async () => {
  const workflow = await readYaml('.github/workflows/codeql.yml');
  assert.equal(workflow.name, 'CodeQL baseline');
  assert.deepEqual(workflow.on.pull_request, { branches: ['main'] });
  assert.deepEqual(workflow.on.push, { branches: ['main'] });
  assert.equal(workflow.on.workflow_dispatch, null);
  assert.deepEqual(workflow.on.schedule, [{ cron: '17 4 * * 2' }]);
  assert.deepEqual(workflow.permissions, { contents: 'read' });

  const job = workflow.jobs.analyze;
  assert.equal(job.name, 'javascript-typescript (non-required baseline)');
  assert.equal(job['runs-on'], 'ubuntu-latest');
  assert.equal(job.if, undefined);
  assert.equal(job['continue-on-error'], undefined);
  assert.deepEqual(job.permissions, {
    'security-events': 'write',
    packages: 'read',
    contents: 'read',
  });

  const checkout = job.steps.find((step) => step.name === 'Checkout');
  const init = job.steps.find((step) => step.name === 'Initialize CodeQL');
  const analyze = job.steps.find((step) => step.name === 'Analyze JavaScript and TypeScript');
  assert.equal(checkout.uses, `actions/checkout@${CHECKOUT_ACTION_SHA}`);
  assert.equal(init.uses, `github/codeql-action/init@${CODEQL_ACTION_SHA}`);
  assert.deepEqual(init.with, {
    languages: 'javascript-typescript',
    'build-mode': 'none',
  });
  assert.equal(analyze.uses, `github/codeql-action/analyze@${CODEQL_ACTION_SHA}`);
  assert.equal(job.steps.some((step) => /autobuild/.test(step.uses ?? '')), false);

  for (const step of [checkout, init, analyze]) {
    assert.equal(step.if, undefined);
    assert.equal(step['continue-on-error'], undefined);
    assert.match(step.uses, /@[0-9a-f]{40}$/);
  }
});

test('independent docs dependencies are audited and pinned to compatible fixes', async () => {
  const [docsPackage, docsLock, rootPatch, docsPatch, typecheck, docsWorkflow] = await Promise.all([
    read('docs/.site/package.json').then(JSON.parse),
    read('docs/.site/bun.lock'),
    read('patches/minimatch@3.1.5.patch'),
    read('docs/.site/patches/minimatch@3.1.5.patch'),
    readYaml('.github/workflows/typecheck.yml'),
    readYaml('.github/workflows/docs.yml'),
  ]);
  assert.equal(docsPackage.devDependencies.next, '16.2.11');
  assert.deepEqual(docsPackage.overrides, {
    ajv: '8.18.0',
    'brace-expansion': '5.0.8',
    minimatch: '3.1.5',
    postcss: '8.5.19',
    sharp: '0.35.3',
  });
  assert.equal(docsPackage.patchedDependencies['minimatch@3.1.5'], 'patches/minimatch@3.1.5.patch');
  assert.equal(docsPackage.scripts['docs:audit'], 'bun audit');
  assert.equal(docsPatch, rootPatch);

  const expectedVersions = {
    ajv: ['8.18.0'],
    'brace-expansion': ['5.0.8'],
    minimatch: ['3.1.5'],
    next: ['16.2.11'],
    postcss: ['8.5.19'],
    sharp: ['0.35.3'],
  };
  const docsLockPackages = Object.values(Bun.JSONC.parse(docsLock).packages);
  for (const [name, expected] of Object.entries(expectedVersions)) {
    const versions = docsLockPackages
      .map((entry) => entry[0])
      .filter((identifier) => identifier.startsWith(`${name}@`))
      .map((identifier) => identifier.slice(name.length + 1));
    assert.deepEqual([...new Set(versions)].sort(), expected);
  }

  const docsGate = typecheck.jobs['repo-hygiene'].steps.find((step) => step.name === 'Check and build complete docs site');
  assert.match(docsGate.run, /bun run docs:audit/);
  const docsTrust = typecheck.jobs['repo-hygiene'].steps.find((step) => step.name === 'Verify docs lifecycle-script trust');
  const deployTrust = docsWorkflow.jobs.build.steps.find((step) => step.name === 'Verify docs lifecycle-script trust');
  for (const step of [docsTrust, deployTrust]) {
    assert.match(step.run, /bun pm untrusted/);
    assert.match(step.run, /Found 0 untrusted dependencies with scripts/);
  }
  const deployAudit = docsWorkflow.jobs.build.steps.find((step) => step.name === 'Audit docs dependencies');
  assert.equal(deployAudit.run, 'bun run docs:audit');
});

test('maintenance policy routes owner review without promising approval or auto-merge', async () => {
  const [codeowners, english, chinese, packageJson] = await Promise.all([
    read('.github/CODEOWNERS'),
    read('docs/quality/ci.md'),
    read('docs/quality/ci.zh.md'),
    read('package.json').then(JSON.parse),
  ]);

  assert.match(codeowners, /^\/\.github\/dependabot\.yml @jczhang02$/m);
  assert.match(codeowners, /^\/patches\/ @jczhang02$/m);
  assert.match(codeowners, /^\/docs\/\.site\/package\.json @jczhang02$/m);
  assert.match(codeowners, /^\/docs\/\.site\/bun\.lock @jczhang02$/m);
  assert.match(codeowners, /^\/docs\/\.site\/patches\/ @jczhang02$/m);
  assert.match(codeowners, /^\/scripts\/maintenance-baseline\.test\.mjs @jczhang02$/m);
  assert.match(packageJson.scripts['test:repo-hardening'], /maintenance-baseline\.test\.mjs/);
  assert.match(english, /\| `repo-hygiene` \|[^\n]*docs audit/);
  assert.doesNotMatch(english, /\| `repo-hygiene` \|[^\n]*root\/docs audits/);
  assert.match(english, /separate `wire` job runs the root dependency audit/);
  assert.match(chinese, /bun run --cwd docs\/\.site docs:audit/);
  assert.match(chinese, /root dependency audit.*required `wire` job/is);

  for (const document of [english, chinese]) {
    assert.match(document, /Dependabot/);
    assert.match(document, /root Bun|根.*Bun/is);
    assert.match(document, /docs.*Bun/is);
    assert.match(document, /GitHub Actions/);
    assert.match(document, /CodeQL/);
    assert.match(document, /JavaScript.*TypeScript/is);
    assert.match(document, /non-required|非 required/is);
    assert.match(document, /triage|分流/i);
    assert.match(document, /CODEOWNERS/);
    assert.match(document, /does not auto-merge|不.*自动合并/is);
    assert.doesNotMatch(document, /must pass .*owner review|必须.*owner review/is);
  }
});
