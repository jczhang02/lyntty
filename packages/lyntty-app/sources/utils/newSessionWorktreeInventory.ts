export type NewSessionWorktreeRequestVersion = {
    identity: string;
    generation: number;
};

export function advanceWorktreeRequestVersion(
    current: NewSessionWorktreeRequestVersion,
    identity: string,
): NewSessionWorktreeRequestVersion {
    return current.identity === identity
        ? current
        : { identity, generation: current.generation + 1 };
}

export type NewSessionWorktreeInventory<T extends { key: string }> = {
    machineId: string;
    basePath: string;
    generation: number;
    status: 'loading' | 'success' | 'error';
    items: T[];
    error?: string;
};

export function isCurrentWorktreeInventory<T extends { key: string }>(
    inventory: NewSessionWorktreeInventory<T> | null,
    machineId: string | null,
    basePath: string | null,
    generation: number,
): inventory is NewSessionWorktreeInventory<T> {
    return inventory !== null
        && machineId !== null
        && basePath !== null
        && inventory.machineId === machineId
        && inventory.basePath === basePath
        && inventory.generation === generation;
}

export function currentWorktreeItems<T extends { key: string }>(
    inventory: NewSessionWorktreeInventory<T> | null,
    machineId: string | null,
    basePath: string | null,
    generation: number,
): T[] {
    return isCurrentWorktreeInventory(inventory, machineId, basePath, generation)
        && inventory.status === 'success'
        ? inventory.items
        : [];
}

export function isCurrentWorktreeSelection(
    worktreeKey: string,
    inventory: NewSessionWorktreeInventory<{ key: string }> | null,
    machineId: string | null,
    basePath: string | null,
    generation: number,
): boolean {
    if (worktreeKey === '__none__' || worktreeKey === '__new__') {
        return true;
    }
    return currentWorktreeItems(inventory, machineId, basePath, generation)
        .some(item => item.key === worktreeKey);
}
