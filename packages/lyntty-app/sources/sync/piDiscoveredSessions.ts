import type { Machine, PiMachineSessionRecord, Session } from './storageTypes';

export function getSyntheticPiSessionId(machineId: string, piSessionId: string): string {
    return `pi-local:${machineId}:${piSessionId}`;
}

function resolveTimestamp(value: number | undefined, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function resolvePiSessionTitle(record: PiMachineSessionRecord): string {
    return record.name?.trim() || record.firstMessage?.trim() || record.piSessionId;
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
        name: resolvePiSessionTitle(record),
        piDiscoveryState: record.state,
        piMessageCount: record.messageCount,
        piFirstMessage: record.firstMessage,
        piRecoveryReason: record.reason,
        piHasHistoryGap: record.hasHistoryGap,
        piSynthetic: synthetic,
        lifecycleState: record.state,
        lifecycleStateSince: resolveTimestamp(record.modifiedAt, Date.now()),
    };
}

export function enrichSessionWithPiDiscovery(
    session: Omit<Session, 'presence'> & { presence?: Session['presence'] },
    record: PiMachineSessionRecord,
    machine: Machine,
): Omit<Session, 'presence'> & { presence?: Session['presence'] } {
    const discoveredMetadata = buildPiMetadata(record, machine, false);
    return {
        ...session,
        updatedAt: Math.max(session.updatedAt, resolveTimestamp(record.modifiedAt, session.updatedAt)),
        metadata: {
            ...(session.metadata ?? {}),
            ...discoveredMetadata,
            path: session.metadata?.path ?? discoveredMetadata.path,
            homeDir: session.metadata?.homeDir ?? discoveredMetadata.homeDir,
            lynttyHomeDir: session.metadata?.lynttyHomeDir ?? discoveredMetadata.lynttyHomeDir,
            summary: session.metadata?.summary,
        },
    };
}

export function createSyntheticPiSession(
    record: PiMachineSessionRecord,
    machine: Machine,
): Omit<Session, 'presence'> & { presence?: Session['presence'] } {
    const now = Date.now();
    const createdAt = resolveTimestamp(record.createdAt, resolveTimestamp(record.modifiedAt, now));
    const updatedAt = resolveTimestamp(record.modifiedAt, createdAt);
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
    const merged = [...relaySessions];
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
