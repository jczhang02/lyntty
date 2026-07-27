import { describe, expect, it } from 'bun:test';

import { applyPiHistoryPageResult } from './piHistoryPage';

describe('applyPiHistoryPageResult', () => {
    it('makes history_gap explicit without losing the authoritative retry cursor', () => {
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
            nextCursor: 'old-cursor',
            hasMore: true,
            totalMessages: 10,
        })).toMatchObject({
            runtimeOwner: 'pi-extension',
            controlState: 'history_gap',
            piHasHistoryGap: true,
            piHistoryGapSource: 'history_page',
            piRecoveryReason: 'cursor missing',
            piHistoryCursor: 'old-cursor',
            piHistoryHasMore: true,
            piHistoryTotalMessages: 10,
        });
    });

    it('ignores a delayed page result after a newer cursor was applied', () => {
        const metadata = {
            path: '/repo',
            host: 'computer',
            piHistoryCursor: 'newer-cursor',
            piHistoryHasMore: true,
        };

        expect(applyPiHistoryPageResult(metadata, {
            type: 'success',
            sent: 5,
            nextCursor: 'older-response-cursor',
            hasMore: true,
            totalMessages: 20,
        }, { expectedCursor: 'requested-cursor' })).toBe(metadata);
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
