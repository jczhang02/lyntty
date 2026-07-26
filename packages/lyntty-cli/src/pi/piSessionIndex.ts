import { createReadStream } from 'node:fs';
import { open, readFile, readdir, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';

import { getAgentDir, type SessionInfo } from '@earendil-works/pi-coding-agent';

import { writeJsonAtomically } from '@/distribution/atomicFile';

const PI_SESSION_INDEX_VERSION = 2;
const DEFAULT_REFRESH_INTERVAL_MS = 10_000;
const DEFAULT_BOOTSTRAP_SESSION_COUNT = 32;
const MAX_CONCURRENT_SESSION_SCANS = 10;
const MAX_BACKGROUND_SESSION_SCANS = 2;
const MAX_SUMMARY_TEXT_LENGTH = 241;
const MAX_PARSED_LINE_BYTES = 1024 * 1024;
const BOOTSTRAP_PREFIX_BYTES = 256 * 1024;
const INDEX_HEAD_HASH_BYTES = 64 * 1024;
const PARSER_YIELD_BYTES = 1024 * 1024;

interface PiSessionFileFingerprint {
  size: number;
  mtimeMs: number;
  ctimeMs: number;
}

interface IndexedPiSession {
  fingerprint: PiSessionFileFingerprint;
  info: SessionInfo;
  parsedBytes: number;
  headHash: string;
  headHashBytes: number;
  complete: boolean;
}

interface PiSessionFileCandidate {
  path: string;
  fingerprint: PiSessionFileFingerprint;
  previous?: IndexedPiSession;
}

interface PersistedPiSessionInfoV1 {
  path: string;
  id: string;
  cwd: string;
  name?: string;
  parentSessionPath?: string;
  createdAt: number;
  modifiedAt: number;
  messageCount: number;
  firstMessage: string;
}

interface PersistedPiSessionEntryV2 {
  fingerprint: PiSessionFileFingerprint;
  info: PersistedPiSessionInfoV1;
  parsedBytes: number;
  headHash: string;
  headHashBytes: number;
  complete: boolean;
}

interface PersistedPiSessionIndexV2 {
  version: 2;
  refreshedAt: number;
  entries: PersistedPiSessionEntryV2[];
}

export interface PiSessionIndexListOptions {
  cwd?: string;
  scope?: 'cwd' | 'machine';
}

export interface PiSessionIndexSnapshot {
  sessions: SessionInfo[];
  incompleteSessionIds: ReadonlySet<string>;
  generation: number;
  refreshing: boolean;
}

export interface PiSessionIndex {
  list(options?: PiSessionIndexListOptions): Promise<SessionInfo[]>;
  find(sessionId: string, options?: PiSessionIndexListOptions): Promise<SessionInfo | undefined>;
  snapshot(options?: PiSessionIndexListOptions): Promise<PiSessionIndexSnapshot>;
  refresh(): Promise<void>;
}

export interface CreatePiSessionIndexOptions {
  indexFile: string;
  sessionsDir?: string;
  refreshIntervalMs?: number;
  bootstrapSessionCount?: number;
  now?: () => number;
  scanSessionFile?: (path: string) => Promise<SessionInfo | null>;
  scanBootstrapSessionFile?: (path: string) => Promise<SessionInfo | null>;
  onBytesRead?: (path: string, bytes: number) => void;
  onError?: (error: unknown) => void;
}

interface FilePiSessionIndexOptions {
  indexFile: string;
  sessionsDir: string;
  refreshIntervalMs: number;
  bootstrapSessionCount: number;
  now: () => number;
  scanCandidate: (candidate: PiSessionFileCandidate) => Promise<IndexedPiSession | null>;
  scanBootstrapCandidate: (candidate: PiSessionFileCandidate) => Promise<IndexedPiSession | null>;
  onError: (error: unknown) => void;
}

function normalizeSummaryText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_SUMMARY_TEXT_LENGTH);
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  if (!line.trim()) return null;
  try {
    const value = JSON.parse(line);
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function extractMessageText(message: Record<string, unknown>): string {
  const content = message.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .flatMap((part) => {
      if (!part || typeof part !== 'object') return [];
      const block = part as Record<string, unknown>;
      return block.type === 'text' && typeof block.text === 'string' ? [block.text] : [];
    })
    .join(' ');
}

function messageActivityTime(entry: Record<string, unknown>, message: Record<string, unknown>): number | undefined {
  if (message.role !== 'user' && message.role !== 'assistant') return undefined;
  if (!Object.hasOwn(message, 'content')) return undefined;
  if (typeof message.timestamp === 'number' && Number.isFinite(message.timestamp)) {
    return message.timestamp;
  }
  if (typeof entry.timestamp !== 'string') return undefined;
  const parsed = new Date(entry.timestamp).getTime();
  return Number.isNaN(parsed) ? undefined : parsed;
}

export async function readPiSessionInfo(path: string): Promise<SessionInfo | null> {
  try {
    const fileStat = await stat(path);
    return (await parsePiSessionFile({
      path,
      fingerprint: {
        size: fileStat.size,
        mtimeMs: fileStat.mtimeMs,
        ctimeMs: fileStat.ctimeMs,
      },
      start: 0,
    }))?.info ?? null;
  } catch {
    return null;
  }
}

interface PiSessionSummaryAccumulator {
  header: Record<string, unknown> | null;
  invalidHeader: boolean;
  messageCount: number;
  firstMessage: string;
  name?: string;
  lastActivityTime?: number;
  sawTruncatedMessage: boolean;
}

function createSummaryAccumulator(previous?: SessionInfo): PiSessionSummaryAccumulator {
  if (!previous) {
    return {
      header: null,
      invalidHeader: false,
      messageCount: 0,
      firstMessage: '',
      sawTruncatedMessage: false,
    };
  }
  return {
    header: {
      type: 'session',
      id: previous.id,
      cwd: previous.cwd,
      timestamp: previous.created.toISOString(),
      parentSession: previous.parentSessionPath,
    },
    invalidHeader: false,
    messageCount: previous.messageCount,
    firstMessage: previous.firstMessage === '(no messages)' ? '' : previous.firstMessage,
    name: previous.name,
    lastActivityTime: previous.modified.getTime(),
    sawTruncatedMessage: false,
  };
}

function applySessionEntry(accumulator: PiSessionSummaryAccumulator, entry: Record<string, unknown>): void {
  if (!accumulator.header) {
    if (entry.type !== 'session' || typeof entry.id !== 'string') {
      accumulator.invalidHeader = true;
      return;
    }
    accumulator.header = entry;
    return;
  }
  if (entry.type === 'session_info') {
    accumulator.name = typeof entry.name === 'string' && entry.name.trim()
      ? normalizeSummaryText(entry.name)
      : undefined;
  }
  if (entry.type !== 'message') return;
  accumulator.messageCount += 1;
  if (!entry.message || typeof entry.message !== 'object') return;
  const message = entry.message as Record<string, unknown>;
  const activityTime = messageActivityTime(entry, message);
  if (activityTime !== undefined) {
    accumulator.lastActivityTime = Math.max(accumulator.lastActivityTime ?? 0, activityTime);
  }
  if (!accumulator.firstMessage && message.role === 'user') {
    const text = normalizeSummaryText(extractMessageText(message));
    if (text) accumulator.firstMessage = text;
  }
}

function processSessionLine(
  accumulator: PiSessionSummaryAccumulator,
  bytes: Buffer,
  truncated: boolean,
): boolean {
  const line = bytes.toString('utf8');
  if (truncated) {
    if (!accumulator.header) return false;
    if (/"type"\s*:\s*"message"/.test(line)) {
      accumulator.messageCount += 1;
      accumulator.sawTruncatedMessage = true;
    }
    return true;
  }
  const entry = parseJsonLine(line);
  if (!entry) return false;
  applySessionEntry(accumulator, entry);
  return true;
}

function sessionInfoFromAccumulator(
  path: string,
  fingerprint: PiSessionFileFingerprint,
  accumulator: PiSessionSummaryAccumulator,
  partial: boolean,
): SessionInfo | null {
  const header = accumulator.header;
  if (!header || accumulator.invalidHeader || typeof header.id !== 'string') return null;
  const headerTimestamp = typeof header.timestamp === 'string'
    ? new Date(header.timestamp).getTime()
    : Number.NaN;
  const createdAt = Number.isFinite(headerTimestamp) ? headerTimestamp : fingerprint.mtimeMs;
  const modifiedAt = partial || accumulator.sawTruncatedMessage
    ? Math.max(accumulator.lastActivityTime ?? 0, fingerprint.mtimeMs)
    : accumulator.lastActivityTime
      ?? (Number.isFinite(headerTimestamp) ? headerTimestamp : fingerprint.mtimeMs);
  return {
    path,
    id: header.id,
    cwd: typeof header.cwd === 'string' ? header.cwd : '',
    name: accumulator.name,
    parentSessionPath: typeof header.parentSession === 'string' ? header.parentSession : undefined,
    created: new Date(createdAt),
    modified: new Date(modifiedAt),
    messageCount: accumulator.messageCount,
    firstMessage: accumulator.firstMessage || '(no messages)',
    allMessagesText: '',
  };
}

async function parsePiSessionFile(options: {
  path: string;
  fingerprint: PiSessionFileFingerprint;
  start: number;
  previousInfo?: SessionInfo;
  maxBytes?: number;
  onBytesRead?: (path: string, bytes: number) => void;
}): Promise<{ info: SessionInfo; parsedBytes: number } | null> {
  if (options.fingerprint.size === 0 || options.start >= options.fingerprint.size) {
    return options.previousInfo
      ? { info: options.previousInfo, parsedBytes: options.start }
      : null;
  }
  const maxEnd = options.maxBytes === undefined
    ? options.fingerprint.size - 1
    : Math.min(options.fingerprint.size, options.start + options.maxBytes) - 1;
  const accumulator = createSummaryAccumulator(options.previousInfo);
  const stream = createReadStream(options.path, { start: options.start, end: maxEnd });
  let absoluteOffset = options.start;
  let parsedBytes = options.start;
  let retainedParts: Buffer[] = [];
  let retainedBytes = 0;
  let lineTruncated = false;
  let bytesSinceYield = 0;

  const retain = (part: Buffer): void => {
    if (retainedBytes >= MAX_PARSED_LINE_BYTES) {
      lineTruncated = true;
      return;
    }
    const remaining = MAX_PARSED_LINE_BYTES - retainedBytes;
    const kept = part.byteLength <= remaining ? part : part.subarray(0, remaining);
    if (kept.byteLength > 0) retainedParts.push(kept);
    retainedBytes += kept.byteLength;
    if (kept.byteLength < part.byteLength) lineTruncated = true;
  };
  const finishLine = (): boolean => {
    const handled = processSessionLine(accumulator, Buffer.concat(retainedParts, retainedBytes), lineTruncated);
    retainedParts = [];
    retainedBytes = 0;
    lineTruncated = false;
    return handled;
  };

  for await (const value of stream) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    options.onBytesRead?.(options.path, chunk.byteLength);
    bytesSinceYield += chunk.byteLength;
    let position = 0;
    while (position < chunk.byteLength) {
      const newline = chunk.indexOf(0x0a, position);
      if (newline === -1) {
        const remainder = chunk.subarray(position);
        retain(remainder);
        absoluteOffset += remainder.byteLength;
        break;
      }
      const segment = chunk.subarray(position, newline);
      retain(segment);
      absoluteOffset += segment.byteLength + 1;
      finishLine();
      parsedBytes = absoluteOffset;
      position = newline + 1;
    }
    if (bytesSinceYield >= PARSER_YIELD_BYTES) {
      bytesSinceYield = 0;
      await new Promise<void>((resolveImmediate) => setImmediate(resolveImmediate));
    }
  }
  const partial = maxEnd < options.fingerprint.size - 1;
  // A bounded bootstrap ends in the middle of a valid JSON line. Treat that
  // retained prefix as truncated so message rows still remain visible without
  // attempting to buffer or parse the full payload.
  if (partial && retainedBytes > 0) lineTruncated = true;
  if ((retainedBytes > 0 || lineTruncated) && finishLine()) parsedBytes = absoluteOffset;

  const info = sessionInfoFromAccumulator(options.path, options.fingerprint, accumulator, partial);
  return info ? { info, parsedBytes } : null;
}

