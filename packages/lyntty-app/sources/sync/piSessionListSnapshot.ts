import { mergePiDiscoveredSessions } from './piDiscoveredSessions';
import type { Machine, PiMachineSessionRecord, Session } from './storageTypes';

type SessionSnapshot = Array<Omit<Session, 'presence'> & { presence?: Session['presence'] }>;

export type DeletedPiSessionIdentity = {
    relaySessionId: string;
    machineId?: string;
    piSessionId?: string;
};

interface PendingMachineRefresh {
    refreshId: number;
    freshById: Map<string, PiMachineSessionRecord>;
    previous: PiMachineSessionRecord[];
    relaySeqAtStart: ReadonlyMap<string, number>;
}

function isRelaySession(session: SessionSnapshot[number]): boolean {
    return session.metadata?.piSynthetic !== true;
}

export class PiSessionListSnapshot {
    private machineSnapshots = new Map<string, PiMachineSessionRecord[]>();
    private pendingMachineRefreshes = new Map<string, PendingMachineRefresh>();
    private hiddenRelaySessionIds = new Set<string>();
    private hiddenPiSessionKeys = new Set<string>();
    private relaySeqAtDiscovery = new Map<string, number>();
    private nextRefreshId = 1;

    constructor(
        private readonly getCurrentSessions: () => SessionSnapshot,
        private readonly getCurrentMachine: (machineId: string) => Machine | undefined,
        private readonly onSnapshot: (sessions: SessionSnapshot) => void,
        private readonly onHiddenPiIdentity?: (identity: DeletedPiSessionIdentity) => void,
    ) {}

    captureRelaySessionIds(): Set<string> {
        return new Set(this.currentRelaySessions().map((session) => session.id));
    }

    commitRelaySnapshot(sessions: SessionSnapshot, requestStartIds: ReadonlySet<string>): void {
        const current = this.currentRelaySessions();
        const currentById = new Map(current.map((session) => [session.id, session]));
        for (const session of sessions) {
            if (this.hiddenRelaySessionIds.has(session.id)
                && session.metadata?.machineId
                && session.metadata.piSessionId) {
                this.promoteHiddenPiIdentity({
                    relaySessionId: session.id,
                    machineId: session.metadata.machineId,
                    piSessionId: session.metadata.piSessionId,
                });
            }
        }
        const visibleSessions = sessions.filter((session) => !this.hiddenRelaySessionIds.has(session.id));
        const fetchedIds = new Set(visibleSessions.map((session) => session.id));
        const committed: SessionSnapshot = [];

        for (const session of visibleSessions) {
            const currentSession = currentById.get(session.id);
            // A relay delete received while this HTTP request was in flight is
            // newer than the response and must not be resurrected.
            if (requestStartIds.has(session.id) && !currentSession) continue;
            committed.push(currentSession && currentSession.seq >= session.seq ? currentSession : session);
        }
        // Preserve rows first observed while the request was in flight. A
        // queued follow-up fetch will reconcile them with the next full server snapshot.
        for (const session of current) {
            if (!requestStartIds.has(session.id) && !fetchedIds.has(session.id)) {
                committed.push(session);
            }
        }

        this.emitSnapshot(committed);
    }

    beginMachineRefresh(machines: Machine[], pruneMissingMachines = false): number {
        const refreshId = this.nextRefreshId;
        this.nextRefreshId += 1;
        this.pendingMachineRefreshes.clear();
        const relaySeqAtStart = new Map(this.currentRelaySessions().flatMap((session): Array<[string, number]> => {
            const machineId = session.metadata?.machineId;
            const piSessionId = session.metadata?.piSessionId;
            return machineId && piSessionId ? [[`${machineId}:${piSessionId}`, session.seq]] : [];
        }));
        if (pruneMissingMachines) {
            const currentMachineIds = new Set(machines.map((machine) => machine.id));
            for (const machineId of this.machineSnapshots.keys()) {
                if (!currentMachineIds.has(machineId)) this.machineSnapshots.delete(machineId);
            }
        }
        for (const machine of machines) {
            this.pendingMachineRefreshes.set(machine.id, {
                refreshId,
                freshById: new Map(),
                previous: this.machineSnapshots.get(machine.id) ?? [],
                relaySeqAtStart,
            });
        }
        this.emitSnapshot();
        return refreshId;
    }

    applyMachinePage(
        refreshId: number,
        machineId: string,
        sessions: PiMachineSessionRecord[],
        complete: boolean,
    ): void {
        const pending = this.pendingMachineRefreshes.get(machineId);
        if (!pending || pending.refreshId !== refreshId || !this.getCurrentMachine(machineId)) return;

        for (const session of sessions) {
            if (session.relaySessionId && this.hiddenRelaySessionIds.has(session.relaySessionId)) {
                this.promoteHiddenPiIdentity({
                    relaySessionId: session.relaySessionId,
                    machineId,
                    piSessionId: session.piSessionId,
                });
            }
            if (!this.isHidden(machineId, session)) {
                pending.freshById.set(session.piSessionId, session);
                const key = `${machineId}:${session.piSessionId}`;
                this.relaySeqAtDiscovery.set(key, pending.relaySeqAtStart.get(key) ?? -1);
            }
        }
        const fresh = [...pending.freshById.values()];
        const displayed = complete
            ? fresh
            : [
                ...fresh,
                ...pending.previous.filter((session) => !pending.freshById.has(session.piSessionId)),
            ];
        this.machineSnapshots.set(machineId, displayed);
        if (complete) this.pendingMachineRefreshes.delete(machineId);
        this.emitSnapshot();
    }

