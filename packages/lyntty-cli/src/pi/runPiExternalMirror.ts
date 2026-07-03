import { closeSync, openSync, readFileSync, readSync, statSync } from 'node:fs';

import type { SessionEntry } from '@earendil-works/pi-coding-agent';

import type { ApiSessionClient } from '@/api/apiSession';
import { logger } from '@/ui/logger';
import { mapPiSessionHistoryToEnvelopes } from './runPiHistory';

const DEFAULT_QUIET_MS = 2_000;
const DEFAULT_POLL_MS = 1_000;

function isSessionEntry(entry: unknown): entry is SessionEntry {
  return !!entry
    && typeof entry === 'object'
    && (entry as { type?: unknown }).type !== 'session'
    && typeof (entry as { id?: unknown }).id === 'string';
}

export function readPiSessionEntries(file: string): SessionEntry[] {
  return parseJsonlSessionEntries(readFileSync(file, 'utf8'));
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

export class PiExternalMirror {
  private readonly knownEntryIds = new Set<string>();
  private pendingEntries: SessionEntry[] = [];
  private lastObservedChangeAt = 0;
  private lastMtimeMs = 0;
  private lastSize = 0;
  private lastReadOffset = 0;

  constructor(
    private readonly sessionFile: string,
    initialEntries: SessionEntry[],
    private readonly sendEntries: (entries: SessionEntry[]) => void | Promise<void>,
    private readonly quietMs = DEFAULT_QUIET_MS,
  ) {
    for (const entry of initialEntries) {
      this.knownEntryIds.add(entry.id);
    }
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

  markCurrentEntriesDeliveredSince(cutoffTimeMs: number): void {
    const entries = readPiSessionEntries(this.sessionFile);
    const deliveredIds = new Set(entries.filter((entry) => this.isExtensionDeliveredEntry(entry, cutoffTimeMs)).map((entry) => entry.id));
    this.pendingEntries = this.pendingEntries.filter((entry) => {
      if (!deliveredIds.has(entry.id)) return true;
      return false;
    });
    for (const entry of entries.filter((entry) => deliveredIds.has(entry.id))) {
      this.knownEntryIds.add(entry.id);
    }
  }

  private isExtensionDeliveredEntry(entry: SessionEntry, cutoffTimeMs: number): boolean {
    const entryTime = Date.parse(entry.timestamp);
    if (!Number.isFinite(entryTime) || entryTime < cutoffTimeMs) {
      return false;
    }
    if (entry.type !== 'message') {
      return true;
    }
    const role = (entry.message as { role?: unknown }).role;
    return role !== 'user';
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
    const pendingIds = new Set(this.pendingEntries.map((entry) => entry.id));
    const newEntries = entries.filter((entry: SessionEntry) => !this.knownEntryIds.has(entry.id) && !pendingIds.has(entry.id));
    if (newEntries.length > 0) {
      this.pendingEntries.push(...newEntries);
      this.lastObservedChangeAt = now;
      return;
    }

    if (this.pendingEntries.length > 0 && now - this.lastObservedChangeAt >= this.quietMs) {
      const pending = [...this.pendingEntries];
      await this.sendEntries(pending);
      const sentIds = new Set(pending.map((entry) => entry.id));
      this.pendingEntries = this.pendingEntries.filter((entry) => !sentIds.has(entry.id));
      for (const entry of pending) {
        this.knownEntryIds.add(entry.id);
      }
    }
  }
}

export function startPiExternalMirror(options: {
  sessionFile: string | undefined;
  initialEntries: SessionEntry[];
  session: () => ApiSessionClient;
  isManagedRuntimeActive?: () => boolean;
  pollMs?: number;
}): { stop: () => Promise<void>; markCurrentEntriesKnown: () => void; markCurrentEntriesDelivered: () => void; markCurrentEntriesDeliveredSince: (cutoffTimeMs: number) => void } | null {
  if (!options.sessionFile) {
    return null;
  }

  let stopped = false;
  let currentPoll: Promise<void> | null = null;

  const mirror = new PiExternalMirror(options.sessionFile, options.initialEntries, async (entries) => {
    if (stopped) return;
    if (options.isManagedRuntimeActive?.()) {
      throw new Error('External Pi mirror suppressed while live runtime is active');
    }
    const envelopes = mapPiSessionHistoryToEnvelopes(entries);
    if (envelopes.length === 0) {
      return;
    }
    logger.debug('[pi] Mirroring external Pi JSONL entries', { entries: entries.length, envelopes: envelopes.length });
    const session = options.session();
    for (const envelope of envelopes) {
      if (stopped) return;
      session.sendSessionProtocolMessage(envelope);
    }
    if (stopped) return;
    await session.flush();
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
        mirror.markCurrentEntriesKnown();
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
    markCurrentEntriesKnown: () => mirror.markCurrentEntriesKnown(),
    markCurrentEntriesDelivered: () => mirror.markCurrentEntriesDelivered(),
    markCurrentEntriesDeliveredSince: (cutoffTimeMs: number) => mirror.markCurrentEntriesDeliveredSince(cutoffTimeMs),
  };
}
