import { describe, expect, it } from 'vitest';

import { claimPiExtensionInstance, isPiExtensionCommandOwner } from './piExtensionOwnership';

describe('Pi extension ownership fencing', () => {
  it('keeps a fresh owner and rejects a concurrent or delayed instance', () => {
    const state = { activeExtensionInstanceId: 'instance-b' as string | null, lastExtensionSeenAt: 9_500 };

    expect(claimPiExtensionInstance(state, 'instance-a', 10_000, 2_000)).toBe('rejected');
    expect(state.activeExtensionInstanceId).toBe('instance-b');
    expect(isPiExtensionCommandOwner(state, 'instance-a')).toBe(false);
    expect(isPiExtensionCommandOwner(state, 'instance-b')).toBe(true);
  });

  it('allows a reload session_start to replace the previous instance', () => {
    const state = { activeExtensionInstanceId: 'instance-a' as string | null, lastExtensionSeenAt: 9_500 };
    expect(claimPiExtensionInstance(state, 'instance-b', 10_000, 2_000, true)).toBe('claimed');
    expect(state.activeExtensionInstanceId).toBe('instance-b');
  });

  it('allows a new instance to claim a stale owner lease', () => {
    const state = { activeExtensionInstanceId: 'instance-a' as string | null, lastExtensionSeenAt: 1_000 };

    expect(claimPiExtensionInstance(state, 'instance-b', 10_000, 2_000)).toBe('claimed');
    expect(state.activeExtensionInstanceId).toBe('instance-b');
  });

  it('does not deliver commands to legacy instances without an epoch', () => {
    const state = { activeExtensionInstanceId: null, lastExtensionSeenAt: 0 };
    expect(claimPiExtensionInstance(state, undefined, 10_000, 2_000)).toBe('missing_instance_id');
    expect(isPiExtensionCommandOwner(state, undefined)).toBe(false);
  });
});
