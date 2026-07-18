import { delimiter, join, posix, resolve, win32 } from 'node:path';
import { inferInstallRootFromRuntimeRoot } from './installPaths';

export interface RuntimeLayout {
  compiled: boolean;
  rootDir: string;
  libraryDir: string;
  toolsDir: string;
  piPackageDir: string | null;
  cliExecutable: string | null;
  daemonExecutable: string | null;
  manifestPath: string | null;
}

export interface RuntimeLayoutInputs {
  bunMain: string;
  execPath: string;
  platform: NodeJS.Platform;
  sourcePackageDir: string;
}

export function isCompiledBunMain(bunMain: string): boolean {
  const normalized = bunMain.toLowerCase();
  return normalized.includes('$bunfs') || normalized.includes('~bun') || normalized.includes('%7ebun');
}

export function resolveRuntimeLayout(inputs: RuntimeLayoutInputs): RuntimeLayout {
  if (!isCompiledBunMain(inputs.bunMain)) {
    const rootDir = resolve(inputs.sourcePackageDir);
    return {
      compiled: false,
      rootDir,
      libraryDir: rootDir,
      toolsDir: join(rootDir, 'tools', 'unpacked'),
      piPackageDir: null,
      cliExecutable: null,
      daemonExecutable: null,
      manifestPath: null,
    };
  }

  const path = inputs.platform === 'win32' ? win32 : posix;
  const rootDir = path.dirname(inputs.execPath);
  const suffix = inputs.platform === 'win32' ? '.exe' : '';
  return {
    compiled: true,
    rootDir,
    libraryDir: rootDir,
    toolsDir: path.join(rootDir, 'tools'),
    piPackageDir: path.join(rootDir, 'runtime', 'pi'),
    cliExecutable: path.join(rootDir, `lyntty${suffix}`),
    daemonExecutable: path.join(rootDir, `lynttyd${suffix}`),
    manifestPath: path.join(rootDir, 'artifact-manifest.json'),
  };
}

const sourcePackageDir = resolve(import.meta.dir, '..', '..');
let currentLayout: RuntimeLayout | null = null;

export function runtimeLayout(): RuntimeLayout {
  currentLayout ??= resolveRuntimeLayout({
    bunMain: Bun.main,
    execPath: process.execPath,
    platform: process.platform,
    sourcePackageDir,
  });
  return currentLayout;
}

/**
 * Configure paths required by code bundled from Pi before that package is loaded.
 * Explicit caller overrides are preserved for isolation and packaging tests.
 */
export function initializeRuntimeLayout(): RuntimeLayout {
  const layout = runtimeLayout();
  if (!layout.compiled) return layout;

  process.env.PI_PACKAGE_DIR ||= layout.piPackageDir!;
  process.env.LYNTTY_RUNTIME_ROOT ||= layout.rootDir;
  const inferredInstallRoot = inferInstallRootFromRuntimeRoot(layout.rootDir);
  if (inferredInstallRoot) process.env.LYNTTY_INSTALL_ROOT ||= inferredInstallRoot;
  process.env.LYNTTY_TOOLS_DIR ||= layout.toolsDir;
  process.env.LYNTTY_CLI_EXECUTABLE ||= layout.cliExecutable!;
  process.env.LYNTTY_DAEMON_EXECUTABLE ||= layout.daemonExecutable!;
  const pathEntries = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  if (!pathEntries.includes(layout.toolsDir)) {
    process.env.PATH = [layout.toolsDir, ...pathEntries].join(delimiter);
  }
  return layout;
}
