import * as React from 'react';
import { Message } from '@/sync/typesMessage';
import { knownTools } from '@/components/tools/knownTools';
import { t } from '@/text';
import { getToolSummaryCategory } from '@/utils/toolDisplay';
import { isComputerOriginUserMessage } from '@/components/userMessagePresentation';

// Display item types for the grouped message list
export type TextItem = {
    type: 'message';
    id: string;
    message: Message;
};

export type ToolGroupItem = {
    type: 'tool-group';
    id: string;
    messages: Message[];
    hasRunning: boolean;
    hasPendingPermission: boolean;
};

export type AgentWorkGroupItem = {
    type: 'agent-work-group';
    id: string;
    messages: Message[];
    hasRunning: boolean;
    hasPendingPermission: boolean;
    startedAt: number;
    completedAt: number | null;
};

export type ToolDisplayItem = TextItem | ToolGroupItem;
export type DisplayItem = TextItem | ToolGroupItem | AgentWorkGroupItem;

/**
 * The messages array is newest-first for the inverted FlatList.
 *
 * When enabled, intermediate agent work in a turn is collapsed into an
 * AgentWorkGroupItem while the final agent text remains visible. Tool calls
 * that remain outside a work group are collapsed only when adjacent visible
 * tool calls form a run. When disabled, every message passes through.
 */
export function useGroupedMessages(
    messages: Message[],
    enabled: boolean = true,
    options: { collapseCurrentTurn?: boolean } = {},
): DisplayItem[] {
    const collapseCurrentTurn = options.collapseCurrentTurn ?? true;
    return React.useMemo(() => {
        return groupMessagesForDisplay(messages, enabled, { collapseCurrentTurn });
    }, [messages, enabled, collapseCurrentTurn]);
}

export function groupMessagesForDisplay(
    messages: Message[],
    enabled: boolean = true,
    options: { collapseCurrentTurn?: boolean } = {},
): DisplayItem[] {
    const collapseCurrentTurn = options.collapseCurrentTurn ?? true;
    const dedupedMessages = suppressDuplicateAgentTextMessages(suppressDuplicateComputerUserMessages(messages));
    const turnOf = getTurnAssignments(dedupedMessages);
    const displayMessages = completeFinishedTurnRunningTools(dedupedMessages, turnOf, collapseCurrentTurn);

    if (!enabled) {
        return displayMessages
            .filter((msg) => !isInvisibleMessage(msg))
            .map((msg) => ({ type: 'message', id: msg.id, message: msg } as TextItem));
    }

    const workGroups = collectAgentWorkGroups(displayMessages, turnOf, collapseCurrentTurn);
    const hiddenWorkIndexes = new Set<number>();
    const workGroupByOldestIndex = new Map<number, AgentWorkGroupItem>();

    for (const group of workGroups) {
        workGroupByOldestIndex.set(group.oldestIdx, group.item);
        for (const index of group.hiddenIndexes) {
            hiddenWorkIndexes.add(index);
        }
    }

    const visibleForToolGrouping = (msg: Message, index: number): boolean => {
        if (hiddenWorkIndexes.has(index)) return false;
        if (isInvisibleMessage(msg) || isUserAttachment(msg)) return false;
        return msg.kind === 'tool-call';
    };

    const toolRuns = collectToolRuns(displayMessages, visibleForToolGrouping);

    // Build display items — groups are emitted at their oldest hidden member
    // so the visual order remains user message → collapsed work → final answer.
    const result: DisplayItem[] = [];
    for (let i = 0; i < displayMessages.length; i++) {
        const msg = displayMessages[i];

        if (isInvisibleMessage(msg)) continue;

        if (hiddenWorkIndexes.has(i)) {
            const workGroup = workGroupByOldestIndex.get(i);
            if (workGroup) {
                result.push(workGroup);
            }
            continue;
        }

        if (isUserAttachment(msg)) {
            result.push({ type: 'message', id: msg.id, message: msg });
            continue;
        }

        if (msg.kind === 'tool-call') {
            const info = toolRuns.get(i);
            if (info && info.msgs.length > 1 && i === info.oldestIdx) {
                let hasRunning = false;
                for (const m of info.msgs) {
                    if (m.kind === 'tool-call' && m.tool.state === 'running') {
                        hasRunning = true;
                        break;
                    }
                }
                const chronologicalMessages = [...info.msgs].reverse();
                result.push({
                    type: 'tool-group',
                    id: `group-${chronologicalMessages[0].id}`,
                    messages: chronologicalMessages,
                    hasRunning,
                    hasPendingPermission: hasPendingPermission(info.msgs),
                });
            }
            if (info && info.msgs.length > 1) {
                continue;
            }
        }

        // Standalone messages (user text, agent text, events)
        result.push({ type: 'message', id: msg.id, message: msg });
    }

    return result;
}

