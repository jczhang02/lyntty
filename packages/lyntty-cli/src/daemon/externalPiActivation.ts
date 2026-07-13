export function isExternalPiMirrorActive(options: {
  lastExtensionSeenAt: number;
  now: number;
  activeWindowMs: number;
}): boolean {
  return options.lastExtensionSeenAt > 0
    && options.now - options.lastExtensionSeenAt <= options.activeWindowMs;
}

export type ExternalPiActivationResult =
  | { type: 'reuse'; sessionId: string }
  | { type: 'released' }
  | { type: 'blocked'; errorMessage: string };

export function resolveStalePiMirrorCleanup(options: {
  staleSeenAt: number;
  recentSignalAt: number;
  replacementSessionId?: string;
  now: number;
  activeWindowMs: number;
}): ExternalPiActivationResult | { type: 'none' } {
  if (options.replacementSessionId) {
    return { type: 'reuse', sessionId: options.replacementSessionId };
  }
  if (options.recentSignalAt > options.staleSeenAt
    && options.now - options.recentSignalAt <= options.activeWindowMs) {
    return {
      type: 'blocked',
      errorMessage: 'Pi extension reconnected while a stale mirror was being cleaned up; retry after the extension finishes reconnecting.',
    };
  }
  return { type: 'none' };
}

export async function resolveExternalPiActivationLease(options: {
  relaySessionId: string;
  takeoverChoice?: string;
  queueShutdown: () => boolean;
  waitForAccepted: () => Promise<boolean>;
  waitForStopped: () => Promise<boolean>;
}): Promise<ExternalPiActivationResult> {
  if (options.takeoverChoice === 'wait') {
    return await options.waitForStopped()
      ? { type: 'released' }
      : {
          type: 'blocked',
          errorMessage: 'Timed out waiting for the active Pi extension runtime to exit; no replacement was started.',
        };
  }
  if (options.takeoverChoice !== 'stop' && options.takeoverChoice !== 'interrupt') {
    return { type: 'reuse', sessionId: options.relaySessionId };
  }

  if (!options.queueShutdown()) {
    return {
      type: 'blocked',
      errorMessage: 'Active Pi extension runtime could not accept the takeover request; no replacement was started.',
    };
  }
  if (!await options.waitForAccepted()) {
    return {
      type: 'blocked',
      errorMessage: 'Timed out waiting for the active Pi extension runtime to accept takeover; no replacement was started.',
    };
  }
  if (!await options.waitForStopped()) {
    return {
      type: 'blocked',
      errorMessage: 'Timed out waiting for the active Pi extension runtime to exit; no replacement was started.',
    };
  }
  return { type: 'released' };
}
