import { beforeEach, describe, expect, it } from 'bun:test';

import { useNewSessionDraft } from './useNewSessionDraft';

function selectExistingWorktree() {
    const draft = useNewSessionDraft.getState();
    draft.setMachineId('machine-a');
    draft.setPath('/repo-a');
    draft.setSessionType('worktree');
    draft.setWorktreeKey('/repo-a/.dev/worktree/feature-a');
}

describe('new-session draft selection identity', () => {
    beforeEach(() => {
        selectExistingWorktree();
    });

    it('clears worktree mode and path when the machine changes elsewhere', () => {
        useNewSessionDraft.getState().setMachineId('machine-b');

        expect(useNewSessionDraft.getState()).toMatchObject({
            selectedMachineId: 'machine-b',
            selectedPath: null,
            sessionType: 'simple',
            worktreeKey: null,
        });
    });

    it('clears worktree mode when the base path changes elsewhere', () => {
        useNewSessionDraft.getState().setPath('/repo-b');

        expect(useNewSessionDraft.getState()).toMatchObject({
            selectedMachineId: 'machine-a',
            selectedPath: '/repo-b',
            sessionType: 'simple',
            worktreeKey: null,
        });
    });
});
