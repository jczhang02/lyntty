import { describe, expect, it } from 'bun:test';

import { mapPiSessionHistoryPageToEnvelopes } from './runPiHistory';
import {
  planPiHistoryStartup,
  resolvePendingPiHistoryCoverage,
  selectPiHistoryPageRequest,
  shouldPauseManagedHistoryMirror,
} from './piHistoryCoverage';

function userEntries(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    type: 'message',
    id: `u${index + 1}`,
    parentId: index === 0 ? null : `u${index}`,
    timestamp: `2026-07-01T09:${String(index).padStart(2, '0')}:00.000Z`,
    message: { role: 'user', content: `message ${index + 1}` },
  })) as any[];
}

describe('planPiHistoryStartup', () => {
  it('completes exactly 50 entries without creating a progressive cursor', () => {
    const entries = userEntries(50);
    const latestPage = mapPiSessionHistoryPageToEnvelopes(entries, { limit: 50 });

    const plan = planPiHistoryStartup({ entries, latestPage });

    expect(plan.replayEnvelopes).toHaveLength(50);
    expect(plan.nextAppendCheckpointEntryId).toBe('u50');
    expect(plan.progressiveCoverage).toEqual({ cursor: undefined, hasMore: false });
  });

  it('models a new session as a confirmed latest tail plus a progressive lower bound', () => {
    const entries = userEntries(51);
    const latestPage = mapPiSessionHistoryPageToEnvelopes(entries, { limit: 50 });

    const plan = planPiHistoryStartup({
      entries,
      latestPage,
    });

    expect(plan.replayEnvelopes.map((envelope) => envelope.id)).toEqual(
      Array.from({ length: 50 }, (_, index) => `pi-history-u${index + 2}-user`),
    );
    expect(plan.nextAppendCheckpointEntryId).toBe('u51');
    expect(plan.boundedReplayStartEntryId).toBe('u2');
    expect(plan.progressiveCoverage).toEqual({ cursor: 'u2', hasMore: true });
    expect(plan.appendCheckpointMissing).toBe(false);
    expect(plan.progressiveCursorMissing).toBe(false);
  });

  it('restarts from the append checkpoint while preserving the progressive cursor', () => {
    const entries = userEntries(52);
    const latestPage = mapPiSessionHistoryPageToEnvelopes(entries, { limit: 50 });

    const plan = planPiHistoryStartup({
      entries,
      latestPage,
      appendCheckpointEntryId: 'u51',
      relayHistoryCursor: 'u2',
      relayHistoryHasMore: true,
    });

    expect(plan.replayEnvelopes.map((envelope) => envelope.id)).toEqual(['pi-history-u52-user']);
    expect(plan.nextAppendCheckpointEntryId).toBe('u52');
    expect(plan.progressiveCoverage).toEqual({ cursor: 'u2', hasMore: true });
  });

  it('does not recreate progressive history after coverage is complete', () => {
    const entries = userEntries(52);

    const plan = planPiHistoryStartup({
      entries,
      latestPage: mapPiSessionHistoryPageToEnvelopes(entries, { limit: 50 }),
      appendCheckpointEntryId: 'u52',
      relayHistoryCursor: 'u2',
      relayHistoryHasMore: false,
    });

    expect(plan.replayEnvelopes).toEqual([]);
    expect(plan.progressiveCoverage).toEqual({ cursor: undefined, hasMore: false });
  });

  it('bootstraps an explicitly virgin managed history from the bounded tail', () => {
    const entries = userEntries(51);
    const latestPage = mapPiSessionHistoryPageToEnvelopes(entries, { limit: 50 });

    const plan = planPiHistoryStartup({
      entries,
      latestPage,
      relayHistoryHasMore: true,
      allowUninitializedProgressiveHistory: true,
    });

    expect(plan.progressiveCursorMissing).toBe(false);
    expect(plan.progressiveCoverage).toEqual({ cursor: 'u2', hasMore: true });
  });

  it('fails closed when incomplete Relay metadata has no progressive cursor', () => {
    const entries = userEntries(51);

    const plan = planPiHistoryStartup({
      entries,
      latestPage: mapPiSessionHistoryPageToEnvelopes(entries, { limit: 50 }),
      relayHistoryHasMore: true,
    });

    expect(plan.progressiveCursorMissing).toBe(true);
    expect(plan.progressiveCoverage).toEqual({ cursor: undefined, hasMore: true });
  });

  it('keeps a cursor on an abandoned branch when planning from complete JSONL entries', () => {
    const entries = [
      ...userEntries(3),
      {
        type: 'message',
        id: 'branch-user',
        parentId: 'u1',
        timestamp: '2026-07-01T11:00:00.000Z',
        message: { role: 'user', content: 'abandoned branch' },
      },
    ] as any[];

    const plan = planPiHistoryStartup({
      entries,
      latestPage: mapPiSessionHistoryPageToEnvelopes(entries, { limit: 50 }),
      relayHistoryCursor: 'u2',
      relayHistoryHasMore: true,
    });

    expect(plan.progressiveCursorMissing).toBe(false);
    expect(plan.progressiveCoverage).toEqual({ cursor: 'u2', hasMore: true });
  });

  it('fails closed when the persisted progressive cursor disappeared locally', () => {
    const entries = userEntries(52);

    const plan = planPiHistoryStartup({
      entries,
      latestPage: mapPiSessionHistoryPageToEnvelopes(entries, { limit: 50 }),
      appendCheckpointEntryId: 'u51',
      relayHistoryCursor: 'missing',
      relayHistoryHasMore: true,
    });

    expect(plan.progressiveCursorMissing).toBe(true);
    expect(plan.progressiveCoverage).toEqual({ cursor: 'missing', hasMore: true });
  });

  it('fails closed and remains bounded when an append checkpoint disappeared', () => {
    const entries = userEntries(500);
    const latestPage = mapPiSessionHistoryPageToEnvelopes(entries, { limit: 50 });

    const plan = planPiHistoryStartup({
      entries,
      latestPage,
      appendCheckpointEntryId: 'missing',
      relayHistoryCursor: 'u451',
      relayHistoryHasMore: true,
    });

    expect(plan.appendCheckpointMissing).toBe(true);
    expect(plan.replayEnvelopes).toHaveLength(50);
    expect(plan.progressiveCoverage).toEqual({ cursor: 'u451', hasMore: true });
  });

  it('keeps no-checkpoint migration bounded even when Relay already has messages', () => {
    const entries = userEntries(500);
    const latestPage = mapPiSessionHistoryPageToEnvelopes(entries, { limit: 50 });

    const plan = planPiHistoryStartup({
      entries,
      latestPage,
    });

    expect(plan.replayEnvelopes).toHaveLength(50);
    expect(plan.replayEnvelopes[0]?.id).toBe('pi-history-u451-user');
    expect(plan.progressiveCoverage).toEqual({ cursor: 'u451', hasMore: true });
  });

  it('preserves an older Relay cursor during no-checkpoint migration', () => {
    const entries = userEntries(500);

    const plan = planPiHistoryStartup({
      entries,
      latestPage: mapPiSessionHistoryPageToEnvelopes(entries, { limit: 50 }),
      relayHistoryCursor: 'u101',
      // Older metadata may predate the explicit hasMore field.
    });

    expect(plan.replayEnvelopes).toHaveLength(50);
    expect(plan.progressiveCoverage).toEqual({ cursor: 'u101', hasMore: true });
  });
});

