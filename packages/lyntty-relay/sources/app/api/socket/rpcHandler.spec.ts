import { describe, expect, it } from 'vitest';
import { MAX_RPC_PARAMS_CHARS, MAX_RPC_RESPONSE_CHARS, canCallRpcMethod, canRegisterRpcMethod, isOversizedRpcString } from './rpcHandler';

const machineId = '3f761d9e-5ef6-4b8a-8b13-a20bc0fed470';
const sessionId = 'cmr21ruo5000rovv87u2os57a';

describe('RPC scope guards', () => {
    it('allows machine sockets to register only safe machine RPC methods for their own machine', () => {
        expect(canRegisterRpcMethod({ clientType: 'machine-scoped', machineId }, `${machineId}:list-pi-sessions`)).toBe(true);
        expect(canRegisterRpcMethod({ clientType: 'machine-scoped', machineId }, `${machineId}:spawn-lyntty-session`)).toBe(true);
        expect(canRegisterRpcMethod({ clientType: 'machine-scoped', machineId }, `${machineId}:worktree-create`)).toBe(true);
        expect(canRegisterRpcMethod({ clientType: 'machine-scoped', machineId }, `${machineId}:worktree-status`)).toBe(true);
        expect(canRegisterRpcMethod({ clientType: 'machine-scoped', machineId }, `${machineId}:bash`)).toBe(false);
        expect(canRegisterRpcMethod({ clientType: 'machine-scoped', machineId }, `other-machine:list-pi-sessions`)).toBe(false);
    });

    it('prevents user sockets from calling machine-scoped shell/file RPC methods', () => {
        expect(canCallRpcMethod({ clientType: 'user-scoped' }, `${machineId}:list-pi-sessions`)).toBe(true);
        expect(canCallRpcMethod({ clientType: 'user-scoped' }, `${machineId}:worktree-create`)).toBe(true);
        expect(canCallRpcMethod({ clientType: 'user-scoped' }, `${machineId}:bash`)).toBe(false);
        expect(canCallRpcMethod({ clientType: 'user-scoped' }, `${machineId}:readFile`)).toBe(false);
        expect(canCallRpcMethod({ clientType: 'user-scoped' }, `${machineId}:writeFile`)).toBe(false);
        expect(canCallRpcMethod({ clientType: 'user-scoped' }, `${machineId}:difftastic`)).toBe(false);
    });

    it('keeps session-scoped shell/file RPC available only for the owning session', () => {
        expect(canRegisterRpcMethod({ clientType: 'session-scoped', sessionId }, `${sessionId}:bash`)).toBe(true);
        expect(canCallRpcMethod({ clientType: 'session-scoped', sessionId }, `${sessionId}:bash`)).toBe(true);
        expect(canRegisterRpcMethod({ clientType: 'session-scoped', sessionId }, `other-session:bash`)).toBe(false);
        expect(canCallRpcMethod({ clientType: 'session-scoped', sessionId }, `other-session:bash`)).toBe(false);
    });

    it('allows only declared user-scoped session RPC methods', () => {
        expect(canCallRpcMethod({ clientType: 'user-scoped' }, `${sessionId}:pi-history-page`)).toBe(true);
        expect(canCallRpcMethod({ clientType: 'user-scoped' }, `${sessionId}:bash`)).toBe(true);
        expect(canCallRpcMethod({ clientType: 'user-scoped' }, `${sessionId}:worktree-create`)).toBe(false);
        expect(canCallRpcMethod({ clientType: 'user-scoped' }, `${sessionId}:internal-debug-dump`)).toBe(false);
    });

    it('prevents machine sockets from issuing RPC calls', () => {
        expect(canCallRpcMethod({ clientType: 'machine-scoped', machineId }, `${sessionId}:bash`)).toBe(false);
        expect(canCallRpcMethod({ clientType: 'machine-scoped', machineId }, `${machineId}:list-pi-sessions`)).toBe(false);
    });

    it('detects oversized RPC string payloads', () => {
        expect(isOversizedRpcString('x'.repeat(MAX_RPC_PARAMS_CHARS), MAX_RPC_PARAMS_CHARS)).toBe(false);
        expect(isOversizedRpcString('x'.repeat(MAX_RPC_PARAMS_CHARS + 1), MAX_RPC_PARAMS_CHARS)).toBe(true);
        expect(isOversizedRpcString('x'.repeat(MAX_RPC_RESPONSE_CHARS + 1), MAX_RPC_RESPONSE_CHARS)).toBe(true);
        expect(isOversizedRpcString({ value: 'not-wire-format' }, MAX_RPC_PARAMS_CHARS)).toBe(false);
    });
});
