import { describe, expect, it } from 'bun:test';
import { CURRENT_WIRE_OFFER } from 'lyntty-wire';
import { createCliSocketAuth } from './wireAuth';

describe('CLI Socket.IO Wire identity', () => {
  it('adds one canonical current offer to every scoped auth shape', () => {
    for (const clientName of ['cli-daemon', 'cli-coding-session', 'cli-remote', 'cli-remote-session'] as const) {
      const auth = createCliSocketAuth({ token: 'token', clientType: 'user-scoped' }, clientName);
      expect(auth).toMatchObject({
        token: 'token',
        clientType: 'user-scoped',
        lynttyClient: expect.stringMatching(new RegExp(`^${clientName}/`)),
        wire: CURRENT_WIRE_OFFER,
        component: { kind: 'cli', version: expect.any(String) },
      });
    }
  });
});
