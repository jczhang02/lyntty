import type { Machine } from './storageTypes';

/**
 * Merge an authoritative HTTP machine list without rolling back socket updates
 * that arrived after that HTTP request began.
 */
export function mergeAuthoritativeMachineSnapshot(
    fetched: Machine[],
    current: Machine[],
    requestStart: ReadonlyMap<string, Machine>,
): Machine[] {
    const merged = new Map(fetched.map((machine) => [machine.id, machine]));
    const currentById = new Map(current.map((machine) => [machine.id, machine]));
    for (const machineId of requestStart.keys()) {
        if (!currentById.has(machineId)) merged.delete(machineId);
    }
    for (const machine of current) {
        const atRequestStart = requestStart.get(machine.id);
        const changedDuringRequest = atRequestStart === undefined || atRequestStart !== machine;
        if (!changedDuringRequest) continue;
        const fetchedMachine = merged.get(machine.id);
        if (!fetchedMachine || machine.seq > fetchedMachine.seq) {
            merged.set(machine.id, machine);
            continue;
        }
        if (machine.seq === fetchedMachine.seq) {
            merged.set(machine.id, {
                ...fetchedMachine,
                updatedAt: Math.max(fetchedMachine.updatedAt, machine.updatedAt),
                active: machine.active,
                activeAt: machine.activeAt,
                ...(machine.metadataVersion >= fetchedMachine.metadataVersion ? {
                    metadata: machine.metadata,
                    metadataVersion: machine.metadataVersion,
                } : {}),
                ...(machine.daemonStateVersion >= fetchedMachine.daemonStateVersion ? {
                    daemonState: machine.daemonState,
                    daemonStateVersion: machine.daemonStateVersion,
                } : {}),
            });
        }
    }
    return [...merged.values()];
}
