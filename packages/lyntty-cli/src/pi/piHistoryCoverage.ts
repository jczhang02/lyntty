import type { SessionEntry } from '@earendil-works/pi-coding-agent';
import type { SessionEnvelope } from 'lyntty-wire';

import {
  mapPiSessionHistoryToEnvelopeGroups,
  type PiHistoryPage,
} from './runPiHistory';

export type PiProgressiveHistoryCoverage = {
  cursor?: string;
  hasMore: boolean;
};

export type PiHistoryStartupPlan = {
  replayEnvelopes: SessionEnvelope[];
  nextAppendCheckpointEntryId?: string;
  boundedReplayStartEntryId?: string;
  progressiveCoverage: PiProgressiveHistoryCoverage;
  appendCheckpointMissing: boolean;
  progressiveCursorMissing: boolean;
};

function resolveProgressiveCoverage(options: {
  entries: SessionEntry[];
  latestPage: PiHistoryPage;
  relayHistoryCursor?: string;
  relayHistoryHasMore?: boolean;
  allowUninitializedProgressiveHistory?: boolean;
}): { coverage: PiProgressiveHistoryCoverage; cursorMissing: boolean } {
  if (options.relayHistoryHasMore === false) {
    return {
      coverage: { cursor: undefined, hasMore: false },
      cursorMissing: false,
    };
  }

  if (
    options.relayHistoryHasMore === true || !!options.relayHistoryCursor
  ) {
    const cursor = options.relayHistoryCursor;
    if (!cursor && options.allowUninitializedProgressiveHistory) {
      return {
        coverage: {
          cursor: options.latestPage.nextCursor,
          hasMore: options.latestPage.hasMore,
        },
        cursorMissing: false,
      };
    }
    return {
      coverage: { cursor, hasMore: true },
      cursorMissing: !cursor || !options.entries.some((entry) => entry.id === cursor),
    };
  }

  return {
    coverage: {
      cursor: options.latestPage.nextCursor,
      hasMore: options.latestPage.hasMore,
    },
    cursorMissing: options.latestPage.hasMore && !options.latestPage.nextCursor,
  };
}

export function planPiHistoryStartup(options: {
  entries: SessionEntry[];
  latestPage: PiHistoryPage;
  appendCheckpointEntryId?: string | null;
  relayHistoryCursor?: string;
  relayHistoryHasMore?: boolean;
  allowUninitializedProgressiveHistory?: boolean;
}): PiHistoryStartupPlan {
  let appendCheckpointMissing = false;
  let replayEnvelopes = options.latestPage.envelopes;
  if (options.appendCheckpointEntryId) {
    const groups = mapPiSessionHistoryToEnvelopeGroups(options.entries);
    const appendCheckpointIndex = groups.findIndex((group) => group.entryId === options.appendCheckpointEntryId);
    appendCheckpointMissing = appendCheckpointIndex < 0;
    if (appendCheckpointIndex >= 0) {
      replayEnvelopes = groups.slice(appendCheckpointIndex + 1).flatMap((group) => group.envelopes);
    }
  }
  const progressive = resolveProgressiveCoverage(options);

  return {
    replayEnvelopes,
    nextAppendCheckpointEntryId: options.entries.at(-1)?.id,
    boundedReplayStartEntryId: options.latestPage.startEntryId ?? options.entries.at(-1)?.id,
    progressiveCoverage: progressive.coverage,
    appendCheckpointMissing,
    progressiveCursorMissing: progressive.cursorMissing,
  };
}

export function shouldPauseManagedHistoryMirror(options: {
  thinking: boolean;
  streaming: boolean;
  pendingReconciliations: number;
}): boolean {
  return options.thinking || options.streaming || options.pendingReconciliations > 0;
}

export function resolvePendingPiHistoryCoverage(options: {
  confirmed: PiProgressiveHistoryCoverage;
  pending: PiProgressiveHistoryCoverage | null;
  synchronized?: PiProgressiveHistoryCoverage;
  requestedCursor?: string;
}): {
  confirmed: PiProgressiveHistoryCoverage;
  pending: PiProgressiveHistoryCoverage | null;
  retryPendingCommit: boolean;
} {
  if (!options.pending) {
    return {
      confirmed: options.confirmed,
      pending: null,
      retryPendingCommit: false,
    };
  }
  if (
    options.synchronized
    && options.synchronized.cursor === options.pending.cursor
    && options.synchronized.hasMore === options.pending.hasMore
  ) {
    return {
      confirmed: options.pending,
      pending: null,
      retryPendingCommit: false,
    };
  }
  return {
    confirmed: options.confirmed,
    pending: options.pending,
    retryPendingCommit: options.requestedCursor === options.pending.cursor,
  };
}

export function selectPiHistoryPageRequest(
  coverage: PiProgressiveHistoryCoverage,
  requestedCursor?: string,
):
  | { type: 'load'; beforeEntryId: string }
  | { type: 'noop'; nextCursor?: string; hasMore: boolean } {
  if (!coverage.hasMore) {
    return {
      type: 'noop',
      nextCursor: coverage.cursor,
      hasMore: false,
    };
  }
  if (!coverage.cursor) {
    return {
      type: 'noop',
      nextCursor: undefined,
      hasMore: true,
    };
  }
  if (requestedCursor && requestedCursor !== coverage.cursor) {
    return {
      type: 'noop',
      nextCursor: coverage.cursor,
      hasMore: coverage.hasMore,
    };
  }
  return { type: 'load', beforeEntryId: coverage.cursor };
}
