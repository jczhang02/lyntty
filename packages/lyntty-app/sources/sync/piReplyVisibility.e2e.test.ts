import { describe, expect, it } from 'vitest';

import { createReducer, reducer } from './reducer/reducer';
import { normalizeRawMessage } from './typesRaw';

describe('Pi reply visibility E2E smoke', () => {
    it('renders a relay-delivered pi ACP text reply as an agent text message', () => {
        const normalized = normalizeRawMessage('server-msg-1', null, 123, {
            role: 'agent',
            content: {
                type: 'acp',
                provider: 'pi',
                data: {
                    type: 'message',
                    message: 'hello from pi',
                },
            },
            meta: { sentFrom: 'cli' },
        } as any);

        expect(normalized).toMatchObject({
            role: 'agent',
            content: [{
                type: 'text',
                text: 'hello from pi',
            }],
        });
    });

    it('renders relay-delivered pi ACP tool events as agent tool messages', () => {
        const normalized = normalizeRawMessage('server-msg-2', null, 124, {
            role: 'agent',
            content: {
                type: 'acp',
                provider: 'pi',
                data: {
                    type: 'tool-call',
                    callId: 'tool-1',
                    id: 'tool-1',
                    name: 'bash',
                    input: { command: 'pnpm test' },
                },
            },
            meta: { sentFrom: 'cli' },
        } as any);

        expect(normalized).toMatchObject({
            role: 'agent',
            content: [{
                type: 'tool-call',
                id: 'tool-1',
                name: 'bash',
            }],
        });
    });

    it('coalesces streamed pi text deltas into one readable agent reply', () => {
        const normalized = ['当前', '目录', '是 /home/jc/dev/lyntty'].map((message, index) => normalizeRawMessage(`delta-${index}`, null, 200 + index, {
            role: 'agent',
            content: {
                type: 'acp',
                provider: 'pi',
                data: {
                    type: 'message',
                    message,
                    streaming: true,
                },
            },
            meta: { sentFrom: 'cli' },
        } as any));

        expect(normalized.every(Boolean)).toBe(true);
        const result = reducer(createReducer(), normalized.filter((message) => message !== null));

        expect(result.messages).toHaveLength(1);
        expect(result.messages[0]).toMatchObject({
            kind: 'agent-text',
            text: '当前目录是 /home/jc/dev/lyntty',
        });
    });
});
