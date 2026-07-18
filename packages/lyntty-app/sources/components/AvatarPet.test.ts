import { describe, expect, it } from 'bun:test';
import { resolvePetAvatarParts } from './AvatarPetParts';

describe('resolvePetAvatarParts', () => {
    it('generates deterministic pet avatars for the same session id', () => {
        expect(resolvePetAvatarParts('session-a')).toEqual(resolvePetAvatarParts('session-a'));
    });

    it('uses only the selected cat pig dog family', () => {
        const species = new Set(
            Array.from({ length: 120 }, (_, index) => resolvePetAvatarParts(`session-${index}`).species),
        );

        expect(species).toEqual(new Set(['cat', 'pig', 'dog']));
    });
});
