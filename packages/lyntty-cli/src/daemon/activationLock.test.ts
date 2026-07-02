import { describe, expect, it } from 'vitest';

import { resolveActivePiSessionReuse, resolvePiActivationLock } from './activationLock';
import type { TrackedSession } from './types';

const activePiSession = (overrides: Partial<TrackedSession> = {}): TrackedSession => ({
  startedBy: 'daemon',
  lynttySessionId: 'ses-active',
  pid: 123,
  directory: '/repo',
  agent: 'pi',
  ...overrides,
});

describe('resolveActivePiSessionReuse', () => {
  it('reuses an active runtime for the same Pi session id', () => {
    const session = activePiSession({
      lynttySessionId: 'relay-session-1',
      lynttySessionMetadataFromLocalWebhook: { piSessionId: 'pi-session-1' } as any,
    });
    expect(resolveActivePiSessionReuse('pi-session-1', [session])?.lynttySessionId).toBe('relay-session-1');
  });

  it('does not reuse a different Pi session id', () => {
    const session = activePiSession({
      lynttySessionId: 'relay-session-1',
      lynttySessionMetadataFromLocalWebhook: { piSessionId: 'pi-session-1' } as any,
    });
    expect(resolveActivePiSessionReuse('pi-session-2', [session])).toBeNull();
  });
});

describe('resolvePiActivationLock', () => {
  it('allows first Pi runtime for a directory', () => {
    expect(resolvePiActivationLock({ directory: '/repo', agent: 'pi' }, [])).toEqual({ type: 'allow' });
  });

  it('ignores non-Pi sessions in the same directory', () => {
    expect(resolvePiActivationLock({ directory: '/repo', agent: 'pi' }, [activePiSession({ agent: 'codex' })])).toEqual({ type: 'allow' });
  });

  it('requires takeover when an active Pi runtime already owns the directory', () => {
    expect(resolvePiActivationLock({ directory: '/repo', agent: 'pi' }, [activePiSession()])).toEqual({
      type: 'blocked',
      activeSessionId: 'ses-active',
      activePid: 123,
      errorMessage: 'active runtime already holds lease for /repo; choose stop or interrupt to take over',
    });
  });

  it('allows takeover with stop or interrupt', () => {
    expect(resolvePiActivationLock({ directory: '/repo', agent: 'pi', takeoverChoice: 'stop' }, [activePiSession()])).toEqual({
      type: 'takeover',
      activeSessionId: 'ses-active',
      activePid: 123,
      choice: 'stop',
    });

    expect(resolvePiActivationLock({ directory: '/repo', agent: 'pi', takeoverChoice: 'interrupt' }, [activePiSession()])).toEqual({
      type: 'takeover',
      activeSessionId: 'ses-active',
      activePid: 123,
      choice: 'interrupt',
    });
  });

  it('reports wait as unsupported queue semantics for now', () => {
    expect(resolvePiActivationLock({ directory: '/repo', agent: 'pi', takeoverChoice: 'wait' }, [activePiSession()])).toEqual({
      type: 'blocked',
      activeSessionId: 'ses-active',
      activePid: 123,
      errorMessage: 'active runtime already holds lease for /repo; wait queue is not implemented yet',
    });
  });
});
