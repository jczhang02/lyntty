import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  shell?: string;
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

test('workflow executes only the classifier stored in the PR base commit', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lyntty-trusted-ci-scope-'));
  const run = (args: string[]) => {
    const child = Bun.spawnSync(args, {
      cwd: directory,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    assert.equal(
      child.exitCode,
      0,
      `${args.join(' ')} failed: ${child.stderr.toString('utf8')}`,
    );
    return child.stdout.toString('utf8').trim();
  };

  try {
    run(['git', 'init', '-q']);
    run(['git', 'config', 'user.name', 'CI Scope Test']);
    run(['git', 'config', 'user.email', 'ci-scope@example.invalid']);
    await writeFile(join(directory, 'README.md'), '# Lyntty\n', 'utf8');
    run(['git', 'add', 'README.md']);
    run(['git', 'commit', '-qm', 'base without classifier']);
    const baseWithoutClassifier = run(['git', 'rev-parse', 'HEAD']);

    await mkdir(join(directory, 'scripts'));
    await writeFile(
      join(directory, 'scripts/ci-changed-paths.ts'),
      await read('scripts/ci-changed-paths.ts'),
      'utf8',
    );
    run(['git', 'add', 'scripts/ci-changed-paths.ts']);
    run(['git', 'commit', '-qm', 'add trusted classifier']);
    const trustedBase = run(['git', 'rev-parse', 'HEAD']);
    const trustedBranch = run(['git', 'branch', '--show-current']);

    await writeFile(join(directory, 'README.md'), '# Lyntty\n\nDocs update.\n', 'utf8');
    run(['git', 'commit', '-qam', 'docs only']);
    const docsHead = run(['git', 'rev-parse', 'HEAD']);

    const workflow = await readYaml('.github/workflows/typecheck.yml');
    const scopeScript = workflow.jobs.wire.steps.find((step) => step.id === 'scope')?.run;
    assert.ok(scopeScript);
    const scriptPath = join(directory, 'run-scope.sh');
    await writeFile(scriptPath, scopeScript, 'utf8');

    const classify = async (baseSha: string, headSha: string) => {
      const outputPath = join(directory, `scope-${headSha}.output`);
      await writeFile(outputPath, '', 'utf8');
      const child = Bun.spawnSync(['bash', scriptPath], {
        cwd: directory,
        env: {
          ...process.env,
          GITHUB_OUTPUT: outputPath,
          LYNTTY_CI_EVENT_NAME: 'pull_request',
          LYNTTY_CI_BASE_SHA: baseSha,
          LYNTTY_CI_HEAD_SHA: headSha,
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      assert.equal(child.exitCode, 0, child.stderr.toString('utf8'));
      return Object.fromEntries(
        (await readFile(outputPath, 'utf8')).trim().split('\n').map((line) => line.split('=', 2)),
      );
    };

    assert.deepEqual(await classify(baseWithoutClassifier, trustedBase), {
      run_full: 'true',
      reason: 'trusted-classifier-unavailable',
    });
    assert.deepEqual(await classify(trustedBase, docsHead), {
      run_full: 'false',
      reason: 'docs-only',
    });

    run(['git', 'switch', '-qc', 'invalid-classifier', baseWithoutClassifier]);
    await mkdir(join(directory, 'scripts'));
    await writeFile(join(directory, 'scripts/ci-changed-paths.ts'), '', 'utf8');
    run(['git', 'add', 'scripts/ci-changed-paths.ts']);
    run(['git', 'commit', '-qm', 'add empty classifier']);
    const invalidBase = run(['git', 'rev-parse', 'HEAD']);
    await writeFile(join(directory, 'README.md'), '# Lyntty\n\nInvalid classifier test.\n', 'utf8');
    run(['git', 'commit', '-qam', 'docs with empty classifier']);
    const invalidHead = run(['git', 'rev-parse', 'HEAD']);
    assert.deepEqual(await classify(invalidBase, invalidHead), {
      run_full: 'true',
      reason: 'trusted-classifier-invalid',
    });

    run(['git', 'switch', '-qc', 'nul-classifier', baseWithoutClassifier]);
    await mkdir(join(directory, 'scripts'));
    await writeFile(
      join(directory, 'scripts/ci-changed-paths.ts'),
      'await Bun.write(process.env.GITHUB_OUTPUT!, Buffer.from("run_full=false\\0\\nreason=docs-only\\n"));\n',
      'utf8',
    );
    run(['git', 'add', 'scripts/ci-changed-paths.ts']);
    run(['git', 'commit', '-qm', 'add NUL-output classifier']);
    const nulBase = run(['git', 'rev-parse', 'HEAD']);
    await writeFile(join(directory, 'README.md'), '# Lyntty\n\nNUL classifier test.\n', 'utf8');
    run(['git', 'commit', '-qam', 'docs with NUL classifier']);
    const nulHead = run(['git', 'rev-parse', 'HEAD']);
    assert.deepEqual(await classify(nulBase, nulHead), {
      run_full: 'true',
      reason: 'trusted-classifier-invalid',
    });

    run(['git', 'switch', '-qc', 'bom-classifier', baseWithoutClassifier]);
    await mkdir(join(directory, 'scripts'));
    await writeFile(
      join(directory, 'scripts/ci-changed-paths.ts'),
      'const body = Buffer.from("run_full=false\\nreason=docs-only\\n"); await Bun.write(process.env.GITHUB_OUTPUT!, new Uint8Array([0xef, 0xbb, 0xbf, ...body]));\n',
      'utf8',
    );
    run(['git', 'add', 'scripts/ci-changed-paths.ts']);
    run(['git', 'commit', '-qm', 'add BOM-output classifier']);
    const bomBase = run(['git', 'rev-parse', 'HEAD']);
    await writeFile(join(directory, 'README.md'), '# Lyntty\n\nBOM classifier test.\n', 'utf8');
    run(['git', 'commit', '-qam', 'docs with BOM classifier']);
    const bomHead = run(['git', 'rev-parse', 'HEAD']);
    assert.deepEqual(await classify(bomBase, bomHead), {
      run_full: 'true',
      reason: 'trusted-classifier-invalid',
    });

    run(['git', 'switch', '-q', trustedBranch]);
    await mkdir(join(directory, 'packages/example'), { recursive: true });
    await writeFile(join(directory, 'packages/example/index.ts'), 'export {};\n', 'utf8');
    await writeFile(join(directory, 'bunfig.toml'), 'preload = ["./preload.ts"]\n', 'utf8');
    await writeFile(
      join(directory, 'preload.ts'),
      'import { writeFileSync } from "node:fs"; process.on("exit", () => writeFileSync(process.env.GITHUB_OUTPUT!, "run_full=false\\nreason=docs-only\\n"));\n',
      'utf8',
    );
    await writeFile(
      join(directory, 'scripts/ci-changed-paths.ts'),
      'await Bun.write(process.env.GITHUB_OUTPUT!, "run_full=false\\nreason=docs-only\\n");\n',
      'utf8',
    );
    run(['git', 'add', 'bunfig.toml', 'preload.ts', 'packages/example/index.ts', 'scripts/ci-changed-paths.ts']);
    run(['git', 'commit', '-qm', 'attempt classifier bypass']);
    const maliciousHead = run(['git', 'rev-parse', 'HEAD']);
    assert.deepEqual(await classify(trustedBase, maliciousHead), {
      run_full: 'true',
      reason: 'full-path',
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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
    assert.equal(scope.shell, 'bash');
    assert.match(scope.run ?? '', /git show "\$LYNTTY_CI_BASE_SHA:scripts\/ci-changed-paths\.ts"/);
    assert.match(scope.run ?? '', /reason=trusted-classifier-unavailable/);
    assert.match(scope.run ?? '', /reason=trusted-classifier-invalid/);
    assert.match(scope.run ?? '', /trusted_bunfig="\.git\/lyntty-ci-empty-bunfig\.toml"/);
    assert.match(scope.run ?? '', /GITHUB_OUTPUT="\$classifier_output" bun --config="\$trusted_bunfig" --no-env-file --no-install "\$trusted_classifier"/);
    assert.match(scope.run ?? '', /bun --config="\$trusted_bunfig" --no-env-file --no-install -e/);
    assert.match(scope.run ?? '', /TextDecoder\("utf-8", \{ fatal: true, ignoreBOM: true \}\)/);
    assert.match(scope.run ?? '', /byte > 0x7f/);
    assert.match(scope.run ?? '', /\^run_full=\(true\|false\)\$/);
    assert.match(scope.run ?? '', /run_full=false.*reason=docs-only/is);
    assert.doesNotMatch(scope.run ?? '', /sed -n|\$\(cat/);
    assert.doesNotMatch(scope.run ?? '', /bun scripts\/ci-changed-paths\.ts/);
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
    assert.match(document, /base commit|PR base/i);
    assert.match(document, /never.*worktree|不.*工作树/is);
  }
});
