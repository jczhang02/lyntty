export type PiExtensionSequenceState = {
  lastExtensionInstanceId: string | null;
  lastExtensionEventId: number | null;
  extensionHasSeqGap: boolean;
};

export function applyPiExtensionSequence(
  state: PiExtensionSequenceState,
  event: { extensionInstanceId?: string; eventId?: number },
): boolean {
  const eventId = typeof event.eventId === 'number' && Number.isFinite(event.eventId)
    ? event.eventId
    : null;
  if (event.extensionInstanceId && event.extensionInstanceId !== state.lastExtensionInstanceId) {
    const replacedEstablishedOwner = state.lastExtensionInstanceId !== null;
    state.lastExtensionInstanceId = event.extensionInstanceId;
    state.lastExtensionEventId = null;
    // A new owner resets only its per-instance cursor. Any unresolved gap
    // remains sticky until canonical JSONL fallback is acknowledged. Event 1
    // is the owner claim; seeing a later first id proves the prefix was lost.
    if (replacedEstablishedOwner || eventId !== 1) state.extensionHasSeqGap = true;
  }

  if (eventId === null) {
    state.extensionHasSeqGap = true;
    return true;
  }
  if (state.lastExtensionEventId !== null) {
    if (eventId <= state.lastExtensionEventId) return false;
    if (eventId !== state.lastExtensionEventId + 1) {
      state.extensionHasSeqGap = true;
    }
  }
  state.lastExtensionEventId = eventId;
  return true;
}
