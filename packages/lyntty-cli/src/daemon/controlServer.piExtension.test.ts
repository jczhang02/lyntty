import { describe, expect, it } from 'vitest';

import { startDaemonControlServer } from './controlServer';

const noopSessionWebhook = () => undefined;

describe('daemon control server Pi extension endpoints', () => {
  it('accepts local Pi extension events and forwards them to the daemon handler', async () => {
    const received: unknown[] = [];
    const server = await startDaemonControlServer({
      getChildren: () => [],
      stopSession: () => false,
      spawnSession: async () => ({ type: 'error', errorMessage: 'not used' }),
      requestShutdown: () => undefined,
      onLynttySessionWebhook: noopSessionWebhook,
      onPiExtensionEvent: async (payload) => {
        received.push(payload);
        return { status: 'ok', sessionId: 'relay-1' };
      },
    });

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/pi-extension/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: { piSessionId: 'pi-1', cwd: '/tmp/project', name: 'Current Pi' },
          event: { type: 'agent_start' },
          timestamp: 123,
        }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: 'ok', sessionId: 'relay-1' });
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        session: { piSessionId: 'pi-1', cwd: '/tmp/project', name: 'Current Pi' },
        event: { type: 'agent_start' },
      });
    } finally {
      await server.stop();
    }
  });
});
