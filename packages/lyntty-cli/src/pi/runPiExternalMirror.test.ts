import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionEntry, SessionHeader } from '@earendil-works/pi-coding-agent';

import { PiExternalMirror, readPiSessionEntriesFromOffset, startPiExternalMirror } from './runPiExternalMirror';

function writeJsonl(path: string, entries: Array<SessionHeader | SessionEntry>): void {
  writeFileSync(path, `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
}

function appendJsonl(path: string, entry: SessionEntry): void {
  appendFileSync(path, `${JSON.stringify(entry)}\n`);
}

const header: SessionHeader = {
  type: 'session',
  id: 'pi-session-1',
  timestamp: '2026-07-02T00:00:00.000Z',
  cwd: '/repo',
};

const userEntry = (id: string, text: string): SessionEntry => ({
  type: 'message',
  id,
  parentId: null,
  timestamp: '2026-07-02T00:00:01.000Z',
  message: {
    role: 'user',
    content: text,
  } as any,
});

const assistantEntry = (id: string, text: string): SessionEntry => ({
  type: 'message',
  id,
  parentId: null,
  timestamp: '2026-07-02T00:00:01.000Z',
  message: {
    role: 'assistant',
    content: [{ type: 'text', text }],
  } as any,
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PiExternalMirror', () => {
  it('treats a not-yet-created Pi JSONL file as empty during live-delivery dedupe', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lyntty-pi-mirror-'));
    try {
      const file = join(dir, 'missing.jsonl');
      const mirror = new PiExternalMirror(file, [], () => {}, 2_000);

      expect(() => mirror.markUserTextDeliveredSince('early input', 0)).not.toThrow();
      expect(() => mirror.markCurrentEntriesDeliveredSince(0, { includeAssistantMessages: true })).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });


  it('reads appended JSONL entries from a byte offset', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lyntty-pi-mirror-'));
    try {
      const file = join(dir, 'session.jsonl');
      const first = userEntry('u1', 'hello');
      writeJsonl(file, [header, first]);
      const offset = Buffer.byteLength(`${JSON.stringify(header)}\n${JSON.stringify(first)}\n`);
      appendJsonl(file, userEntry('u2', 'external'));

      const result = readPiSessionEntriesFromOffset(file, offset);
      expect(result.entries.map((entry) => entry.id)).toEqual(['u2']);
      expect(result.nextOffset).toBeGreaterThan(offset);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not advance the byte cursor past an incomplete JSONL line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lyntty-pi-mirror-'));
    try {
      const file = join(dir, 'session.jsonl');
      writeJsonl(file, [header]);
      const offset = Buffer.byteLength(`${JSON.stringify(header)}\n`);
      appendFileSync(file, JSON.stringify(userEntry('u2', 'partial')));

      const result = readPiSessionEntriesFromOffset(file, offset);
      expect(result.entries).toEqual([]);
      expect(result.nextOffset).toBe(offset);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('mirrors entries already on disk when initialEntries are stale', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lyntty-pi-mirror-'));
    try {
      const file = join(dir, 'session.jsonl');
      const first = userEntry('u1', 'hello');
      writeJsonl(file, [header, first, userEntry('u2', 'startup race')]);
      const sent: SessionEntry[][] = [];
      const mirror = new PiExternalMirror(file, [first], (entries) => {
        sent.push(entries);
      }, 2_000);

      await mirror.tick(1_000);
      await mirror.tick(3_100);
      expect(sent).toHaveLength(1);
      expect(sent[0].map((entry) => entry.id)).toEqual(['u2']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('mirrors new JSONL entries only after a quiet window', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lyntty-pi-mirror-'));
    try {
      const file = join(dir, 'session.jsonl');
      const first = userEntry('u1', 'hello');
      writeJsonl(file, [header, first]);
      const sent: SessionEntry[][] = [];
      const mirror = new PiExternalMirror(file, [first], (entries) => {
        sent.push(entries);
      }, 2_000);

      appendJsonl(file, userEntry('u2', 'external'));
      await mirror.tick(1_000);
      expect(sent).toEqual([]);

      await mirror.tick(2_000);
      expect(sent).toEqual([]);

      await mirror.tick(3_100);
      expect(sent).toHaveLength(1);
      expect(sent[0].map((entry) => entry.id)).toEqual(['u2']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('preserves pending external entries when managed runtime becomes active before quiet', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lyntty-pi-mirror-'));
    try {
      const file = join(dir, 'session.jsonl');
      const first = userEntry('u1', 'hello');
      writeJsonl(file, [header, first]);
      const sent: SessionEntry[][] = [];
      const mirror = new PiExternalMirror(file, [first], (entries) => {
        sent.push(entries);
      }, 2_000);

      appendJsonl(file, userEntry('u2', 'external'));
      await mirror.tick(1_000);
      mirror.markCurrentEntriesKnown();
      await mirror.tick(3_100);

      expect(sent).toHaveLength(1);
      expect(sent[0].map((entry) => entry.id)).toEqual(['u2']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('forwards quiet external writes through session-protocol envelopes and flushes once', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const dir = mkdtempSync(join(tmpdir(), 'lyntty-pi-mirror-'));
    try {
      const file = join(dir, 'session.jsonl');
      const first = userEntry('u1', 'hello');
      writeJsonl(file, [header, first]);
      const sendSessionProtocolMessage = vi.fn();
      const flush = vi.fn().mockResolvedValue(undefined);
      const mirror = startPiExternalMirror({
        sessionFile: file,
        initialEntries: [first],
        session: () => ({ sendSessionProtocolMessage, flush }) as any,
        pollMs: 100,
      });
      expect(mirror).not.toBeNull();

      appendJsonl(file, userEntry('u2', 'external mobile-visible line'));
      await vi.advanceTimersByTimeAsync(100);
      expect(sendSessionProtocolMessage).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(2_200);
      expect(sendSessionProtocolMessage).toHaveBeenCalledTimes(1);
      expect(sendSessionProtocolMessage.mock.calls[0][0]).toMatchObject({
        id: 'pi-history-u2-user',
        role: 'user',
        ev: { t: 'text', text: 'external mobile-visible line' },
      });
      expect(flush).toHaveBeenCalledTimes(1);
      mirror?.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not mark JSONL writes known merely because the live runtime is active', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const dir = mkdtempSync(join(tmpdir(), 'lyntty-pi-mirror-'));
    try {
      const file = join(dir, 'session.jsonl');
      const first = userEntry('u1', 'hello');
      writeJsonl(file, [header, first]);
      const sendSessionProtocolMessage = vi.fn();
      const flush = vi.fn().mockResolvedValue(undefined);
      let active = true;
      const mirror = startPiExternalMirror({
        sessionFile: file,
        initialEntries: [first],
        session: () => ({ sendSessionProtocolMessage, flush }) as any,
        isManagedRuntimeActive: () => active,
        pollMs: 100,
      });
      expect(mirror).not.toBeNull();

      appendJsonl(file, userEntry('u2', 'fallback must recover this tail'));
      await vi.advanceTimersByTimeAsync(500);
      expect(sendSessionProtocolMessage).not.toHaveBeenCalled();

      active = false;
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(2_200);
      expect(sendSessionProtocolMessage).toHaveBeenCalledWith(expect.objectContaining({
        id: 'pi-history-u2-user',
        ev: { t: 'text', text: 'fallback must recover this tail' },
      }), undefined);
      expect(flush).toHaveBeenCalledTimes(1);
      await mirror?.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('suppresses assistant JSONL entries that appear after live extension delivery was marked', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lyntty-pi-mirror-'));
    try {
      const file = join(dir, 'session.jsonl');
      const first = userEntry('u1', 'hello');
      writeJsonl(file, [header, first]);
      const sent: SessionEntry[][] = [];
      const mirror = new PiExternalMirror(file, [first], (entries) => {
        sent.push(entries);
      }, 2_000);

      mirror.markAssistantTextDeliveredSince('live extension already sent this late entry', Date.parse('2026-07-02T00:00:00.000Z'));
      appendJsonl(file, assistantEntry('a2', 'live extension already sent this late entry'));
      await mirror.tick(1_000);
      await mirror.tick(3_100);

      expect(sent).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('forwards assistant-delivery marking through the startPiExternalMirror wrapper', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const dir = mkdtempSync(join(tmpdir(), 'lyntty-pi-mirror-'));
    try {
      const file = join(dir, 'session.jsonl');
      const first = userEntry('u1', 'hello');
      writeJsonl(file, [header, first]);
      const sendSessionProtocolMessage = vi.fn();
      const flush = vi.fn().mockResolvedValue(undefined);
      const mirror = startPiExternalMirror({
        sessionFile: file,
        initialEntries: [first],
        session: () => ({ sendSessionProtocolMessage, flush }) as any,
        pollMs: 100,
      });
      expect(mirror).not.toBeNull();

      appendJsonl(file, assistantEntry('a2', 'already delivered completed turn'));
      await vi.advanceTimersByTimeAsync(100);
      mirror?.markAssistantTextDeliveredSince('already delivered completed turn', Date.parse('2026-07-02T00:00:00.000Z'));
      await vi.advanceTimersByTimeAsync(2_200);

      expect(sendSessionProtocolMessage).not.toHaveBeenCalled();
      expect(flush).not.toHaveBeenCalled();
      await mirror?.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('can attach remote command metadata to mirrored Pi user echoes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const dir = mkdtempSync(join(tmpdir(), 'lyntty-pi-mirror-'));
    try {
      const file = join(dir, 'session.jsonl');
      const first = userEntry('u1', 'hello');
      writeJsonl(file, [header, first]);
      const sendSessionProtocolMessage = vi.fn();
      const flush = vi.fn().mockResolvedValue(undefined);
      const mirror = startPiExternalMirror({
        sessionFile: file,
        initialEntries: [first],
        session: () => ({ sendSessionProtocolMessage, flush }) as any,
        metaForEnvelope: (envelope) => envelope.role === 'user'
          ? { remoteCommandLocalKey: 'mobile-local-1', remoteCommandState: 'accepted_by_pi' }
          : undefined,
        pollMs: 100,
      });
      expect(mirror).not.toBeNull();

      appendJsonl(file, userEntry('u2', 'phone echo'));
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(2_200);

      expect(sendSessionProtocolMessage).toHaveBeenCalledWith(expect.objectContaining({
        id: 'pi-history-u2-user',
        ev: { t: 'text', text: 'phone echo' },
      }), { remoteCommandLocalKey: 'mobile-local-1', remoteCommandState: 'accepted_by_pi' });
      await mirror?.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('retries pending entries when sending fails', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lyntty-pi-mirror-'));
    try {
      const file = join(dir, 'session.jsonl');
      const first = userEntry('u1', 'hello');
      writeJsonl(file, [header, first]);
      const sent: SessionEntry[][] = [];
      let fail = true;
      const mirror = new PiExternalMirror(file, [first], (entries) => {
        if (fail) {
          fail = false;
          throw new Error('relay unavailable');
        }
        sent.push(entries);
      }, 2_000);

      appendJsonl(file, userEntry('u2', 'external'));
      await mirror.tick(1_000);
      await expect(mirror.tick(3_100)).rejects.toThrow('relay unavailable');
      expect(sent).toEqual([]);

      await mirror.tick(3_200);
      expect(sent).toHaveLength(1);
      expect(sent[0].map((entry) => entry.id)).toEqual(['u2']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps pending entries older than the live extension coverage window', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lyntty-pi-mirror-'));
    try {
      const file = join(dir, 'session.jsonl');
      const first = userEntry('u1', 'hello');
      writeJsonl(file, [header, first]);
      const sent: SessionEntry[][] = [];
      const mirror = new PiExternalMirror(file, [first], (entries) => {
        sent.push(entries);
      }, 2_000);

      appendJsonl(file, userEntry('u2', 'before extension'));
      await mirror.tick(1_000);
      mirror.markCurrentEntriesDeliveredSince(Date.parse('2026-07-02T00:00:02.000Z'));
      await mirror.tick(3_100);

      expect(sent).toHaveLength(1);
      expect(sent[0].map((entry) => entry.id)).toEqual(['u2']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('drops a pending user entry only when the live extension delivered the same user text', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lyntty-pi-mirror-'));
    try {
      const file = join(dir, 'session.jsonl');
      const first = userEntry('u1', 'hello');
      writeJsonl(file, [header, first]);
      const sent: SessionEntry[][] = [];
      const mirror = new PiExternalMirror(file, [first], (entries) => {
        sent.push(entries);
      }, 2_000);

      appendJsonl(file, userEntry('u2', 'computer typed prompt'));
      await mirror.tick(1_000);
      mirror.markUserTextDeliveredSince('computer typed prompt', Date.parse('2026-07-02T00:00:00.000Z'));
      await mirror.tick(3_100);

      expect(sent).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps pending user entries that do not match a live extension input', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lyntty-pi-mirror-'));
    try {
      const file = join(dir, 'session.jsonl');
      const first = userEntry('u1', 'hello');
      writeJsonl(file, [header, first]);
      const sent: SessionEntry[][] = [];
      const mirror = new PiExternalMirror(file, [first], (entries) => {
        sent.push(entries);
      }, 2_000);

      appendJsonl(file, userEntry('u2', 'computer typed prompt'));
      await mirror.tick(1_000);
      mirror.markUserTextDeliveredSince('different prompt', Date.parse('2026-07-02T00:00:00.000Z'));
      await mirror.tick(3_100);

      expect(sent).toHaveLength(1);
      expect(sent[0].map((entry) => entry.id)).toEqual(['u2']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps pending user entries when only non-user extension delivery was marked', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lyntty-pi-mirror-'));
    try {
      const file = join(dir, 'session.jsonl');
      const first = userEntry('u1', 'hello');
      writeJsonl(file, [header, first]);
      const sent: SessionEntry[][] = [];
      const mirror = new PiExternalMirror(file, [first], (entries) => {
        sent.push(entries);
      }, 2_000);

      appendJsonl(file, userEntry('u2', 'computer typed prompt'));
      await mirror.tick(1_000);
      mirror.markCurrentEntriesDeliveredSince(Date.parse('2026-07-02T00:00:00.000Z'));
      await mirror.tick(3_100);

      expect(sent).toHaveLength(1);
      expect(sent[0].map((entry) => entry.id)).toEqual(['u2']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps pending assistant entries until a completed live turn marks assistant delivery', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lyntty-pi-mirror-'));
    try {
      const file = join(dir, 'session.jsonl');
      const first = userEntry('u1', 'hello');
      writeJsonl(file, [header, first]);
      const sent: SessionEntry[][] = [];
      const mirror = new PiExternalMirror(file, [first], (entries) => {
        sent.push(entries);
      }, 2_000);

      appendJsonl(file, assistantEntry('a2', 'live extension already sent this'));
      await mirror.tick(1_000);
      mirror.markCurrentEntriesDeliveredSince(Date.parse('2026-07-02T00:00:00.000Z'));
      await mirror.tick(3_100);

      expect(sent).toHaveLength(1);
      expect(sent[0].map((entry) => entry.id)).toEqual(['a2']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('drops pending assistant entries when the live extension delivered the same assistant text', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lyntty-pi-mirror-'));
    try {
      const file = join(dir, 'session.jsonl');
      const first = userEntry('u1', 'hello');
      writeJsonl(file, [header, first]);
      const sent: SessionEntry[][] = [];
      const mirror = new PiExternalMirror(file, [first], (entries) => {
        sent.push(entries);
      }, 2_000);

      appendJsonl(file, assistantEntry('a2', 'live extension already sent this'));
      await mirror.tick(1_000);
      mirror.markAssistantTextDeliveredSince('live extension already sent this', Date.parse('2026-07-02T00:00:00.000Z'));
      await mirror.tick(3_100);

      expect(sent).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps pending assistant entries when the live extension delivered different text', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lyntty-pi-mirror-'));
    try {
      const file = join(dir, 'session.jsonl');
      const first = userEntry('u1', 'hello');
      writeJsonl(file, [header, first]);
      const sent: SessionEntry[][] = [];
      const mirror = new PiExternalMirror(file, [first], (entries) => {
        sent.push(entries);
      }, 2_000);

      appendJsonl(file, assistantEntry('a2', 'fallback must recover this tail'));
      await mirror.tick(1_000);
      mirror.markAssistantTextDeliveredSince('different live text', Date.parse('2026-07-02T00:00:00.000Z'));
      await mirror.tick(3_100);

      expect(sent).toHaveLength(1);
      expect(sent[0].map((entry) => entry.id)).toEqual(['a2']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('can mark managed runtime writes as already known without emitting them', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lyntty-pi-mirror-'));
    try {
      const file = join(dir, 'session.jsonl');
      const first = userEntry('u1', 'hello');
      writeJsonl(file, [header, first]);
      const sent: SessionEntry[][] = [];
      const mirror = new PiExternalMirror(file, [first], (entries) => {
        sent.push(entries);
      }, 2_000);

      appendJsonl(file, userEntry('u2', 'managed'));
      mirror.markCurrentEntriesKnown();
      await mirror.tick(5_000);

      expect(sent).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
