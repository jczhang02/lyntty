import { describe, expect, it, vi } from 'vitest';

import { isExternalPiMirrorActive, resolveExternalPiActivationLease, resolveStalePiMirrorCleanup } from './externalPiActivation';

describe('resolveExternalPiActivationLease', () => {
  it('treats an extension mirror as active only inside its heartbeat window', () => {
    expect(isExternalPiMirrorActive({ lastExtensionSeenAt: 9_000, now: 10_000, activeWindowMs: 2_000 })).toBe(true);
    expect(isExternalPiMirrorActive({ lastExtensionSeenAt: 7_999, now: 10_000, activeWindowMs: 2_000 })).toBe(false);
  });

  it('blocks replacement when an extension signal arrives during stale cleanup', () => {
    expect(resolveStalePiMirrorCleanup({
      staleSeenAt: 1_000,
      recentSignalAt: 9_500,
      now: 10_000,
      activeWindowMs: 2_000,
    })).toMatchObject({ type: 'blocked' });
    expect(resolveStalePiMirrorCleanup({
      staleSeenAt: 1_000,
      recentSignalAt: 7_000,
      now: 10_000,
      activeWindowMs: 2_000,
    })).toEqual({ type: 'none' });
  });

  it('reuses a replacement mirror created during stale cleanup', () => {
    expect(resolveStalePiMirrorCleanup({
      staleSeenAt: 1_000,
      recentSignalAt: 1_000,
      replacementSessionId: 'relay-replacement',
      now: 10_000,
      activeWindowMs: 2_000,
    })).toEqual({ type: 'reuse', sessionId: 'relay-replacement' });
  });

  it('reuses an ordinary extension-backed Pi runtime by default', async () => {
    const queueShutdown = vi.fn();
    await expect(resolveExternalPiActivationLease({
      relaySessionId: 'relay-1',
      queueShutdown,
      waitForAccepted: vi.fn(),
      waitForStopped: vi.fn(),
    })).resolves.toEqual({ type: 'reuse', sessionId: 'relay-1' });
    expect(queueShutdown).not.toHaveBeenCalled();
  });

  it('waits without sending shutdown when wait takeover is requested', async () => {
    const queueShutdown = vi.fn();
    const waitForAccepted = vi.fn();
    await expect(resolveExternalPiActivationLease({
      relaySessionId: 'relay-1',
      takeoverChoice: 'wait',
      queueShutdown,
      waitForAccepted,
      waitForStopped: async () => true,
    })).resolves.toEqual({ type: 'released' });
    expect(queueShutdown).not.toHaveBeenCalled();
    expect(waitForAccepted).not.toHaveBeenCalled();
  });

  it('waits for explicit takeover shutdown and exit before releasing the lease', async () => {
    const order: string[] = [];
    await expect(resolveExternalPiActivationLease({
      relaySessionId: 'relay-1',
      takeoverChoice: 'stop',
      queueShutdown: () => {
        order.push('queue');
        return true;
      },
      waitForAccepted: async () => {
        order.push('accepted');
        return true;
      },
      waitForStopped: async () => {
        order.push('stopped');
        return true;
      },
    })).resolves.toEqual({ type: 'released' });
    expect(order).toEqual(['queue', 'accepted', 'stopped']);
  });

  it('blocks replacement when the old runtime does not stop', async () => {
    const result = await resolveExternalPiActivationLease({
      relaySessionId: 'relay-1',
      takeoverChoice: 'interrupt',
      queueShutdown: () => true,
      waitForAccepted: async () => true,
      waitForStopped: async () => false,
    });

    expect(result.type).toBe('blocked');
    expect(result).toMatchObject({ errorMessage: expect.stringContaining('no replacement was started') });
  });
});