export function groupToolCallsForDisplay(
    messages: Message[],
    enabled: boolean = true,
    options: { groupSingleToolCalls?: boolean } = {},
): ToolDisplayItem[] {
    if (!enabled) {
        return messages
            .filter((msg) => !isInvisibleMessage(msg))
            .map((msg) => ({ type: 'message', id: msg.id, message: msg } as TextItem));
    }

    const groupSingleToolCalls = options.groupSingleToolCalls ?? false;
    const toolRuns = collectToolRuns(messages, (msg) => {
        if (msg.kind !== 'tool-call') return false;
        if (isInvisibleMessage(msg) || isUserAttachment(msg)) return false;
        return true;
    });

    const result: ToolDisplayItem[] = [];
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];

        if (isInvisibleMessage(msg)) continue;

        if (isUserAttachment(msg)) {
            result.push({ type: 'message', id: msg.id, message: msg });
            continue;
        }

        if (msg.kind === 'tool-call') {
            const info = toolRuns.get(i);
            const shouldGroupRun = info && (info.msgs.length > 1 || groupSingleToolCalls);
            if (shouldGroupRun && i === info.oldestIdx) {
                let hasRunning = false;
                for (const m of info.msgs) {
                    if (m.kind === 'tool-call' && m.tool.state === 'running') {
                        hasRunning = true;
                        break;
                    }
                }
                const chronologicalMessages = [...info.msgs].reverse();
                result.push({
                    type: 'tool-group',
                    id: `group-${chronologicalMessages[0].id}`,
                    messages: chronologicalMessages,
                    hasRunning,
                    hasPendingPermission: hasPendingPermission(info.msgs),
                });
            }
            if (shouldGroupRun) {
                continue;
            }
        }

        result.push({ type: 'message', id: msg.id, message: msg });
    }

    return result;
}

function normalizeMessageTextForDedupe(text: string): string {
    return text.trim().replace(/\s+/g, ' ');
}

function isPiLiveInputFallbackPair(a: Message, b: Message): boolean {
    if (a.kind !== 'user-text' || b.kind !== 'user-text') {
        return false;
    }
    if (!isComputerOriginUserMessage(a) || !isComputerOriginUserMessage(b)) {
        return false;
    }
    const ids = [a.id, a.localId ?? '', b.id, b.localId ?? ''];
    const hasLiveInput = ids.some((id) => id.includes('pi-live-input-'));
    const hasHistoryInput = ids.some((id) => id.includes('pi-history-'));
    return hasLiveInput && hasHistoryInput;
}

function suppressDuplicateComputerUserMessages(messages: Message[]): Message[] {
    let changed = false;
    const filtered: Message[] = [];
    for (const msg of messages) {
        const previous = filtered[filtered.length - 1];
        const duplicate = previous?.kind === 'user-text'
            && msg.kind === 'user-text'
            && isPiLiveInputFallbackPair(previous, msg)
            && normalizeMessageTextForDedupe(previous.text) === normalizeMessageTextForDedupe(msg.text)
            && Math.abs(previous.createdAt - msg.createdAt) <= 5 * 60_000;
        if (duplicate) {
            changed = true;
            continue;
        }
        filtered.push(msg);
    }
    return changed ? filtered : messages;
}

function suppressDuplicateAgentTextMessages(messages: Message[]): Message[] {
    const turnOf = getTurnAssignments(messages);
    const seenByTurn = new Map<number, Map<string, number>>();
    let changed = false;
    const filtered = messages.filter((msg, index) => {
        if (msg.kind !== 'agent-text' || msg.isThinking === true) {
            return true;
        }
        const normalized = normalizeMessageTextForDedupe(msg.text);
        if (!normalized) {
            return true;
        }
        const turn = turnOf[index];
        let seen = seenByTurn.get(turn);
        if (!seen) {
            seen = new Map();
            seenByTurn.set(turn, seen);
        }
        const previousCreatedAt = seen.get(normalized);
        seen.set(normalized, msg.createdAt);
        if (previousCreatedAt === undefined) {
            return true;
        }
        if (Math.abs(previousCreatedAt - msg.createdAt) <= 5 * 60_000) {
            changed = true;
            return false;
        }
        return true;
    });
    return changed ? filtered : messages;
}

