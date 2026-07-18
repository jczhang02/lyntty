import { describe, expect, it, vi } from 'bun:test';
import { generateGroupSummary, groupMessagesForDisplay, groupToolCallsForDisplay } from './useGroupedMessages';
import { Message, ToolCallMessage } from '@/sync/typesMessage';

vi.mock('@/components/tools/knownTools', () => ({
    knownTools: {
        Skill: { hidden: true },
    },
}));

vi.mock('@/text', () => ({
    t: (key: string, params?: { count?: number }) => `${key}:${params?.count ?? ''}`,
}));

function toolMessage(id: string, createdAt: number, options: { pendingPermission?: boolean; running?: boolean } = {}): ToolCallMessage {
    return {
        kind: 'tool-call',
        id,
        localId: null,
        createdAt,
        tool: {
            name: 'CodexBash',
            state: options.running ? 'running' : 'completed',
            input: { command: id },
            createdAt,
            startedAt: createdAt,
            completedAt: options.running ? null : createdAt + 1,
            description: id,
            ...(options.pendingPermission
                ? {
                    permission: {
                        id: `permission-${id}`,
                        status: 'pending' as const,
                    },
                }
                : {}),
        },
        children: [],
    };
}

function namedToolMessage(id: string, name: string, createdAt: number): ToolCallMessage {
    const message = toolMessage(id, createdAt);
    return {
        ...message,
        tool: {
            ...message.tool,
            name,
        },
    };
}

