import { basename } from 'node:path';
import { createHash } from 'node:crypto';

import { SessionManager, type SessionInfo } from '@earendil-works/pi-coding-agent';

export type PiRecoveryState =
  | 'discovered_local'
  | 'registered'
  | 'active_runtime'
  | 'stale_local'
  | 'missing_local_history'
  | 'history_gap'
  | 'import_failed';

export interface RegisteredPiSessionState {
  piSessionId: string;
  relaySessionId?: string;
  importedMessageCount: number;
  relayAvailable?: boolean;
  updatedAt?: Date;
}

export interface PiSessionRecoveryRecord {
  state: PiRecoveryState;
  piSessionId: string;
  relaySessionId?: string;
  path?: string;
  cwd?: string;
  name?: string;
  createdAt?: number;
  modifiedAt?: number;
  registeredUpdatedAt?: number;
  firstMessage?: string;
  messageCount: number;
  summaryComplete?: boolean;
  needsRegistration: boolean;
  needsBackfill: boolean;
  hasHistoryGap: boolean;
  reason: string;
}

export interface PiSessionDiscoveryPage {
  records: PiSessionRecoveryRecord[];
  nextCursor?: string;
  total: number;
}

export interface DiscoverPiSessionsOptions {
  cwd?: string;
  sessionDir?: string;
  scope?: 'cwd' | 'machine';
  registeredSessions?: RegisteredPiSessionState[];
  activePiSessionIds?: string[];
  staleAfterMs?: number;
  now?: Date;
  limit?: number;
  cursor?: string;
  snapshotGeneration?: string;
  listSessions?: () => Promise<SessionInfo[]>;
  isSessionSummaryComplete?: (sessionId: string) => boolean;
  isSessionHistoryGapVerified?: (sessionId: string) => boolean;
  isSessionActive?: (sessionId: string) => boolean;
}

const DEFAULT_STALE_AFTER_MS = 1000 * 60 * 60 * 24 * 14;

export function createPiDiscoverySnapshotGeneration(input: {
  runtimeNonce: string;
  indexGeneration: number;
  scope: 'cwd' | 'machine';
  cwd?: string;
  registered: Array<{
    piSessionId: string;
    relaySessionId?: string;
    importedMessageCount: number;
    relayAvailable?: boolean;
    updatedAt?: number;
  }>;
  activePiSessionIds: string[];
}): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('base64url');
}
const MAX_RELAY_TEXT_FIELD_LENGTH = 240;

function truncateRelayText(value: string | undefined, maxLength = MAX_RELAY_TEXT_FIELD_LENGTH): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

export function classifyPiSessionRecovery(input: {
  local?: SessionInfo;
  registered?: RegisteredPiSessionState;
  active?: boolean;
  importError?: string;
  staleAfterMs?: number;
  now?: Date;
  localSummaryComplete?: boolean;
  localHistoryGapVerified?: boolean;
}): PiSessionRecoveryRecord {
  const now = input.now ?? new Date();
  const staleAfterMs = input.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const piSessionId = input.local?.id ?? input.registered?.piSessionId ?? 'unknown';
  const importedMessageCount = input.registered?.importedMessageCount ?? 0;
  const localMessageCount = input.local?.messageCount ?? 0;
  const summaryComplete = input.localSummaryComplete !== false;
  const historyGapVerified = input.localHistoryGapVerified !== false;
  const hasNewLocalHistory = summaryComplete && localMessageCount > importedMessageCount;
  const base = {
    piSessionId,
    relaySessionId: input.registered?.relaySessionId,
    path: input.local?.path,
    cwd: input.local?.cwd,
    name: truncateRelayText(input.local?.name),
    createdAt: input.local?.created.getTime(),
    modifiedAt: input.local?.modified.getTime(),
    registeredUpdatedAt: input.registered?.updatedAt?.getTime(),
    firstMessage: truncateRelayText(input.local?.firstMessage),
    messageCount: localMessageCount,
    summaryComplete,
  };

  if (input.importError) {
    return {
      ...base,
      state: 'import_failed',
      needsRegistration: false,
      needsBackfill: false,
      hasHistoryGap: false,
      reason: input.importError,
    };
  }

  if (!input.local) {
    return {
      ...base,
      state: 'missing_local_history',
      needsRegistration: false,
      needsBackfill: false,
      hasHistoryGap: true,
      reason: 'registered relay session has no local Pi JSONL history',
    };
  }

  if (!input.registered) {
    return {
      ...base,
      state: 'discovered_local',
      needsRegistration: true,
      needsBackfill: true,
      hasHistoryGap: false,
      reason: 'local Pi JSONL session is not registered with relay',
    };
  }

  if (input.active) {
    return {
      ...base,
      state: 'active_runtime',
      needsRegistration: false,
      needsBackfill: hasNewLocalHistory || input.registered.relayAvailable === false,
      hasHistoryGap: false,
      reason: 'Pi runtime is active for this session',
    };
  }

  if (summaryComplete && historyGapVerified && localMessageCount < importedMessageCount) {
    return {
      ...base,
      state: 'history_gap',
      needsRegistration: false,
      needsBackfill: false,
      hasHistoryGap: true,
      reason: `local Pi history has ${localMessageCount} messages but relay import ledger expects ${importedMessageCount}`,
    };
  }

  if (input.registered.relayAvailable === false) {
    return {
      ...base,
      state: 'registered',
      needsRegistration: false,
      needsBackfill: true,
      hasHistoryGap: false,
      reason: 'relay cache is missing session history and needs local backfill',
    };
  }

  if (now.getTime() - input.local.modified.getTime() > staleAfterMs) {
    return {
      ...base,
      state: 'stale_local',
      needsRegistration: false,
      needsBackfill: hasNewLocalHistory,
      hasHistoryGap: false,
      reason: 'local Pi session is registered but stale',
    };
  }

  return {
    ...base,
    state: 'registered',
    needsRegistration: false,
    needsBackfill: hasNewLocalHistory,
    hasHistoryGap: false,
    reason: !summaryComplete
      ? 'Pi session summary is still indexing'
      : !historyGapVerified && localMessageCount < importedMessageCount
      ? 'Pi session history gap is awaiting current file verification'
      : hasNewLocalHistory
      ? 'local Pi history has new messages to backfill'
      : 'local Pi session is registered and in sync',
  };
}