async function hashFileHead(
  path: string,
  length: number,
  onBytesRead?: (path: string, bytes: number) => void,
): Promise<string> {
  const buffer = Buffer.alloc(length);
  const handle = await open(path, 'r');
  try {
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    onBytesRead?.(path, bytesRead);
    return createHash('sha256').update(buffer.subarray(0, bytesRead)).digest('base64url');
  } finally {
    await handle.close();
  }
}

async function scanIndexedCandidate(
  candidate: PiSessionFileCandidate,
  onBytesRead?: (path: string, bytes: number) => void,
): Promise<IndexedPiSession | null> {
  const previous = candidate.previous;
  let canAppend = false;
  if (previous?.complete
    && candidate.fingerprint.size > previous.fingerprint.size
    && previous.parsedBytes <= previous.fingerprint.size) {
    const verificationHash = await hashFileHead(candidate.path, previous.headHashBytes, onBytesRead);
    canAppend = verificationHash === previous.headHash;
  }
  const parsed = await parsePiSessionFile({
    path: candidate.path,
    fingerprint: candidate.fingerprint,
    start: canAppend ? previous!.parsedBytes : 0,
    previousInfo: canAppend ? previous!.info : undefined,
    onBytesRead,
  });
  if (!parsed) return null;
  const headHashBytes = Math.min(candidate.fingerprint.size, INDEX_HEAD_HASH_BYTES);
  const headHash = canAppend && headHashBytes === previous!.headHashBytes
    ? previous!.headHash
    : await hashFileHead(candidate.path, headHashBytes, onBytesRead);
  return {
    fingerprint: candidate.fingerprint,
    info: parsed.info,
    parsedBytes: parsed.parsedBytes,
    headHash,
    headHashBytes,
    complete: true,
  };
}