describe('useGroupedMessages', () => {
    it('hides adjacent duplicate computer-origin user messages from live plus JSONL fallback', () => {
        const messages: Message[] = [
            {
                kind: 'user-text',
                id: 'pi-history-entry-user-text',
                localId: 'session:pi-history-entry-user-text',
                meta: { sentFrom: 'cli' },
                createdAt: 2_000,
                text: 'computer typed prompt',
            },
            {
                kind: 'user-text',
                id: 'pi-live-input-session-42-7',
                localId: 'session:pi-live-input-session-42-7',
                meta: { sentFrom: 'cli' },
                createdAt: 1_500,
                text: 'computer typed prompt',
            },
            {
                kind: 'agent-text',
                id: 'agent',
                localId: null,
                createdAt: 1_000,
                text: 'previous answer',
            },
        ];

        expect(groupMessagesForDisplay(messages, false).map((item) => item.id)).toEqual([
            'pi-history-entry-user-text',
            'agent',
        ]);
        expect(groupMessagesForDisplay(messages, true).map((item) => item.id)).toEqual([
            'pi-history-entry-user-text',
            'agent',
        ]);
    });

    it('keeps repeated generic computer user messages because they may be intentional sends', () => {
        const messages: Message[] = [
            {
                kind: 'user-text',
                id: 'computer-2',
                localId: 'session:computer-2',
                meta: { sentFrom: 'cli' },
                createdAt: 2_000,
                text: 'same computer prompt',
            },
            {
                kind: 'user-text',
                id: 'computer-1',
                localId: 'session:computer-1',
                meta: { sentFrom: 'cli' },
                createdAt: 1_500,
                text: 'same computer prompt',
            },
        ];

        expect(groupMessagesForDisplay(messages, false).map((item) => item.id)).toEqual(['computer-2', 'computer-1']);
    });

    it('keeps repeated phone user messages because they may be intentional sends', () => {
        const messages: Message[] = [
            {
                kind: 'user-text',
                id: 'phone-2',
                localId: 'local-2',
                createdAt: 2_000,
                text: 'same phone prompt',
            },
            {
                kind: 'user-text',
                id: 'phone-1',
                localId: 'local-1',
                createdAt: 1_500,
                text: 'same phone prompt',
            },
        ];

        expect(groupMessagesForDisplay(messages, false).map((item) => item.id)).toEqual(['phone-2', 'phone-1']);
    });

    it('hides duplicate agent replies from live plus JSONL fallback in the same turn', () => {
        const messages: Message[] = [
            {
                kind: 'agent-text',
                id: 'pi-history-assistant-final',
                localId: 'session:pi-history-assistant-final',
                createdAt: 2_000,
                text: 'same answer from Pi',
            },
            {
                kind: 'agent-text',
                id: 'pi-live-assistant-final',
                localId: 'session:pi-live-assistant-final',
                createdAt: 1_500,
                text: 'same answer from Pi',
            },
            {
                kind: 'user-text',
                id: 'user',
                localId: null,
                createdAt: 1_000,
                text: 'reply once',
            },
        ];

        expect(groupMessagesForDisplay(messages, false).map((item) => item.id)).toEqual([
            'pi-history-assistant-final',
            'user',
        ]);
        expect(groupMessagesForDisplay(messages, true).map((item) => item.id)).toEqual([
            'pi-history-assistant-final',
            'user',
        ]);
    });

    it('keeps identical agent text in different turns', () => {
        const messages: Message[] = [
            {
                kind: 'agent-text',
                id: 'agent-2',
                localId: null,
                createdAt: 4_000,
                text: 'OK',
            },
            {
                kind: 'user-text',
                id: 'user-2',
                localId: null,
                createdAt: 3_000,
                text: 'second',
            },
            {
                kind: 'agent-text',
                id: 'agent-1',
                localId: null,
                createdAt: 2_000,
                text: 'OK',
            },
            {
                kind: 'user-text',
                id: 'user-1',
                localId: null,
                createdAt: 1_000,
                text: 'first',
            },
        ];

        expect(groupMessagesForDisplay(messages, false).map((item) => item.id)).toEqual([
            'agent-2',
            'user-2',
            'agent-1',
            'user-1',
        ]);
    });

    it('summarizes lowercase Pi tool names with the shared categories', () => {
        const messages: Message[] = [
            namedToolMessage('tool-find', 'find', 3),
            namedToolMessage('tool-bash', 'bash', 2),
        ];

        const group = groupToolCallsForDisplay(messages, true).find((item) => item.type === 'tool-group');
        expect(group?.type).toBe('tool-group');
        if (group?.type !== 'tool-group') throw new Error('Expected tool group');
        expect(group.messages.map((message) => message.id)).toEqual(['tool-bash', 'tool-find']);
        expect(generateGroupSummary(group.messages)).toBe('toolGroup.ranCommands:1, toolGroup.searched:1');
    });

    it('stores grouped tools in chronological render order', () => {
        const messages: Message[] = [
            {
                kind: 'agent-text',
                id: 'agent-after-tools',
                localId: null,
                createdAt: 5,
                text: 'done',
            },
            toolMessage('tool-latest', 4),
            toolMessage('tool-middle', 3),
            toolMessage('tool-earliest', 2),
            {
                kind: 'user-text',
                id: 'user',
                localId: null,
                createdAt: 1,
                text: 'run tools',
            },
        ];

        const group = groupToolCallsForDisplay(messages, true).find((item) => item.type === 'tool-group');

        expect(group?.messages.map((message) => message.id)).toEqual([
            'tool-earliest',
            'tool-middle',
            'tool-latest',
        ]);
    });

    it('groups only adjacent tool calls between text messages', () => {
        const messages: Message[] = [
            {
                kind: 'agent-text',
                id: 'agent-final',
                localId: null,
                createdAt: 7,
                text: 'done',
            },
            toolMessage('tool-4', 6),
            toolMessage('tool-3', 5),
            {
                kind: 'agent-text',
                id: 'agent-middle',
                localId: null,
                createdAt: 4,
                text: 'next step',
            },
            toolMessage('tool-2', 3),
            toolMessage('tool-1', 2),
            {
                kind: 'user-text',
                id: 'user',
                localId: null,
                createdAt: 1,
                text: 'run tools',
            },
        ];

        const groups = groupToolCallsForDisplay(messages, true).filter((item) => item.type === 'tool-group');

        expect(groups).toHaveLength(2);
        expect(groups[0]?.messages.map((message) => message.id)).toEqual(['tool-3', 'tool-4']);
        expect(groups[1]?.messages.map((message) => message.id)).toEqual(['tool-1', 'tool-2']);
    });

    it('hides persisted legacy Pi history tool-output thinking text', () => {
        const messages: Message[] = [
            {
                kind: 'agent-text',
                id: 'agent-final',
                localId: null,
                createdAt: 3,
                text: 'done',
            },
            {
                kind: 'agent-text',
                id: 'pi-history-entry-1-tool-output',
                localId: null,
                createdAt: 2,
                text: 'available work\\nbd show ... {"details":{}}',
                isThinking: true,
            },
            {
                kind: 'user-text',
                id: 'user',
                localId: null,
                createdAt: 1,
                text: 'show task',
            },
        ];

        const groups = groupMessagesForDisplay(messages, true);

        expect(groups).toHaveLength(2);
        expect(groups.map((group) => group.type)).toEqual(['message', 'message']);
        expect(groups.some((group) => group.type === 'message' && group.message.id === 'pi-history-entry-1-tool-output')).toBe(false);
    });

    it('hides persisted legacy Pi history tool-output thinking text when grouping is disabled', () => {
        const messages: Message[] = [
            {
                kind: 'agent-text',
                id: 'agent-final',
                localId: null,
                createdAt: 3,
                text: 'done',
            },
            {
                kind: 'agent-text',
                id: 'pi-history-entry-1-tool-output',
                localId: null,
                createdAt: 2,
                text: 'available work\nbd show ... {"details":{}}',
                isThinking: true,
            },
            {
                kind: 'user-text',
                id: 'user',
                localId: null,
                createdAt: 1,
                text: 'show task',
            },
        ];

        const groups = groupMessagesForDisplay(messages, false);

        expect(groups).toHaveLength(2);
        expect(groups.some((group) => group.type === 'message' && group.message.id === 'pi-history-entry-1-tool-output')).toBe(false);
    });

    it('hides current-session mirrored serialized Pi tool-output agent text', () => {
        const messages: Message[] = [
            {
                kind: 'agent-text',
                id: 'agent-final',
                localId: null,
                createdAt: 3,
                text: 'fixed in 746cfbe',
            },
            {
                kind: 'agent-text',
                id: 'mirror-tool-output-current-session',
                localId: null,
                createdAt: 2,
                text: '{"content":[]}{"content":[{"type":"text","text":" M .beads/interactions.jsonl\\nM packages/lyntty-app/sources/sync/reducer/reducer.ts"}],"details":{}}',
            },
            {
                kind: 'agent-text',
                id: 'mirror-tool-output-current-session-thinking',
                localId: null,
                createdAt: 1.5,
                text: '{"content":[]}{"content":[{"type":"text","text":"beads.role not configured"}],"details":{}}',
                isThinking: true,
            },
            {
                kind: 'user-text',
                id: 'user',
                localId: null,
                createdAt: 1,
                text: 'commit it',
            },
        ];

        const groups = groupMessagesForDisplay(messages, false);

        expect(groups).toHaveLength(2);
        expect(groups.some((group) => group.type === 'message' && group.message.id === 'mirror-tool-output-current-session')).toBe(false);
        expect(groups.some((group) => group.type === 'message' && group.message.id === 'mirror-tool-output-current-session-thinking')).toBe(false);
    });

    it('keeps legitimate assistant JSON text visible', () => {
        const messages: Message[] = [
            {
                kind: 'agent-text',
                id: 'assistant-json',
                localId: null,
                createdAt: 2,
                text: '{"content":"human-readable summary","details":{"source":"assistant"}}',
            },
            {
                kind: 'user-text',
                id: 'user',
                localId: null,
                createdAt: 1,
                text: 'return json',
            },
        ];

        const groups = groupMessagesForDisplay(messages, false);

        expect(groups.some((group) => group.type === 'message' && group.message.id === 'assistant-json')).toBe(true);
    });

    it('keeps the final agent message visible and collapses earlier agent work', () => {
        const messages: Message[] = [
            {
                kind: 'agent-text',
                id: 'agent-final',
                localId: null,
                createdAt: 5,
                text: 'done',
            },
            toolMessage('tool-latest', 4),
            {
                kind: 'agent-text',
                id: 'agent-progress',
                localId: null,
                createdAt: 3,
                text: 'checking',
            },
            toolMessage('tool-earliest', 2),
            {
                kind: 'user-text',
                id: 'user',
                localId: null,
                createdAt: 1,
                text: 'run tools',
            },
        ];

        const items = groupMessagesForDisplay(messages, true);

        expect(items.map((item) => item.type)).toEqual(['message', 'agent-work-group', 'message']);
        expect(items[0]).toMatchObject({ type: 'message', id: 'agent-final' });
        expect(items[1]).toMatchObject({ type: 'agent-work-group', id: 'work-tool-earliest' });
        if (items[1].type !== 'agent-work-group') {
            throw new Error('Expected an agent work group');
        }
        expect(items[1].messages.map((message) => message.id)).toEqual([
            'tool-latest',
            'agent-progress',
            'tool-earliest',
        ]);
    });

    it('keeps split final agent replies visible outside the work group', () => {
        const messages: Message[] = [
            {
                kind: 'agent-text',
                id: 'agent-final-part-2',
                localId: null,
                createdAt: 6,
                text: 'second final paragraph',
            },
            {
                kind: 'agent-text',
                id: 'agent-final-part-1',
                localId: null,
                createdAt: 5,
                text: 'first final paragraph',
            },
            toolMessage('tool-latest', 4),
            {
                kind: 'agent-text',
                id: 'agent-progress',
                localId: null,
                createdAt: 3,
                text: 'checking',
            },
            toolMessage('tool-earliest', 2),
            {
                kind: 'user-text',
                id: 'user',
                localId: null,
                createdAt: 1,
                text: 'run tools',
            },
        ];

        const items = groupMessagesForDisplay(messages, true);

        expect(items.map((item) => item.type)).toEqual(['message', 'message', 'agent-work-group', 'message']);
        expect(items[0]).toMatchObject({ type: 'message', id: 'agent-final-part-2' });
        expect(items[1]).toMatchObject({ type: 'message', id: 'agent-final-part-1' });
        expect(items[2]).toMatchObject({ type: 'agent-work-group', id: 'work-tool-earliest' });
        if (items[2].type !== 'agent-work-group') {
            throw new Error('Expected an agent work group');
        }
        expect(items[2].messages.map((message) => message.id)).toEqual([
            'tool-latest',
            'agent-progress',
            'tool-earliest',
        ]);
    });

    it('freezes running tool timers once a final answer completes the work group', () => {
        const messages: Message[] = [
            {
                kind: 'agent-text',
                id: 'agent-final',
                localId: null,
                createdAt: 5_000,
                text: 'done',
            },
            toolMessage('tool-running-in-history', 2_000, { running: true }),
            {
                kind: 'user-text',
                id: 'user',
                localId: null,
                createdAt: 1_000,
                text: 'read files',
            },
        ];

        const items = groupMessagesForDisplay(messages, true);
        const group = items.find((item) => item.type === 'agent-work-group');
        expect(group).toBeDefined();
        if (group?.type !== 'agent-work-group') throw new Error('Expected agent work group');
        expect(group.hasRunning).toBe(false);
        expect(group.completedAt).toBe(5_000);
        expect(group.messages[0]).toMatchObject({
            kind: 'tool-call',
            tool: {
                state: 'completed',
                completedAt: 5_000,
            },
        });
    });

    it('freezes completed-turn running tools even when tool grouping is disabled', () => {
        const messages: Message[] = [
            {
                kind: 'agent-text',
                id: 'agent-final',
                localId: null,
                createdAt: 5_000,
                text: 'done',
            },
            toolMessage('tool-running-persisted', 2_000, { running: true }),
            {
                kind: 'user-text',
                id: 'user',
                localId: null,
                createdAt: 1_000,
                text: 'read files',
            },
        ];

        const items = groupMessagesForDisplay(messages, false);
        const toolItem = items.find((item) => item.type === 'message' && item.message.id === 'tool-running-persisted');
        expect(toolItem).toBeDefined();
        if (toolItem?.type !== 'message' || toolItem.message.kind !== 'tool-call') {
            throw new Error('Expected visible tool-call message');
        }
        expect(toolItem.message.tool.state).toBe('completed');
        expect(toolItem.message.tool.completedAt).toBe(5_000);
    });

    it('shows current thinking but folds completed thinking into agent work', () => {
        const messages: Message[] = [
            {
                kind: 'agent-text',
                id: 'agent-final',
                localId: null,
                createdAt: 4,
                text: 'done',
            },
            {
                kind: 'agent-text',
                id: 'thinking',
                localId: null,
                createdAt: 3,
                text: 'inspect files',
                isThinking: true,
            },
            {
                kind: 'user-text',
                id: 'user',
                localId: null,
                createdAt: 1,
                text: 'run tools',
            },
        ];

        const completed = groupMessagesForDisplay(messages, true);
        expect(completed.map((item) => item.type)).toEqual(['message', 'agent-work-group', 'message']);
        expect(completed[1]).toMatchObject({ type: 'agent-work-group' });

        const running = groupMessagesForDisplay(messages, true, { collapseCurrentTurn: false });
        expect(running.map((item) => item.id)).toEqual(['agent-final', 'thinking', 'user']);
    });

    it('does not collapse the current turn while the agent is still working', () => {
        const messages: Message[] = [
            {
                kind: 'agent-text',
                id: 'agent-streaming',
                localId: null,
                createdAt: 5,
                text: 'still working',
            },
            toolMessage('tool-latest', 4),
            {
                kind: 'agent-text',
                id: 'agent-progress',
                localId: null,
                createdAt: 3,
                text: 'checking',
            },
            toolMessage('tool-earliest', 2),
            {
                kind: 'user-text',
                id: 'user',
                localId: null,
                createdAt: 1,
                text: 'run tools',
            },
        ];

        const items = groupMessagesForDisplay(messages, true, { collapseCurrentTurn: false });

        expect(items.map((item) => item.type)).toEqual([
            'message',
            'message',
            'message',
            'message',
            'message',
        ]);
        expect(items.map((item) => item.id)).toEqual([
            'agent-streaming',
            'tool-latest',
            'agent-progress',
            'tool-earliest',
            'user',
        ]);
    });

    it('still groups adjacent current-turn tools while the agent is working', () => {
        const messages: Message[] = [
            {
                kind: 'agent-text',
                id: 'agent-streaming',
                localId: null,
                createdAt: 5,
                text: 'still working',
            },
            toolMessage('tool-latest', 4),
            toolMessage('tool-earliest', 3),
            {
                kind: 'user-text',
                id: 'user',
                localId: null,
                createdAt: 1,
                text: 'run tools',
            },
        ];

        const items = groupMessagesForDisplay(messages, true, { collapseCurrentTurn: false });

        expect(items.map((item) => item.type)).toEqual(['message', 'tool-group', 'message']);
        expect(items[1]).toMatchObject({
            type: 'tool-group',
            id: 'group-tool-earliest',
            hasPendingPermission: false,
        });
    });

    it('marks a tool group when it contains a pending permission', () => {
        const messages: Message[] = [
            toolMessage('tool-latest', 3, { pendingPermission: true }),
            toolMessage('tool-earliest', 2),
            {
                kind: 'user-text',
                id: 'user',
                localId: null,
                createdAt: 1,
                text: 'run tools',
            },
        ];

        const group = groupMessagesForDisplay(messages, true).find((item) => item.type === 'tool-group');

        expect(group).toMatchObject({
            type: 'tool-group',
            id: 'group-tool-earliest',
            hasPendingPermission: true,
        });
    });

    it('does not collapse a single standalone tool call into a tool group', () => {
        const messages: Message[] = [
            toolMessage('tool-only', 2),
            {
                kind: 'user-text',
                id: 'user',
                localId: null,
                createdAt: 1,
                text: 'run one tool',
            },
        ];

        const items = groupMessagesForDisplay(messages, true);

        expect(items.map((item) => item.type)).toEqual(['message', 'message']);
        expect(items[0]).toMatchObject({ type: 'message', id: 'tool-only' });
    });

    it('hides Claude Skill tool calls from the display list', () => {
        const messages: Message[] = [
            {
                kind: 'agent-text',
                id: 'agent-final',
                localId: null,
                createdAt: 3,
                text: 'done',
            },
            namedToolMessage('skill-tool', 'Skill', 2),
            {
                kind: 'user-text',
                id: 'user',
                localId: null,
                createdAt: 1,
                text: 'run skill',
            },
        ];

        const items = groupMessagesForDisplay(messages, true);

        expect(items.map((item) => item.id)).toEqual(['agent-final', 'user']);
    });

    it('can collapse single standalone tool calls for nested work details', () => {
        const messages: Message[] = [
            toolMessage('tool-only', 2),
            {
                kind: 'user-text',
                id: 'user',
                localId: null,
                createdAt: 1,
                text: 'run one tool',
            },
        ];

        const items = groupToolCallsForDisplay(messages, true, { groupSingleToolCalls: true });

        expect(items.map((item) => item.type)).toEqual(['tool-group', 'message']);
        expect(items[0]).toMatchObject({
            type: 'tool-group',
            id: 'group-tool-only',
            hasPendingPermission: false,
        });
        if (items[0].type !== 'tool-group') {
            throw new Error('Expected a tool group');
        }
        expect(items[0].messages.map((message) => message.id)).toEqual(['tool-only']);
    });
});
