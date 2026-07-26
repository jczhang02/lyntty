import { closeSync, openSync, readFileSync, readSync, statSync } from 'node:fs';

import type { SessionEntry } from '@earendil-works/pi-coding-agent';

import { SessionOutboxConflictError, type ApiSessionClient } from '@/api/apiSession';
import { logger } from '@/ui/logger';
import { mapPiSessionHistoryToEnvelopeGroups, mapPiSessionHistoryToEnvelopes } from './runPiHistory';

const DEFAULT_QUIET_MS = 2_000;
const DEFAULT_POLL_MS = 1_000;

function isSessionEntry(entry: unknown): entry is SessionEntry {
  return !!entry
    && typeof entry === 'object'
    && (entry as { type?: unknown }).type !== 'session'
    && typeof (entry as { id?: unknown }).id === 'string';
}

export function readPiSessionEntries(file: string): SessionEntry[] {
  try {
    return parseJsonlSessionEntries(readFileSync(file, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && (error as { code?: unknown }).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function parseJsonlSessionEntries(content: string): SessionEntry[] {
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      try {
        const parsed: unknown = JSON.parse(line);
        return isSessionEntry(parsed) ? [parsed] : [];
      } catch {
        return [];
      }
    });
}

function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .flatMap((part) => {
      if (!part || typeof part !== 'object') return [];
      const record = part as { type?: unknown; text?: unknown };
      return record.type === 'text' && typeof record.text === 'string' ? [record.text] : [];
    })
    .join('');
}

export function readPiSessionEntriesFromOffset(file: string, offset: number): { entries: SessionEntry[]; nextOffset: number } {
  const stat = statSync(file, { throwIfNoEntry: false });
  if (!stat) {
    return { entries: [], nextOffset: offset };
  }
  if (stat.size < offset) {
    offset = 0;
  }
  if (stat.size === offset) {
    return { entries: [], nextOffset: offset };
  }

  const fd = openSync(file, 'r');
  try {
    const length = stat.size - offset;
    const buffer = Buffer.alloc(length);
    const bytesRead = readSync(fd, buffer, 0, length, offset);
    const text = buffer.subarray(0, bytesRead).toString('utf8');
    const lastNewline = text.lastIndexOf('\n');
    if (lastNewline < 0) {
      return { entries: [], nextOffset: offset };
    }
    const completeText = text.slice(0, lastNewline + 1);
    return {
      entries: parseJsonlSessionEntries(completeText),
      nextOffset: offset + Buffer.byteLength(completeText, 'utf8'),
    };
  } finally {
    closeSync(fd);
  }
}

type DeliveredText = {
  text: string;
  cutoffTimeMs: number;
  untilTimeMs: number;
  expiresAtMs: number;
};

const DELIVERED_TEXT_TTL_MS = 5 * 60_000;
const MAX_DELIVERED_TEXTS = 100;

export class PiExternalMirror {
  private readonly knownEntryIds = new Set<string>();
  private readonly relayConfirmedEntryIds = new Set<string>();
  private pendingEntries: SessionEntry[] = [];
  private deliveredUserTexts: DeliveredText[] = [];
  private deliveredAssistantTexts: DeliveredText[] = [];
  private lastObservedChangeAt = 0;
  private lastMtimeMs = 0;
  private lastSize = 0;
  private lastReadOffset = 0;

  constructor(
    private readonly sessionFile: string,
    initialEntries: SessionEntry[],
    private readonly sendEntries: (entries: SessionEntry[]) => boolean | void | Promise<boolean | void>,
    private readonly quietMs = DEFAULT_QUIET_MS,
  ) {
    for (const entry of initialEntries) {
      this.knownEntryIds.add(entry.id);
    }
  }

  isEntryRelayConfirmed(entryId: string): boolean {
    return this.relayConfirmedEntryIds.has(entryId);
  }

  markCurrentEntriesKnown(): void {
    const { entries, nextOffset } = readPiSessionEntriesFromOffset(this.sessionFile, this.lastReadOffset);
    this.lastReadOffset = nextOffset;
    this.lastSize = Math.max(this.lastSize, nextOffset);
    const pendingIds = new Set(this.pendingEntries.map((entry) => entry.id));
    for (const entry of entries) {
      if (!pendingIds.has(entry.id)) {
        this.knownEntryIds.add(entry.id);
      }
    }
  }

  markCurrentEntriesDelivered(): void {
    this.markCurrentEntriesDeliveredSince(Number.NEGATIVE_INFINITY);
  }

  markEntryIdsDelivered(entryIds: Iterable<string>): void {
    const deliveredIds = new Set(entryIds);
    this.pendingEntries = this.pendingEntries.filter((entry) => !deliveredIds.has(entry.id));
    for (const entryId of deliveredIds) {
      this.knownEntryIds.add(entryId);
      this.relayConfirmedEntryIds.add(entryId);
    }
  }

  markCurrentEntriesDeliveredSince(cutoffTimeMs: number, options: { includeAssistantMessages?: boolean } = {}): void {
    const entries = readPiSessionEntries(this.sessionFile);
    const deliveredIds = new Set(entries
      .filter((entry) => this.isExtensionDeliveredEntry(entry, cutoffTimeMs, options.includeAssistantMessages === true))
      .map((entry) => entry.id));
    this.markDeliveredIds(deliveredIds, entries);
  }

  markUserTextDeliveredSince(text: string, cutoffTimeMs: number): void {
    const normalizedText = text.trim();
    if (!normalizedText) return;
    const now = Date.now();
    this.deliveredUserTexts = [
      ...this.deliveredUserTexts.filter((item) => item.expiresAtMs > now),
      { text: normalizedText, cutoffTimeMs, untilTimeMs: Number.POSITIVE_INFINITY, expiresAtMs: now + DELIVERED_TEXT_TTL_MS },
    ].slice(-MAX_DELIVERED_TEXTS);
    const entries = readPiSessionEntries(this.sessionFile);
    const deliveredIds = new Set(entries
      .filter((entry) => this.isUserTextEntry(entry, cutoffTimeMs, normalizedText))
      .map((entry) => entry.id));
    this.markDeliveredIds(deliveredIds, entries);
  }

  markAssistantTextDeliveredSince(text: string, cutoffTimeMs: number, untilTimeMs = Number.POSITIVE_INFINITY): void {
    const normalizedText = text.trim();
    if (!normalizedText) return;
    const now = Date.now();
    this.deliveredAssistantTexts = [
      ...this.deliveredAssistantTexts.filter((item) => item.expiresAtMs > now),
      { text: normalizedText, cutoffTimeMs, untilTimeMs, expiresAtMs: now + DELIVERED_TEXT_TTL_MS },
    ].slice(-MAX_DELIVERED_TEXTS);
    const entries = readPiSessionEntries(this.sessionFile);
    const deliveredIds = new Set(entries
      .filter((entry) => this.isAssistantTextEntry(entry, cutoffTimeMs, normalizedText, untilTimeMs))
      .map((entry) => entry.id));
    this.markDeliveredIds(deliveredIds, entries);
  }

  capAssistantTextDeliveryWindow(untilTimeMs: number): void {
    if (!Number.isFinite(untilTimeMs)) return;
    this.deliveredAssistantTexts = this.deliveredAssistantTexts.map((item) => ({
      ...item,
      untilTimeMs: Math.min(item.untilTimeMs, untilTimeMs),
    }));
  }

  private markDeliveredIds(deliveredIds: Set<string>, entries: SessionEntry[]): void {
    this.pendingEntries = this.pendingEntries.filter((entry) => !deliveredIds.has(entry.id));
    for (const entry of entries.filter((entry) => deliveredIds.has(entry.id))) {
      this.knownEntryIds.add(entry.id);
      this.relayConfirmedEntryIds.add(entry.id);
    }
  }

  private isUserTextEntry(entry: SessionEntry, cutoffTimeMs: number, text: string): boolean {
    const entryTime = Date.parse(entry.timestamp);
    if (!Number.isFinite(entryTime) || entryTime < cutoffTimeMs) {
      return false;
    }
    if (entry.type !== 'message') return false;
    const message = entry.message as { role?: unknown; content?: unknown };
    if (message.role !== 'user') return false;
    return extractMessageText(message.content).trim() === text;
  }

  private isAssistantTextEntry(entry: SessionEntry, cutoffTimeMs: number, text: string, untilTimeMs = Number.POSITIVE_INFINITY): boolean {
    const entryTime = Date.parse(entry.timestamp);
    if (!Number.isFinite(entryTime) || entryTime < cutoffTimeMs || entryTime > untilTimeMs) {
      return false;
    }
    if (entry.type !== 'message') return false;
    const message = entry.message as { role?: unknown; content?: unknown };
    if (message.role !== 'assistant') return false;
    return extractMessageText(message.content).trim() === text;
  }

  private isExtensionDeliveredEntry(entry: SessionEntry, cutoffTimeMs: number, includeAssistantMessages: boolean): boolean {
    const entryTime = Date.parse(entry.timestamp);
    if (!Number.isFinite(entryTime) || entryTime < cutoffTimeMs) {
      return false;
    }
    if (entry.type !== 'message') {
      return true;
    }
    const role = (entry.message as { role?: unknown }).role;
    if (role === 'user') return false;
    if (role === 'assistant') return includeAssistantMessages;
    return true;
  }

  private isRecentlyDeliveredUserEntry(entry: SessionEntry, now: number): boolean {
    this.deliveredUserTexts = this.deliveredUserTexts.filter((item) => item.expiresAtMs > now);
    if (this.deliveredUserTexts.length === 0) {
      return false;
    }
    return this.deliveredUserTexts.some((item) => this.isUserTextEntry(entry, item.cutoffTimeMs, item.text));
  }

  private isRecentlyDeliveredAssistantEntry(entry: SessionEntry, now: number): boolean {
    this.deliveredAssistantTexts = this.deliveredAssistantTexts.filter((item) => item.expiresAtMs > now);
    if (this.deliveredAssistantTexts.length === 0) {
      return false;
    }
    return this.deliveredAssistantTexts.some((item) => this.isAssistantTextEntry(entry, item.cutoffTimeMs, item.text, item.untilTimeMs));
  }

  async tick(now = Date.now()): Promise<void> {
    const stat = statSync(this.sessionFile, { throwIfNoEntry: false });
    if (!stat) {
      return;
    }
    if (stat.mtimeMs === this.lastMtimeMs && stat.size === this.lastSize && this.pendingEntries.length === 0) {
      return;
    }
    this.lastMtimeMs = stat.mtimeMs;
    this.lastSize = stat.size;

    const { entries, nextOffset } = readPiSessionEntriesFromOffset(this.sessionFile, this.lastReadOffset);
    this.lastReadOffset = nextOffset;
    for (const entry of entries) {
      if (!this.knownEntryIds.has(entry.id) && (
        this.isRecentlyDeliveredUserEntry(entry, now)
        || this.isRecentlyDeliveredAssistantEntry(entry, now)
      )) {
        this.knownEntryIds.add(entry.id);
      }
    }
    const pendingIds = new Set(this.pendingEntries.map((entry) => entry.id));
    const newEntries = entries.filter((entry: SessionEntry) => !this.knownEntryIds.has(entry.id) && !pendingIds.has(entry.id));
    if (newEntries.length > 0) {
      this.pendingEntries.push(...newEntries);
      this.lastObservedChangeAt = now;
      return;
    }

    if (this.pendingEntries.length > 0 && now - this.lastObservedChangeAt >= this.quietMs) {
      const pending = [...this.pendingEntries];
      const relayConfirmed = await this.sendEntries(pending);
      const sentIds = new Set(pending.map((entry) => entry.id));
      this.pendingEntries = this.pendingEntries.filter((entry) => !sentIds.has(entry.id));
      for (const entry of pending) {
        this.knownEntryIds.add(entry.id);
        if (relayConfirmed !== false) {
          this.relayConfirmedEntryIds.add(entry.id);
        }
      }
    }
  }
}

export function startPiExternalMirror(options: {
  sessionFile: string | undefined;
  initialEntries: SessionEntry[];
  session: () => ApiSessionClient;
  metaForEnvelope?: (envelope: ReturnType<typeof mapPiSessionHistoryToEnvelopes>[number]) => Record<string, unknown> | undefined;
  isManagedRuntimeActive?: () => boolean;
  onHistoryGap?: (reason: string) => void | Promise<void>;
  pollMs?: number;
}): { stop: () => Promise<void>; isEntryRelayConfirmed: (entryId: string) => boolean; markCurrentEntriesKnown: () => void; markCurrentEntriesDelivered: () => void; markEntryIdsDelivered: (entryIds: Iterable<string>) => void; markCurrentEntriesDeliveredSince: (cutoffTimeMs: number, options?: { includeAssistantMessages?: boolean }) => void; markUserTextDeliveredSince: (text: string, cutoffTimeMs: number) => void; markAssistantTextDeliveredSince: (text: string, cutoffTimeMs: number, untilTimeMs?: number) => void; capAssistantTextDeliveryWindow: (untilTimeMs: number) => void } | null {
  if (!options.sessionFile) {
    return null;
  }
  const sessionFile = options.sessionFile;

  let stopped = false;
  let currentPoll: Promise<void> | null = null;

  const mirror = new PiExternalMirror(sessionFile, options.initialEntries, async (entries) => {
    if (stopped) return;
    if (options.isManagedRuntimeActive?.()) {
      throw new Error('External Pi mirror suppressed while live runtime is active');
    }
    const pendingEntryIds = new Set(entries.map((entry) => entry.id));
    const envelopes = mapPiSessionHistoryToEnvelopeGroups(readPiSessionEntries(sessionFile))
      .filter((group) => pendingEntryIds.has(group.entryId))
      .flatMap((group) => group.envelopes);
    if (envelopes.length === 0) {
      return;
    }
    logger.debug('[pi] Mirroring external Pi JSONL entries', { entries: entries.length, envelopes: envelopes.length });
    const session = options.session();
    for (const envelope of envelopes) {
      if (stopped) return;
      session.sendSessionProtocolMessage(envelope, options.metaForEnvelope?.(envelope));
    }
    if (stopped) return;
    try {
      await session.flush();
      return true;
    } catch (error) {
      if (!(error instanceof SessionOutboxConflictError)) throw error;
      await options.onHistoryGap?.(error.message);
      return false;
    }
  });

  let polling = false;

  const interval = setInterval(() => {
    if (stopped) {
      return;
    }
    if (polling) {
      return;
    }
    polling = true;
    currentPoll = (async () => {
    try {
      if (options.isManagedRuntimeActive?.()) {
        // Do not advance the JSONL fallback watermark just because a live Pi
        // extension/runtime is active. Live delivery can buffer text until a
        // debounce/turn boundary, and extension events can be dropped. Entries
        // are marked known only after session-protocol envelopes are flushed
        // through markCurrentEntriesDelivered*. This keeps the fallback able to
        // recover a missing tail instead of permanently hiding it.
        return;
      }
      await mirror.tick();
    } catch (error) {
      logger.debug('[pi] External Pi mirror poll failed', error);
    } finally {
      polling = false;
      currentPoll = null;
    }
    })();
  }, options.pollMs ?? DEFAULT_POLL_MS);

  return {
    stop: async () => {
      stopped = true;
      clearInterval(interval);
      await currentPoll;
    },
    isEntryRelayConfirmed: (entryId: string) => mirror.isEntryRelayConfirmed(entryId),
    markCurrentEntriesKnown: () => mirror.markCurrentEntriesKnown(),
    markCurrentEntriesDelivered: () => mirror.markCurrentEntriesDelivered(),
    markEntryIdsDelivered: (entryIds: Iterable<string>) => mirror.markEntryIdsDelivered(entryIds),
    markCurrentEntriesDeliveredSince: (cutoffTimeMs: number, options?: { includeAssistantMessages?: boolean }) => mirror.markCurrentEntriesDeliveredSince(cutoffTimeMs, options),
    markUserTextDeliveredSince: (text: string, cutoffTimeMs: number) => mirror.markUserTextDeliveredSince(text, cutoffTimeMs),
    markAssistantTextDeliveredSince: (text: string, cutoffTimeMs: number, untilTimeMs?: number) => mirror.markAssistantTextDeliveredSince(text, cutoffTimeMs, untilTimeMs),
    capAssistantTextDeliveryWindow: (untilTimeMs: number) => mirror.capAssistantTextDeliveryWindow(untilTimeMs),
  };
}
