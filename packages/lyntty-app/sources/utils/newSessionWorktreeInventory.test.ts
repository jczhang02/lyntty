import { describe, expect, it } from 'bun:test';

import {
    advanceWorktreeRequestVersion,
    currentWorktreeItems,
    isCurrentWorktreeSelection,
    type NewSessionWorktreeInventory,
} from './newSessionWorktreeInventory';

const inventory: NewSessionWorktreeInventory<{ key: string; label: string }> = {
    machineId: 'machine-a',
    basePath: '/repo-a',
    generation: 3,
    status: 'success',
    items: [{ key: '/repo-a/.dev/worktree/feature', label: 'feature' }],
};

describe('new-session worktree inventory identity', () => {
    it('exposes results only to the exact machine and base path that produced them', () => {
        expect(currentWorktreeItems(inventory, 'machine-a', '/repo-a', 3)).toHaveLength(1);
        expect(currentWorktreeItems(inventory, 'machine-b', '/repo-a', 3)).toEqual([]);
        expect(currentWorktreeItems(inventory, 'machine-a', '/repo-b', 3)).toEqual([]);
        expect(currentWorktreeItems(inventory, 'machine-a', '/repo-a', 4)).toEqual([]);
    });

    it('rejects an old worktree selection after identity changes or during refresh', () => {
        const key = '/repo-a/.dev/worktree/feature';
        expect(isCurrentWorktreeSelection(key, inventory, 'machine-a', '/repo-a', 3)).toBe(true);
        expect(isCurrentWorktreeSelection(key, inventory, 'machine-b', '/repo-a', 3)).toBe(false);
        expect(isCurrentWorktreeSelection(key, inventory, 'machine-a', '/repo-b', 3)).toBe(false);
        expect(isCurrentWorktreeSelection(key, inventory, 'machine-a', '/repo-a', 4)).toBe(false);
        expect(isCurrentWorktreeSelection(key, { ...inventory, status: 'loading' }, 'machine-a', '/repo-a', 3)).toBe(false);
        expect(isCurrentWorktreeSelection(key, { ...inventory, status: 'error', error: 'offline' }, 'machine-a', '/repo-a', 3)).toBe(false);
    });

    it('invalidates inventory synchronously when refresh or connectivity identity changes', () => {
        const initial = { identity: '["machine-a","/repo-a",true,0]', generation: 3 };
        const reopened = advanceWorktreeRequestVersion(
            initial,
            '["machine-a","/repo-a",true,1]',
        );
        const offline = advanceWorktreeRequestVersion(
            reopened,
            '["machine-a","/repo-a",false,1]',
        );

        expect(reopened.generation).toBe(4);
        expect(offline.generation).toBe(5);
        expect(currentWorktreeItems(inventory, 'machine-a', '/repo-a', reopened.generation)).toEqual([]);
        expect(isCurrentWorktreeSelection(
            '/repo-a/.dev/worktree/feature',
            inventory,
            'machine-a',
            '/repo-a',
            reopened.generation,
        )).toBe(false);
    });

    it('keeps fixed no-worktree and new-worktree choices independent of inventory', () => {
        expect(isCurrentWorktreeSelection('__none__', null, 'machine-a', '/repo-a', 1)).toBe(true);
        expect(isCurrentWorktreeSelection('__new__', null, 'machine-a', '/repo-a', 1)).toBe(true);
    });
});
