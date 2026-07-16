import type { Metadata } from './storageTypes';

/**
 * Control fails closed unless the session carries explicit current Pi identity.
 * Flavorless and non-Pi rows remain encrypted-history compatibility only.
 */
export function canControlSession(metadata: Pick<Metadata, 'flavor'> | null | undefined): boolean {
    return metadata?.flavor?.trim().toLowerCase() === 'pi';
}
