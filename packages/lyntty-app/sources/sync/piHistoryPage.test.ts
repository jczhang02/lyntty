import { describe, expect, it } from 'vitest';

import { applyPiHistoryPageResult } from './piHistoryPage';

describe('applyPiHistoryPageResult', () => {
    it('preserves current metadata while making history_gap explicit and terminal', () => {
        expect(applyPiHistoryPageResult({
            path: '/repo',
            host: 'computer',
            runtimeOwner: 'pi-extension',
            piHistoryCursor: 'old-cursor',
            piHistoryHasMore: true,
        }, {
            type: 'history_gap',
            code: 'history_gap',
            missingCursor: 'old-cursor',
            reason: 'cursor missing',
            hasMore: false,
            totalMessages: 10,
        })).toMatchObject({
            runtimeOwner: 'pi-extension',
            controlState: 'history_gap',
            piHasHistoryGap: true,
            piRecoveryReason: 'cursor missing',
            piHistoryCursor: undefined,
            piHistoryHasMore: false,
            piHistoryTotalMessages: 10,
        });
    });

    it('advances a successful Pi history page', () => {
        expect(applyPiHistoryPageResult({ path: '/repo', host: 'computer', piHistoryCursor: 'old' }, {
            type: 'success',
            sent: 5,
            nextCursor: 'next',
            hasMore: true,
            totalMessages: 20,
        })).toMatchObject({
            piHistoryCursor: 'next',
            piHistoryHasMore: true,
            piHistoryTotalMessages: 20,
        });
    });
});
