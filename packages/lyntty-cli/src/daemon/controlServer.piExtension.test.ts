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
          ? [{ seq: 7, deliveryToken: 'lease-7', localKey: 'mobile-local-7', mobileContext: true, command: { type: 'invoke_pi_command', commandLine: '/skill:coding-standards' } }]
          : session.piSessionId === 'pi-stop' && afterSeq < 9
            ? [{ seq: 9, deliveryToken: 'lease-9', localKey: 'archive-stop-9', mobileContext: false, command: { type: 'internal_shutdown' } }]
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
        commands: [{ seq: 7, deliveryToken: 'lease-7', localKey: 'mobile-local-7', mobileContext: true, command: { type: 'invoke_pi_command', commandLine: '/skill:coding-standards' } }],
      });

      const shutdownResponse = await fetch(`http://127.0.0.1:${server.port}/pi-extension/commands`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ session: { piSessionId: 'pi-stop' }, afterSeq: 0 }),
      });
      expect(shutdownResponse.status).toBe(200);
      expect(await shutdownResponse.json()).toEqual({
        status: 'ok',
        commands: [{ seq: 9, deliveryToken: 'lease-9', localKey: 'archive-stop-9', mobileContext: false, command: { type: 'internal_shutdown' } }],
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

  it('rejects unauthenticated access to every daemon control endpoint', async () => {
    let calls = 0;
    const server = await startDaemonControlServer({
      getChildren: () => {
        calls += 1;
        return [];
      },
      stopSession: () => {
        calls += 1;
        return false;
      },
      spawnSession: async () => {
        calls += 1;
        return { type: 'error', errorMessage: 'not used' };
      },
      requestShutdown: () => {
        calls += 1;
      },
      onLynttySessionWebhook: () => {
        calls += 1;
      },
      piExtensionToken: 'secret-token',
    });

    const requests = [
      ['/session-started', { sessionId: 'relay-1', metadata: {} }],
      ['/pi-extension/status', {}],
      ['/pi-extension/event', { session: { piSessionId: 'pi-1' }, event: { type: 'agent_start' } }],
      ['/pi-extension/commands', { session: { piSessionId: 'pi-1' }, afterSeq: 0 }],
      ['/pi-extension/command-ack', { session: { piSessionId: 'pi-1' }, ack: { seq: 1, status: 'accepted_by_pi' } }],
      ['/list', {}],
      ['/stop-session', { sessionId: 'relay-1' }],
      ['/spawn-session', { directory: '/tmp/project', agent: 'pi' }],
      ['/stop', {}],
    ] as const;

    try {
      for (const [path, body] of requests) {
        const response = await fetch(`http://127.0.0.1:${server.port}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        expect(response.status, path).toBe(401);
      }
      const malformedResponse = await fetch(`http://127.0.0.1:${server.port}/spawn-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      });
      expect(malformedResponse.status).toBe(401);
      expect(calls).toBe(0);
    } finally {
      await server.stop();
    }
  });

  it('rejects dangerous environment variables before spawning a session', async () => {
    let spawned = false;
    const server = await startDaemonControlServer({
      getChildren: () => [],
      stopSession: () => false,
      spawnSession: async () => {
        spawned = true;
        return { type: 'error', errorMessage: 'not used' };
      },
      requestShutdown: () => undefined,
      onLynttySessionWebhook: noopSessionWebhook,
      piExtensionToken: 'secret-token',
    });

    try {
      for (const environmentVariables of [
        { NODE_OPTIONS: '--require /tmp/attacker.cjs' },
        { PATH: '/tmp/attacker-bin' },
        { node_options: '--require /tmp/attacker.cjs' },
        { lyntty_home_dir: '/tmp/attacker-home' },
      ]) {
        const response = await fetch(`http://127.0.0.1:${server.port}/spawn-session`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ directory: '/tmp/project', agent: 'pi', environmentVariables }),
        });

        expect(response.status, Object.keys(environmentVariables)[0]).toBe(400);
      }
      expect(spawned).toBe(false);
    } finally {
      await server.stop();
    }
  });
});
