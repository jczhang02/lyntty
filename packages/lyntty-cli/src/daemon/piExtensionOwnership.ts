export type PiExtensionOwnershipState = {
  activeExtensionInstanceId: string | null;
  lastExtensionSeenAt: number;
};

export function claimPiExtensionInstance(
  state: PiExtensionOwnershipState,
  instanceId: string | undefined,
  now: number,
  activeWindowMs: number,
  allowTakeover = false,
): 'claimed' | 'current' | 'rejected' | 'missing_instance_id' {
  if (!instanceId) return 'missing_instance_id';
  if (!state.activeExtensionInstanceId) {
    state.activeExtensionInstanceId = instanceId;
    return 'claimed';
  }
  if (state.activeExtensionInstanceId === instanceId) return 'current';
  if (allowTakeover || now - state.lastExtensionSeenAt > activeWindowMs) {
    state.activeExtensionInstanceId = instanceId;
    return 'claimed';
  }
  return 'rejected';
}

export function isPiExtensionCommandOwner(
  state: Pick<PiExtensionOwnershipState, 'activeExtensionInstanceId'>,
  instanceId: string | undefined,
): boolean {
  return !!instanceId && state.activeExtensionInstanceId === instanceId;
}