async function scanBootstrapCandidate(
  candidate: PiSessionFileCandidate,
  onBytesRead?: (path: string, bytes: number) => void,
): Promise<IndexedPiSession | null> {
  const parsed = await parsePiSessionFile({
    path: candidate.path,
    fingerprint: candidate.fingerprint,
    start: 0,
    maxBytes: BOOTSTRAP_PREFIX_BYTES,
    onBytesRead,
  });
  if (!parsed) return null;
  const headHashBytes = Math.min(candidate.fingerprint.size, INDEX_HEAD_HASH_BYTES);
  return {
    fingerprint: candidate.fingerprint,
    info: parsed.info,
    parsedBytes: parsed.parsedBytes,
    headHash: await hashFileHead(candidate.path, headHashBytes, onBytesRead),
    headHashBytes,
    complete: false,
  };
}

async function scanWithCustomReader(
  candidate: PiSessionFileCandidate,
  reader: (path: string) => Promise<SessionInfo | null>,
  complete: boolean,
  onBytesRead?: (path: string, bytes: number) => void,
): Promise<IndexedPiSession | null> {
  const info = await reader(candidate.path);
  if (!info) return null;
  const headHashBytes = Math.min(candidate.fingerprint.size, INDEX_HEAD_HASH_BYTES);
  return {
    fingerprint: candidate.fingerprint,
    info,
    parsedBytes: complete ? candidate.fingerprint.size : Math.min(candidate.fingerprint.size, BOOTSTRAP_PREFIX_BYTES),
    headHash: await hashFileHead(candidate.path, headHashBytes, onBytesRead),
    headHashBytes,
    complete,
  };
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function parsePersistedEntry(value: unknown, sessionsDir: string): IndexedPiSession | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Partial<PersistedPiSessionEntryV2>;
  const fingerprint = entry.fingerprint;
  const info = entry.info;
  if (!fingerprint || !info) return null;
  if (!isFiniteNonNegative(fingerprint.size)
    || !isFiniteNonNegative(fingerprint.mtimeMs)
    || !isFiniteNonNegative(fingerprint.ctimeMs)) return null;
  if (typeof info.path !== 'string' || !isPathInside(sessionsDir, info.path)) return null;
  if (typeof info.id !== 'string' || !info.id) return null;
  if (typeof info.cwd !== 'string'
    || !isFiniteNonNegative(info.createdAt)
    || !isFiniteNonNegative(info.modifiedAt)
    || !Number.isInteger(info.messageCount)
    || info.messageCount < 0
    || typeof info.firstMessage !== 'string') return null;
  if (!isFiniteNonNegative(entry.parsedBytes)
    || entry.parsedBytes > fingerprint.size
    || typeof entry.headHash !== 'string'
    || !entry.headHash
    || !isFiniteNonNegative(entry.headHashBytes)
    || entry.headHashBytes > Math.min(fingerprint.size, INDEX_HEAD_HASH_BYTES)
    || typeof entry.complete !== 'boolean') return null;
  if (info.name !== undefined && typeof info.name !== 'string') return null;
  if (info.parentSessionPath !== undefined && typeof info.parentSessionPath !== 'string') return null;

  return {
    fingerprint: { ...fingerprint },
    parsedBytes: entry.parsedBytes,
    headHash: entry.headHash,
    headHashBytes: entry.headHashBytes,
    complete: entry.complete,
    info: {
      path: info.path,
      id: info.id,
      cwd: info.cwd,
      name: info.name,
      parentSessionPath: info.parentSessionPath,
      created: new Date(info.createdAt),
      modified: new Date(info.modifiedAt),
      messageCount: info.messageCount,
      firstMessage: info.firstMessage,
      allMessagesText: '',
    },
  };
}

