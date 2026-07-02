import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionEntry, SessionHeader } from '@earendil-works/pi-coding-agent';

import { PiExternalMirror, startPiExternalMirror } from './runPiExternalMirror';

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

afterEach(() => {
  vi.useRealTimers();
});

describe('PiExternalMirror', () => {
  it('mirrors new JSONL entries only after a quiet window', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lyntty-pi-mirror-'));
    try {
      const file = join(dir, 'session.jsonl');
      const first = userEntry('u1', 'hello');
      writeJsonl(file, [header, first]);
      const sent: SessionEntry[][] = [];
      const mirror = new PiExternalMirror(file, [first], (entries) => sent.push(entries), 2_000);

      appendJsonl(file, userEntry('u2', 'external'));
      mirror.tick(1_000);
      expect(sent).toEqual([]);

      mirror.tick(2_000);
      expect(sent).toEqual([]);

      mirror.tick(3_100);
      expect(sent).toHaveLength(1);
      expect(sent[0].map((entry) => entry.id)).toEqual(['u2']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('preserves pending external entries when managed runtime becomes active before quiet', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lyntty-pi-mirror-'));
    try {
      const file = join(dir, 'session.jsonl');
      const first = userEntry('u1', 'hello');
      writeJsonl(file, [header, first]);
      const sent: SessionEntry[][] = [];
      const mirror = new PiExternalMirror(file, [first], (entries) => sent.push(entries), 2_000);

      appendJsonl(file, userEntry('u2', 'external'));
      mirror.tick(1_000);
      mirror.markCurrentEntriesKnown();
      mirror.tick(3_100);

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

  it('can mark managed runtime writes as already known without emitting them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lyntty-pi-mirror-'));
    try {
      const file = join(dir, 'session.jsonl');
      const first = userEntry('u1', 'hello');
      writeJsonl(file, [header, first]);
      const sent: SessionEntry[][] = [];
      const mirror = new PiExternalMirror(file, [first], (entries) => sent.push(entries), 2_000);

      appendJsonl(file, userEntry('u2', 'managed'));
      mirror.markCurrentEntriesKnown();
      mirror.tick(5_000);

      expect(sent).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
