import { describe, expect, it, mock } from 'bun:test';

import { SessionOutboxConflictError, type SessionProtocolEnvelopeStatus } from '@/api/apiSession';
import { reconcilePiCanonicalHistory, reconcilePiHistoryEnvelopes } from './reconcilePiHistory';
import { mapPiSessionHistoryToEnvelopes } from './runPiHistory';

const entries = [
  { type: 'message', id: 'u1', parentId: null, timestamp: '2026-07-01T09:00:00.000Z', message: { role: 'user', content: 'one' } },
  { type: 'message', id: 'u2', parentId: 'u1', timestamp: '2026-07-01T09:00:01.000Z', message: { role: 'user', content: 'two' } },
  { type: 'message', id: 'u3', parentId: 'u2', timestamp: '2026-07-01T09:00:02.000Z', message: { role: 'user', content: 'three' } },
] as any[];

function envelopeId(entryId: string): string {
  return `pi-history-${entryId}-user`;
}

describe('reconcilePiCanonicalHistory', () => {
  it('sends missing entries after a true conflict and keeps a contiguous append checkpoint', async () => {
    const statuses = new Map<string, SessionProtocolEnvelopeStatus>([
      [envelopeId('u1'), 'matching'],
      [envelopeId('u2'), 'conflict'],
      [envelopeId('u3'), 'missing'],
    ]);
    const sent: string[] = [];
    const client = {
      syncExistingSessionProtocolEnvelopeIds: mock(async () => undefined),
      getSessionProtocolEnvelopeStatus: (envelope: { id: string }) => statuses.get(envelope.id) ?? 'missing',
      sendSessionProtocolMessage: (envelope: { id: string }) => sent.push(envelope.id),
      flushConfirmed: mock(async () => {
        statuses.set(envelopeId('u3'), 'matching');
      }),
    };

    const result = await reconcilePiCanonicalHistory({
      entries,
      client,
      isEntryRelayConfirmed: () => false,
    });

    expect(sent).toEqual([envelopeId('u3')]);
    expect(result.conflicting.map((envelope) => envelope.id)).toEqual([envelopeId('u2')]);
    expect(result.missing).toEqual([]);
    expect(result.contiguousAppendCheckpointEntryId).toBe('u1');
  });

  it('reconciles restart replay from Relay inventory without re-encrypting', async () => {
    const statuses = new Map<string, SessionProtocolEnvelopeStatus>();
    const client = {
      syncExistingSessionProtocolEnvelopeIds: mock(async () => {
        for (const entry of entries) statuses.set(envelopeId(entry.id), 'matching');
      }),
      getSessionProtocolEnvelopeStatus: (envelope: { id: string }) => statuses.get(envelope.id) ?? 'missing',
      sendSessionProtocolMessage: mock(),
      flushConfirmed: mock(async () => undefined),
    };

    const result = await reconcilePiCanonicalHistory({
      entries,
      client,
      isEntryRelayConfirmed: () => false,
    });

    expect(client.sendSessionProtocolMessage).not.toHaveBeenCalled();
    expect(client.flushConfirmed).not.toHaveBeenCalled();
    expect(result.contiguousAppendCheckpointEntryId).toBe('u3');
  });

  it('does not duplicate managed live entries marked Relay-confirmed after flush', async () => {
    const client = {
      syncExistingSessionProtocolEnvelopeIds: mock(async () => undefined),
      getSessionProtocolEnvelopeStatus: () => 'missing' as const,
      sendSessionProtocolMessage: mock(),
      flushConfirmed: mock(async () => undefined),
    };

    const result = await reconcilePiCanonicalHistory({
      entries,
      afterEntryId: 'u1',
      client,
      isEntryRelayConfirmed: (entryId) => entryId === 'u2' || entryId === 'u3',
    });

    expect(client.sendSessionProtocolMessage).not.toHaveBeenCalled();
    expect(client.syncExistingSessionProtocolEnvelopeIds).not.toHaveBeenCalled();
    expect(result.matching.map((envelope) => envelope.id)).toEqual([
      envelopeId('u2'),
      envelopeId('u3'),
    ]);
    expect(result.contiguousAppendCheckpointEntryId).toBe('u3');
  });

  it('maps a post-checkpoint tool result with full canonical turn context', async () => {
    const toolEntries = [
      {
        type: 'message',
        id: 'a1',
        parentId: 'u1',
        timestamp: '2026-07-01T09:00:01.000Z',
        message: {
          role: 'assistant',
          content: [{ type: 'toolCall', id: 'call-1', name: 'read', arguments: { path: 'a.ts' } }],
        },
      },
      {
        type: 'message',
        id: 't1',
        parentId: 'a1',
        timestamp: '2026-07-01T09:00:02.000Z',
        message: { role: 'toolResult', toolCallId: 'call-1', toolName: 'read', content: 'ok' },
      },
    ] as any[];
    const canonical = mapPiSessionHistoryToEnvelopes(toolEntries);
    const statuses = new Map(canonical.map((envelope) => [envelope.id, 'matching' as const]));
    const client = {
      syncExistingSessionProtocolEnvelopeIds: mock(async () => undefined),
      getSessionProtocolEnvelopeStatus: (envelope: { id: string }) => statuses.get(envelope.id) ?? 'missing',
      sendSessionProtocolMessage: mock(),
      flushConfirmed: mock(async () => undefined),
    };

    const result = await reconcilePiCanonicalHistory({
      entries: toolEntries,
      afterEntryId: 'a1',
      client,
      isEntryRelayConfirmed: () => false,
    });

    expect(client.sendSessionProtocolMessage).not.toHaveBeenCalled();
    expect(result.matching.map((envelope) => envelope.id)).toEqual([
      'pi-history-t1-tool-end',
      'pi-history-t1-end',
    ]);
    expect(result.contiguousAppendCheckpointEntryId).toBe('t1');
  });

  it('reconciles a bounded progressive tail when no append checkpoint exists yet', async () => {
    const statuses = new Map<string, SessionProtocolEnvelopeStatus>([
      [envelopeId('u2'), 'matching'],
      [envelopeId('u3'), 'matching'],
    ]);
    const client = {
      syncExistingSessionProtocolEnvelopeIds: mock(async () => undefined),
      getSessionProtocolEnvelopeStatus: (envelope: { id: string }) => statuses.get(envelope.id) ?? 'missing',
      sendSessionProtocolMessage: mock(),
      flushConfirmed: mock(async () => undefined),
    };

    const result = await reconcilePiCanonicalHistory({
      entries,
      startAtEntryId: 'u2',
      client,
      isEntryRelayConfirmed: () => false,
    });

    expect(result.matching.map((envelope) => envelope.id)).toEqual([envelopeId('u2'), envelopeId('u3')]);
    expect(client.sendSessionProtocolMessage).not.toHaveBeenCalled();
    expect(result.contiguousAppendCheckpointEntryId).toBe('u3');
  });

  it('fails closed instead of replaying all history when a bounded start entry is missing', async () => {
    const client = {
      syncExistingSessionProtocolEnvelopeIds: mock(async () => undefined),
      getSessionProtocolEnvelopeStatus: () => 'missing' as const,
      sendSessionProtocolMessage: mock(),
      flushConfirmed: mock(async () => undefined),
    };

    const result = await reconcilePiCanonicalHistory({
      entries,
      startAtEntryId: 'missing',
      client,
      isEntryRelayConfirmed: () => false,
    });

    expect(result.startEntryMissing).toBe(true);
    expect(result.sent).toBe(0);
    expect(client.sendSessionProtocolMessage).not.toHaveBeenCalled();
  });

  it('reports a post-inventory conflict while still confirming later envelopes', async () => {
    const statuses = new Map<string, SessionProtocolEnvelopeStatus>();
    const sent: string[] = [];
    const client = {
      syncExistingSessionProtocolEnvelopeIds: mock(async () => undefined),
      getSessionProtocolEnvelopeStatus: (envelope: { id: string }) => statuses.get(envelope.id) ?? 'missing',
      sendSessionProtocolMessage: (envelope: { id: string }) => sent.push(envelope.id),
      flushConfirmed: mock(async () => {
        statuses.set(envelopeId('u1'), 'conflict');
        statuses.set(envelopeId('u2'), 'matching');
        statuses.set(envelopeId('u3'), 'matching');
        throw new SessionOutboxConflictError([`session:${envelopeId('u1')}`]);
      }),
    };

    const result = await reconcilePiCanonicalHistory({
      entries,
      client,
      isEntryRelayConfirmed: () => false,
    });

    expect(sent).toEqual(entries.map((entry) => envelopeId(entry.id)));
    expect(result.conflicting.map((envelope) => envelope.id)).toEqual([envelopeId('u1')]);
    expect(result.missing).toEqual([]);
    expect(result.contiguousAppendCheckpointEntryId).toBeUndefined();
  });
});