function getTurnAssignments(messages: Message[]): number[] {
    // Newest-first → turn 0 is the current assistant turn.
    const turnOf = new Array<number>(messages.length);
    let turn = 0;
    for (let i = 0; i < messages.length; i++) {
        turnOf[i] = turn;
        if (messages[i].kind === 'user-text') turn++;
    }
    return turnOf;
}

function collectToolRuns(
    messages: Message[],
    shouldInclude: (msg: Message, index: number) => boolean,
): Map<number, { msgs: Message[]; oldestIdx: number }> {
    const runsByIndex = new Map<number, { msgs: Message[]; oldestIdx: number }>();
    let current: { indexes: number[]; msgs: Message[] } | null = null;

    const flush = () => {
        if (!current || current.msgs.length === 0) {
            current = null;
            return;
        }
        const oldestIdx = current.indexes[current.indexes.length - 1];
        const run = { msgs: current.msgs, oldestIdx };
        for (const index of current.indexes) {
            runsByIndex.set(index, run);
        }
        current = null;
    };

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (!shouldInclude(msg, i)) {
            if (!isInvisibleMessage(msg)) {
                flush();
            }
            continue;
        }
        if (!current) {
            current = { indexes: [], msgs: [] };
        }
        current.indexes.push(i);
        current.msgs.push(msg);
    }
    flush();

    return runsByIndex;
}

function completeFinishedTurnRunningTools(messages: Message[], turnOf: number[], collapseCurrentTurn: boolean): Message[] {
    const finalTextIndexByTurn = new Map<number, number>();
    for (let index = 0; index < messages.length; index++) {
        const msg = messages[index];
        if (msg.kind !== 'agent-text') {
            continue;
        }
        const turn = turnOf[index];
        if (turn === 0 && !collapseCurrentTurn) {
            continue;
        }
        if (!finalTextIndexByTurn.has(turn)) {
            finalTextIndexByTurn.set(turn, index);
        }
    }

    let changed = false;
    const completed = messages.map((msg, index) => {
        const finalTextIndex = finalTextIndexByTurn.get(turnOf[index]);
        if (finalTextIndex === undefined || index <= finalTextIndex) {
            return msg;
        }
        const finalText = messages[finalTextIndex];
        const next = completeRunningToolForDisplay(msg, finalText.createdAt);
        if (next !== msg) {
            changed = true;
        }
        return next;
    });

    return changed ? completed : messages;
}

function collectAgentWorkGroups(messages: Message[], turnOf: number[], collapseCurrentTurn: boolean): Array<{
    item: AgentWorkGroupItem;
    hiddenIndexes: number[];
    oldestIdx: number;
}> {
    const segments = new Map<number, number[]>();
    for (let i = 0; i < messages.length; i++) {
        const turn = turnOf[i];
        if (!segments.has(turn)) {
            segments.set(turn, []);
        }
        segments.get(turn)!.push(i);
    }

    const groups: Array<{
        item: AgentWorkGroupItem;
        hiddenIndexes: number[];
        oldestIdx: number;
    }> = [];

    for (const [turn, indexes] of segments) {
        if (turn === 0 && !collapseCurrentTurn) {
            continue;
        }

        const visibleAgentIndexes = indexes.filter((index) => {
            const msg = messages[index];
            if (msg.kind === 'user-text') return false;
            if (isInvisibleMessage(msg) || isUserAttachment(msg)) return false;
            return true;
        });

        const finalTextPosition = visibleAgentIndexes.findIndex((index) => messages[index].kind === 'agent-text');
        if (finalTextPosition === -1) continue;

        const finalTextIndex = visibleAgentIndexes[finalTextPosition];
        const finalText = messages[finalTextIndex];
        let finalTextBoundaryPosition = finalTextPosition;
        if (finalText.kind === 'agent-text' && finalText.isThinking !== true) {
            while (finalTextBoundaryPosition + 1 < visibleAgentIndexes.length) {
                const nextIndex = visibleAgentIndexes[finalTextBoundaryPosition + 1];
                const nextMessage = messages[nextIndex];
                if (nextMessage.kind !== 'agent-text' || nextMessage.isThinking === true) {
                    break;
                }
                finalTextBoundaryPosition++;
            }
        }
        const finalTextBoundaryIndex = visibleAgentIndexes[finalTextBoundaryPosition];

        const hiddenIndexes = visibleAgentIndexes.filter((index) => index > finalTextBoundaryIndex);
        if (hiddenIndexes.length === 0) continue;

        const oldestIdx = Math.max(...hiddenIndexes);
        const completedAt = finalText.createdAt;
        const hiddenMessages = hiddenIndexes.map((index) => completeRunningToolForDisplay(messages[index], completedAt));
        const startedAt = Math.min(...hiddenMessages.map((msg) => msg.createdAt));
        const hasRunning = hiddenMessages.some((msg) => msg.kind === 'tool-call' && msg.tool.state === 'running');

        groups.push({
            hiddenIndexes,
            oldestIdx,
            item: {
                type: 'agent-work-group',
                id: `work-${messages[oldestIdx].id}`,
                messages: hiddenMessages,
                hasRunning,
                hasPendingPermission: hasPendingPermission(hiddenMessages),
                startedAt,
                completedAt,
            },
        });
    }

    return groups;
}

