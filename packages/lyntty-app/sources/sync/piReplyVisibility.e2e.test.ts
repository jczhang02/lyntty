import { createEnvelope } from 'lyntty-wire';
import { describe, expect, it } from 'vitest';

import { createReducer, reducer } from './reducer/reducer';
import { normalizeRawMessage } from './typesRaw';

describe('Pi reply visibility E2E smoke', () => {
    it('renders a relay-delivered pi session-protocol text reply as an agent text message', () => {
        const normalized = normalizeRawMessage('server-msg-1', null, 123, {
            role: 'session',
            content: createEnvelope('agent', {
                t: 'text',
                text: 'hello from pi',
            }, { turn: 'pi-turn-1', time: 123 }),
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

    it('renders relay-delivered pi session-protocol tool events as agent tool messages', () => {
        const normalized = [
            normalizeRawMessage('server-msg-2', null, 124, {
                role: 'session',
                content: createEnvelope('agent', {
                    t: 'tool-call-start',
                    call: 'tool-1',
                    name: 'bash',
                    title: 'bash',
                    description: 'Running bash',
                    args: { command: 'pnpm test' },
                }, { turn: 'pi-turn-1', time: 124 }),
                meta: { sentFrom: 'cli' },
            } as any),
            normalizeRawMessage('server-msg-3', null, 125, {
                role: 'session',
                content: createEnvelope('agent', {
                    t: 'tool-call-end',
                    call: 'tool-1',
                }, { turn: 'pi-turn-1', time: 125 }),
                meta: { sentFrom: 'cli' },
            } as any),
        ];

        const result = reducer(createReducer(), normalized.filter((message) => message !== null));

        expect(result.messages).toHaveLength(1);
        expect(result.messages[0]).toMatchObject({
            kind: 'tool-call',
            tool: {
                name: 'bash',
                state: 'completed',
                input: { command: 'pnpm test' },
            },
        });
    });

    it('renders coalesced pi SDK deltas as one readable session-protocol reply', () => {
        const normalized = normalizeRawMessage('server-msg-4', null, 200, {
            role: 'session',
            content: createEnvelope('agent', {
                t: 'text',
                text: '当前目录是 /home/jc/dev/lyntty',
            }, { turn: 'pi-turn-2', time: 200 }),
            meta: { sentFrom: 'cli' },
        } as any);

        expect(normalized).not.toBeNull();
        const result = reducer(createReducer(), normalized ? [normalized] : []);

        expect(result.messages).toHaveLength(1);
        expect(result.messages[0]).toMatchObject({
            kind: 'agent-text',
            text: '当前目录是 /home/jc/dev/lyntty',
        });
    });
});
