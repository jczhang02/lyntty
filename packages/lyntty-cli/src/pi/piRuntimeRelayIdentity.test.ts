import { describe, expect, it, mock, spyOn, jest } from 'bun:test';

import { resolvePiRelaySessionTag } from './piRelaySessionTag';
import { createPiRuntimeRelayIdentity } from './piRuntimeRelayIdentity';

describe('createPiRuntimeRelayIdentity', () => {
  it('derives the relay tag from the actual newly-created Pi session id', async () => {
    const createRuntime = mock(async () => ({ session: { sessionId: 'actual-pi-session' } }));

    const result = await createPiRuntimeRelayIdentity({
      machineId: 'machine-1',
      cwd: '/repo',
      requestedPiSessionId: undefined,
      createRuntime,
    });

    expect(createRuntime).toHaveBeenCalledWith('/repo', undefined);
    expect(result.sessionTag).toBe(resolvePiRelaySessionTag('machine-1', 'actual-pi-session'));
    expect(result.piRuntime.session.sessionId).toBe('actual-pi-session');
  });
});
