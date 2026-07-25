import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'bun:test';

import {
  classifyChangeSet,
  classifyPullRequestDiff,
  isDocsOnlyPath,
  parseNameStatusZ,
  type ChangedPath,
} from './ci-changed-paths.ts';

type WorkflowStep = {
  name?: string;
  id?: string;
  if?: string;
  with?: Record<string, string | number>;
  env?: Record<string, string>;
  run?: string;
};

type WorkflowJob = {
  name: string;
  if?: string;
  needs?: unknown;
  steps: WorkflowStep[];
  strategy?: {
    matrix: {
      os?: string[];
      include?: Array<{ target: string }>;
    };
  };
};

type WorkflowConfig = {
  on: Record<string, {
    paths?: string[];
    'paths-ignore'?: string[];
  } | null>;
  jobs: Record<string, WorkflowJob>;
};

const repositoryRoot = new URL('../', import.meta.url);

async function read(path: string): Promise<string> {
  return readFile(new URL(path, repositoryRoot), 'utf8');
}

async function readYaml(path: string): Promise<WorkflowConfig> {
  return Bun.YAML.parse(await read(path)) as WorkflowConfig;
}

describe('docs-only CI change classifier', () => {
  test('allows only explicit current guides and documentation assets', () => {
    for (const path of [
      'README.md',
      'docs/README.md',
      'docs/README.zh.md',
      'docs/getting-started.md',
      'docs/getting-started.zh.md',
      'docs/faq.md',
      'docs/faq.zh.md',
      'docs/troubleshooting.md',
      'docs/troubleshooting.zh.md',
      'docs/development.md',
      'docs/development.zh.md',
      'docs/assets/readme/session-home.png',
    ]) assert.equal(isDocsOnlyPath(path), true, path);

    for (const path of [
      'SECURITY.md',
      'CONTRIBUTING.md',
      'CONTEXT-MAP.md',
      '.github/workflows/typecheck.yml',
      'package.json',
      'bun.lock',
      'patches/minimatch@3.1.5.patch',
      'scripts/ci-changed-paths.ts',
      'packages/lyntty-app/README.md',
      'docs/.site/package.json',
      'docs/AGENTS.md',
      'docs/architecture/pi-shared-control.md',
      'docs/contexts/product/CONTEXT.md',
      'docs/deploy/relay-vps.md',
      'docs/evidence/r114-readme-refresh.md',
      'docs/prds/lyntty-product.md',
      'docs/quality/ci.md',
      'docs/release/android-apk.md',
      'docs/research/lyntty-pi-agent.md',
      'docs/assets/../release/android-apk.md',
      'docs/assets/unsafe.txt',
      'docs/assets/active.svg',
      'docs/assets/bad\nname.png',
      '/docs/README.md',
    ]) assert.equal(isDocsOnlyPath(path), false, path);
  });

  test('short-circuits only non-empty pull-request A/M guide changes', () => {
    const docsChanges: ChangedPath[] = [
      { status: 'M', paths: ['README.md'] },
      { status: 'A', paths: ['docs/faq.zh.md'] },
      { status: 'M', paths: ['docs/assets/readme/session-home.png'] },
    ];
    expect(classifyChangeSet({ eventName: 'pull_request', changes: docsChanges })).toEqual({
      runFull: false,
      reason: 'docs-only',
    });

    expect(classifyChangeSet({ eventName: 'push', changes: docsChanges })).toEqual({
      runFull: true,
      reason: 'non-pr-event',
    });
    expect(classifyChangeSet({ eventName: 'workflow_dispatch', changes: docsChanges })).toEqual({
      runFull: true,
      reason: 'non-pr-event',
    });
    expect(classifyChangeSet({ eventName: 'pull_request', changes: [] })).toEqual({
      runFull: true,
      reason: 'empty-change-set',
    });
  });

  test('fails open for code, trust, deletion, rename, and malformed records', () => {
    const unsafePaths = [
      'packages/lyntty-cli/src/index.ts',
      '.github/workflows/typecheck.yml',
      'SECURITY.md',
      'docs/release/android-apk.md',
      'docs/evidence/r114-readme-refresh.md',
      'docs/.site/package.json',
    ];
    for (const path of unsafePaths) {
      const result = classifyChangeSet({
        eventName: 'pull_request',
        changes: [{ status: 'M', paths: [path] }],
      });
      assert.equal(result.runFull, true, path);
      assert.equal(result.reason, 'full-path');
    }

    for (const change of [
      { status: 'D', paths: ['docs/faq.md'] },
      { status: 'R100', paths: ['docs/faq.md', 'docs/faq-new.md'] },
      { status: 'T', paths: ['README.md'] },
      { status: 'M', paths: [] },
      { status: 'M', paths: ['README.md', 'docs/faq.md'] },
    ] satisfies ChangedPath[]) {
      const result = classifyChangeSet({ eventName: 'pull_request', changes: [change] });
      assert.equal(result.runFull, true);
      assert.match(result.reason, /^(full-status|malformed-change)$/);
    }
  });

  test('fails open when PR identity or Git diff cannot be trusted', async () => {
    const baseSha = 'a'.repeat(40);
    const headSha = 'b'.repeat(40);
    expect(await classifyPullRequestDiff({
      eventName: 'pull_request',
      baseSha,
      headSha,
      diffNameStatus: async () => 'M\0README.md\0',
      validateDocsPaths: async () => true,
    })).toEqual({ runFull: false, reason: 'docs-only' });
    expect(await classifyPullRequestDiff({
      eventName: 'pull_request',
      baseSha: '',
      headSha,
      diffNameStatus: async () => 'M\0README.md\0',
    })).toEqual({ runFull: true, reason: 'invalid-sha' });
    expect(await classifyPullRequestDiff({
      eventName: 'pull_request',
      baseSha,
      headSha,
      diffNameStatus: async () => { throw new Error('missing commit'); },
    })).toEqual({ runFull: true, reason: 'git-diff-failed' });
    expect(await classifyPullRequestDiff({
      eventName: 'pull_request',
      baseSha,
      headSha,
      diffNameStatus: async () => 'M\0README.md',
    })).toEqual({ runFull: true, reason: 'git-diff-failed' });
    expect(await classifyPullRequestDiff({
      eventName: 'pull_request',
      baseSha,
      headSha,
      diffNameStatus: async () => 'A\0docs/assets/new.png\0',
      validateDocsPaths: async () => false,
    })).toEqual({ runFull: true, reason: 'non-regular-doc' });
  });

  test('parses NUL-delimited Git name-status records without path ambiguity', () => {
    expect(parseNameStatusZ('M\0README.md\0A\0docs/faq.md\0')).toEqual([
      { status: 'M', paths: ['README.md'] },
      { status: 'A', paths: ['docs/faq.md'] },
    ]);
    expect(parseNameStatusZ('R100\0docs/faq.md\0docs/faq-new.md\0')).toEqual([
      { status: 'R100', paths: ['docs/faq.md', 'docs/faq-new.md'] },
    ]);
    expect(() => parseNameStatusZ('M\0README.md')).toThrow(/NUL terminator/);
    expect(() => parseNameStatusZ('M\0')).toThrow(/missing path/);
    expect(() => parseNameStatusZ('R100\0old.md\0')).toThrow(/missing rename path/);
  });
});

