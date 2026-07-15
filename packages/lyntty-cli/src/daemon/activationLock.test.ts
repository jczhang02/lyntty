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
      lynttySessionMetadataFromLocalWebhook: { machineId: 'machine-1', piSessionId: 'pi-session-1' } as any,
    });
    expect(resolveActivePiSessionReuse('pi-session-1', [session], 'machine-1')?.lynttySessionId).toBe('relay-session-1');
  });

  it('does not reuse a different Pi session id or machine id', () => {
    const session = activePiSession({
      lynttySessionId: 'relay-session-1',
      lynttySessionMetadataFromLocalWebhook: { machineId: 'machine-1', piSessionId: 'pi-session-1' } as any,
    });
    expect(resolveActivePiSessionReuse('pi-session-2', [session], 'machine-1')).toBeNull();
    expect(resolveActivePiSessionReuse('pi-session-1', [session], 'machine-2')).toBeNull();
  });
});

describe('resolvePiActivationLock', () => {
  it('allows first Pi runtime for a directory', () => {
    expect(resolvePiActivationLock({ directory: '/repo', agent: 'pi' }, [])).toEqual({ type: 'allow' });
  });

  it('uses the Pi session lease before falling back to directory locks', () => {
    const active = activePiSession({
      lynttySessionMetadataFromLocalWebhook: { machineId: 'machine-1', piSessionId: 'pi-session-1' } as any,
    });

    expect(resolvePiActivationLock({ directory: '/repo', machineId: 'machine-1', sessionId: 'pi-session-2', agent: 'pi' }, [active])).toEqual({ type: 'allow' });
    expect(resolvePiActivationLock({ directory: '/repo', machineId: 'machine-1', sessionId: 'pi-session-1', agent: 'pi' }, [active])).toEqual({
      type: 'blocked',
      activeSessionId: 'ses-active',
      activePid: 123,
      errorMessage: 'active runtime already holds lease for machine-1:pi-session-1; choose stop or interrupt to take over',
    });
  });

  it('defaults an omitted agent to Pi at the daemon spawn boundary', () => {
    expect(resolvePiActivationLock({ directory: '/repo' }, [activePiSession()])).toMatchObject({
      type: 'blocked',
      activePid: 123,
    });
  });

  it('requires takeover when a new Pi runtime without session id already owns the directory', () => {
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

  it('returns a wait lease that the daemon can hold until the active runtime exits', () => {
    expect(resolvePiActivationLock({ directory: '/repo', agent: 'pi', takeoverChoice: 'wait' }, [activePiSession()])).toEqual({
      type: 'wait',
      activeSessionId: 'ses-active',
      activePid: 123,
    });
  });
});
