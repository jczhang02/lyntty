import { createHash } from 'node:crypto';
import { chmod, cp, mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import packageJson from '../package.json';
import { ARTIFACT_MANIFEST_SCHEMA_VERSION, type ArtifactFile, type ArtifactManifestV1, type ArtifactTarget } from '../src/distribution/artifactManifest';
import { lynttyPiExtensionSha256 } from '../src/pi/piExtensionInstall';

type BuildTargetId = 'linux-x64' | 'linux-arm64' | 'darwin-x64' | 'darwin-arm64' | 'windows-x64';

interface BuildTarget {
  id: BuildTargetId;
  bunTarget: string;
  manifestTarget: ArtifactTarget;
  toolTarget: string;
  executableSuffix: '' | '.exe';
  archiveSuffix: '.tar.gz' | '.zip';
}

const TARGETS: Record<BuildTargetId, BuildTarget> = {
  'linux-x64': {
    id: 'linux-x64', bunTarget: 'bun-linux-x64-baseline', manifestTarget: { os: 'linux', arch: 'x64', libc: 'glibc' },
    toolTarget: 'x64-linux', executableSuffix: '', archiveSuffix: '.tar.gz',
  },
  'linux-arm64': {
    id: 'linux-arm64', bunTarget: 'bun-linux-arm64', manifestTarget: { os: 'linux', arch: 'arm64', libc: 'glibc' },
    toolTarget: 'arm64-linux', executableSuffix: '', archiveSuffix: '.tar.gz',
  },
  'darwin-x64': {
    id: 'darwin-x64', bunTarget: 'bun-darwin-x64-baseline', manifestTarget: { os: 'darwin', arch: 'x64' },
    toolTarget: 'x64-darwin', executableSuffix: '', archiveSuffix: '.tar.gz',
  },
  'darwin-arm64': {
    id: 'darwin-arm64', bunTarget: 'bun-darwin-arm64', manifestTarget: { os: 'darwin', arch: 'arm64' },
    toolTarget: 'arm64-darwin', executableSuffix: '', archiveSuffix: '.tar.gz',
  },
  'windows-x64': {
    id: 'windows-x64', bunTarget: 'bun-windows-x64', manifestTarget: { os: 'windows', arch: 'x64' },
    toolTarget: 'x64-win32', executableSuffix: '.exe', archiveSuffix: '.zip',
  },
};

const packageDir = resolve(import.meta.dir, '..');
const repoRoot = resolve(packageDir, '..', '..');

function parseArgs(args: string[]): { targets: BuildTarget[]; outputDir: string; archive: boolean } {
  let requestedTarget: string | null = null;
  let outputDir = join(packageDir, 'dist', 'artifacts');
  let archive = true;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === '--target') requestedTarget = args[++index] ?? '';
    else if (arg.startsWith('--target=')) requestedTarget = arg.slice('--target='.length);
    else if (arg === '--out-dir') outputDir = resolve(args[++index] ?? '');
    else if (arg.startsWith('--out-dir=')) outputDir = resolve(arg.slice('--out-dir='.length));
    else if (arg === '--no-archive') archive = false;
    else if (arg === '--all') requestedTarget = 'all';
    else throw new Error(`Unknown build-artifact argument: ${arg}`);
  }

  if (!requestedTarget) {
    const os = process.platform === 'win32' ? 'windows' : process.platform;
    requestedTarget = `${os}-${process.arch}`;
  }
  if (requestedTarget === 'all') return { targets: Object.values(TARGETS), outputDir, archive };
  const target = TARGETS[requestedTarget as BuildTargetId];
  if (!target) throw new Error(`Unsupported build target: ${requestedTarget}`);
  return { targets: [target], outputDir, archive };
}

async function run(command: string[], options: { cwd?: string; env?: Record<string, string | undefined> } = {}): Promise<string> {
  const child = Bun.spawn(command, {
    cwd: options.cwd ?? packageDir,
    env: options.env ?? process.env,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) throw new Error(`${command.join(' ')} failed (${exitCode})\n${stderr || stdout}`);
  return stdout;
}

async function compileBinary(entrypoint: string, outfile: string, target: BuildTarget, releaseId: string): Promise<void> {
  await run([
    process.execPath,
    'build',
    '--compile',
    `--target=${target.bunTarget}`,
    '--define', `__LYNTTY_BUILD_VERSION__=${JSON.stringify(packageJson.version)}`,
    '--define', `__LYNTTY_BUILD_RELEASE_ID__=${JSON.stringify(releaseId)}`,
    '--define', `__LYNTTY_BUILD_TARGET_ID__=${JSON.stringify(target.id)}`,
    '--no-compile-autoload-dotenv',
    '--no-compile-autoload-bunfig',
    '--no-compile-autoload-package-json',
    entrypoint,
    '--outfile',
    outfile,
  ]);
  if (target.manifestTarget.os !== 'windows') await chmod(outfile, 0o755);
}

async function sanitizeBundledPiRuntimeText(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await sanitizeBundledPiRuntimeText(path);
      continue;
    }
    if (['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock'].includes(entry.name)) {
      await rm(path, { force: true });
      continue;
    }
    if (!/\.(?:ts|js|mjs|cjs|md|json)$/.test(entry.name)) continue;
    const source = await readFile(path, 'utf8');
    const bunOnly = source
      .replaceAll('bunx tsx ', 'bun ')
      .replaceAll('npm list', 'bun pm ls')
      .replaceAll('npm outdated', 'bun outdated')
      .replaceAll('npm audit', 'bun audit')
      .replaceAll('npm install', 'bun install')
      .replaceAll('npm run', 'bun run')
      .replaceAll('npm test', 'bun test')
      .replaceAll('yarn add', 'bun add')
      .replace(/\bnpm\b/g, 'bun')
      .replace(/\bnpx\b/g, 'bunx')
      .replace(/\bpnpm\b/g, 'bun')
      .replace(/\byarn\b/g, 'bun')
      .replace(/\btsx\b/g, 'bun');
    if (bunOnly !== source) await writeFile(path, bunOnly);
  }
}

