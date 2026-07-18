import { describe, expect, it, mock, spyOn, jest } from 'bun:test';
import { handleRemoteCommand } from './index';

mock.module('@/pi/piExtensionInstall', () => ({
    installLynttyPiExtension: mock(),
    lynttyPiExtensionPath: mock(() => '/tmp/pi-extension.ts'),
}));

describe('remote command dispatch', () => {
    it('rejects a non-Pi spawn runtime before contacting the relay', async () => {
        await expect(handleRemoteCommand(['spawn', '--machine', 'machine-1', '--agent', 'other']))
            .rejects.toThrow('only supports agent `pi`');
    });

    it('requires exactly a session and message for send', async () => {
        await expect(handleRemoteCommand(['send', 'session-only']))
            .rejects.toThrow('send requires exactly one session-id and one message');
        await expect(handleRemoteCommand(['send', 'session', 'message', 'extra']))
            .rejects.toThrow('send requires exactly one session-id and one message');
    });

    it('requires one session ID for session commands', async () => {
        await expect(handleRemoteCommand(['stop', 'one', 'two']))
            .rejects.toThrow('Expected at most one session-id');
        await expect(handleRemoteCommand(['wait']))
            .rejects.toThrow('session-id is required');
    });

    it('requires an explicit supported takeover choice for resume', async () => {
        await expect(handleRemoteCommand(['resume', 'session-1', '--takeover', 'force']))
            .rejects.toThrow('--takeover must be wait, stop, or interrupt');
    });
});