function isPathInside(root: string, path: string): boolean {
  const child = relative(resolve(root), resolve(path));
  return child !== '' && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

function sameFingerprint(a: PiSessionFileFingerprint, b: PiSessionFileFingerprint): boolean {
  return a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}

async function listPiSessionFiles(sessionsDir: string): Promise<string[]> {
  const rootEntries = await readdir(sessionsDir, { withFileTypes: true }).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  });
  const files: string[] = [];
  for (const entry of rootEntries) {
    if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      files.push(join(sessionsDir, entry.name));
      continue;
    }
    if (!entry.isDirectory()) continue;
    const directory = join(sessionsDir, entry.name);
    const children = await readdir(directory, { withFileTypes: true });
    for (const child of children) {
      if (child.isFile() && child.name.endsWith('.jsonl')) {
        files.push(join(directory, child.name));
      }
    }
  }
  return files.sort();
}

async function mapWithConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  callback: (value: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      await callback(values[index]!);
      // Session JSONL parsing can be CPU-heavy even though the file stream is
      // asynchronous. Cooperatively yield so websocket/RPC work is not starved.
      await new Promise<void>((resolveImmediate) => setImmediate(resolveImmediate));
    }
  });
  await Promise.all(workers);
}

function serializeIndex(refreshedAt: number, entries: Map<string, IndexedPiSession>): PersistedPiSessionIndexV2 {
  return {
    version: PI_SESSION_INDEX_VERSION,
    refreshedAt,
    entries: [...entries.values()]
      .sort((a, b) => a.info.path.localeCompare(b.info.path))
      .map(({ fingerprint, info, parsedBytes, headHash, headHashBytes, complete }) => ({
        fingerprint,
        parsedBytes,
        headHash,
        headHashBytes,
        complete,
        info: {
          path: info.path,
          id: info.id,
          cwd: info.cwd,
          name: info.name,
          parentSessionPath: info.parentSessionPath,
          createdAt: info.created.getTime(),
          modifiedAt: info.modified.getTime(),
          messageCount: info.messageCount,
          firstMessage: info.firstMessage,
        },
      })),
  };
}

