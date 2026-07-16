import { afterEach, beforeEach, describe, expect, it, mock, spyOn, jest } from 'bun:test';
import { ApiMachineClient } from './apiMachine';
import type { Machine } from './types';
import { registerCommonHandlers } from '@/modules/common/registerCommonHandlers';
import { logger } from '@/ui/logger';

const {
    mockIo,
    mockShouldReconnect,
    mockCreateManagedWorktree,
    mockListManagedWorktrees,
    mockRemoveManagedWorktree,
    mockGetManagedWorktreeStatus,
} = {
    mockIo: mock(),
    mockShouldReconnect: mock(() => true),
    mockCreateManagedWorktree: mock(),
    mockListManagedWorktrees: mock(),
    mockRemoveManagedWorktree: mock(),
    mockGetManagedWorktreeStatus: mock(),
};

mock.module('socket.io-client', () => ({
    io: mockIo
}));

mock.module('@/configuration', () => ({
    configuration: {
        serverUrl: 'http://127.0.0.1:3005',
        currentCliVersion: 'test'
    }
}));

mock.module('@/ui/logger', () => ({
    logger: {
        debug: mock(),
        debugLargeJson: mock()
    }
}));

mock.module('@/modules/common/registerCommonHandlers', () => ({
    registerCommonHandlers: mock()
}));

mock.module('@/modules/worktree/worktreeRpc', () => ({
    createManagedWorktree: mockCreateManagedWorktree,
    listManagedWorktrees: mockListManagedWorktrees,
    removeManagedWorktree: mockRemoveManagedWorktree,
    getManagedWorktreeStatus: mockGetManagedWorktreeStatus,
}));

mock.module('@/api/rpc/RpcHandlerManager', () => ({
    RpcHandlerManager: class {
        onSocketConnect = mock();
        onSocketDisconnect = mock();
        handleRequest = mock(async () => '');
        registerHandler = mock();
        unregisterHandler = mock();
        hasHandler = mock(() => false);
    }
}));

mock.module('@/utils/detectCLI', () => ({
    detectCLIAvailability: mock(() => ({
        pi: true,
        detectedAt: 1,
    }))
}));

mock.module('@/resume/localRemoteAuth', () => ({
    detectResumeSupport: mock(() => ({
        rpcAvailable: false,
        requiresSameMachine: true,
        requiresRemoteAuth: true,
        remoteAuthenticated: false,
        detectedAt: 1
    }))
}));

mock.module('@/utils/lidState', () => ({
    shouldReconnect: mockShouldReconnect
}));

type SocketHandler = (...args: any[]) => void;
type SocketHandlers = Record<string, SocketHandler[]>;

function makeMachine(): Machine {
    return {
        id: 'test-machine-id',
        metadata: {
            host: 'localhost',
            platform: 'darwin',
            lynttyCliVersion: 'test',
            homeDir: '/home/user',
            lynttyHomeDir: '/home/user/.lyntty',
            lynttyLibDir: '/home/user/.lyntty/lib'
        },
        metadataVersion: 0,
        daemonState: null,
        daemonStateVersion: 0,
        encryptionKey: new Uint8Array(32),
        encryptionVariant: 'legacy'
    };
}

const loggerDebugMock = logger.debug as unknown as ReturnType<typeof mock>;

