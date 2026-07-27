import type { SessionEntry } from '@earendil-works/pi-coding-agent';
import type { SessionEnvelope } from 'lyntty-wire';

import {
  SessionOutboxConflictError,
  type SessionProtocolEnvelopeStatus,
} from '@/api/apiSession';
import {
  analyzePiHistoryEnvelopeGroups,
  mapPiSessionHistoryToEnvelopeGroups,
  partitionPiHistoryEnvelopes,
} from './runPiHistory';

type PiHistoryReconciliationClient = {
  syncExistingSessionProtocolEnvelopeIds: () => Promise<void>;
  getSessionProtocolEnvelopeStatus: (envelope: SessionEnvelope) => SessionProtocolEnvelopeStatus;
  sendSessionProtocolMessage: (envelope: SessionEnvelope) => void;
  flushConfirmed: () => Promise<void>;
};

export async function reconcilePiHistoryEnvelopes(options: {
  envelopes: SessionEnvelope[];
  client: PiHistoryReconciliationClient;
}): Promise<{
  missing: SessionEnvelope[];
  matching: SessionEnvelope[];
  conflicting: SessionEnvelope[];
  sent: number;
  outboxConflictLocalIds: string[];
}> {
  const canonicalLocalIds = new Set(
    options.envelopes.map((envelope) => `session:${envelope.id}`),
  );
  let outboxConflictLocalIds: string[] = [];
  try {
    await options.client.flushConfirmed();
  } catch (error) {
    if (!(error instanceof SessionOutboxConflictError)) throw error;
    outboxConflictLocalIds = error.localIds.filter((localId) => canonicalLocalIds.has(localId));
    if (outboxConflictLocalIds.length === 0) throw error;
  }
  await options.client.syncExistingSessionProtocolEnvelopeIds();
  const initial = partitionPiHistoryEnvelopes(
    options.envelopes,
    (envelope) => options.client.getSessionProtocolEnvelopeStatus(envelope),
  );
  for (const envelope of initial.missing) {
    options.client.sendSessionProtocolMessage(envelope);
  }

  if (initial.missing.length > 0) {
    try {
      await options.client.flushConfirmed();
    } catch (error) {
      if (!(error instanceof SessionOutboxConflictError)) throw error;
      const relevantLocalIds = error.localIds.filter((localId) => canonicalLocalIds.has(localId));
      if (relevantLocalIds.length === 0) throw error;
      outboxConflictLocalIds = [...new Set([...outboxConflictLocalIds, ...relevantLocalIds])];
    }
  }

  return {
    ...partitionPiHistoryEnvelopes(
      options.envelopes,
      (envelope) => options.client.getSessionProtocolEnvelopeStatus(envelope),
    ),
    sent: initial.missing.length,
    outboxConflictLocalIds,
  };
}

export async function reconcilePiCanonicalHistory(options: {
  entries: SessionEntry[];
  afterEntryId?: string;
  startAtEntryId?: string;
  client: PiHistoryReconciliationClient;
  isEntryRelayConfirmed: (entryId: string) => boolean;
  allowRelayConfirmedEntries?: boolean;
}): Promise<{
  missing: SessionEnvelope[];
  matching: SessionEnvelope[];
  conflicting: SessionEnvelope[];
  contiguousAppendCheckpointEntryId?: string;
  afterEntryMissing: boolean;
  startEntryMissing: boolean;
  sent: number;
  outboxConflictLocalIds: string[];
}> {
  const canonicalGroups = mapPiSessionHistoryToEnvelopeGroups(options.entries);
  const afterEntryIndex = options.afterEntryId
    ? canonicalGroups.findIndex((group) => group.entryId === options.afterEntryId)
    : -1;
  const startAtEntryIndex = options.startAtEntryId
    ? canonicalGroups.findIndex((group) => group.entryId === options.startAtEntryId)
    : -1;
  const afterEntryMissing = !!options.afterEntryId && afterEntryIndex < 0;
  const startEntryMissing = !!options.startAtEntryId && startAtEntryIndex < 0;
  const groups = afterEntryMissing || startEntryMissing
    ? []
    : options.afterEntryId
      ? canonicalGroups.slice(afterEntryIndex + 1)
      : options.startAtEntryId
        ? canonicalGroups.slice(startAtEntryIndex)
        : canonicalGroups;
  const allowRelayConfirmedEntries = options.allowRelayConfirmedEntries !== false;
  const relayConfirmedEnvelopeIds = new Set(groups.flatMap((group) => (
    allowRelayConfirmedEntries && options.isEntryRelayConfirmed(group.entryId)
      ? group.envelopes.map((envelope) => envelope.id)
      : []
  )));
  const getStatus = (envelope: SessionEnvelope): SessionProtocolEnvelopeStatus => {
    const exactStatus = options.client.getSessionProtocolEnvelopeStatus(envelope);
    if (exactStatus !== 'missing') return exactStatus;
    return relayConfirmedEnvelopeIds.has(envelope.id) ? 'matching' : 'missing';
  };

  const needsInventory = groups.some((group) => group.envelopes.some((envelope) => (
    getStatus(envelope) === 'missing'
  )));
  if (needsInventory) {
    await options.client.syncExistingSessionProtocolEnvelopeIds();
  }

  const initial = analyzePiHistoryEnvelopeGroups(groups, getStatus);
  for (const envelope of initial.missing) {
    options.client.sendSessionProtocolMessage(envelope);
  }

  let outboxConflictLocalIds: string[] = [];
  if (initial.missing.length > 0) {
    try {
      await options.client.flushConfirmed();
    } catch (error) {
      if (!(error instanceof SessionOutboxConflictError)) throw error;
      const canonicalLocalIds = new Set(groups.flatMap((group) => (
        group.envelopes.map((envelope) => `session:${envelope.id}`)
      )));
      outboxConflictLocalIds = error.localIds.filter((localId) => canonicalLocalIds.has(localId));
      if (outboxConflictLocalIds.length === 0) throw error;
    }
  }

  return {
    ...analyzePiHistoryEnvelopeGroups(groups, getStatus),
    afterEntryMissing,
    startEntryMissing,
    sent: initial.missing.length,
    outboxConflictLocalIds,
  };
}
