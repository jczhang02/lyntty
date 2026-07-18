import { describe, expect, it, vi } from 'bun:test';
import { navigateAfterSessionArchive } from './archiveNavigation';

describe('navigateAfterSessionArchive', () => {
    it('replaces with Sessions Home instead of depending on a back stack', () => {
        const router = {
            replace: vi.fn(),
        };

        navigateAfterSessionArchive(router);

        expect(router.replace).toHaveBeenCalledWith('/');
    });
});
