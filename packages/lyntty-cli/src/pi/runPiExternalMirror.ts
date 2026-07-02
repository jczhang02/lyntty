import { readFileSync, statSync } from 'node:fs';

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

function readSessionEntries(file: string): SessionEntry[] {
  return readFileSync(file, 'utf8')
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

export class PiExternalMirror {
  private readonly knownEntryIds = new Set<string>();
  private pendingEntries: SessionEntry[] = [];
  private lastObservedChangeAt = 0;
  private lastMtimeMs = 0;

  constructor(
    private readonly sessionFile: string,
    initialEntries: SessionEntry[],
    private readonly sendEntries: (entries: SessionEntry[]) => void,
    private readonly quietMs = DEFAULT_QUIET_MS,
  ) {
    for (const entry of initialEntries) {
      this.knownEntryIds.add(entry.id);
    }
  }

  markCurrentEntriesKnown(): void {
    const entries = readSessionEntries(this.sessionFile);
    const pendingIds = new Set(this.pendingEntries.map((entry) => entry.id));
    for (const entry of entries) {
      if (!pendingIds.has(entry.id)) {
        this.knownEntryIds.add(entry.id);
      }
    }
  }

  tick(now = Date.now()): void {
    const stat = statSync(this.sessionFile, { throwIfNoEntry: false });
    if (!stat) {
      return;
    }
    if (stat.mtimeMs === this.lastMtimeMs && this.pendingEntries.length === 0) {
      return;
    }
    this.lastMtimeMs = stat.mtimeMs;

    const entries = readSessionEntries(this.sessionFile);
    const newEntries = entries.filter((entry: SessionEntry) => !this.knownEntryIds.has(entry.id));
    if (newEntries.length > 0) {
      for (const entry of newEntries) {
        this.knownEntryIds.add(entry.id);
      }
      this.pendingEntries.push(...newEntries);
      this.lastObservedChangeAt = now;
      return;
    }

    if (this.pendingEntries.length > 0 && now - this.lastObservedChangeAt >= this.quietMs) {
      const pending = this.pendingEntries;
      this.pendingEntries = [];
      this.sendEntries(pending);
    }
  }
}

export function startPiExternalMirror(options: {
  sessionFile: string | undefined;
  initialEntries: SessionEntry[];
  session: () => ApiSessionClient;
  isManagedRuntimeActive?: () => boolean;
  pollMs?: number;
}): { stop: () => void; markCurrentEntriesKnown: () => void } | null {
  if (!options.sessionFile) {
    return null;
  }

  const mirror = new PiExternalMirror(options.sessionFile, options.initialEntries, (entries) => {
    const envelopes = mapPiSessionHistoryToEnvelopes(entries);
    if (envelopes.length === 0) {
      return;
    }
    logger.debug('[pi] Mirroring external Pi JSONL entries', { entries: entries.length, envelopes: envelopes.length });
    const session = options.session();
    for (const envelope of envelopes) {
      session.sendSessionProtocolMessage(envelope);
    }
    void session.flush();
  });

  const interval = setInterval(() => {
    try {
      if (options.isManagedRuntimeActive?.()) {
        mirror.markCurrentEntriesKnown();
        return;
      }
      mirror.tick();
    } catch (error) {
      logger.debug('[pi] External Pi mirror poll failed', error);
    }
  }, options.pollMs ?? DEFAULT_POLL_MS);

  return {
    stop: () => clearInterval(interval),
    markCurrentEntriesKnown: () => mirror.markCurrentEntriesKnown(),
  };
}
