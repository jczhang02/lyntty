const BLOCKED_SESSION_ENVIRONMENT_KEYS = new Set([
  'BASH_ENV',
  'COMSPEC',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'ENV',
  'HOME',
  'LD_LIBRARY_PATH',
  'LD_PRELOAD',
  'NODE_OPTIONS',
  'NODE_PATH',
  'PATH',
  'PATHEXT',
  'PERL5OPT',
  'PYTHONHOME',
  'PYTHONPATH',
  'RUBYOPT',
  'SHELL',
  'ZDOTDIR',
]);

export function findBlockedSessionEnvironmentKeys(environmentVariables: Record<string, string> | undefined): string[] {
  if (!environmentVariables) return [];
  return Object.keys(environmentVariables).filter((key) => {
    const normalizedKey = key.toUpperCase();
    return BLOCKED_SESSION_ENVIRONMENT_KEYS.has(normalizedKey) || normalizedKey.startsWith('LYNTTY_');
  });
}
