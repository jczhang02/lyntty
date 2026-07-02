import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import type { SessionEntry, SessionHeader } from '@earendil-works/pi-coding-agent';

import { PiExternalMirror } from './runPiExternalMirror';

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
