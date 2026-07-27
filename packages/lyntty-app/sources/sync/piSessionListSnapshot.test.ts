import { describe, expect, it } from 'bun:test';

import type { Machine, PiMachineSessionRecord, Session } from './storageTypes';
import { PiSessionListSnapshot } from './piSessionListSnapshot';

type SessionSnapshot = Array<Omit<Session, 'presence'> & { presence?: Session['presence'] }>;

function machine(id = 'machine-1'): Machine {
    return {
        id,
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: {
            host: id,
            platform: 'linux',
            lynttyCliVersion: '1.2.0',
            lynttyHomeDir: `/home/${id}/.lyntty`,
            homeDir: `/home/${id}`,
        },
        metadataVersion: 1,
        daemonState: null,
        daemonStateVersion: 1,
    };
}

function relaySession(id = 'relay-1'): Omit<Session, 'presence'> & { presence?: Session['presence'] } {
    return {
        id,
        seq: 1,
        createdAt: 100,
        updatedAt: 100,
        active: false,
        activeAt: 100,
        metadata: {
            path: '/repo',
            host: 'machine-1',
            machineId: 'machine-1',
            flavor: 'pi',
            piSessionId: 'pi-relay',
            name: 'Relay session',
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 0,
    };
}

function piRecord(id: string, modifiedAt: number, relaySessionId?: string): PiMachineSessionRecord {
    return {
        state: 'discovered_local',
        piSessionId: id,
        relaySessionId,
        cwd: `/repo/${id}`,
        name: id,
        createdAt: modifiedAt - 1,
        modifiedAt,
        firstMessage: id,
        messageCount: 1,
        needsRegistration: !relaySessionId,
        needsBackfill: true,
        hasHistoryGap: false,
        reason: 'local Pi JSONL session needs discovery reconciliation',
    };
}

function ids(sessions: SessionSnapshot): string[] {
    return sessions.map((session) => session.metadata?.piSessionId ?? session.id);
}

function createHarness(
    nodes = [machine()],
    onHiddenPiIdentity?: ConstructorParameters<typeof PiSessionListSnapshot>[3],
): {
    snapshot: PiSessionListSnapshot;
    updates: SessionSnapshot[];
    getStored: () => SessionSnapshot;
    setStored: (sessions: SessionSnapshot) => void;
    nodes: Map<string, Machine>;
} {
    let stored: SessionSnapshot = [];
    const machineById = new Map(nodes.map((node) => [node.id, node]));
    const updates: SessionSnapshot[] = [];
    const snapshot = new PiSessionListSnapshot(
        () => stored,
        (machineId) => machineById.get(machineId),
        (sessions) => {
            stored = sessions;
            updates.push(sessions);
        },
        onHiddenPiIdentity,
    );
    return {
        snapshot,
        updates,
        getStored: () => stored,
        setStored: (sessions) => { stored = sessions; },
        nodes: machineById,
    };
}

describe('PiSessionListSnapshot', () => {
    it('publishes relay rows first and adds each discovery page immediately', () => {
        const harness = createHarness();
        const node = harness.nodes.get('machine-1')!;

        harness.snapshot.commitRelaySnapshot([relaySession()], new Set());
        expect(ids(harness.updates.at(-1)!)).toEqual(['pi-relay']);

        const refreshId = harness.snapshot.beginMachineRefresh([node]);
        harness.snapshot.applyMachinePage(refreshId, node.id, [piRecord('pi-new', 300)], false);
        expect(ids(harness.updates.at(-1)!)).toEqual(['pi-relay', 'pi-new']);

        harness.snapshot.applyMachinePage(refreshId, node.id, [piRecord('pi-old', 200)], true);
        expect(ids(harness.updates.at(-1)!)).toEqual(['pi-relay', 'pi-new', 'pi-old']);
    });

    it('keeps unseen rows during a refresh and removes deleted rows only after EOF', () => {
        const harness = createHarness();
        const node = harness.nodes.get('machine-1')!;

        let refreshId = harness.snapshot.beginMachineRefresh([node]);
        harness.snapshot.applyMachinePage(refreshId, node.id, [piRecord('pi-kept', 200), piRecord('pi-deleted', 100)], true);
        expect(ids(harness.updates.at(-1)!)).toEqual(['pi-kept', 'pi-deleted']);

        refreshId = harness.snapshot.beginMachineRefresh([node]);
        harness.snapshot.applyMachinePage(refreshId, node.id, [piRecord('pi-kept', 300)], false);
        expect(ids(harness.updates.at(-1)!)).toEqual(['pi-kept', 'pi-deleted']);

        harness.snapshot.applyMachinePage(refreshId, node.id, [], true);
        expect(ids(harness.updates.at(-1)!)).toEqual(['pi-kept']);
    });

    it('keeps known rows when a machine is temporarily offline', () => {
        const harness = createHarness();
        const node = harness.nodes.get('machine-1')!;
        const refreshId = harness.snapshot.beginMachineRefresh([node]);
        harness.snapshot.applyMachinePage(refreshId, node.id, [piRecord('pi-offline', 100)], true);

        harness.snapshot.beginMachineRefresh([]);

        expect(ids(harness.getStored())).toEqual(['pi-offline']);
    });

    it('ignores late pages from an obsolete refresh generation', () => {
        const harness = createHarness();
        const node = harness.nodes.get('machine-1')!;
        const oldRefreshId = harness.snapshot.beginMachineRefresh([node]);
        const currentRefreshId = harness.snapshot.beginMachineRefresh([node]);

        harness.snapshot.applyMachinePage(oldRefreshId, node.id, [piRecord('pi-stale', 100)], true);
        harness.snapshot.applyMachinePage(currentRefreshId, node.id, [piRecord('pi-current', 200)], true);

        expect(ids(harness.updates.at(-1)!)).toEqual(['pi-current']);
        expect(ids(harness.updates.at(-1)!)).not.toContain('pi-stale');
    });

    it('retains the previous machine snapshot when a refresh fails', () => {
        const harness = createHarness();
        const node = harness.nodes.get('machine-1')!;
        let refreshId = harness.snapshot.beginMachineRefresh([node]);
        harness.snapshot.applyMachinePage(refreshId, node.id, [piRecord('pi-existing', 100)], true);

        refreshId = harness.snapshot.beginMachineRefresh([node]);
        harness.snapshot.failMachineRefresh(refreshId, node.id);

        expect(ids(harness.updates.at(-1)!)).toEqual(['pi-existing']);
    });

    it('never rolls a newer relay mutation back when a later Pi page arrives', () => {
        const harness = createHarness();
        const node = harness.nodes.get('machine-1')!;
        const startedWith = harness.snapshot.captureRelaySessionIds();
        harness.snapshot.commitRelaySnapshot([relaySession()], startedWith);
        const refreshId = harness.snapshot.beginMachineRefresh([node]);
        harness.snapshot.applyMachinePage(refreshId, node.id, [piRecord('pi-relay', 300, 'relay-1')], false);

        const currentRelay = harness.getStored().find((session) => session.id === 'relay-1')!;
        harness.setStored(harness.getStored().map((session) => session.id === 'relay-1'
            ? {
                ...currentRelay,
                seq: 2,
                agentState: { controlledByUser: true },
                agentStateVersion: 2,
                active: false,
                presence: 400,
                metadata: {
                    ...currentRelay.metadata!,
                    name: 'Newer socket title',
                    runtimeOwner: 'none',
                    piHasHistoryGap: true,
                    controlState: 'history_gap',
                },
            }
            : session));
        harness.snapshot.applyMachinePage(refreshId, node.id, [piRecord('pi-relay', 200, 'relay-1')], true);

        const relay = harness.getStored().find((session) => session.id === 'relay-1');
        expect(relay).toMatchObject({
            seq: 2,
            active: false,
            presence: 400,
            agentState: { controlledByUser: true },
            metadata: {
                name: 'Newer socket title',
                runtimeOwner: 'none',
                piHasHistoryGap: true,
                controlState: 'history_gap',
            },
        });
    });

    it('clears a provisional discovery gap after a verified complete refresh', () => {
        const harness = createHarness();
        const node = harness.nodes.get('machine-1')!;
        harness.snapshot.commitRelaySnapshot([relaySession()], new Set());
        const staleGap = {
            ...piRecord('pi-relay', 210, 'relay-1'),
            state: 'history_gap' as const,
            summaryComplete: true,
            messageCount: 2,
            needsBackfill: false,
            hasHistoryGap: true,
        };
        const firstRefresh = harness.snapshot.beginMachineRefresh([node]);
        harness.snapshot.applyMachinePage(firstRefresh, node.id, [staleGap], false);
        expect(harness.getStored().find((session) => session.id === 'relay-1')?.metadata).toMatchObject({
            controlState: 'history_gap',
            piHistoryGapSource: 'discovery',
        });

        const complete = {
            ...staleGap,
            state: 'registered' as const,
            messageCount: 5,
            hasHistoryGap: false,
        };
        const secondRefresh = harness.snapshot.beginMachineRefresh([node]);
        harness.snapshot.applyMachinePage(secondRefresh, node.id, [complete], true);
        expect(harness.getStored().find((session) => session.id === 'relay-1')?.metadata).toMatchObject({
            controlState: 'queued',
            piHasHistoryGap: false,
        });
    });

    it('does not resurrect a deleted relay id or accept a late page for a removed machine', () => {
        const harness = createHarness();
        const node = harness.nodes.get('machine-1')!;
        harness.snapshot.commitRelaySnapshot([relaySession()], new Set());
        const refreshId = harness.snapshot.beginMachineRefresh([node]);
        harness.snapshot.applyMachinePage(refreshId, node.id, [piRecord('pi-relay', 210, 'relay-1')], false);
        expect(harness.snapshot.findPiIdentityByRelaySessionId('relay-1')).toEqual({
            machineId: node.id,
            piSessionId: 'pi-relay',
        });

        harness.snapshot.hideDeletedSession({
            relaySessionId: 'relay-1',
            machineId: node.id,
            piSessionId: 'pi-relay',
        });
        harness.setStored([]);
        harness.snapshot.applyMachinePage(refreshId, node.id, [piRecord('pi-relay', 200, 'relay-1')], false);
        expect(harness.getStored().some((session) => session.id === 'relay-1')).toBe(false);
        expect(ids(harness.getStored())).not.toContain('pi-relay');

        harness.nodes.delete(node.id);
        harness.snapshot.removeMachine(node.id);
        harness.snapshot.applyMachinePage(refreshId, node.id, [piRecord('pi-late', 300)], true);
        expect(ids(harness.getStored())).not.toContain('pi-late');
    });

    it('does not resurrect an ordinary session deleted before an old relay snapshot returns', () => {
        const harness = createHarness();
        const requestStartIds = harness.snapshot.captureRelaySessionIds();
        harness.snapshot.hideDeletedSession({ relaySessionId: 'ordinary-deleted' });

        harness.snapshot.commitRelaySnapshot([{
            ...relaySession('ordinary-deleted'),
            metadata: { name: 'Ordinary session', path: '/repo', host: 'machine-1' },
        }], requestStartIds);

        expect(ids(harness.getStored())).not.toContain('ordinary-deleted');
    });

    it('promotes an unknown delete to a Pi identity when discovery arrives later', () => {
        const promoted: Array<{ relaySessionId: string; machineId?: string; piSessionId?: string }> = [];
        const harness = createHarness([machine()], (identity) => promoted.push(identity));
        const node = harness.nodes.get('machine-1')!;
        harness.snapshot.hideDeletedSession({ relaySessionId: 'late-pi-delete' });
        const refreshId = harness.snapshot.beginMachineRefresh([node]);
        harness.snapshot.applyMachinePage(
            refreshId,
            node.id,
            [piRecord('pi-deleted-late', 200, 'late-pi-delete')],
            true,
        );

        expect(promoted).toEqual([{
            relaySessionId: 'late-pi-delete',
            machineId: 'machine-1',
            piSessionId: 'pi-deleted-late',
        }]);
        expect(ids(harness.getStored())).not.toContain('pi-deleted-late');

        const restarted = createHarness();
        restarted.snapshot.setDeletedSessions(promoted);
        const restartedNode = restarted.nodes.get('machine-1')!;
        const restartedRefresh = restarted.snapshot.beginMachineRefresh([restartedNode]);
        restarted.snapshot.applyMachinePage(
            restartedRefresh,
            restartedNode.id,
            [piRecord('pi-deleted-late', 200)],
            true,
        );
        expect(ids(restarted.getStored())).not.toContain('pi-deleted-late');
    });

    it('promotes a deleted stable tag before tag-only discovery can resurrect it', () => {
        const promoted: Array<{
            relaySessionId: string;
            relaySessionTag?: string;
            machineId?: string;
            piSessionId?: string;
        }> = [];
        const harness = createHarness([machine()], (identity) => promoted.push(identity));
        const node = harness.nodes.get('machine-1')!;
        harness.snapshot.hideDeletedSession({
            relaySessionId: 'legacy-relay-delete',
            relaySessionTag: 'pi:stable-tag',
        });

        const refreshId = harness.snapshot.beginMachineRefresh([node]);
        harness.snapshot.applyMachinePage(refreshId, node.id, [{
            ...piRecord('pi-tag-only', 200),
            relaySessionTag: 'pi:stable-tag',
        }], true);

        expect(promoted).toEqual([{
            relaySessionId: 'legacy-relay-delete',
            relaySessionTag: 'pi:stable-tag',
            machineId: 'machine-1',
            piSessionId: 'pi-tag-only',
        }]);
        expect(ids(harness.getStored())).not.toContain('pi-tag-only');

        const restarted = createHarness();
        restarted.snapshot.setDeletedSessions(promoted);
        const restartedNode = restarted.nodes.get('machine-1')!;
        const restartedRefresh = restarted.snapshot.beginMachineRefresh([restartedNode]);
        restarted.snapshot.applyMachinePage(restartedRefresh, restartedNode.id, [{
            ...piRecord('pi-tag-only', 200),
            relaySessionTag: 'pi:stable-tag',
        }], true);
        expect(ids(restarted.getStored())).not.toContain('pi-tag-only');
    });

    it('restores account-scoped deletion tombstones before discovery after restart', () => {
        const harness = createHarness();
        const node = harness.nodes.get('machine-1')!;
        harness.snapshot.setDeletedSessions([{
            relaySessionId: 'relay-deleted',
            machineId: node.id,
            piSessionId: 'pi-deleted',
        }]);

        const refreshId = harness.snapshot.beginMachineRefresh([node]);
        harness.snapshot.applyMachinePage(refreshId, node.id, [piRecord('pi-deleted', 200)], true);

        expect(ids(harness.getStored())).not.toContain('pi-deleted');
    });

    it('prunes snapshots for nodes absent from an authoritative machine list', () => {
        const harness = createHarness();
        const node = harness.nodes.get('machine-1')!;
        const refreshId = harness.snapshot.beginMachineRefresh([node]);
        harness.snapshot.applyMachinePage(refreshId, node.id, [piRecord('pi-old-node', 100)], true);
        harness.nodes.delete(node.id);

        harness.snapshot.retainMachines(new Set());

        expect(ids(harness.getStored())).not.toContain('pi-old-node');
    });

    it('preserves relay mutations that happen while a full relay request is in flight', () => {
        const harness = createHarness();
        const initialRelay = relaySession();
        harness.snapshot.commitRelaySnapshot([initialRelay], new Set());
        const startedWith = harness.snapshot.captureRelaySessionIds();
        harness.setStored([{
            ...initialRelay,
            seq: 2,
            metadata: { ...initialRelay.metadata!, controlState: 'history_gap' },
        }]);

        harness.snapshot.commitRelaySnapshot([relaySession()], startedWith);

        expect(harness.getStored()[0]).toMatchObject({
            seq: 2,
            metadata: { controlState: 'history_gap' },
        });
    });
});