async function copyPiRuntime(destination: string): Promise<void> {
  const packageJsonPath = Bun.resolveSync('@earendil-works/pi-coding-agent/package.json', packageDir);
  const piRoot = dirname(packageJsonPath);
  await mkdir(destination, { recursive: true });

  for (const file of ['package.json', 'README.md', 'CHANGELOG.md']) {
    await cp(join(piRoot, file), join(destination, file));
  }
  await cp(join(piRoot, 'docs'), join(destination, 'docs'), { recursive: true });
  await cp(join(piRoot, 'examples'), join(destination, 'examples'), { recursive: true });
  await sanitizeBundledPiRuntimeText(destination);
  await cp(join(piRoot, 'dist', 'modes', 'interactive', 'theme'), join(destination, 'theme'), {
    recursive: true,
    filter: source => !source.endsWith('.map') && !source.endsWith('.d.ts'),
  });
  await cp(join(piRoot, 'dist', 'modes', 'interactive', 'assets'), join(destination, 'assets'), { recursive: true });
  const exportDir = join(destination, 'export-html');
  await mkdir(join(exportDir, 'vendor'), { recursive: true });
  for (const file of ['template.html', 'template.css', 'template.js']) {
    await cp(join(piRoot, 'dist', 'core', 'export-html', file), join(exportDir, file));
  }
  for (const file of ['marked.min.js', 'highlight.min.js']) {
    await cp(join(piRoot, 'dist', 'core', 'export-html', 'vendor', file), join(exportDir, 'vendor', file));
  }
}

async function extractTool(target: BuildTarget, tool: 'ripgrep' | 'difftastic', outputDir: string): Promise<void> {
  const archive = join(packageDir, 'tools', 'archives', `${tool}-${target.toolTarget}.tar.gz`);
  const binaryName = tool === 'ripgrep'
    ? `rg${target.executableSuffix}`
    : `difft${target.executableSuffix}`;
  const entries = (await run(['tar', '-tzf', archive])).trim().split(/\r?\n/).filter(Boolean);
  if (!entries.includes(binaryName) || entries.some(entry => entry.startsWith('/') || entry.includes('..') || entry.includes('\\'))) {
    throw new Error(`Unsafe or incomplete tool archive: ${basename(archive)}`);
  }

  const stagingBase = join(packageDir, 'dist', 'build-staging');
  await mkdir(stagingBase, { recursive: true });
  const stagingDir = await mkdtemp(join(stagingBase, `${tool}-`));
  try {
    await run(['tar', '-xzf', archive, '-C', stagingDir, binaryName]);
    const destination = join(outputDir, binaryName);
    await cp(join(stagingDir, binaryName), destination);
    if (target.manifestTarget.os !== 'windows') await chmod(destination, 0o755);
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
}

async function sha256(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function listFiles(root: string, current = root): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(root, path));
    else if (entry.isFile()) result.push(relative(root, path).split(sep).join('/'));
    else throw new Error(`Artifact contains unsupported filesystem entry: ${path}`);
  }
  return result.sort();
}

function isArtifactExecutable(relativePath: string, target: BuildTarget): boolean {
  return relativePath === `lyntty${target.executableSuffix}`
    || relativePath === `lynttyd${target.executableSuffix}`
    || relativePath === `tools/rg${target.executableSuffix}`
    || relativePath === `tools/difft${target.executableSuffix}`;
}

async function canonicalizeArtifactModes(root: string, target: BuildTarget, current = root): Promise<void> {
  if (current === root) await chmod(root, 0o755);
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      await chmod(path, 0o755);
      await canonicalizeArtifactModes(root, target, path);
    } else if (entry.isFile()) {
      const relativePath = relative(root, path).split(sep).join('/');
      await chmod(path, isArtifactExecutable(relativePath, target) ? 0o755 : 0o644);
    } else {
      throw new Error(`Artifact contains unsupported filesystem entry: ${path}`);
    }
  }
}

