import { afterEach, describe, expect, it, vi } from 'bun:test';

const socketHandlers = new Map<string, (...args: any[]) => void>();
const timedEmitWithAck = vi.fn();
const emitWithAck = vi.fn();
const timeout = vi.fn(() => ({ emitWithAck: timedEmitWithAck }));
const socket = {
    recovered: false,
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
        socketHandlers.set(event, handler);
    }),
    onAny: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn(),
    emitWithAck,
    timeout,
};

vi.mock('socket.io-client', () => ({ io: vi.fn(() => socket) }));
vi.mock('react-native', () => ({
    AppState: { currentState: 'active' },
    Platform: { OS: 'android' },
}));
vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '1.2.0' } } }));
vi.mock('@/auth/tokenStorage', () => ({ TokenStorage: { getCredentials: vi.fn() } }));
vi.mock('@/auth/authInvalidation', () => ({
    isAuthInvalidationError: vi.fn(() => false),
    isAuthInvalidationMessage: vi.fn(() => false),
    requestAuthInvalidation: vi.fn(),
}));
vi.mock('./encryption/encryption', () => ({ Encryption: class {} }));
vi.mock('./storage', () => ({
    storage: { getState: () => ({ localSettings: { verboseLogging: false } }) },
}));

afterEach(async () => {
    const { apiSocket } = await import('./apiSocket');
    apiSocket.reset();
    timedEmitWithAck.mockReset();
    emitWithAck.mockReset();
    timeout.mockClear();
    socketHandlers.clear();
});

describe('socket reconnect refresh', () => {
    it('does not report the first connection as a reconnect', async () => {
        const listener = vi.fn();
        const { apiSocket } = await import('./apiSocket');
        apiSocket.onReconnected(listener);
        apiSocket.initialize({ endpoint: 'http://relay.test', token: 'token' }, {} as any);

        socketHandlers.get('connect')?.();
        expect(listener).not.toHaveBeenCalled();

        socket.recovered = false;
        socketHandlers.get('connect')?.();
        expect(listener).toHaveBeenCalledTimes(1);
    });
});

describe('machine RPC timeout', () => {
    it('uses Socket.IO acknowledgement timeout for bounded discovery calls', async () => {
        timedEmitWithAck.mockResolvedValue({ ok: true, result: 'encrypted-result' });
        const machineEncryption = {
            encryptRaw: vi.fn(async () => 'encrypted-params'),
            decryptRaw: vi.fn(async () => ({ type: 'success', sessions: [] })),
        };
        const encryption = {
            getMachineEncryption: vi.fn(() => machineEncryption),
        };
        const { apiSocket } = await import('./apiSocket');
        apiSocket.initialize({ endpoint: 'http://relay.test', token: 'token' }, encryption as any);

        await expect(apiSocket.machineRPC(
            'machine-1',
            'list-pi-sessions',
            { scope: 'machine' },
            (value) => value,
            { timeoutMs: 15_000 },
        )).resolves.toEqual({ type: 'success', sessions: [] });

        expect(timeout).toHaveBeenCalledWith(15_000);
        expect(timedEmitWithAck).toHaveBeenCalledWith('rpc-call', {
            method: 'machine-1:list-pi-sessions',
            params: 'encrypted-params',
        });
    });

    it('keeps existing non-discovery RPC calls unbounded unless requested', async () => {
        emitWithAck.mockResolvedValue({ ok: true, result: 'encrypted-result' });
        const encryption = {
            getMachineEncryption: () => ({
                encryptRaw: async () => 'encrypted-params',
                decryptRaw: async () => ({ message: 'ok' }),
            }),
        };
        const { apiSocket } = await import('./apiSocket');
        apiSocket.initialize({ endpoint: 'http://relay.test', token: 'token' }, encryption as any);

        await expect(apiSocket.machineRPC('machine-1', 'stop-daemon', {}, (value) => value))
            .resolves.toEqual({ message: 'ok' });

        expect(timeout).not.toHaveBeenCalled();
        expect(emitWithAck).toHaveBeenCalledTimes(1);
    });
});

describe('session RPC bounds', () => {
    it('defaults to a bounded acknowledgement and aborts pending work on socket reset', async () => {
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => { markStarted = resolve; });
        timedEmitWithAck.mockImplementation(() => {
            markStarted();
            return new Promise(() => undefined);
        });
        const encryption = {
            getSessionEncryption: () => ({
                encryptRaw: async () => 'encrypted-params',
                decryptRaw: async () => ({ type: 'success' }),
            }),
        };
        const { apiSocket } = await import('./apiSocket');
        apiSocket.initialize({ endpoint: 'http://relay.test', token: 'token' }, encryption as any);
        const request = apiSocket.sessionRPC('session-1', 'abort', {});
        await started;
        apiSocket.reset();

        await expect(request).rejects.toMatchObject({ name: 'AbortError' });
        expect(timeout).toHaveBeenCalledWith(15_000);
    });

    it('uses an explicit acknowledgement timeout and releases an externally aborted caller', async () => {
        let markStarted!: () => void;
        const started = new Promise<void>((resolve) => { markStarted = resolve; });
        timedEmitWithAck.mockImplementation(() => {
            markStarted();
            return new Promise(() => undefined);
        });
        const encryption = {
            getSessionEncryption: () => ({
                encryptRaw: async () => 'encrypted-params',
                decryptRaw: async () => ({ type: 'success' }),
            }),
        };
        const { apiSocket } = await import('./apiSocket');
        apiSocket.initialize({ endpoint: 'http://relay.test', token: 'token' }, encryption as any);
        const controller = new AbortController();
        const request = apiSocket.sessionRPC(
            'session-1',
            'pi-history-page',
            {},
            { timeoutMs: 15_000, signal: controller.signal },
        );
        await started;
        controller.abort();

        await expect(request).rejects.toMatchObject({ name: 'AbortError' });
        expect(timeout).toHaveBeenCalledWith(15_000);
        expect(timedEmitWithAck).toHaveBeenCalledWith('rpc-call', {
            method: 'session-1:pi-history-page',
            params: 'encrypted-params',
        });
    });
});
