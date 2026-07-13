export type PiExtensionSequenceState = {
  lastExtensionInstanceId: string | null;
  lastExtensionEventId: number | null;
  extensionHasSeqGap: boolean;
};

export function applyPiExtensionSequence(
  state: PiExtensionSequenceState,
  event: { extensionInstanceId?: string; eventId?: number },
): boolean {
  if (event.extensionInstanceId && event.extensionInstanceId !== state.lastExtensionInstanceId) {
    state.lastExtensionInstanceId = event.extensionInstanceId;
    state.lastExtensionEventId = null;
    state.extensionHasSeqGap = false;
  }

  const eventId = typeof event.eventId === 'number' && Number.isFinite(event.eventId)
    ? event.eventId
    : null;
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
