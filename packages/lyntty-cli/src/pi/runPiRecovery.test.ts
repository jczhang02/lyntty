import { describe, expect, it } from 'vitest';

import {
  classifyPiSessionRecovery,
  discoverLocalPiSessions,
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
