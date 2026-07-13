import { describe, expect, it } from 'vitest';

import { applyPiExtensionSequence } from './piExtensionSequence';

describe('applyPiExtensionSequence', () => {
  it('accepts a low event id after the extension instance epoch changes', () => {
    const state = {
      lastExtensionInstanceId: 'old-instance' as string | null,
      lastExtensionEventId: 42 as number | null,
      extensionHasSeqGap: false,
    };

    expect(applyPiExtensionSequence(state, { extensionInstanceId: 'new-instance', eventId: 1 })).toBe(true);
    expect(state).toEqual({
      lastExtensionInstanceId: 'new-instance',
      lastExtensionEventId: 1,
      extensionHasSeqGap: false,
    });
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
