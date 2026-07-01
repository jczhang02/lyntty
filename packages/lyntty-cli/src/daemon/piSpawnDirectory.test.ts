import { describe, expect, it } from 'vitest';
import { choosePiSpawnDirectory } from './run';
import type { PiSessionRecoveryRecord } from '@/pi/runPiRecovery';

function piRecord(overrides: Partial<PiSessionRecoveryRecord>): PiSessionRecoveryRecord {
  return {
    state: 'discovered_local',
    piSessionId: 'pi-1',
    messageCount: 0,
    needsRegistration: true,
    needsBackfill: false,
    hasHistoryGap: false,
    reason: 'local',
    ...overrides,
  };
}

describe('choosePiSpawnDirectory', () => {
  it('uses the real local Pi cwd for historical session spawns', () => {
    expect(choosePiSpawnDirectory('~', 'pi-1', [
      piRecord({ piSessionId: 'pi-1', cwd: '/home/jc/dev/lyntty' }),
    ], '/home/jc')).toBe('/home/jc/dev/lyntty');
  });

  it('expands a redacted home path when no historical Pi cwd matches', () => {
    expect(choosePiSpawnDirectory('~/dev/lyntty', 'missing', [], '/home/jc')).toBe('/home/jc/dev/lyntty');
  });
});
