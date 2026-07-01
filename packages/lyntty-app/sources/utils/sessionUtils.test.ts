import { describe, expect, it, vi } from 'vitest';

import type { Session } from '@/sync/storageTypes';

vi.mock('@/text', () => ({
    t: (key: string) => key === 'session.newChat' ? 'New chat' : key,
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
