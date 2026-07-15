import type { Metadata } from './storageTypes';

/**
 * Only current Pi sessions are controllable. Flavorless rows predate explicit
 * Pi metadata and remain controllable for backward compatibility; an explicit
 * non-Pi flavor is encrypted-history compatibility only.
 */
export function canControlSession(metadata: Pick<Metadata, 'flavor'> | null | undefined): boolean {
    const flavor = metadata?.flavor?.trim().toLowerCase();
    return !flavor || flavor === 'pi';
}
