import type { Metadata } from './storageTypes';

export type PiHistoryPageResult =
    | {
        type: 'success';
        sent: number;
        nextCursor?: string;
        hasMore: boolean;
        totalMessages: number;
    }
    | {
        type: 'history_gap';
        code: 'history_gap';
        missingCursor: string;
        reason: string;
        hasMore: false;
        totalMessages: number;
    };

export function applyPiHistoryPageResult(
    metadata: Metadata,
    result: PiHistoryPageResult,
): Metadata {
    return {
        ...metadata,
        controlState: result.type === 'history_gap' ? 'history_gap' : metadata.controlState,
        piHasHistoryGap: result.type === 'history_gap' ? true : metadata.piHasHistoryGap,
        piHistoryGapSource: result.type === 'history_gap' ? 'history_page' : metadata.piHistoryGapSource,
        piRecoveryReason: result.type === 'history_gap' ? result.reason : metadata.piRecoveryReason,
        piHistoryCursor: result.type === 'success' ? result.nextCursor : undefined,
        piHistoryHasMore: result.hasMore,
        piHistoryTotalMessages: result.totalMessages,
    };
}
