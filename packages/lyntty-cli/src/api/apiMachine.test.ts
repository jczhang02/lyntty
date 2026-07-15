import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
} = vi.hoisted(() => ({
    mockIo: vi.fn(),
    mockShouldReconnect: vi.fn(() => true),
    mockCreateManagedWorktree: vi.fn(),
    mockListManagedWorktrees: vi.fn(),
    mockRemoveManagedWorktree: vi.fn(),
    mockGetManagedWorktreeStatus: vi.fn(),
}));

vi.mock('socket.io-client', () => ({
    io: mockIo
}));

vi.mock('@/configuration', () => ({
    configuration: {
        serverUrl: 'http://127.0.0.1:3005',
        currentCliVersion: 'test'
    }
}));

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
        debugLargeJson: vi.fn()
    }
}));

vi.mock('@/modules/common/registerCommonHandlers', () => ({
    registerCommonHandlers: vi.fn()
}));

vi.mock('@/modules/worktree/worktreeRpc', () => ({
    createManagedWorktree: mockCreateManagedWorktree,
    listManagedWorktrees: mockListManagedWorktrees,
    removeManagedWorktree: mockRemoveManagedWorktree,
    getManagedWorktreeStatus: mockGetManagedWorktreeStatus,
}));

vi.mock('@/api/rpc/RpcHandlerManager', () => ({
    RpcHandlerManager: class {
        onSocketConnect = vi.fn();
        onSocketDisconnect = vi.fn();
        handleRequest = vi.fn(async () => '');
        registerHandler = vi.fn();
        unregisterHandler = vi.fn();
        hasHandler = vi.fn(() => false);
    }
}));

vi.mock('@/utils/detectCLI', () => ({
    detectCLIAvailability: vi.fn(() => ({
        pi: true,
        detectedAt: 1,
    }))
}));

vi.mock('@/resume/localRemoteAuth', () => ({
    detectResumeSupport: vi.fn(() => ({
        rpcAvailable: false,
        requiresSameMachine: true,
        requiresRemoteAuth: true,
        remoteAuthenticated: false,
        detectedAt: 1
    }))
}));

vi.mock('@/utils/lidState', () => ({
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

describe('ApiMachineClient socket reconnection', () => {
    let socketHandlers: SocketHandlers;
    let mockSocket: any;

    const emitSocketEvent = (event: string, ...args: any[]) => {
        const handlers = socketHandlers[event] || [];
        handlers.forEach((handler) => handler(...args));
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockShouldReconnect.mockReturnValue(true);
        mockCreateManagedWorktree.mockResolvedValue({ success: true, worktreePath: '/repo/.dev/worktree/test', branchName: 'test' });
        mockListManagedWorktrees.mockResolvedValue([{ path: '/repo/.dev/worktree/test', branch: 'test' }]);
        mockRemoveManagedWorktree.mockResolvedValue({ success: true });
        mockGetManagedWorktreeStatus.mockResolvedValue({ success: true, clean: true });
        socketHandlers = {};
        mockSocket = {
            connected: false,
            connect: vi.fn(),
            on: vi.fn((event: string, handler: SocketHandler) => {
                if (!socketHandlers[event]) {
                    socketHandlers[event] = [];
                }
                socketHandlers[event].push(handler);
            }),
            emit: vi.fn(),
            emitWithAck: vi.fn(),
            close: vi.fn(),
            io: {
                on: vi.fn()
            }
        };

        mockIo.mockReturnValue(mockSocket);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('does not register session shell/file handlers on machine RPC', () => {
        new ApiMachineClient('fake-token', makeMachine());

        expect(registerCommonHandlers).not.toHaveBeenCalled();
    });

    it('registers narrow worktree RPC handlers on machine RPC', async () => {
        const client = new ApiMachineClient('fake-token', makeMachine());
        client.setRPCHandlers({
            spawnSession: vi.fn(async () => ({ type: 'success' as const, sessionId: 'session-1' })),
            stopSession: vi.fn(() => true),
            requestShutdown: vi.fn(),
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
    });

    it('redacts sensitive spawn RPC parameters from logs', async () => {
        const client = new ApiMachineClient('fake-token', makeMachine());
        const spawnSession = vi.fn(async () => ({ type: 'success' as const, sessionId: 'session-1' }));
        client.setRPCHandlers({
            spawnSession,
            stopSession: vi.fn(() => true),
            requestShutdown: vi.fn(),
        });

        const handler = (client as any).rpcHandlerManager.registerHandler.mock.calls
            .find(([method]: [string]) => method === 'spawn-lyntty-session')?.[1];
        expect(handler).toBeTypeOf('function');

        await handler({
            directory: '/repo',
            agent: 'pi',
            environmentVariables: { PROVIDER_KEY: 'provider-key-value' },
        });

        const logs = JSON.stringify(vi.mocked(logger.debug).mock.calls);
        expect(logs).toContain('hasEnvironmentVariables');
        expect(logs).not.toContain('provider-key-value');
    });

    it('retries after initial socket connection error', async () => {
        vi.useFakeTimers();

        const client = new ApiMachineClient('fake-token', makeMachine());
        client.connect();

        expect(mockIo).toHaveBeenCalledWith('ws://127.0.0.1:3005', expect.objectContaining({
            reconnection: false
        }));
        expect(mockSocket.connect).not.toHaveBeenCalled();

        emitSocketEvent('connect_error', new Error('ECONNREFUSED'));

        await vi.advanceTimersByTimeAsync(1000);
        expect(mockSocket.connect).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(3000);
        expect(mockSocket.connect).toHaveBeenCalledTimes(2);

        client.shutdown();
    });
});