    failMachineRefresh(refreshId: number, machineId: string): void {
        const pending = this.pendingMachineRefreshes.get(machineId);
        if (!pending || pending.refreshId !== refreshId) return;
        this.pendingMachineRefreshes.delete(machineId);
    }

    cancelPendingMachineRefreshes(): void {
        this.pendingMachineRefreshes.clear();
    }

    removeMachine(machineId: string): void {
        this.pendingMachineRefreshes.delete(machineId);
        this.machineSnapshots.delete(machineId);
        for (const key of this.relaySeqAtDiscovery.keys()) {
            if (key.startsWith(`${machineId}:`)) this.relaySeqAtDiscovery.delete(key);
        }
        this.emitSnapshot();
    }

    retainMachines(machineIds: ReadonlySet<string>): void {
        for (const machineId of this.machineSnapshots.keys()) {
            if (!machineIds.has(machineId)) this.machineSnapshots.delete(machineId);
        }
        for (const machineId of this.pendingMachineRefreshes.keys()) {
            if (!machineIds.has(machineId)) this.pendingMachineRefreshes.delete(machineId);
        }
        for (const key of this.relaySeqAtDiscovery.keys()) {
            const separator = key.indexOf(':');
            if (separator > 0 && !machineIds.has(key.slice(0, separator))) {
                this.relaySeqAtDiscovery.delete(key);
            }
        }
        this.emitSnapshot();
    }

    findPiIdentityByRelaySessionId(relaySessionId: string): Omit<DeletedPiSessionIdentity, 'relaySessionId'> | undefined {
        for (const [machineId, sessions] of this.machineSnapshots) {
            const match = sessions.find((session) => session.relaySessionId === relaySessionId);
            if (match) return { machineId, piSessionId: match.piSessionId };
        }
        for (const [machineId, pending] of this.pendingMachineRefreshes) {
            const candidates = [...pending.freshById.values(), ...pending.previous];
            const match = candidates.find((session) => session.relaySessionId === relaySessionId);
            if (match) return { machineId, piSessionId: match.piSessionId };
        }
        return undefined;
    }

    setDeletedSessions(identities: DeletedPiSessionIdentity[]): void {
        this.hiddenRelaySessionIds = new Set(identities.map((identity) => identity.relaySessionId));
        this.hiddenPiSessionKeys = new Set(identities.flatMap((identity) => (
            identity.machineId && identity.piSessionId
                ? [`${identity.machineId}:${identity.piSessionId}`]
                : []
        )));
        this.removeHiddenRecords();
    }

    hideDeletedSession(identity: DeletedPiSessionIdentity): void {
        this.hiddenRelaySessionIds.add(identity.relaySessionId);
        if (identity.machineId && identity.piSessionId) {
            this.hiddenPiSessionKeys.add(`${identity.machineId}:${identity.piSessionId}`);
        }
        this.removeHiddenRecords();
    }

    reset(): void {
        this.machineSnapshots.clear();
        this.pendingMachineRefreshes.clear();
        this.hiddenRelaySessionIds.clear();
        this.hiddenPiSessionKeys.clear();
        this.relaySeqAtDiscovery.clear();
    }

    private currentRelaySessions(): SessionSnapshot {
        return this.getCurrentSessions().filter((session) => (
            isRelaySession(session) && !this.hiddenRelaySessionIds.has(session.id)
        ));
    }

    private emitSnapshot(relaySessions = this.currentRelaySessions()): void {
        const machineSessions = [...this.machineSnapshots.entries()].flatMap(([machineId, sessions]) => {
            const machine = this.getCurrentMachine(machineId);
            return machine ? [{ machine, sessions }] : [];
        });
        this.onSnapshot(mergePiDiscoveredSessions(relaySessions, machineSessions, {
            hiddenRelaySessionIds: this.hiddenRelaySessionIds,
            hiddenPiSessionKeys: this.hiddenPiSessionKeys,
            relaySeqAtDiscovery: this.relaySeqAtDiscovery,
        }));
    }

    private isHidden(machineId: string, session: PiMachineSessionRecord): boolean {
        return Boolean(
            (session.relaySessionId && this.hiddenRelaySessionIds.has(session.relaySessionId))
            || this.hiddenPiSessionKeys.has(`${machineId}:${session.piSessionId}`),
        );
    }

    private promoteHiddenPiIdentity(identity: DeletedPiSessionIdentity): void {
        if (!identity.machineId || !identity.piSessionId) return;
        const key = `${identity.machineId}:${identity.piSessionId}`;
        const wasKnown = this.hiddenPiSessionKeys.has(key);
        this.hiddenPiSessionKeys.add(key);
        if (!wasKnown) this.onHiddenPiIdentity?.(identity);
    }

    private removeHiddenRecords(): void {
        for (const [machineId, sessions] of this.machineSnapshots) {
            this.machineSnapshots.set(machineId, sessions.filter((session) => !this.isHidden(machineId, session)));
        }
        for (const [machineId, pending] of this.pendingMachineRefreshes) {
            pending.previous = pending.previous.filter((session) => !this.isHidden(machineId, session));
            for (const [piSessionId, session] of pending.freshById) {
                if (this.isHidden(machineId, session)) pending.freshById.delete(piSessionId);
            }
        }
        this.emitSnapshot(this.currentRelaySessions().filter((session) => !this.hiddenRelaySessionIds.has(session.id)));
    }
}