test('all twelve required contexts materialize before step-level short-circuiting', async () => {
  const [typecheck, cliSmoke, packageJson, codeowners, english, chinese] = await Promise.all([
    readYaml('.github/workflows/typecheck.yml'),
    readYaml('.github/workflows/cli-smoke-test.yml'),
    read('package.json').then(JSON.parse),
    read('.github/CODEOWNERS'),
    read('docs/quality/ci.md'),
    read('docs/quality/ci.zh.md'),
  ]);

  for (const workflow of [typecheck, cliSmoke]) {
    for (const trigger of Object.values(workflow.on)) {
      if (!trigger) continue;
      assert.equal(trigger.paths, undefined);
      assert.equal(trigger['paths-ignore'], undefined);
    }
  }

  const typecheckContexts = [
    typecheck.jobs['repo-hygiene'].name,
    typecheck.jobs.wire.name,
    typecheck.jobs.cli.name,
    typecheck.jobs.relay.name,
    typecheck.jobs.app.name,
    ...(typecheck.jobs['dev-isolation'].strategy?.matrix.os ?? []).map(
      (os: string) => `isolated dev lifecycle (${os})`,
    ),
  ];
  const cliContexts = [
    ...(cliSmoke.jobs['artifact-posix'].strategy?.matrix.include ?? []).map(
      ({ target }: { target: string }) => `CLI artifact smoke (${target})`,
    ),
    cliSmoke.jobs['artifact-windows'].name,
  ];
  assert.deepEqual([...typecheckContexts, ...cliContexts], [
    'Repo hygiene',
    'lyntty-wire',
    'lyntty-cli',
    'lyntty-relay',
    'lyntty-app',
    'isolated dev lifecycle (ubuntu-latest)',
    'isolated dev lifecycle (macos-15)',
    'CLI artifact smoke (linux-x64)',
    'CLI artifact smoke (linux-arm64)',
    'CLI artifact smoke (darwin-x64)',
    'CLI artifact smoke (darwin-arm64)',
    'CLI artifact smoke (windows-x64)',
  ]);

  const repoHygiene = typecheck.jobs['repo-hygiene'];
  assert.equal(repoHygiene.if, undefined);
  assert.equal(repoHygiene.steps.some((step) => step.id === 'scope'), false);
  assert.equal(repoHygiene.steps.some((step) => /steps\.scope/.test(step.if ?? '')), false);

  const scopedJobs = [
    typecheck.jobs.wire,
    typecheck.jobs.cli,
    typecheck.jobs.relay,
    typecheck.jobs.app,
    typecheck.jobs['dev-isolation'],
    cliSmoke.jobs['artifact-posix'],
    cliSmoke.jobs['artifact-windows'],
  ];
  for (const job of scopedJobs) {
    assert.equal(job.if, undefined);
    assert.equal(job.needs, undefined);
    const checkout = job.steps.find((step) => step.name === 'Checkout');
    const scope = job.steps.find((step) => step.id === 'scope');
    assert.ok(checkout, 'scoped job must checkout the complete PR history');
    assert.ok(scope, 'scoped job must classify its own change set');
    assert.equal(checkout.with?.['fetch-depth'], 0);
    assert.deepEqual(scope.env, {
      LYNTTY_CI_EVENT_NAME: '${{ github.event_name }}',
      LYNTTY_CI_BASE_SHA: '${{ github.event.pull_request.base.sha }}',
      LYNTTY_CI_HEAD_SHA: '${{ github.event.pull_request.head.sha }}',
    });
    assert.equal(scope.run, 'bun scripts/ci-changed-paths.ts');
    const scopeIndex = job.steps.indexOf(scope);
    assert.equal(scopeIndex > job.steps.indexOf(checkout), true);
    for (const step of job.steps.slice(scopeIndex + 1)) {
      assert.match(step.if ?? '', /steps\.scope\.outputs\.run_full/);
    }
  }

  assert.match(packageJson.scripts['test:repo-hardening'], /ci-changed-paths\.test\.ts/);
  assert.match(codeowners, /^\/scripts\/ci-changed-paths\.ts @jczhang02$/m);
  assert.match(codeowners, /^\/scripts\/ci-changed-paths\.test\.ts @jczhang02$/m);
  for (const document of [english, chinese]) {
    assert.match(document, /docs-only/i);
    assert.match(document, /12|十二/);
    assert.match(document, /step-level|步骤级/i);
    assert.match(document, /fail-open|完整门禁/i);
  }
});
