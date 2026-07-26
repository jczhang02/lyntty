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
        nextCursor?: string;
        hasMore: boolean;
        totalMessages: number;
    };

export function applyPiHistoryPageResult(
    metadata: Metadata,
    result: PiHistoryPageResult,
    options?: { expectedCursor?: string },
): Metadata {
    if (options && metadata.piHistoryCursor !== options.expectedCursor) {
        return metadata;
    }
    return {
        ...metadata,
        controlState: result.type === 'history_gap' ? 'history_gap' : metadata.controlState,
        piHasHistoryGap: result.type === 'history_gap' ? true : metadata.piHasHistoryGap,
        piRecoveryReason: result.type === 'history_gap' ? result.reason : metadata.piRecoveryReason,
        piHistoryCursor: result.nextCursor,
        piHistoryHasMore: result.hasMore,
        piHistoryTotalMessages: result.totalMessages,
    };
}
