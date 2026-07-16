import { describe, expect, it } from 'bun:test';
import type { ClientConnection } from '@/app/events/eventRouter';
import { canAccessMachine, canUpdateMachineMetadata } from './machineUpdateHandler';
import { canAccessSession } from './sessionUpdateHandler';

const socket = {} as never;

function userConnection(): ClientConnection {
    return { connectionType: 'user-scoped', socket, userId: 'user-1' };
}

function sessionConnection(sessionId: string): ClientConnection {
    return { connectionType: 'session-scoped', socket, userId: 'user-1', sessionId };
}

function machineConnection(machineId: string): ClientConnection {
    return { connectionType: 'machine-scoped', socket, userId: 'user-1', machineId };
}

describe('socket scope guards', () => {
    it('prevents session-scoped and machine-scoped sockets from mutating other sessions', () => {
        expect(canAccessSession(userConnection(), 'session-1')).toBe(true);
        expect(canAccessSession(sessionConnection('session-1'), 'session-1')).toBe(true);
        expect(canAccessSession(sessionConnection('session-1'), 'session-2')).toBe(false);
        expect(canAccessSession(machineConnection('machine-1'), 'session-1')).toBe(false);
    });

    it('keeps daemon machine state scoped to the bound machine while allowing user metadata edits', () => {
        expect(canAccessMachine(machineConnection('machine-1'), 'machine-1')).toBe(true);
        expect(canAccessMachine(machineConnection('machine-1'), 'machine-2')).toBe(false);
        expect(canAccessMachine(userConnection(), 'machine-1')).toBe(false);
        expect(canUpdateMachineMetadata(userConnection(), 'machine-1')).toBe(true);
        expect(canUpdateMachineMetadata(machineConnection('machine-1'), 'machine-1')).toBe(true);
        expect(canUpdateMachineMetadata(machineConnection('machine-1'), 'machine-2')).toBe(false);
    });

});
