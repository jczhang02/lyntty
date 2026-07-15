import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    listSessions: vi.fn(),
    postSessionUserMessage: vi.fn(),
    waitForConnect: vi.fn(),
    waitForTurnCompletionAfter: vi.fn(),
    close: vi.fn(),
}));

vi.mock('./config', () => ({
    loadConfig: () => ({ serverUrl: 'https://relay.example.test' }),
}));

vi.mock('./credentials', () => ({
    requireCredentials: () => ({ token: 'test-token' }),
}));

vi.mock('./api', () => ({
    listSessions: mocks.listSessions,
    postSessionUserMessage: mocks.postSessionUserMessage,
    createSession: vi.fn(),
    getSessionMessages: vi.fn(),
    listActiveSessions: vi.fn(),
    listMachines: vi.fn(),
}));

vi.mock('./session', () => ({
    SessionClient: class {
        waitForConnect = mocks.waitForConnect;
        waitForTurnCompletionAfter = mocks.waitForTurnCompletionAfter;
        close = mocks.close;
    },
}));

vi.mock('@/pi/piExtensionInstall', () => ({
    installLynttyPiExtension: vi.fn(),
    lynttyPiExtensionPath: vi.fn(() => '/tmp/pi-extension.ts'),
}));

import { handleRemoteCommand } from './index';

const session = {
    id: 'session-1',
    metadata: { path: '/repo' },
    agentState: null,
    encryption: { key: new Uint8Array(32), variant: 'dataKey' as const },
};

describe('remote send --wait orchestration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.listSessions.mockResolvedValue([session]);
        mocks.waitForConnect.mockResolvedValue(undefined);
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('installs the localId acceptance waiter before persisting the message', async () => {
        const order: string[] = [];
        let finishTurn!: () => void;
        const completion = new Promise<void>((resolve) => {
            finishTurn = resolve;
        });
        mocks.waitForTurnCompletionAfter.mockImplementation((localId: string) => {
            order.push(`wait:${localId}`);
            return completion;
        });
        mocks.postSessionUserMessage.mockImplementation(async (
            _config: unknown,
            _credentials: unknown,
            _session: unknown,
            _message: string,
            localId: string,
        ) => {
            order.push(`post:${localId}`);
            finishTurn();
            return { id: 'message-1', seq: 7, localId, createdAt: 1, updatedAt: 1 };
        });

        await handleRemoteCommand(['send', 'session-1', 'follow up', '--wait']);

        expect(order).toHaveLength(2);
        expect(order[0]).toMatch(/^wait:remote:/);
        expect(order[1]).toBe(order[0].replace('wait:', 'post:'));
        expect(mocks.close).toHaveBeenCalledTimes(1);
    });

    it('observes the waiter rejection when persistence fails first', async () => {
        let rejectCompletion!: (error: Error) => void;
        const completion = new Promise<void>((_resolve, reject) => {
            rejectCompletion = reject;
        });
        mocks.waitForTurnCompletionAfter.mockReturnValue(completion);
        mocks.postSessionUserMessage.mockRejectedValue(new Error('Relay persistence failed'));
        mocks.close.mockImplementationOnce(() => {
            rejectCompletion(new Error('Socket disconnected while waiting for agent turn completion'));
        });
        const unhandled: unknown[] = [];
        const onUnhandled = (reason: unknown) => unhandled.push(reason);
        process.on('unhandledRejection', onUnhandled);

        try {
            await expect(handleRemoteCommand(['send', 'session-1', 'follow up', '--wait']))
                .rejects.toThrow('Relay persistence failed');
            await new Promise<void>((resolve) => setImmediate(resolve));
            expect(unhandled).toEqual([]);
        } finally {
            process.off('unhandledRejection', onUnhandled);
        }
    });
});
