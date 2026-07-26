import { describe, expect, it } from 'bun:test';

import { unwrapRpcHandlerResponse } from './apiSocketErrors';
import {
    listPiSessionsResultSchema,
    parseMachineRpcResult,
    spawnSessionResultSchema,
    worktreeListResultSchema,
    worktreeStatusResultSchema,
} from './machineRpcSchemas';

const completePiRecord = {
    state: 'discovered_local' as const,
    piSessionId: 'pi-1',
    relaySessionTag: 'pi:stable-tag',
    messageCount: 1,
    needsRegistration: true,
    needsBackfill: true,
    hasHistoryGap: false,
    reason: 'Local Pi history is available',
};

describe('machine RPC response validation', () => {
    it('accepts current spawn and Pi discovery response shapes', () => {
        expect(parseMachineRpcResult('spawn-lyntty-session', spawnSessionResultSchema)({
            type: 'success',
            sessionId: 'relay-1',
        })).toEqual({ type: 'success', sessionId: 'relay-1' });

        const discovered = parseMachineRpcResult('list-pi-sessions', listPiSessionsResultSchema)({
            type: 'success',
            sessions: [completePiRecord],
            total: 1,
        });
        expect(discovered).toMatchObject({ type: 'success', sessions: [completePiRecord] });
        if (discovered.type === 'success') {
            expect(discovered.sessions[0]?.relaySessionTag).toBe('pi:stable-tag');
        }
        expect(parseMachineRpcResult('worktree-list', worktreeListResultSchema)({
            success: true,
            worktrees: [{ path: '/repo/.dev/worktree/a', branch: 'a' }],
        })).toMatchObject({ success: true, worktrees: [{ branch: 'a' }] });
        expect(parseMachineRpcResult('worktree-list', worktreeListResultSchema)({
            success: false,
            error: 'offline',
        })).toEqual({ success: false, error: 'offline' });
    });

    it('rejects malformed and obsolete success payloads', () => {
        const parseSpawn = parseMachineRpcResult('spawn-lyntty-session', spawnSessionResultSchema);
        const parseWorktrees = parseMachineRpcResult('worktree-list', worktreeListResultSchema);

        expect(() => parseSpawn({ type: 'success' })).toThrow('Invalid machine RPC response');
        expect(() => parseWorktrees([{ path: '/repo/.dev/worktree/a', branch: 'a' }])).toThrow(
            'Invalid machine RPC response',
        );
        expect(() => parseWorktrees({ success: true, worktrees: [{ path: '', branch: 'a' }] })).toThrow(
            'Invalid machine RPC response',
        );
        expect(() => parseMachineRpcResult('worktree-status', worktreeStatusResultSchema)({
            success: false,
            clean: true,
            error: 'denied',
        })).toThrow('Invalid machine RPC response');
    });

    it('rejects every encrypted error envelope before success parsing', () => {
        expect(() => unwrapRpcHandlerResponse({ error: 'denied', code: 'E_DENIED' })).toThrow('denied');
        expect(() => unwrapRpcHandlerResponse({ type: 'success', sessionId: 'fake', error: 'denied' })).toThrow('denied');
        expect(() => unwrapRpcHandlerResponse({ success: true, clean: true, error: 'denied' })).toThrow('denied');
        expect(() => unwrapRpcHandlerResponse({
            success: true,
            worktrees: [],
            type: 'error',
            error: 'denied',
        })).toThrow('denied');
        expect(() => unwrapRpcHandlerResponse({
            success: false,
            type: 'success',
            error: 'denied',
        })).toThrow('denied');
        expect(() => unwrapRpcHandlerResponse({ error: 500 })).toThrow('RPC handler failed');
        expect(() => unwrapRpcHandlerResponse({ error: '' })).toThrow('RPC handler failed');
    });
});