describe('ApiMachineClient socket reconnection', () => {
    let socketHandlers: SocketHandlers;
    let mockSocket: any;

    const emitSocketEvent = (event: string, ...args: any[]) => {
        const handlers = socketHandlers[event] || [];
        handlers.forEach((handler) => handler(...args));
    };

    beforeEach(() => {
        mock.clearAllMocks();
        mockShouldReconnect.mockReturnValue(true);
        mockCreateManagedWorktree.mockResolvedValue({ success: true, worktreePath: '/repo/.dev/worktree/test', branchName: 'test' });
        mockListManagedWorktrees.mockResolvedValue([{ path: '/repo/.dev/worktree/test', branch: 'test' }]);
        mockRemoveManagedWorktree.mockResolvedValue({ success: true });
        mockGetManagedWorktreeStatus.mockResolvedValue({ success: true, clean: true });
        socketHandlers = {};
        mockSocket = {
            connected: false,
            connect: mock(),
            on: mock((event: string, handler: SocketHandler) => {
                if (!socketHandlers[event]) {
                    socketHandlers[event] = [];
                }
                socketHandlers[event].push(handler);
            }),
            emit: mock(),
            emitWithAck: mock(),
            close: mock(),
            io: {
                on: mock()
            }
        };

        mockIo.mockReturnValue(mockSocket);
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('does not register session shell/file handlers on machine RPC', () => {
        new ApiMachineClient('fake-token', makeMachine());

        expect(registerCommonHandlers).not.toHaveBeenCalled();
    });

    it('registers narrow worktree RPC handlers on machine RPC', async () => {
        const client = new ApiMachineClient('fake-token', makeMachine());
        client.setRPCHandlers({
            spawnSession: mock(async () => ({ type: 'success' as const, sessionId: 'session-1' })),
            stopSession: mock(() => true),
            requestShutdown: mock(),
        });

        const registeredMethods = (client as any).rpcHandlerManager.registerHandler.mock.calls.map(([method]: [string]) => method);
        expect(registeredMethods).toContain('worktree-create');
        expect(registeredMethods).toContain('worktree-list');
        expect(registeredMethods).toContain('worktree-remove');
        expect(registeredMethods).toContain('worktree-status');
        expect(registeredMethods).not.toContain('bash');

        const createHandler = (client as any).rpcHandlerManager.registerHandler.mock.calls
            .find(([method]: [string]) => method === 'worktree-create')?.[1];
        await expect(createHandler({ basePath: '/repo', branchName: 'safe-branch' })).resolves.toMatchObject({ success: true });
        expect(mockCreateManagedWorktree).toHaveBeenCalledWith({ basePath: '/repo', branchName: 'safe-branch' });

        const listHandler = (client as any).rpcHandlerManager.registerHandler.mock.calls
            .find(([method]: [string]) => method === 'worktree-list')?.[1];
        await expect(listHandler({ basePath: '/repo' })).resolves.toEqual({
            success: true,
            worktrees: [{ path: '/repo/.dev/worktree/test', branch: 'test' }],
        });
    });

    it('redacts sensitive spawn RPC parameters from logs', async () => {
        const client = new ApiMachineClient('fake-token', makeMachine());
        const spawnSession = mock(async () => ({ type: 'success' as const, sessionId: 'session-1' }));
        client.setRPCHandlers({
            spawnSession,
            stopSession: mock(() => true),
            requestShutdown: mock(),
        });

        const handler = (client as any).rpcHandlerManager.registerHandler.mock.calls
            .find(([method]: [string]) => method === 'spawn-lyntty-session')?.[1];
        expect(handler).toBeTypeOf('function');

        await handler({
            directory: '/repo',
            agent: 'pi',
            environmentVariables: { PROVIDER_KEY: 'provider-key-value' },
        });

        const logs = JSON.stringify(loggerDebugMock.mock.calls);
        expect(logs).toContain('hasEnvironmentVariables');
        expect(logs).not.toContain('provider-key-value');
    });

    it('retries after initial socket connection error', async () => {
        jest.useFakeTimers();

        const client = new ApiMachineClient('fake-token', makeMachine());
        client.connect();

        expect(mockIo).toHaveBeenCalledWith('ws://127.0.0.1:3005', expect.objectContaining({
            reconnection: false
        }));
        expect(mockSocket.connect).not.toHaveBeenCalled();

        emitSocketEvent('connect_error', new Error('ECONNREFUSED'));

        await jest.advanceTimersByTime(1000);
        expect(mockSocket.connect).toHaveBeenCalledTimes(1);

        await jest.advanceTimersByTime(3000);
        expect(mockSocket.connect).toHaveBeenCalledTimes(2);

        client.shutdown();
    });
});
