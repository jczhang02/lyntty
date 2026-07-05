type PetSpecies = 'cat' | 'pig' | 'dog';
type PetAccessory = 'bow' | 'tag' | 'terminal' | 'spark' | 'none';
type PetEyes = 'dot' | 'sleep' | 'wink';
type PetSpot = 'left' | 'right' | 'forehead' | 'none';

export interface PetAvatarParts {
    species: PetSpecies;
    accessory: PetAccessory;
    eyes: PetEyes;
    spot: PetSpot;
    paletteIndex: number;
}

function hashCode(value: string): number {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function pick<T>(values: readonly T[], hash: number, shift: number): T {
    return values[(hash >>> shift) % values.length];
}

export function resolvePetAvatarParts(id: string): PetAvatarParts {
    const hash = hashCode(`lyntty-pet-avatar:${id}`);
    return {
        species: pick(['cat', 'pig', 'dog'] as const, hash, 2),
        accessory: pick(['bow', 'tag', 'terminal', 'spark', 'none'] as const, hash, 8),
        eyes: pick(['dot', 'sleep', 'wink'] as const, hash, 12),
        spot: pick(['left', 'right', 'forehead', 'none'] as const, hash, 16),
        paletteIndex: hash % 7,
    };
}
