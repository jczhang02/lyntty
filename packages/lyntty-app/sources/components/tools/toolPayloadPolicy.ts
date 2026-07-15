import type { Metadata } from '@/sync/storageTypes';

export function shouldHideGenericToolPayload(metadata: Metadata | null, hasSpecializedFullView: boolean): boolean {
    if (hasSpecializedFullView) {
        return false;
    }
    return metadata?.flavor === 'pi';
}