describe('shouldPauseManagedHistoryMirror', () => {
  it('keeps fallback polling paused until delayed agent-end reconciliation settles', () => {
    expect(shouldPauseManagedHistoryMirror({
      thinking: false,
      streaming: false,
      pendingReconciliations: 1,
    })).toBe(true);
    expect(shouldPauseManagedHistoryMirror({
      thinking: false,
      streaming: false,
      pendingReconciliations: 0,
    })).toBe(false);
  });
});

describe('resolvePendingPiHistoryCoverage', () => {
  const confirmed = { cursor: 'u101', hasMore: true } as const;
  const pending = { cursor: 'u51', hasMore: true } as const;

  it('adopts a pending transition after a late Relay broadcast confirms it', () => {
    expect(resolvePendingPiHistoryCoverage({
      confirmed,
      pending,
      synchronized: pending,
      requestedCursor: 'u51',
    })).toEqual({
      confirmed: pending,
      pending: null,
      retryPendingCommit: false,
    });
  });

  it('retries a pending metadata commit when the App already has its cursor', () => {
    expect(resolvePendingPiHistoryCoverage({
      confirmed,
      pending,
      synchronized: confirmed,
      requestedCursor: 'u51',
    })).toEqual({
      confirmed,
      pending,
      retryPendingCommit: true,
    });
  });

  it('does not let an unrelated stale cursor adopt a pending transition', () => {
    expect(resolvePendingPiHistoryCoverage({
      confirmed,
      pending,
      synchronized: confirmed,
      requestedCursor: 'u151',
    })).toEqual({
      confirmed,
      pending,
      retryPendingCommit: false,
    });
  });
});

describe('selectPiHistoryPageRequest', () => {
  const coverage = { cursor: 'u2', hasMore: true } as const;

  it('loads only the authoritative progressive cursor', () => {
    expect(selectPiHistoryPageRequest(coverage, 'u2')).toEqual({ type: 'load', beforeEntryId: 'u2' });
    expect(selectPiHistoryPageRequest(coverage, undefined)).toEqual({ type: 'load', beforeEntryId: 'u2' });
  });

  it('loads the omitted first entry from a 51-entry startup tail', () => {
    const entries = userEntries(51);
    const latestPage = mapPiSessionHistoryPageToEnvelopes(entries, { limit: 50 });
    const plan = planPiHistoryStartup({ entries, latestPage });
    const request = selectPiHistoryPageRequest(plan.progressiveCoverage, 'u2');

    expect(request).toEqual({ type: 'load', beforeEntryId: 'u2' });
    if (request.type !== 'load') {
      throw new Error('expected a load request');
    }
    const olderPage = mapPiSessionHistoryPageToEnvelopes(entries, {
      beforeEntryId: request.beforeEntryId,
      limit: 50,
    });
    expect(olderPage.envelopes.map((envelope) => envelope.id)).toEqual(['pi-history-u1-user']);
    expect({ cursor: olderPage.nextCursor, hasMore: olderPage.hasMore }).toEqual({
      cursor: undefined,
      hasMore: false,
    });
  });

  it('turns stale or arbitrary cursors into a safe no-op', () => {
    expect(selectPiHistoryPageRequest(coverage, 'u3')).toEqual({
      type: 'noop',
      nextCursor: 'u2',
      hasMore: true,
    });
  });

  it('does not reopen completed progressive history', () => {
    expect(selectPiHistoryPageRequest({ cursor: undefined, hasMore: false }, 'u2')).toEqual({
      type: 'noop',
      nextCursor: undefined,
      hasMore: false,
    });
  });
});
