import { describe, expect, it } from 'vitest';
import { getUserMessagePresentation, isBlockUserMessageText, isLocalOptimisticUserMessage } from './userMessagePresentation';
import type { UserTextMessage } from '@/sync/typesMessage';

function userMessage(overrides: Partial<UserTextMessage>): UserTextMessage {
    return {
        kind: 'user-text',
        id: 'msg-1',
        localId: null,
        createdAt: 1,
        text: 'hello',
        ...overrides,
    };
}

describe('userMessagePresentation', () => {
    it('does not treat session-protocol computer input as a local optimistic slash command', () => {
        const message = userMessage({
            localId: 'session:pi-live-input-1',
            text: '1. first visible body\n2. second visible body\n/skill:jc-writing-style',
            meta: { sentFrom: 'cli' },
        });

        expect(isLocalOptimisticUserMessage(message)).toBe(false);
        expect(getUserMessagePresentation(message)).toEqual({
            frame: 'phonePromptCard',
            parseRawSlashCommands: false,
            sourceLabel: 'Computer',
        });
    });

    it('keeps phone-local slash commands eligible for command presentation', () => {
        const message = userMessage({
            localId: 'phone-local-1',
            text: '/skill:jc-writing-style polish this paragraph',
            meta: { sentFrom: 'android', remoteCommandState: 'queued' },
        });

        expect(isLocalOptimisticUserMessage(message)).toBe(true);
        expect(getUserMessagePresentation(message)).toEqual({
            frame: 'phoneBubble',
            parseRawSlashCommands: true,
            sourceLabel: 'Sending…',
        });
    });

    it('removes the sending label once a mobile command is accepted by Pi', () => {
        expect(getUserMessagePresentation(userMessage({
            localId: 'phone-local-1',
            text: 'hello',
            meta: { sentFrom: 'android', remoteCommandState: 'accepted_by_pi' },
        }))).toEqual({
            frame: 'phoneBubble',
            parseRawSlashCommands: true,
            sourceLabel: null,
        });
    });

    it('uses a prompt-card frame for user numbered and bulleted lists', () => {
        expect(isBlockUserMessageText('1. first visible body\n2. second visible body')).toBe(true);
        expect(isBlockUserMessageText('- first visible body\n- second visible body')).toBe(true);
        expect(getUserMessagePresentation(userMessage({ text: '1. first visible body\n2. second visible body' })).frame).toBe('phonePromptCard');
    });

    it('keeps short user text compact', () => {
        expect(getUserMessagePresentation(userMessage({ text: 'ok' })).frame).toBe('phoneBubble');
    });
});
