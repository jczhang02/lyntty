import { describe, expect, it } from 'vitest';

import {
  classifyPiSessionRecovery,
  discoverLocalPiSessions,
  discoverLocalPiSessionsPage,
  piSessionDisplayName,
  redactPiSessionForRelay,
  redactPiTextForRelay,
} from './runPiRecovery';

const now = new Date('2026-06-30T13:30:00Z');

function sessionInfo(overrides: Partial<any> = {}) {
  return {
    path: '/home/jc/.pi/agent/sessions/repo/session.jsonl',
    id: 'pi-1',
    cwd: '/home/jc/dev/repo',
    created: new Date('2026-06-30T12:00:00Z'),
    modified: new Date('2026-06-30T13:00:00Z'),
    messageCount: 3,
    firstMessage: 'hello',
    allMessagesText: 'hello world',
    ...overrides,
  };
}

describe('classifyPiSessionRecovery', () => {
  it('marks unregistered local Pi JSONL as discovered_local and needing registration/import', () => {
    expect(classifyPiSessionRecovery({ local: sessionInfo(), now })).toMatchObject({
      state: 'discovered_local',
      piSessionId: 'pi-1',
      needsRegistration: true,
      needsBackfill: true,
      hasHistoryGap: false,
    });
  });

  it('marks active registered runtime and blocks history_gap when local history is complete', () => {
    expect(classifyPiSessionRecovery({
      local: sessionInfo({ messageCount: 5 }),
      registered: { piSessionId: 'pi-1', relaySessionId: 'relay-1', importedMessageCount: 3 },
      active: true,
      now,
    })).toMatchObject({
      state: 'active_runtime',
      relaySessionId: 'relay-1',
      needsRegistration: false,
      needsBackfill: true,
      hasHistoryGap: false,
    });
  });

  it('marks missing local history when relay has registration but local JSONL is gone', () => {
    expect(classifyPiSessionRecovery({
      registered: { piSessionId: 'pi-1', relaySessionId: 'relay-1', importedMessageCount: 4 },
      now,
    })).toMatchObject({
      state: 'missing_local_history',
      needsBackfill: false,
      hasHistoryGap: true,
    });
  });

  it('marks history_gap when local Pi JSONL has fewer messages than import ledger expects', () => {
    expect(classifyPiSessionRecovery({
      local: sessionInfo({ messageCount: 2 }),
      registered: { piSessionId: 'pi-1', importedMessageCount: 5 },
      now,
    })).toMatchObject({
      state: 'history_gap',
      needsBackfill: false,
      hasHistoryGap: true,
    });
  });

  it('marks relay cache loss as registered but needing local backfill', () => {
    expect(classifyPiSessionRecovery({
      local: sessionInfo({ messageCount: 5 }),
      registered: { piSessionId: 'pi-1', importedMessageCount: 5, relayAvailable: false },
      now,
    })).toMatchObject({
      state: 'registered',
      needsBackfill: true,
      hasHistoryGap: false,
      reason: 'relay cache is missing session history and needs local backfill',
    });
  });

  it('marks stale registered local sessions', () => {
    expect(classifyPiSessionRecovery({
      local: sessionInfo({ modified: new Date('2026-06-01T00:00:00Z') }),
      registered: { piSessionId: 'pi-1', importedMessageCount: 3 },
      staleAfterMs: 1000,
      now,
    })).toMatchObject({
      state: 'stale_local',
      needsBackfill: false,
    });
  });

  it('truncates large Pi text fields before machine RPC exposure', () => {
    const record = classifyPiSessionRecovery({
      local: sessionInfo({
        name: 'n'.repeat(400),
        firstMessage: 'hello '.repeat(2000),
      }),
      now,
    });

    expect(record.name).toHaveLength(240);
    expect(record.name?.endsWith('…')).toBe(true);
    expect(record.firstMessage).toHaveLength(240);
    expect(record.firstMessage?.endsWith('…')).toBe(true);
  });

  it('marks import failures explicitly', () => {
    expect(classifyPiSessionRecovery({
      local: sessionInfo(),
      importError: 'invalid jsonl header',
      now,
    })).toMatchObject({
      state: 'import_failed',
      reason: 'invalid jsonl header',
    });
  });
});