async function makeManifest(root: string, target: BuildTarget, releaseId: string): Promise<ArtifactManifestV1> {
  const files: ArtifactFile[] = [];
  for (const relativePath of await listFiles(root)) {
    if (relativePath === 'artifact-manifest.json') continue;
    const path = join(root, ...relativePath.split('/'));
    const stats = await stat(path);
    files.push({
      path: relativePath,
      sha256: await sha256(path),
      size: stats.size,
      executable: isArtifactExecutable(relativePath, target),
    });
  }
  return {
    schemaVersion: ARTIFACT_MANIFEST_SCHEMA_VERSION,
    product: 'lyntty-cli',
    releaseId,
    version: packageJson.version,
    stateSchema: 1,
    target: target.manifestTarget,
    extensionSha256: lynttyPiExtensionSha256(),
    files,
  };
}

async function setZipTimestamps(root: string): Promise<void> {
  const timestamp = new Date('1980-01-01T00:00:00.000Z');
  const paths = (await listFiles(root)).map(path => join(root, ...path.split('/')));
  for (const path of paths) await utimes(path, timestamp, timestamp);
}

async function createArchive(outputDir: string, artifactName: string, suffix: BuildTarget['archiveSuffix']): Promise<string> {
  const archivePath = join(outputDir, `${artifactName}${suffix}`);
  await rm(archivePath, { force: true });
  if (suffix === '.tar.gz') {
    await run([
      'tar', '--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner',
      '-czf', archivePath, '-C', outputDir, artifactName,
    ]);
  } else {
    const artifactRoot = join(outputDir, artifactName);
    await setZipTimestamps(artifactRoot);
    const files = (await listFiles(artifactRoot)).map(path => `${artifactName}/${path}`);
    await run(['zip', '-X', '-q', archivePath, ...files], {
      cwd: outputDir,
      env: { ...process.env, TZ: 'UTC' },
    });
  }
  await writeFile(`${archivePath}.sha256`, `${await sha256(archivePath)}  ${basename(archivePath)}\n`, { mode: 0o644 });
  return archivePath;
}

async function buildTarget(target: BuildTarget, outputDir: string, archive: boolean): Promise<void> {
  const artifactName = `lyntty-cli-${packageJson.version}-${target.id}`;
  const artifactRoot = join(outputDir, artifactName);
  await rm(artifactRoot, { recursive: true, force: true });
  await mkdir(join(artifactRoot, 'runtime', 'pi'), { recursive: true });
  await mkdir(join(artifactRoot, 'tools'), { recursive: true });
  await mkdir(join(artifactRoot, 'licenses'), { recursive: true });

  await compileBinary('./src/index.ts', join(artifactRoot, `lyntty${target.executableSuffix}`), target, artifactName);
  await compileBinary('./src/daemon/entry.ts', join(artifactRoot, `lynttyd${target.executableSuffix}`), target, artifactName);
  await copyPiRuntime(join(artifactRoot, 'runtime', 'pi'));
  await extractTool(target, 'ripgrep', join(artifactRoot, 'tools'));
  await extractTool(target, 'difftastic', join(artifactRoot, 'tools'));

  await cp(join(repoRoot, 'LICENSE'), join(artifactRoot, 'licenses', 'Lyntty-LICENSE'));
  await cp(join(packageDir, 'tools', 'licenses', 'ripgrep-LICENSE'), join(artifactRoot, 'licenses', 'ripgrep-LICENSE'));
  await cp(join(packageDir, 'tools', 'licenses', 'difftastic-LICENSE'), join(artifactRoot, 'licenses', 'difftastic-LICENSE'));
  const piPackage = JSON.parse(await readFile(Bun.resolveSync('@earendil-works/pi-coding-agent/package.json', packageDir), 'utf8')) as {
    name?: string; version?: string; license?: string; repository?: unknown;
  };
  await writeFile(join(artifactRoot, 'licenses', 'pi-NOTICE.txt'), [
    `${piPackage.name ?? '@earendil-works/pi-coding-agent'} ${piPackage.version ?? 'unknown'}`,
    `License: ${piPackage.license ?? 'not declared'}`,
    `Repository: ${typeof piPackage.repository === 'string' ? piPackage.repository : JSON.stringify(piPackage.repository ?? null)}`,
    '',
  ].join('\n'));

  await canonicalizeArtifactModes(artifactRoot, target);
  const manifest = await makeManifest(artifactRoot, target, artifactName);
  const manifestPath = join(artifactRoot, 'artifact-manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
  await chmod(manifestPath, 0o644);
  const manifestSha256 = await sha256(manifestPath);
  await writeFile(
    join(outputDir, `${artifactName}.manifest.sha256`),
    `${manifestSha256}  artifact-manifest.json\n`,
    { mode: 0o644 },
  );
  const archivePath = archive ? await createArchive(outputDir, artifactName, target.archiveSuffix) : null;
  console.log(JSON.stringify({ artifactRoot, archivePath, manifestSha256, releaseId: artifactName, files: manifest.files.length }));
}

const { targets, outputDir, archive } = parseArgs(process.argv.slice(2));
await mkdir(outputDir, { recursive: true });
for (const target of targets) await buildTarget(target, outputDir, archive);
