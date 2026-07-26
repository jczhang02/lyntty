import { appendFile } from 'node:fs/promises';

export type ChangedPath = {
  status: string;
  paths: string[];
};

export type ChangeClassification = {
  runFull: boolean;
  reason: string;
};

type DiffNameStatus = (baseSha: string, headSha: string) => Promise<string | Uint8Array>;
type ValidateDocsPaths = (headSha: string, changes: ChangedPath[]) => Promise<boolean>;

const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const DOCS_ONLY_FILES = new Set([
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
]);
const DOCS_ASSET_EXTENSIONS = new Set(['.gif', '.jpeg', '.jpg', '.png', '.webp']);

function isSafeRelativePath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\\') || /[\u0000-\u001f\u007f]/.test(path)) return false;
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

export function isDocsOnlyPath(path: string): boolean {
  if (!isSafeRelativePath(path)) return false;
  if (DOCS_ONLY_FILES.has(path)) return true;
  if (!path.startsWith('docs/assets/')) return false;
  const filename = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  const extensionIndex = filename.lastIndexOf('.');
  return extensionIndex > 0 && DOCS_ASSET_EXTENSIONS.has(filename.slice(extensionIndex));
}

export function classifyChangeSet(input: {
  eventName: string;
  changes: ChangedPath[];
}): ChangeClassification {
  if (input.eventName !== 'pull_request') return { runFull: true, reason: 'non-pr-event' };
  if (input.changes.length === 0) return { runFull: true, reason: 'empty-change-set' };

  for (const change of input.changes) {
    if (change.paths.length !== 1) return { runFull: true, reason: 'malformed-change' };
    if (change.status !== 'A' && change.status !== 'M') {
      return { runFull: true, reason: 'full-status' };
    }
    if (!isDocsOnlyPath(change.paths[0])) return { runFull: true, reason: 'full-path' };
  }

  return { runFull: false, reason: 'docs-only' };
}

export function parseNameStatusZ(output: string | Uint8Array): ChangedPath[] {
  const text = typeof output === 'string'
    ? output
    : new TextDecoder('utf-8', { fatal: true }).decode(output);
  if (!text.endsWith('\0')) throw new Error('Git name-status output is missing its NUL terminator');

  const fields = text.split('\0');
  fields.pop();
  const changes: ChangedPath[] = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (!status) throw new Error('Git name-status output is missing a status');
    const path = fields[index++];
    if (!path) throw new Error('Git name-status output is missing path');
    const paths = [path];
    if (/^[RC][0-9]{1,3}$/.test(status)) {
      const destination = fields[index++];
      if (!destination) throw new Error('Git name-status output is missing rename path');
      paths.push(destination);
    }
    changes.push({ status, paths });
  }
  return changes;
}

async function gitDiffNameStatus(baseSha: string, headSha: string): Promise<Uint8Array> {
  const child = Bun.spawn([
    'git',
    'diff',
    '--no-ext-diff',
    '--no-textconv',
    '--name-status',
    '-z',
    '--find-renames',
    `${baseSha}...${headSha}`,
    '--',
  ], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = new Response(child.stdout).arrayBuffer();
  const stderr = new Response(child.stderr).text();
  const [exitCode, output, errorOutput] = await Promise.all([child.exited, stdout, stderr]);
  if (exitCode !== 0) throw new Error(`git diff failed: ${errorOutput.trim() || `exit ${exitCode}`}`);
  return new Uint8Array(output);
}

async function gitDocsPathsAreRegular(headSha: string, changes: ChangedPath[]): Promise<boolean> {
  for (const change of changes) {
    const path = change.paths[0];
    const child = Bun.spawn(['git', 'ls-tree', '-z', headSha, '--', path], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stdout = new Response(child.stdout).arrayBuffer();
    const stderr = new Response(child.stderr).text();
    const [exitCode, output, errorOutput] = await Promise.all([child.exited, stdout, stderr]);
    if (exitCode !== 0) throw new Error(`git ls-tree failed: ${errorOutput.trim() || `exit ${exitCode}`}`);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(output);
    const records = text.split('\0');
    if (records.at(-1) !== '') return false;
    records.pop();
    if (records.length !== 1) return false;
    const separator = records[0].indexOf('\t');
    if (separator < 0) return false;
    const [mode, objectType] = records[0].slice(0, separator).split(' ');
    if (mode !== '100644' || objectType !== 'blob') return false;
    if (records[0].slice(separator + 1) !== path) return false;
  }
  return true;
}

export async function classifyPullRequestDiff(input: {
  eventName: string;
  baseSha: string;
  headSha: string;
  diffNameStatus?: DiffNameStatus;
  validateDocsPaths?: ValidateDocsPaths;
}): Promise<ChangeClassification> {
  if (input.eventName !== 'pull_request') return { runFull: true, reason: 'non-pr-event' };
  if (!SHA_PATTERN.test(input.baseSha) || !SHA_PATTERN.test(input.headSha)) {
    return { runFull: true, reason: 'invalid-sha' };
  }

  try {
    const output = await (input.diffNameStatus ?? gitDiffNameStatus)(input.baseSha, input.headSha);
    const changes = parseNameStatusZ(output);
    const classification = classifyChangeSet({ eventName: input.eventName, changes });
    if (classification.runFull) return classification;
    const pathsAreRegular = await (input.validateDocsPaths ?? gitDocsPathsAreRegular)(input.headSha, changes);
    return pathsAreRegular ? classification : { runFull: true, reason: 'non-regular-doc' };
  } catch {
    return { runFull: true, reason: 'git-diff-failed' };
  }
}

async function writeGithubOutput(classification: ChangeClassification): Promise<void> {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) throw new Error('GITHUB_OUTPUT is required');
  await appendFile(
    outputPath,
    `run_full=${classification.runFull ? 'true' : 'false'}\nreason=${classification.reason}\n`,
    'utf8',
  );
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `CI scope: **${classification.runFull ? 'full' : 'docs-only'}** (${classification.reason})\n`,
      'utf8',
    );
  }
}

async function main(): Promise<void> {
  const classification = await classifyPullRequestDiff({
    eventName: process.env.LYNTTY_CI_EVENT_NAME ?? '',
    baseSha: process.env.LYNTTY_CI_BASE_SHA ?? '',
    headSha: process.env.LYNTTY_CI_HEAD_SHA ?? '',
  });
  await writeGithubOutput(classification);
  console.log(JSON.stringify({
    runFull: classification.runFull,
    reason: classification.reason,
  }));
}

if (import.meta.main) await main();
