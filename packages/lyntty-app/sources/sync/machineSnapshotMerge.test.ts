import { describe, expect, it } from 'bun:test';

import { mergeAuthoritativeMachineSnapshot } from './machineSnapshotMerge';
import type { Machine } from './storageTypes';

function machine(id: string, options: Partial<Machine> = {}): Machine {
    return {
        id,
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: false,
        activeAt: 1,
        metadata: null,
        metadataVersion: 0,
        daemonState: null,
        daemonStateVersion: 0,
        ...options,
    };
}

describe('mergeAuthoritativeMachineSnapshot', () => {
    it('retains a machine created by a socket update during the HTTP request', () => {
        const oldMachine = machine('old');
        const newMachine = machine('new');
        expect(mergeAuthoritativeMachineSnapshot(
            [oldMachine],
            [oldMachine, newMachine],
            new Map([['old', oldMachine]]),
        ).map((entry) => entry.id)).toEqual(['old', 'new']);
    });

    it('retains same-seq activity changes that arrived during the HTTP request', () => {
        const atStart = machine('old', { active: false });
        const socketUpdate = { ...atStart, active: true, activeAt: 2 };
        const [merged] = mergeAuthoritativeMachineSnapshot(
            [machine('old', { active: false })],
            [socketUpdate],
            new Map([['old', atStart]]),
        );
        expect(merged).toMatchObject({ active: true, activeAt: 2 });
    });

    it('removes an unchanged machine absent from the authoritative response', () => {
        const atStart = machine('removed');
        expect(mergeAuthoritativeMachineSnapshot([], [atStart], new Map([['removed', atStart]])))
            .toEqual([]);
    });

    it('does not resurrect a machine deleted by a socket update during the request', () => {
        const atStart = machine('deleted');
        expect(mergeAuthoritativeMachineSnapshot(
            [atStart],
            [],
            new Map([['deleted', atStart]]),
        )).toEqual([]);
    });

    it('prefers a fetched machine with a newer sequence', () => {
        const atStart = machine('old', { seq: 1 });
        const socketUpdate = { ...atStart, active: true };
        const fetched = machine('old', { seq: 2 });
        expect(mergeAuthoritativeMachineSnapshot(
            [fetched],
            [socketUpdate],
            new Map([['old', atStart]]),
        )).toEqual([fetched]);
    });
});
