import type { Machine, PiMachineSessionRecord, Session } from './storageTypes';

export function getSyntheticPiSessionId(machineId: string, piSessionId: string): string {
    return `pi-local:${machineId}:${piSessionId}`;
}

function resolveTimestamp(value: number | undefined, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function resolvePiActivityTimestamp(record: PiMachineSessionRecord, fallback: number): number {
    if (record.state === 'active_runtime') {
        return resolveTimestamp(record.registeredUpdatedAt, resolveTimestamp(record.modifiedAt, fallback));
    }
    return resolveTimestamp(record.modifiedAt, resolveTimestamp(record.registeredUpdatedAt, fallback));
}

export function shouldShowPiDiscoveredRecord(record: PiMachineSessionRecord): boolean {
    if (record.state === 'missing_local_history') {
        return false;
    }
    if (record.state !== 'active_runtime' && (record.messageCount ?? 0) <= 0) {
        return false;
    }
    return true;
}

function shouldShowRelaySession(session: Omit<Session, 'presence'> & { presence?: Session['presence'] }): boolean {
    const state = session.metadata?.piDiscoveryState;
    if (state === 'missing_local_history') {
        return false;
    }
    return true;
}

function resolvePiSessionTitle(record: PiMachineSessionRecord, fallback: string): string {
    return record.name?.trim() || record.firstMessage?.trim() || fallback;
}

function resolvePiRuntimeOwner(record: PiMachineSessionRecord): string {
    if (record.state === 'missing_local_history') return 'none';
    if (record.state === 'active_runtime') return 'pi-extension';
    return 'lyntty-sdk';
}

function resolvePiControlState(record: PiMachineSessionRecord): string {
    switch (record.state) {
        case 'active_runtime':
            return 'ready';
        case 'missing_local_history':
            return 'missing_local_history';
        case 'stale_local':
            return 'computer_offline';
        case 'history_gap':
            return 'history_gap';
        default:
            return 'queued';
    }
}

function buildPiMetadata(
    record: PiMachineSessionRecord,
    machine: Machine,
    synthetic: boolean,
): NonNullable<Session['metadata']> {
    const machineMetadata = machine.metadata;
    const cwd = record.cwd || record.path || machineMetadata?.homeDir || '~';

    return {
        path: cwd,
        host: machineMetadata?.host || machine.id,
        homeDir: machineMetadata?.homeDir,
        lynttyHomeDir: machineMetadata?.lynttyHomeDir,
        machineId: machine.id,
        flavor: 'pi',
        piSessionId: record.piSessionId,
        name: resolvePiSessionTitle(record, machineMetadata?.displayName || machineMetadata?.host || 'Pi'),
        piDiscoveryState: record.state,
        piMessageCount: record.messageCount,
        piFirstMessage: record.firstMessage,
        piRecoveryReason: record.reason,
        piHasHistoryGap: record.hasHistoryGap,
        ...(synthetic ? {
            piHistoryHasMore: (record.messageCount ?? 0) > 0,
            piHistoryTotalMessages: record.messageCount,
        } : {}),
        piSynthetic: synthetic,
        lifecycleState: record.state === 'active_runtime' ? 'running' : record.state,
        lifecycleStateSince: resolvePiActivityTimestamp(record, Date.now()),
        runtimeOwner: resolvePiRuntimeOwner(record),
        controlState: resolvePiControlState(record),
    };
}

export function enrichSessionWithPiDiscovery(
    session: Omit<Session, 'presence'> & { presence?: Session['presence'] },
    record: PiMachineSessionRecord,
    machine: Machine,
): Omit<Session, 'presence'> & { presence?: Session['presence'] } {
    const discoveredMetadata = buildPiMetadata(record, machine, false);
    const active = record.state === 'active_runtime';
    const hasPersistedHistoryGap = session.metadata?.piHasHistoryGap === true
        || session.metadata?.controlState === 'history_gap';
    const updatedAt = Math.max(session.updatedAt, resolvePiActivityTimestamp(record, session.updatedAt));
    return {
        ...session,
        updatedAt,
        active: active ? true : session.active,
        activeAt: active ? updatedAt : session.activeAt,
        presence: active ? 'online' : session.presence,
        metadata: {
            ...(session.metadata ?? {}),
            ...discoveredMetadata,
            path: session.metadata?.path ?? discoveredMetadata.path,
            homeDir: session.metadata?.homeDir ?? discoveredMetadata.homeDir,
            lynttyHomeDir: session.metadata?.lynttyHomeDir ?? discoveredMetadata.lynttyHomeDir,
            summary: session.metadata?.summary,
            piHasHistoryGap: hasPersistedHistoryGap || discoveredMetadata.piHasHistoryGap,
            piRecoveryReason: hasPersistedHistoryGap
                ? session.metadata?.piRecoveryReason
                : discoveredMetadata.piRecoveryReason,
            controlState: hasPersistedHistoryGap ? 'history_gap' : discoveredMetadata.controlState,
        },
    };
}

export function createSyntheticPiSession(
    record: PiMachineSessionRecord,
    machine: Machine,
): Omit<Session, 'presence'> & { presence?: Session['presence'] } {
    const now = Date.now();
    const createdAt = resolveTimestamp(record.createdAt, resolvePiActivityTimestamp(record, now));
    const updatedAt = resolvePiActivityTimestamp(record, createdAt);
    const active = record.state === 'active_runtime';

    return {
        id: getSyntheticPiSessionId(machine.id, record.piSessionId),
        seq: 0,
        createdAt,
        updatedAt,
        active,
        activeAt: updatedAt,
        metadata: buildPiMetadata(record, machine, true),
        metadataVersion: 0,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        presence: active ? 'online' : updatedAt,
    };
}

export function mergePiDiscoveredSessions(
    relaySessions: Array<Omit<Session, 'presence'> & { presence?: Session['presence'] }>,
    machineSessions: Array<{ machine: Machine; sessions: PiMachineSessionRecord[] }>,
): Array<Omit<Session, 'presence'> & { presence?: Session['presence'] }> {
    const merged = relaySessions.filter(shouldShowRelaySession);
    const byRelayId = new Map(merged.map((session, index) => [session.id, index]));
    const byPiId = new Map<string, number>();

    merged.forEach((session, index) => {
        const machineId = session.metadata?.machineId;
        const piSessionId = session.metadata?.piSessionId;
        if (machineId && piSessionId) {
            byPiId.set(`${machineId}:${piSessionId}`, index);
        }
    });

    for (const { machine, sessions } of machineSessions) {
        for (const record of sessions) {
            if (!shouldShowPiDiscoveredRecord(record)) {
                continue;
            }

            const existingIndex = record.relaySessionId
                ? byRelayId.get(record.relaySessionId)
                : byPiId.get(`${machine.id}:${record.piSessionId}`);

            if (existingIndex !== undefined) {
                merged[existingIndex] = enrichSessionWithPiDiscovery(merged[existingIndex], record, machine);
                continue;
            }

            const synthetic = createSyntheticPiSession(record, machine);
            byRelayId.set(synthetic.id, merged.length);
            byPiId.set(`${machine.id}:${record.piSessionId}`, merged.length);
            merged.push(synthetic);
        }
    }

    return merged;
}