function compareSessionInfoByDiscoveryOrder(activePiIds: Set<string>): (a: SessionInfo, b: SessionInfo) => number {
  return (a, b) => {
    return compareSessionDiscoveryKeys(sessionDiscoveryKey(a, activePiIds), sessionDiscoveryKey(b, activePiIds));
  };
}

interface PiDiscoveryCursorV1 {
  v: 1;
  active: boolean;
  modified: number;
  id: string;
  generation?: string;
}

function sessionDiscoveryKey(session: SessionInfo, activePiIds: Set<string>): Omit<PiDiscoveryCursorV1, 'v'> {
  return {
    active: activePiIds.has(session.id),
    modified: session.modified.getTime(),
    id: session.id,
  };
}

function compareSessionDiscoveryKeys(a: Omit<PiDiscoveryCursorV1, 'v'>, b: Omit<PiDiscoveryCursorV1, 'v'>): number {
  const activeDelta = Number(b.active) - Number(a.active);
  if (activeDelta !== 0) {
    return activeDelta;
  }
  const modifiedDelta = b.modified - a.modified;
  return modifiedDelta !== 0 ? modifiedDelta : a.id.localeCompare(b.id);
}

function recoveryRecordDiscoveryKey(record: PiSessionRecoveryRecord, activePiIds: Set<string>): Omit<PiDiscoveryCursorV1, 'v'> {
  return {
    active: activePiIds.has(record.piSessionId),
    modified: record.modifiedAt ?? record.registeredUpdatedAt ?? record.createdAt ?? 0,
    id: record.piSessionId,
  };
}

function encodeDiscoveryKey(
  key: Omit<PiDiscoveryCursorV1, 'v' | 'generation'>,
  generation?: string,
): string {
  return Buffer.from(JSON.stringify({
    v: 1,
    ...key,
    ...(generation ? { generation } : {}),
  } satisfies PiDiscoveryCursorV1), 'utf8').toString('base64url');
}