describe('reconcilePiHistoryEnvelopes', () => {
  it('turns a race-time conflict into an explicit result after sending later page envelopes', async () => {
    const envelopes = mapPiSessionHistoryToEnvelopes(entries.slice(0, 2));
    const statuses = new Map<string, SessionProtocolEnvelopeStatus>();
    const sent: string[] = [];
    const client = {
      syncExistingSessionProtocolEnvelopeIds: mock(async () => undefined),
      getSessionProtocolEnvelopeStatus: (envelope: { id: string }) => statuses.get(envelope.id) ?? 'missing',
      sendSessionProtocolMessage: (envelope: { id: string }) => sent.push(envelope.id),
      flushConfirmed: mock()
        .mockResolvedValueOnce(undefined)
        .mockImplementationOnce(async () => {
          statuses.set(envelopes[0].id, 'conflict');
          statuses.set(envelopes[1].id, 'matching');
          throw new SessionOutboxConflictError([`session:${envelopes[0].id}`]);
        }),
    };

    const result = await reconcilePiHistoryEnvelopes({ envelopes, client });

    expect(sent).toEqual(envelopes.map((envelope) => envelope.id));
    expect(result.conflicting.map((envelope) => envelope.id)).toEqual([envelopes[0].id]);
    expect(result.missing).toEqual([]);
  });
});
