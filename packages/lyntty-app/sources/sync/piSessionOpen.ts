import { storage, type SessionRowData } from './storage';
import { resolveOptimisticPiPath } from './piSessionOpenRequest';

export { buildPiSessionSpawnRequest, resolveOptimisticPiPath, shouldOpenPiSessionImmediately } from './piSessionOpenRequest';

export function applyOptimisticPiSession(source: SessionRowData, sessionId: string) {
    const now = Date.now();
    storage.getState().applySessions([{
        id: sessionId,
        seq: 0,
        createdAt: now,
        updatedAt: now,
        active: true,
        activeAt: now,
        metadata: {
            path: resolveOptimisticPiPath(source),
            host: source.machineId ?? 'node',
            flavor: 'pi',
            machineId: source.machineId ?? undefined,
            piSessionId: source.piSessionId ?? undefined,
            piDiscoveryState: 'active_runtime',
            piMessageCount: source.piMessageCount ?? undefined,
            piFirstMessage: source.piFirstMessage ?? undefined,
            piRecoveryReason: source.piRecoveryReason ?? undefined,
            piHasHistoryGap: source.piHasHistoryGap,
            name: source.name,
        },
        metadataVersion: 0,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
    }]);
}