function decodeDiscoveryCursor(cursor: string | undefined): PiDiscoveryCursorV1 | undefined {
  if (!cursor) {
    return undefined;
  }
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<PiDiscoveryCursorV1>;
    if (decoded.v === 1
      && typeof decoded.active === 'boolean'
      && typeof decoded.modified === 'number'
      && typeof decoded.id === 'string'
      && (decoded.generation === undefined || typeof decoded.generation === 'string')) {
      return decoded as PiDiscoveryCursorV1;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function resolvePageLimit(limit: number | undefined): number | undefined {
  if (limit === undefined) {
    return undefined;
  }
  if (!Number.isFinite(limit) || limit <= 0) {
    return undefined;
  }
  return Math.min(Math.floor(limit), 500);
}

async function listPiSessionsForScope(options: DiscoverPiSessionsOptions): Promise<SessionInfo[]> {
  if (options.listSessions) {
    return options.listSessions();
  }

  if (options.scope === 'machine' || !options.cwd) {
    return options.sessionDir
      ? SessionManager.listAll(options.sessionDir)
      : SessionManager.listAll();
  }

  return SessionManager.list(options.cwd, options.sessionDir);
}

export async function discoverLocalPiSessionsPage(options: DiscoverPiSessionsOptions): Promise<PiSessionDiscoveryPage> {
  const registeredByPiId = new Map((options.registeredSessions ?? []).map((entry) => [entry.piSessionId, entry]));
  const activePiIds = new Set(options.activePiSessionIds ?? []);
  const decodedCursor = decodeDiscoveryCursor(options.cursor);
  if (decodedCursor && options.snapshotGeneration
    && decodedCursor.generation !== options.snapshotGeneration) {
    throw new Error('Pi discovery snapshot generation changed during pagination');
  }
  const sessions = (await listPiSessionsForScope(options)).sort(compareSessionInfoByDiscoveryOrder(activePiIds));
  const limit = resolvePageLimit(options.limit);
  // Product-visible discovery only exposes real local/live Pi sessions. Relay-only
  // registrations without a local Pi JSONL/session record are diagnostic noise,
  // not user-visible sessions.
  const records = sessions.map((local) => classifyPiSessionRecovery({
    local,
    registered: registeredByPiId.get(local.id),
    active: activePiIds.has(local.id) || options.isSessionActive?.(local.id) === true,
    localSummaryComplete: options.isSessionSummaryComplete?.(local.id) ?? true,
    localHistoryGapVerified: options.isSessionHistoryGapVerified?.(local.id) ?? true,
    staleAfterMs: options.staleAfterMs,
    now: options.now,
  })).sort((a, b) => compareSessionDiscoveryKeys(recoveryRecordDiscoveryKey(a, activePiIds), recoveryRecordDiscoveryKey(b, activePiIds)));
  const total = records.length;
  const candidateRecords = decodedCursor
    ? records.filter((record) => compareSessionDiscoveryKeys(recoveryRecordDiscoveryKey(record, activePiIds), decodedCursor) > 0)
    : records;
  const pageRecords = limit === undefined ? candidateRecords : candidateRecords.slice(0, limit);
  const hasMore = limit !== undefined && candidateRecords.length > pageRecords.length;
  const lastRecord = pageRecords.at(-1);

  return {
    records: pageRecords,
    nextCursor: hasMore && lastRecord
      ? encodeDiscoveryKey(recoveryRecordDiscoveryKey(lastRecord, activePiIds), options.snapshotGeneration)
      : undefined,
    total,
  };
}

export async function discoverLocalPiSessions(options: DiscoverPiSessionsOptions): Promise<PiSessionRecoveryRecord[]> {
  return (await discoverLocalPiSessionsPage(options)).records;
}

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\b(sk-[A-Za-z0-9_-]{12,})\b/g, 'sk-REDACTED'],
  [/\b([A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,})\b/g, 'jwt.REDACTED'],
  [/(authorization\s*[:=]\s*)([^\s]+)/gi, '$1REDACTED'],
  [/(api[_-]?key\s*[:=]\s*)([^\s]+)/gi, '$1REDACTED'],
  [/(token\s*[:=]\s*)([^\s]+)/gi, '$1REDACTED'],
];

export function redactPiTextForRelay(text: string, homeDir = process.env.HOME): string {
  let redacted = text;
  if (homeDir) {
    redacted = redacted.split(homeDir).join('~');
  }
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }
  return redacted;
}

export function redactPiSessionForRelay(record: PiSessionRecoveryRecord, homeDir = process.env.HOME): PiSessionRecoveryRecord {
  return {
    ...record,
    path: record.path ? redactPiTextForRelay(record.path, homeDir) : undefined,
    cwd: record.cwd ? redactPiTextForRelay(record.cwd, homeDir) : undefined,
    name: record.name ? redactPiTextForRelay(record.name, homeDir) : undefined,
    firstMessage: record.firstMessage ? redactPiTextForRelay(record.firstMessage, homeDir) : undefined,
    reason: redactPiTextForRelay(record.reason, homeDir),
  };
}

export function piSessionDisplayName(record: PiSessionRecoveryRecord): string {
  return record.name ?? basename(record.cwd ?? record.path ?? record.piSessionId);
}