describe('discoverLocalPiSessions', () => {
  it('classifies discovered local sessions with registered and active state', async () => {
    await expect(discoverLocalPiSessions({
      cwd: '/home/jc/dev/repo',
      registeredSessions: [{ piSessionId: 'pi-1', importedMessageCount: 3 }],
      activePiSessionIds: ['pi-1'],
      now,
      listSessions: async () => [sessionInfo()],
    })).resolves.toMatchObject([{ state: 'active_runtime', piSessionId: 'pi-1' }]);
  });

  it('paginates machine-wide Pi discovery by opaque newest-first cursor', async () => {
    const sessions = [
      sessionInfo({ id: 'pi-old', cwd: '/repo/old', modified: new Date('2026-06-30T10:00:00Z') }),
      sessionInfo({ id: 'pi-new', cwd: '/repo/new', modified: new Date('2026-06-30T14:00:00Z') }),
      sessionInfo({ id: 'pi-mid', cwd: '/repo/mid', modified: new Date('2026-06-30T12:00:00Z') }),
    ];

    const first = await discoverLocalPiSessionsPage({
      scope: 'machine',
      limit: 1,
      now,
      listSessions: async () => sessions,
    });
    expect(first.records).toMatchObject([{ piSessionId: 'pi-new' }]);
    expect(first.nextCursor).toBeTruthy();

    await expect(discoverLocalPiSessionsPage({
      scope: 'machine',
      limit: 2,
      cursor: first.nextCursor,
      now,
      listSessions: async () => sessions,
    })).resolves.toMatchObject({
      records: [
        { piSessionId: 'pi-mid' },
        { piSessionId: 'pi-old' },
      ],
      nextCursor: undefined,
      total: 3,
    });
  });

  it('keeps cursor stable when a newer Pi session appears before the next page', async () => {
    const first = await discoverLocalPiSessionsPage({
      scope: 'machine',
      limit: 1,
      now,
      listSessions: async () => [
        sessionInfo({ id: 'pi-new', cwd: '/repo/new', modified: new Date('2026-06-30T14:00:00Z') }),
        sessionInfo({ id: 'pi-mid', cwd: '/repo/mid', modified: new Date('2026-06-30T12:00:00Z') }),
        sessionInfo({ id: 'pi-old', cwd: '/repo/old', modified: new Date('2026-06-30T10:00:00Z') }),
      ],
    });
    expect(first.records).toMatchObject([{ piSessionId: 'pi-new' }]);

    const second = await discoverLocalPiSessionsPage({
      scope: 'machine',
      limit: 2,
      cursor: first.nextCursor,
      now,
      listSessions: async () => [
        sessionInfo({ id: 'pi-newer', cwd: '/repo/newer', modified: new Date('2026-06-30T15:00:00Z') }),
        sessionInfo({ id: 'pi-new', cwd: '/repo/new', modified: new Date('2026-06-30T14:00:00Z') }),
        sessionInfo({ id: 'pi-mid', cwd: '/repo/mid', modified: new Date('2026-06-30T12:00:00Z') }),
        sessionInfo({ id: 'pi-old', cwd: '/repo/old', modified: new Date('2026-06-30T10:00:00Z') }),
      ],
    });

    expect(second.records).toMatchObject([
      { piSessionId: 'pi-mid' },
      { piSessionId: 'pi-old' },
    ]);
  });

  it('orders active runtime sessions before pagination slices', async () => {
    await expect(discoverLocalPiSessionsPage({
      scope: 'machine',
      limit: 1,
      now,
      activePiSessionIds: ['pi-active'],
      registeredSessions: [{ piSessionId: 'pi-active', importedMessageCount: 1 }],
      listSessions: async () => [
        sessionInfo({ id: 'pi-new', cwd: '/repo/new', modified: new Date('2026-06-30T14:00:00Z') }),
        sessionInfo({ id: 'pi-active', cwd: '/repo/active', modified: new Date('2026-06-30T09:00:00Z') }),
      ],
    })).resolves.toMatchObject({
      records: [{ state: 'active_runtime', piSessionId: 'pi-active' }],
      total: 2,
    });
  });

  it('orders missing-local registered sessions by relay update time', async () => {
    await expect(discoverLocalPiSessionsPage({
      scope: 'machine',
      registeredSessions: [
        { piSessionId: 'pi-missing-old', relaySessionId: 'relay-old', importedMessageCount: 1, updatedAt: new Date('2026-06-30T10:00:00Z') },
        { piSessionId: 'pi-missing-new', relaySessionId: 'relay-new', importedMessageCount: 1, updatedAt: new Date('2026-06-30T13:10:00Z') },
      ],
      limit: 1,
      now,
      listSessions: async () => [],
    })).resolves.toMatchObject({
      records: [{ piSessionId: 'pi-missing-new' }],
      total: 2,
    });
  });

  it('emits registered relay sessions whose local Pi history is missing', async () => {
    await expect(discoverLocalPiSessions({
      scope: 'machine',
      registeredSessions: [{
        piSessionId: 'pi-missing',
        relaySessionId: 'relay-1',
        importedMessageCount: 42,
        updatedAt: new Date('2026-06-30T13:10:00Z'),
      }],
      now,
      listSessions: async () => [],
    })).resolves.toMatchObject([
      {
        state: 'missing_local_history',
        piSessionId: 'pi-missing',
        relaySessionId: 'relay-1',
        hasHistoryGap: true,
      },
    ]);
  });

  it('supports machine-wide historical Pi discovery without a cwd', async () => {
    await expect(discoverLocalPiSessions({
      scope: 'machine',
      now,
      listSessions: async () => [
        sessionInfo({ id: 'pi-1', cwd: '/repo/one' }),
        sessionInfo({ id: 'pi-2', cwd: '/repo/two', name: 'Two' }),
      ],
    })).resolves.toMatchObject([
      { state: 'discovered_local', piSessionId: 'pi-1', cwd: '/repo/one' },
      { state: 'discovered_local', piSessionId: 'pi-2', cwd: '/repo/two', name: 'Two' },
    ]);
  });
});

