import { describe, expect, it, vi } from 'vitest';
import type { Session } from './storageTypes';

const mockSessions: Record<string, Partial<Session>> = {};

vi.mock('./storage', () => ({
    storage: {
        getState: () => ({ sessions: mockSessions }),
    },
}));

import { getAllCommands } from './suggestionCommands';

describe('suggestionCommands', () => {
    it('includes supported Pi commands in the default slash command suggestions', () => {
        const commands = getAllCommands('missing-session');

        expect(commands).toEqual(expect.arrayContaining([
            expect.objectContaining({
                command: 'goal',
                descriptionKey: 'appWide.showOrManageTheCurrentPiGoal',
            }),
            expect.objectContaining({ command: 'context' }),
        ]));
        expect(commands).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ command: 'compact' }),
            expect.objectContaining({ command: 'mcp' }),
            expect.objectContaining({ command: 'skills' }),
        ]));
    });

    it('includes skills from session metadata in slash command suggestions', () => {
        mockSessions['codex-session'] = {
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                skills: ['plan-to-beads', 'superpowers:brainstorming'],
            },
        } as Partial<Session>;

        const commands = getAllCommands('codex-session');

        expect(commands).toEqual(expect.arrayContaining([
            expect.objectContaining({ command: 'skill:plan-to-beads' }),
            expect.objectContaining({ command: 'skill:superpowers:brainstorming' }),
        ]));
    });
});