function completeRunningToolForDisplay(msg: Message, completedAt: number): Message {
    if (msg.kind !== 'tool-call' || msg.tool.state !== 'running') return msg;
    if (completedAt < msg.createdAt) return msg;
    return {
        ...msg,
        tool: {
            ...msg.tool,
            state: 'completed',
            completedAt,
        },
    };
}

/** Returns true for messages that render as null and should be excluded entirely */
function isLegacyPiHistoryToolOutputText(msg: Message): boolean {
    if (msg.kind !== 'agent-text') return false;
    if (msg.isThinking === true && /^pi-history-.+-tool-output$/.test(msg.id)) return true;

    // Current-session mirror compatibility: older/current relay state can contain
    // serialized Pi tool result payloads as plain or thinking agent text with
    // non-history ids. Real assistant prose should not be an escaped
    // tool-result JSON object with content+details.
    const text = msg.text.trim();
    const hasDetails = text.includes('"details"') || text.includes('\\"details\\"');
    const hasContent = text.includes('"content"') || text.includes('\\"content\\"');
    if (!hasDetails || !hasContent) return false;

    const hasConcatenatedToolPayload = text.includes('}{"content"') || text.includes('}\\"{\\"content\\"');
    const hasKnownToolNoise = (
        text.includes('toolResult')
        || text.includes('tool_result')
        || text.includes('bd show')
        || text.includes('gpg: Signature made')
        || text.includes('beads.role not configured')
    );

    if (msg.isThinking === true) {
        return text.startsWith('{') || hasConcatenatedToolPayload || hasKnownToolNoise;
    }
    return hasConcatenatedToolPayload || hasKnownToolNoise;
}

function isInvisibleMessage(msg: Message): boolean {
    // Hidden tools (ToolSearch, CodexReasoning, etc.)
    if (msg.kind === 'tool-call') {
        const known = knownTools[msg.tool.name as keyof typeof knownTools] as any;
        return known?.hidden === true;
    }
    if (msg.kind === 'agent-text') {
        if (msg.text.trim().length === 0) return true;
        // Older app builds normalized historical Pi toolResult payloads into
        // persisted thinking-text messages. Hide them at render grouping time too,
        // because raw-sync normalization will not revisit already-stored rows.
        if (isLegacyPiHistoryToolOutputText(msg)) return true;
    }
    return false;
}

/** User-sent file/image attachments should never be collapsed into a group */
function isUserAttachment(msg: Message): boolean {
    return msg.kind === 'tool-call' && msg.tool.name === 'file';
}

function hasPendingPermission(messages: Message[]): boolean {
    return messages.some((msg) => (
        msg.kind === 'tool-call'
        && msg.tool.permission?.status === 'pending'
    ));
}

/** Generate a human-readable summary of tools in a group */
export function generateGroupSummary(messages: Message[]): string {
    const counts: Record<string, number> = {};

    for (const msg of messages) {
        if (msg.kind === 'tool-call') {
            const category = getToolSummaryCategory(msg.tool.name);
            counts[category] = (counts[category] || 0) + 1;
        }
    }

    const parts: string[] = [];

    if (counts.edit) parts.push(t('toolGroup.editedFiles', { count: counts.edit }));
    if (counts.read) parts.push(t('toolGroup.readFiles', { count: counts.read }));
    if (counts.terminal) parts.push(t('toolGroup.ranCommands', { count: counts.terminal }));
    if (counts.search) parts.push(t('toolGroup.searched', { count: counts.search }));
    if (counts.web) parts.push(t('toolGroup.fetchedUrls', { count: counts.web }));
    if (counts.task) parts.push(t('toolGroup.ranTasks', { count: counts.task }));
    if (counts.other) parts.push(t('toolGroup.usedTools', { count: counts.other }));

    return parts.join(', ') || t('toolGroup.usedTools', { count: messages.length });
}

export function formatWorkDuration(durationMs: number): string {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}h${minutes}m`;
    }
    if (minutes > 0) {
        return `${minutes}m${seconds}s`;
    }
    return `${seconds}s`;
}
