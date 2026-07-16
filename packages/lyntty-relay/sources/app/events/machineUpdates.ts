import type { UpdatePayload } from './eventRouter';

type MachineUpdateSource = {
    id: string;
    seq: number;
    metadata: string;
    metadataVersion: number;
    daemonState: string | null;
    daemonStateVersion: number;
    dataEncryptionKey: Uint8Array | null;
    active: boolean;
    lastActiveAt: Date;
    createdAt: Date;
    updatedAt: Date;
};

export function buildNewMachineUpdate(
    machine: MachineUpdateSource,
    updateSeq: number,
    updateId: string,
): UpdatePayload {
    return {
        id: updateId,
        seq: updateSeq,
        body: {
            t: 'new-machine',
            machineId: machine.id,
            seq: machine.seq,
            metadata: machine.metadata,
            metadataVersion: machine.metadataVersion,
            daemonState: machine.daemonState,
            daemonStateVersion: machine.daemonStateVersion,
            dataEncryptionKey: machine.dataEncryptionKey
                ? Buffer.from(machine.dataEncryptionKey).toString('base64')
                : null,
            active: machine.active,
            activeAt: machine.lastActiveAt.getTime(),
            createdAt: machine.createdAt.getTime(),
            updatedAt: machine.updatedAt.getTime(),
        },
        createdAt: Date.now(),
    };
}

export function buildUpdateMachineUpdate(
    machineId: string,
    updateSeq: number,
    updateId: string,
    metadata?: { value: string; version: number },
    daemonState?: { value: string; version: number },
): UpdatePayload {
    return {
        id: updateId,
        seq: updateSeq,
        body: {
            t: 'update-machine',
            machineId,
            metadata,
            daemonState,
        },
        createdAt: Date.now(),
    };
}

export function buildDeleteMachineUpdate(
    machineId: string,
    updateSeq: number,
    updateId: string,
): UpdatePayload {
    return {
        id: updateId,
        seq: updateSeq,
        body: {
            t: 'delete-machine',
            machineId,
        },
        createdAt: Date.now(),
    };
}
