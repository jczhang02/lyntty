import { describe, expect, it } from 'vitest';

import { startDaemonControlServer } from './controlServer';

const noopSessionWebhook = () => undefined;

describe('daemon control server Pi extension endpoints', () => {
  const authHeaders = { 'Content-Type': 'application/json', 'X-Lyntty-Extension-Token': 'secret-token' };

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
      piExtensionToken: 'secret-token',
    });

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/pi-extension/event`, {
        method: 'POST',
        headers: authHeaders,
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

  it('serves whitelisted remote commands and accepts extension acks', async () => {
    const acked: unknown[] = [];
    const server = await startDaemonControlServer({
      getChildren: () => [],
      stopSession: () => false,
      spawnSession: async () => ({ type: 'error', errorMessage: 'not used' }),
      requestShutdown: () => undefined,
      onLynttySessionWebhook: noopSessionWebhook,
      pollPiExtensionCommands: async (session, afterSeq) => ({
        status: 'ok',
        commands: session.piSessionId === 'pi-1' && afterSeq < 7
          ? [{ seq: 7, deliveryToken: 'lease-7', command: { type: 'invoke_pi_command', commandLine: '/skill:coding-standards' } }]
          : [],
      }),
      onPiExtensionCommandAck: async (session, ack) => {
        acked.push({ session, ack });
        return { status: 'ok' };
      },
      piExtensionToken: 'secret-token',
    });

    try {
      const commandResponse = await fetch(`http://127.0.0.1:${server.port}/pi-extension/commands`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ session: { piSessionId: 'pi-1' }, afterSeq: 0 }),
      });
      expect(commandResponse.status).toBe(200);
      expect(await commandResponse.json()).toEqual({
        status: 'ok',
        commands: [{ seq: 7, deliveryToken: 'lease-7', command: { type: 'invoke_pi_command', commandLine: '/skill:coding-standards' } }],
      });

      const ackResponse = await fetch(`http://127.0.0.1:${server.port}/pi-extension/command-ack`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          session: { piSessionId: 'pi-1' },
          ack: {
            seq: 7,
            deliveryToken: 'lease-7',
            status: 'accepted_by_pi',
            commands: [{ name: 'skill:coding-standards', source: 'skill', description: 'coding standards' }],
          },
        }),
      });
      expect(ackResponse.status).toBe(200);
      expect(await ackResponse.json()).toEqual({ status: 'ok' });
      expect(acked).toEqual([{ session: { piSessionId: 'pi-1' }, ack: { seq: 7, deliveryToken: 'lease-7', status: 'accepted_by_pi', commands: [{ name: 'skill:coding-standards', source: 'skill', description: 'coding standards' }] } }]);
    } finally {
      await server.stop();
    }
  });

  it('rejects unauthenticated local Pi extension command access when a daemon token is configured', async () => {
    let polled = false;
    const server = await startDaemonControlServer({
      getChildren: () => [],
      stopSession: () => false,
      spawnSession: async () => ({ type: 'error', errorMessage: 'not used' }),
      requestShutdown: () => undefined,
      onLynttySessionWebhook: noopSessionWebhook,
      pollPiExtensionCommands: async () => {
        polled = true;
        return { status: 'ok', commands: [] };
      },
      piExtensionToken: 'secret-token',
    });

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/pi-extension/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: { piSessionId: 'pi-1' }, afterSeq: 0 }),
      });

      expect(response.status).toBe(401);
      expect(polled).toBe(false);
    } finally {
      await server.stop();
    }
  });
});
