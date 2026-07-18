import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join } from 'node:path';

export interface InstallPaths {
  rootDir: string;
  versionsDir: string;
  currentPath: string;
  transactionsDir: string;
  extensionSnapshotsDir: string;
  statePath: string;
  userBinDir: string;
}

export interface InstallPathOptions {
  platform?: NodeJS.Platform;
  homeDir?: string;
  xdgDataHome?: string;
  localAppData?: string;
  installRoot?: string;
  userBinDir?: string;
}

function requireAbsolute(path: string, label: string): string {
  if (!isAbsolute(path)) throw new Error(`${label} must be an absolute path`);
  return path;
}

export function defaultInstallRoot(options: InstallPathOptions = {}): string {
  const platform = options.platform ?? process.platform;
  const homeDir = requireAbsolute(options.homeDir ?? homedir(), 'home directory');
  const explicit = options.installRoot ?? process.env.LYNTTY_INSTALL_ROOT?.trim();
  if (explicit) return requireAbsolute(explicit, 'LYNTTY_INSTALL_ROOT');
  if (platform === 'darwin') return join(homeDir, 'Library', 'Application Support', 'Lyntty');
  if (platform === 'win32') {
    return join(requireAbsolute(options.localAppData ?? process.env.LOCALAPPDATA ?? join(homeDir, 'AppData', 'Local'), 'LOCALAPPDATA'), 'Lyntty');
  }
  return join(requireAbsolute(options.xdgDataHome ?? process.env.XDG_DATA_HOME ?? join(homeDir, '.local', 'share'), 'XDG_DATA_HOME'), 'lyntty');
}

export function resolveInstallPaths(options: InstallPathOptions = {}): InstallPaths {
  const homeDir = options.homeDir ?? homedir();
  const rootDir = defaultInstallRoot(options);
  const userBinDir = requireAbsolute(
    options.userBinDir ?? process.env.LYNTTY_BIN_DIR ?? join(homeDir, '.local', 'bin'),
    'Lyntty user bin directory',
  );
  return {
    rootDir,
    versionsDir: join(rootDir, 'versions'),
    currentPath: join(rootDir, 'current'),
    transactionsDir: join(rootDir, 'transactions'),
    extensionSnapshotsDir: join(rootDir, 'extension-snapshots'),
    statePath: join(rootDir, 'install-state.json'),
    userBinDir,
  };
}

export function inferInstallRootFromRuntimeRoot(runtimeRoot: string): string | null {
  const versionsDir = dirname(runtimeRoot);
  if (basename(versionsDir) !== 'versions' || basename(runtimeRoot).startsWith('.')) return null;
  return dirname(versionsDir);
}

export function installedExecutablePath(rootDir: string, role: 'lyntty' | 'lynttyd', platform = process.platform): string {
  return join(rootDir, 'current', `${role}${platform === 'win32' ? '.exe' : ''}`);
}