describe('Pi relay redaction', () => {
  it('redacts home paths and obvious token shapes before relay/client exposure', () => {
    expect(redactPiTextForRelay(
      'cwd=/home/jc/dev/repo authorization: BearerSECRET token=abc123 api_key=secret sk-abcdefghijklmnopqrstuvwxyz',
      '/home/jc',
    )).toBe('cwd=~/dev/repo authorization: REDACTED token=REDACTED api_key=REDACTED sk-REDACTED');
  });

  it('redacts recovery records', () => {
    expect(redactPiSessionForRelay({
      state: 'discovered_local',
      piSessionId: 'pi-1',
      path: '/home/jc/.pi/agent/sessions/session.jsonl',
      cwd: '/home/jc/dev/repo',
      name: 'token=abc123',
      messageCount: 1,
      needsRegistration: true,
      needsBackfill: true,
      hasHistoryGap: false,
      reason: 'path /home/jc/dev/repo',
    }, '/home/jc')).toMatchObject({
      path: '~/.pi/agent/sessions/session.jsonl',
      cwd: '~/dev/repo',
      name: 'token=REDACTED',
      reason: 'path ~/dev/repo',
    });
  });

  it('derives stable display names without leaking when explicit name exists', () => {
    expect(piSessionDisplayName({
      state: 'registered',
      piSessionId: 'pi-1',
      name: 'Release fix',
      messageCount: 1,
      needsRegistration: false,
      needsBackfill: false,
      hasHistoryGap: false,
      reason: 'ok',
    })).toBe('Release fix');
  });
});
