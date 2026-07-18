import type { UserTextMessage } from '@/sync/typesMessage';

export type UserMessageFrame = 'phoneBubble' | 'phonePromptCard';

export type UserMessagePresentation = {
    frame: UserMessageFrame;
    parseRawSlashCommands: boolean;
    sourceLabel: string | null;
};

const SESSION_PROTOCOL_LOCAL_ID_PREFIX = 'session:';
const COMPUTER_SENT_FROM_VALUES = new Set(['cli', 'computer', 'terminal', 'pi']);

const BLOCK_MARKDOWN_RE = /(^|\n)\s*(?:[-*+]\s+|\d+\.\s+|#{1,6}\s+|```|>\s+|\|.+\|)/;

export function isLocalOptimisticUserMessage(message: Pick<UserTextMessage, 'localId' | 'meta'>): boolean {
    if (!message.localId) {
        return false;
    }
    if (message.localId.startsWith(SESSION_PROTOCOL_LOCAL_ID_PREFIX)) {
        return false;
    }
    const sentFrom = message.meta?.sentFrom?.toLowerCase();
    return !sentFrom || !COMPUTER_SENT_FROM_VALUES.has(sentFrom);
}

export function isComputerOriginUserMessage(message: Pick<UserTextMessage, 'localId' | 'meta'>): boolean {
    const sentFrom = message.meta?.sentFrom?.toLowerCase();
    return message.localId?.startsWith(SESSION_PROTOCOL_LOCAL_ID_PREFIX) === true
        || (sentFrom ? COMPUTER_SENT_FROM_VALUES.has(sentFrom) : false);
}

export function isBlockUserMessageText(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) {
        return false;
    }
    if (BLOCK_MARKDOWN_RE.test(trimmed)) {
        return true;
    }
    const nonEmptyLines = trimmed.split('\n').filter((line) => line.trim().length > 0);
    return nonEmptyLines.length >= 2 || trimmed.length >= 120;
}

export function getUserMessagePresentation(message: UserTextMessage, controlState?: string | null): UserMessagePresentation {
    const localOptimistic = isLocalOptimisticUserMessage(message);
    const computerOrigin = isComputerOriginUserMessage(message);
    const displayText = message.displayText || message.text;
    const block = isBlockUserMessageText(displayText);
    const remoteCommandState = message.meta?.remoteCommandState;

    if (computerOrigin) {
        return {
            frame: block ? 'phonePromptCard' : 'phoneBubble',
            parseRawSlashCommands: false,
            sourceLabel: 'Computer',
        };
    }

    return {
        frame: block ? 'phonePromptCard' : 'phoneBubble',
        parseRawSlashCommands: localOptimistic,
        sourceLabel: remoteCommandState === 'queued'
            ? controlState === 'waiting_extension'
                ? 'Waiting for Pi extension'
                : controlState === 'computer_offline'
                    ? 'Queued — computer offline'
                    : 'Sending…'
            : remoteCommandState === 'failed'
                ? 'Not delivered'
                : null,
    };
}
