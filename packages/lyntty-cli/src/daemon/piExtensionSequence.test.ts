import { describe, expect, it } from 'vitest';

import { applyPiExtensionSequence } from './piExtensionSequence';

describe('applyPiExtensionSequence', () => {
  it('accepts a low event id but marks an established owner epoch change uncertain', () => {
    const state = {
      lastExtensionInstanceId: 'old-instance' as string | null,
      lastExtensionEventId: 42 as number | null,
      extensionHasSeqGap: false,
    };

    expect(applyPiExtensionSequence(state, { extensionInstanceId: 'new-instance', eventId: 1 })).toBe(true);
    expect(state).toEqual({
      lastExtensionInstanceId: 'new-instance',
      lastExtensionEventId: 1,
      extensionHasSeqGap: true,
    });
  });

  it('accepts a fresh owner starting at event one without inventing a gap', () => {
    const state = {
      lastExtensionInstanceId: null as string | null,
      lastExtensionEventId: null as number | null,
      extensionHasSeqGap: false,
    };

    expect(applyPiExtensionSequence(state, { extensionInstanceId: 'first-instance', eventId: 1 })).toBe(true);
    expect(state.extensionHasSeqGap).toBe(false);
  });

  it('keeps an unresolved gap sticky across an extension owner epoch', () => {
    const state = {
      lastExtensionInstanceId: 'old-instance' as string | null,
      lastExtensionEventId: 42 as number | null,
      extensionHasSeqGap: true,
    };

    expect(applyPiExtensionSequence(state, { extensionInstanceId: 'new-instance', eventId: 1 })).toBe(true);
    expect(state).toEqual({
      lastExtensionInstanceId: 'new-instance',
      lastExtensionEventId: 1,
      extensionHasSeqGap: true,
    });
  });

  it('marks a missing new-owner prefix as a sequence gap', () => {
    const state = {
      lastExtensionInstanceId: 'old-instance' as string | null,
      lastExtensionEventId: 42 as number | null,
      extensionHasSeqGap: false,
    };

    expect(applyPiExtensionSequence(state, { extensionInstanceId: 'new-instance', eventId: 2 })).toBe(true);
    expect(state.extensionHasSeqGap).toBe(true);
  });

  it('rejects duplicate ids within one instance but records forward gaps', () => {
    const state = {
      lastExtensionInstanceId: 'instance-1' as string | null,
      lastExtensionEventId: 4 as number | null,
      extensionHasSeqGap: false,
    };

    expect(applyPiExtensionSequence(state, { extensionInstanceId: 'instance-1', eventId: 4 })).toBe(false);
    expect(applyPiExtensionSequence(state, { extensionInstanceId: 'instance-1', eventId: 6 })).toBe(true);
    expect(state.extensionHasSeqGap).toBe(true);
  });
});
