export function resolvePiSessionDisplayName(
  name?: string | null,
  firstMessage?: string | null,
): string {
  return name?.trim() || firstMessage?.trim() || 'Pi session';
}
