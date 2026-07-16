import { describe, expect, it } from 'bun:test';

import { createSessionMetadata } from './createSessionMetadata';

describe('createSessionMetadata', () => {
    it('creates Pi-only managed-session metadata without claiming unenforced sandboxing', () => {
        const { metadata, state } = createSessionMetadata({
            flavor: 'pi',
            machineId: 'machine-1',
            startedBy: 'daemon',
        });

        expect(metadata.flavor).toBe('pi');
        expect(metadata.machineId).toBe('machine-1');
        expect(metadata.startedBy).toBe('daemon');
        expect(metadata).not.toHaveProperty('sandbox');
        expect(state.controlledByUser).toBe(false);
    });
});
