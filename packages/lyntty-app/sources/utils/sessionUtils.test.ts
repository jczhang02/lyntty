import { describe, expect, it, vi } from 'vitest';

import type { Session } from '@/sync/storageTypes';

vi.mock('@/text', () => ({
    t: (key: string) => {
        if (key === 'session.newChat') return 'New chat';
        if (key === 'appWide.piHistoryGapOlderMessagesUnavailable') return 'History gap · Some older Pi messages are unavailable on this computer.';
        return key;
    },
}));

vi.mock('./resumeCommand', () => ({
    buildResumeCommand: vi.fn(),
    buildResumeCommandBlock: vi.fn(),
}));

function session(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: null,
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 0,
        presence: 'online',
        ...overrides,
    };
}

describe('getSessionSubtitle', () => {
    it('shows Pi history details for discovered node sessions', async () => {
        const { getSessionSubtitle } = await import('./sessionUtils');

        expect(getSessionSubtitle(session({
            metadata: {
                path: '/home/jc/dev/lyntty',
                host: 'thinkpad',
                homeDir: '/home/jc',
                piSessionId: 'pi-1',
                name: 'Pi release fix',
                flavor: 'pi',
                piDiscoveryState: 'discovered_local',
                piMessageCount: 42,
                piHasHistoryGap: false,
            },
        }))).toBe('~/dev/lyntty • 42 messages • discovered_local');
    });

    it('does not show missing-history state in user subtitles', async () => {
        const { getSessionSubtitle } = await import('./sessionUtils');

        expect(getSessionSubtitle(session({
            metadata: {
                path: '/home/jc/dev/lyntty',
                host: 'thinkpad',
                homeDir: '/home/jc',
                piSessionId: 'pi-1',
                flavor: 'pi',
                piDiscoveryState: 'missing_local_history',
                piMessageCount: 0,
                piHasHistoryGap: true,
            },
        }))).toBe('~/dev/lyntty • 0 messages');
    });

    it('shows an explicit history-gap state in user subtitles', async () => {
        const { getSessionSubtitle } = await import('./sessionUtils');

        expect(getSessionSubtitle(session({
            metadata: {
                path: '/home/jc/dev/lyntty',
                host: 'thinkpad',
                homeDir: '/home/jc',
                piSessionId: 'pi-gap',
                flavor: 'pi',
                piDiscoveryState: 'history_gap',
                piMessageCount: 2,
                piHasHistoryGap: true,
            },
        }))).toBe('~/dev/lyntty • 2 messages • History gap · Some older Pi messages are unavailable on this computer.');
    });
});

describe('shouldShowPiHistoryLoading', () => {
    it('shows loading for empty Pi sessions with known historical messages', async () => {
        const { shouldShowPiHistoryLoading } = await import('./sessionUtils');

        expect(shouldShowPiHistoryLoading(session({
            metadata: {
                path: '/repo',
                host: 'node',
                flavor: 'pi',
                piSessionId: 'pi-1',
                piMessageCount: 7354,
            },
        }), 0)).toBe(true);
    });

    it('does not show loading once Pi history has visible messages', async () => {
        const { shouldShowPiHistoryLoading } = await import('./sessionUtils');

        expect(shouldShowPiHistoryLoading(session({
            metadata: {
                path: '/repo',
                host: 'node',
                flavor: 'pi',
                piSessionId: 'pi-1',
                piMessageCount: 7354,
            },
        }), 1)).toBe(false);
    });
});

describe('getSessionName', () => {
    it('uses Pi session metadata name before generated summaries', async () => {
        const { getSessionName } = await import('./sessionUtils');

        expect(getSessionName(session({
            metadata: {
                path: '/repo',
                host: 'thinkpad',
                piSessionId: 'pi-1',
                name: 'Pi release fix',
                summary: { text: 'Generated summary', updatedAt: 10 },
                flavor: 'pi',
            },
        }))).toBe('Pi release fix');
    });

    it('falls back to summary when Pi name is missing', async () => {
        const { getSessionName } = await import('./sessionUtils');

        expect(getSessionName(session({
            metadata: {
                path: '/repo',
                host: 'thinkpad',
                summary: { text: 'Generated summary', updatedAt: 10 },
                flavor: 'pi',
            },
        }))).toBe('Generated summary');
    });
});