class FilePiSessionIndex implements PiSessionIndex {
  private entries = new Map<string, IndexedPiSession>();
  private hasSnapshot = false;
  private refreshedAt = 0;
  private generation = 0;
  private refreshPromise: Promise<void> | null = null;
  private snapshotReadyPromise: Promise<void> | null = null;
  private resolveSnapshotReady: (() => void) | null = null;

  constructor(private readonly options: FilePiSessionIndexOptions) {}

  async load(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.options.indexFile, 'utf8')) as Partial<PersistedPiSessionIndexV2>;
      if (parsed.version !== PI_SESSION_INDEX_VERSION
        || !isFiniteNonNegative(parsed.refreshedAt)
        || !Array.isArray(parsed.entries)) return;
      const loaded = new Map<string, IndexedPiSession>();
      for (const value of parsed.entries) {
        const entry = parsePersistedEntry(value, this.options.sessionsDir);
        if (entry) loaded.set(entry.info.path, entry);
      }
      this.entries = loaded;
      this.refreshedAt = [...loaded.values()].some((entry) => !entry.complete)
        ? 0
        : parsed.refreshedAt;
      this.hasSnapshot = true;
      this.generation += 1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.options.onError(error);
    }
  }

  async list(options: PiSessionIndexListOptions = {}): Promise<SessionInfo[]> {
    return (await this.snapshot(options)).sessions;
  }

  async find(sessionId: string, options: PiSessionIndexListOptions = {}): Promise<SessionInfo | undefined> {
    const initial = await this.snapshot(options);
    const initialMatch = initial.sessions.find((session) => session.id === sessionId);
    if (initialMatch && await this.matchesCurrentFile(initialMatch)) return initialMatch;

    // Exact control/open operations must not be limited by the discovery TTL:
    // a just-created session may not exist in the current list snapshot yet.
    await this.refresh();
    const refreshedMatch = this.currentSessions(options).find((session) => session.id === sessionId);
    if (!refreshedMatch) return undefined;
    return await this.matchesCurrentFile(refreshedMatch) ? refreshedMatch : undefined;
  }

  async snapshot(options: PiSessionIndexListOptions = {}): Promise<PiSessionIndexSnapshot> {
    if (!this.hasSnapshot) {
      const refresh = this.refresh();
      await (this.snapshotReadyPromise ?? refresh);
      if (!this.hasSnapshot) throw new Error('Pi session index is unavailable');
    } else if (this.options.now() - this.refreshedAt >= this.options.refreshIntervalMs) {
      void this.refresh();
    }

    const sessions = this.currentSessions(options);
    const visibleSessionIds = new Set(sessions.map((session) => session.id));
    return {
      sessions,
      incompleteSessionIds: new Set(
        [...this.entries.values()]
          .filter((entry) => !entry.complete && visibleSessionIds.has(entry.info.id))
          .map((entry) => entry.info.id),
      ),
      generation: this.generation,
      refreshing: this.refreshPromise !== null,
    };
  }

  async refresh(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;
    if (!this.hasSnapshot) {
      this.snapshotReadyPromise = new Promise<void>((resolveReady) => {
        this.resolveSnapshotReady = resolveReady;
      });
    }
    const request = this.performRefresh()
      .catch((error) => this.options.onError(error))
      .finally(() => {
        this.publishSnapshotReady();
        if (this.refreshPromise === request) {
          this.refreshPromise = null;
          this.snapshotReadyPromise = null;
        }
      });
    this.refreshPromise = request;
    return request;
  }

  private async performRefresh(): Promise<void> {
    const buildingFirstSnapshot = !this.hasSnapshot;
    const paths = await listPiSessionFiles(this.options.sessionsDir);
    const nextEntries = new Map<string, IndexedPiSession>();
    const changed: PiSessionFileCandidate[] = [];
    await mapWithConcurrency(paths, MAX_CONCURRENT_SESSION_SCANS, async (path) => {
      const previous = this.entries.get(path);
      try {
        const fileStat = await stat(path);
        const fingerprint = {
          size: fileStat.size,
          mtimeMs: fileStat.mtimeMs,
          ctimeMs: fileStat.ctimeMs,
        };
        if (previous && previous.complete && sameFingerprint(previous.fingerprint, fingerprint)) {
          nextEntries.set(path, previous);
          return;
        }
        changed.push({ path, fingerprint, previous });
      } catch (error) {
        this.options.onError(error);
        if (previous) nextEntries.set(path, previous);
      }
    });

    changed.sort((a, b) => b.fingerprint.mtimeMs - a.fingerprint.mtimeMs || a.path.localeCompare(b.path));
    const bootstrapCount = Math.max(1, Math.floor(this.options.bootstrapSessionCount));
    if (buildingFirstSnapshot && changed.length > 0) {
      await this.scanCandidates(
        changed.slice(0, bootstrapCount),
        nextEntries,
        MAX_CONCURRENT_SESSION_SCANS,
        this.options.scanBootstrapCandidate,
      );
      // An empty bounded window is still a valid first snapshot (for example
      // when the newest files are corrupt). Never make callers wait for the
      // complete background scan merely to learn that the tail is empty.
      this.publishMemorySnapshot(new Map(nextEntries), undefined, true);
      await new Promise<void>((resolveImmediate) => setImmediate(resolveImmediate));
      // Bootstrap entries are deliberately approximate. Re-scan every changed
      // candidate in the low-concurrency background pass before persistence.
      await this.scanCandidates(changed, nextEntries, MAX_BACKGROUND_SESSION_SCANS);
    } else {
      await this.scanCandidates(changed, nextEntries, MAX_BACKGROUND_SESSION_SCANS);
    }

    const refreshedAt = this.options.now();
    this.publishMemorySnapshot(nextEntries, refreshedAt, false);
    try {
      await writeJsonAtomically(this.options.indexFile, serializeIndex(refreshedAt, nextEntries));
    } catch (error) {
      this.options.onError(error);
    }
  }

  private async scanCandidates(
    candidates: PiSessionFileCandidate[],
    target: Map<string, IndexedPiSession>,
    concurrency: number,
    scanner = this.options.scanCandidate,
  ): Promise<void> {
    await mapWithConcurrency(candidates, concurrency, async ({ path, fingerprint, previous }) => {
      try {
        const indexed = await scanner({ path, fingerprint, previous });
        if (indexed) {
          target.set(path, {
            ...indexed,
            fingerprint,
            info: { ...indexed.info, path, allMessagesText: '' },
          });
        } else if (previous) {
          target.set(path, previous);
        }
      } catch (error) {
        this.options.onError(error);
        if (previous) target.set(path, previous);
      }
    });
  }

  private publishMemorySnapshot(
    entries: Map<string, IndexedPiSession>,
    refreshedAt?: number,
    publishReady = false,
  ): void {
    this.entries = entries;
    this.hasSnapshot = true;
    this.generation += 1;
    if (refreshedAt !== undefined) this.refreshedAt = refreshedAt;
    if (publishReady) this.publishSnapshotReady();
  }

  private publishSnapshotReady(): void {
    const resolveReady = this.resolveSnapshotReady;
    this.resolveSnapshotReady = null;
    resolveReady?.();
  }

  private async matchesCurrentFile(session: SessionInfo): Promise<boolean> {
    const indexed = this.entries.get(session.path);
    if (!indexed) return false;
    try {
      const fileStat = await stat(session.path);
      return sameFingerprint(indexed.fingerprint, {
        size: fileStat.size,
        mtimeMs: fileStat.mtimeMs,
        ctimeMs: fileStat.ctimeMs,
      });
    } catch {
      return false;
    }
  }

  private currentSessions(options: PiSessionIndexListOptions): SessionInfo[] {
    const sessions = [...this.entries.values()].map((entry) => entry.info);
    if ((options.scope ?? 'machine') === 'machine' || !options.cwd) return sessions;
    const expectedCwd = resolve(options.cwd);
    return sessions.filter((session) => session.cwd && resolve(session.cwd) === expectedCwd);
  }
}

export async function createPiSessionIndex(options: CreatePiSessionIndexOptions): Promise<PiSessionIndex> {
  const onBytesRead = options.onBytesRead;
  const fullReader = options.scanSessionFile;
  const bootstrapReader = options.scanBootstrapSessionFile;
  const index = new FilePiSessionIndex({
    indexFile: options.indexFile,
    sessionsDir: options.sessionsDir ?? join(getAgentDir(), 'sessions'),
    refreshIntervalMs: options.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS,
    bootstrapSessionCount: options.bootstrapSessionCount ?? DEFAULT_BOOTSTRAP_SESSION_COUNT,
    now: options.now ?? Date.now,
    scanCandidate: fullReader
      ? (candidate) => scanWithCustomReader(candidate, fullReader, true, onBytesRead)
      : (candidate) => scanIndexedCandidate(candidate, onBytesRead),
    scanBootstrapCandidate: bootstrapReader
      ? (candidate) => scanWithCustomReader(candidate, bootstrapReader, false, onBytesRead)
      : (candidate) => scanBootstrapCandidate(candidate, onBytesRead),
    onError: options.onError ?? (() => undefined),
  });
  await index.load();
  return index;
}
