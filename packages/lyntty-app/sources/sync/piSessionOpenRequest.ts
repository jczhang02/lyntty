import type { SessionRowData } from './storage';
import type { SpawnSessionOptions } from './ops';

export function shouldOpenPiSessionImmediately(source: SessionRowData): boolean {
    return !!source.piSynthetic && source.id.startsWith('pi-local:');
}

export function resolveOptimisticPiPath(source: SessionRowData): string {
    const path = source.path ?? source.subtitle ?? '';
    if (path === '~' && source.homeDir) {
        return source.homeDir;
    }
    if (path.startsWith('~/') && source.homeDir) {
        return `${source.homeDir}/${path.slice(2)}`;
    }
    return path;
}

export function buildPiSessionSpawnRequest(source: SessionRowData): SpawnSessionOptions | null {
    if (!source.machineId || !source.piSessionId || !source.path) {
        return null;
    }

    return {
        machineId: source.machineId,
        directory: source.path,
        sessionId: source.piSessionId,
        agent: 'pi',
        approvedNewDirectoryCreation: true,
    };
}
