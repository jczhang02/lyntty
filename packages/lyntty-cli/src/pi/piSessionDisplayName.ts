const GENERIC_PI_SESSION_TITLES = new Set([
  'pi',
  'pi session',
  '(no messages)',
  'no messages',
]);

export function normalizePiSessionDisplayNameCandidate(
  value?: string | null,
): string | undefined {
  const candidate = value?.trim();
  if (!candidate || GENERIC_PI_SESSION_TITLES.has(candidate.toLocaleLowerCase())) {
    return undefined;
  }
  return candidate;
}

export function resolvePiSessionDisplayName(
  name?: string | null,
  firstMessage?: string | null,
): string {
  return normalizePiSessionDisplayNameCandidate(name)
    ?? normalizePiSessionDisplayNameCandidate(firstMessage)
    ?? 'Pi session';
}

export function reconcilePiSessionDisplayName(
  relayName: string | null | undefined,
  canonicalName: string | null | undefined,
): string {
  const current = normalizePiSessionDisplayNameCandidate(relayName);
  const canonical = normalizePiSessionDisplayNameCandidate(canonicalName);
  return canonical ?? current ?? 'Pi session';
}
