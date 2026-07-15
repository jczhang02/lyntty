import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiSessionClient } from './apiSession';
import { decodeBase64, decrypt, decryptBlob, encodeBase64, encrypt } from './encryption';
import type { Update } from './types';
import { logger } from '@/ui/logger';

const {
    mockIo,
    mockAxiosGet,
    mockAxiosPost,
    mockAxiosPut,
    mockBackoff,
    mockDelay,
    mockShouldReconnect
} = vi.hoisted(() => ({
    mockIo: vi.fn(),
    mockAxiosGet: vi.fn(),
    mockAxiosPost: vi.fn(),
    mockAxiosPut: vi.fn(),
    mockBackoff: vi.fn(async <T>(callback: () => Promise<T>) => {
        let lastError: unknown;
        for (let i = 0; i < 20; i += 1) {
            try {
                return await callback();
            } catch (error) {
                lastError = error;
            }
        }
        throw lastError;
    }),
    mockDelay: vi.fn(async () => undefined),
    mockShouldReconnect: vi.fn(() => true)
}));

vi.mock('socket.io-client', () => ({
    io: mockIo
}));

vi.mock('axios', () => ({
    default: {
        get: mockAxiosGet,
        post: mockAxiosPost,
        put: mockAxiosPut
    }
}));

vi.mock('@/configuration', () => ({
    configuration: {
        serverUrl: 'https://server.test'
    }
}));

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
        debugLargeJson: vi.fn()
    }
}));

vi.mock('@/api/rpc/RpcHandlerManager', () => ({
    RpcHandlerManager: class {
        onSocketConnect = vi.fn();
        onSocketDisconnect = vi.fn();
        handleRequest = vi.fn(async () => '');
    }
}));

vi.mock('@/modules/common/registerCommonHandlers', () => ({
    registerCommonHandlers: vi.fn()
}));

vi.mock('@/utils/time', () => ({
    backoff: mockBackoff,
    delay: mockDelay
}));

vi.mock('@/utils/lidState', () => ({
    shouldReconnect: mockShouldReconnect
}));

type SocketHandler = (...args: any[]) => void;
type SocketHandlers = Record<string, SocketHandler[]>;

function makeSession() {
    return {
        id: 'test-session-id',
        seq: 0,
        metadata: {
            path: '/tmp',
            host: 'localhost',
            homeDir: '/home/user',
            lynttyHomeDir: '/home/user/.lyntty',
            lynttyLibDir: '/home/user/.lyntty/lib',
            lynttyToolsDir: '/home/user/.lyntty/tools'
        },
        metadataVersion: 0,
        agentState: null,
        agentStateVersion: 0,
        encryptionKey: new Uint8Array(32),
        encryptionVariant: 'legacy' as const
    };
}

function encryptContent(session: ReturnType<typeof makeSession>, content: unknown): string {
    return encodeBase64(encrypt(session.encryptionKey, session.encryptionVariant, content));
}

function createNewMessageUpdate(seq: number, encryptedContent: string): Update {
    return {
        id: `upd-${seq}`,
        seq,
        createdAt: Date.now(),
        body: {
            t: 'new-message',
            sid: 'test-session-id',
            message: {
                id: `msg-${seq}`,
                seq,
                localId: null,
                content: {
                    t: 'encrypted',
                    c: encryptedContent
                },
                createdAt: Date.now(),
                updatedAt: Date.now(),
            }
        }
    };
}

async function waitForCheck(check: () => void, timeoutMs = 2000) {
    const startedAt = Date.now();
    let lastError: unknown;
    while (Date.now() - startedAt < timeoutMs) {
        try {
            check();
            return;
        } catch (error) {
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, 5));
        }
    }
    throw lastError;
}

describe('ApiSessionClient v3 messages API migration', () => {
    let socketHandlers: SocketHandlers;
    let mockSocket: any;
    let session: ReturnType<typeof makeSession>;

    const emitSocketEvent = (event: string, ...args: any[]) => {
        const handlers = socketHandlers[event] || [];
        handlers.forEach((handler) => handler(...args));
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockShouldReconnect.mockReturnValue(true);
        socketHandlers = {};
        session = makeSession();
        mockSocket = {
            connected: true,
            connect: vi.fn(),
            on: vi.fn((event: string, handler: SocketHandler) => {
                if (!socketHandlers[event]) {
                    socketHandlers[event] = [];
                }
                socketHandlers[event].push(handler);
            }),
            off: vi.fn(),
            emit: vi.fn(),
            emitWithAck: vi.fn(async () => ({ result: 'error' })),
            volatile: {
                emit: vi.fn()
            },
            close: vi.fn()
        };

        mockIo.mockReturnValue(mockSocket);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('registers core socket handlers and connects', () => {
        new ApiSessionClient('fake-token', session);

        expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
        expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
        expect(mockSocket.on).toHaveBeenCalledWith('update', expect.any(Function));
        expect(mockSocket.connect).toHaveBeenCalledTimes(1);
    });

    it('retries after initial socket connection error', async () => {
        vi.useFakeTimers();
        mockSocket.connected = false;

        const client = new ApiSessionClient('fake-token', session);

        expect(mockSocket.connect).toHaveBeenCalledTimes(1);

        emitSocketEvent('connect_error', new Error('ECONNREFUSED'));

        await vi.advanceTimersByTimeAsync(1000);
        expect(mockSocket.connect).toHaveBeenCalledTimes(2);

        await vi.advanceTimersByTimeAsync(3000);
        expect(mockSocket.connect).toHaveBeenCalledTimes(3);

        await client.close();
    });

    it('flushes long outbox batches in enqueue order', async () => {
        const client = new ApiSessionClient('fake-token', session);
        (client as any).pendingOutbox = Array.from({ length: 120 }, (_value, index) => ({
            content: `encrypted-${index + 1}`,
            localId: `local-${index + 1}`,
        }));
        let nextSeq = 1;
        mockAxiosPost.mockImplementation(async (_url: string, payload: { messages: Array<{ localId: string }> }) => ({
            data: {
                messages: payload.messages.map((message) => ({
                    id: `msg-${nextSeq}`,
                    seq: nextSeq++,
                    localId: message.localId,
                    createdAt: nextSeq,
                    updatedAt: nextSeq,
                })),
            },
        }));

        await (client as any).flushOutbox();

        expect(mockAxiosPost).toHaveBeenCalledTimes(3);
        expect(mockAxiosPost.mock.calls.map((call) => call[1].messages.map((message: { localId: string }) => message.localId))).toEqual([
            Array.from({ length: 50 }, (_value, index) => `local-${index + 1}`),
            Array.from({ length: 50 }, (_value, index) => `local-${index + 51}`),
            Array.from({ length: 20 }, (_value, index) => `local-${index + 101}`),
        ]);
        expect((client as any).pendingOutbox).toHaveLength(0);
        expect((client as any).lastSeq).toBe(120);
    });

    it('uploads a local mobile image attachment', async () => {
        const client = new ApiSessionClient('fake-token', session);
        const pngBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

        mockAxiosPost.mockImplementation(async (url: string, payload: any) => {
            if (url.endsWith('/attachments/request-upload')) {
                expect(payload).toMatchObject({
                    filename: 'mobile-image-1.png',
                });
                return {
                    data: {
                        ref: 'sessions/test-session-id/attachments/mobile-image.enc',
                        uploadUrl: 'https://server.test/v1/sessions/test-session-id/attachments/mobile-image.enc',
                        method: 'PUT',
                    },
                };
            }

            return {
                data: {
                    messages: payload.messages.map((_message: unknown, index: number) => ({
                        id: `msg-${index + 1}`,
                        seq: index + 1,
                        localId: `local-${index + 1}`,
                        createdAt: 1,
                        updatedAt: 1,
                    })),
                },
            };
        });
        mockAxiosPut.mockResolvedValueOnce({ data: { ok: true } });

        const envelope = await client.uploadLocalImageAttachmentEnvelope({
            data: pngBytes,
            mimeType: 'image/png',
            name: 'mobile-image-1.png',
        });

        expect(envelope).toMatchObject({
            role: 'user',
            ev: {
                t: 'file',
                ref: 'sessions/test-session-id/attachments/mobile-image.enc',
                name: 'mobile-image-1.png',
                size: pngBytes.length,
                mimeType: 'image/png',
            },
        });

        const uploadBody = mockAxiosPut.mock.calls[0][1];
        const blobKey = await client.getBlobKey();
        expect(decryptBlob(new Uint8Array(uploadBody), blobKey)).toEqual(pngBytes);
    });

    it('sends session protocol messages through enqueueMessage with session envelope', async () => {
        const client = new ApiSessionClient('fake-token', session);
        mockAxiosPost.mockResolvedValueOnce({
            data: {
                messages: [{ id: 'msg-1', seq: 1, localId: 'local-1', createdAt: 1, updatedAt: 1 }]
            }
        });

        const envelope = {
            id: 'env-1',
            time: 1000,
            role: 'agent' as const,
            turn: 'turn-1',
            ev: { t: 'text' as const, text: 'hello from session protocol' }
        };
        client.sendSessionProtocolMessage(envelope);

        await waitForCheck(() => {
            expect(mockAxiosPost).toHaveBeenCalledTimes(1);
        });

        const payload = mockAxiosPost.mock.calls[0][1];
        expect(payload.messages[0].localId).toBe('session:env-1');
        const decrypted = decrypt(
            session.encryptionKey,
            session.encryptionVariant,
            decodeBase64(payload.messages[0].content)
        );

        expect(decrypted).toEqual({
            role: 'session',
            content: envelope,
            meta: {
                sentFrom: 'cli'
            }
        });
    });

    it('sends only modern payload for user session envelopes', async () => {
        const client = new ApiSessionClient('fake-token', session);
        mockAxiosPost.mockResolvedValueOnce({
            data: {
                messages: [{ id: 'msg-1', seq: 1, localId: 'local-1', createdAt: 1, updatedAt: 1 }]
            }
        });

        client.sendSessionProtocolMessage({
            id: 'env-user-1',
            time: 1001,
            role: 'user',
            ev: { t: 'text', text: 'shadow this' }
        });

        await waitForCheck(() => {
            expect(mockAxiosPost).toHaveBeenCalledTimes(1);
        });

        const payload = mockAxiosPost.mock.calls[0][1];
        expect(payload.messages).toHaveLength(1);

        const sessionUser = decrypt(
            session.encryptionKey,
            session.encryptionVariant,
            decodeBase64(payload.messages[0].content)
        );
        expect(sessionUser).toMatchObject({
            role: 'session',
            content: {
                id: 'env-user-1',
                time: 1001,
                role: 'user',
                ev: { t: 'text', text: 'shadow this' }
            }
        });
    });

    it('sends modern session envelope for user text', async () => {
        const client = new ApiSessionClient('fake-token', session);
        mockAxiosPost.mockResolvedValueOnce({
            data: {
                messages: [{ id: 'msg-1', seq: 1, localId: 'local-1', createdAt: 1, updatedAt: 1 }]
            }
        });

        client.sendSessionProtocolMessage({
            id: 'env-user-flag-on-1',
            time: 1002,
            role: 'user',
            ev: { t: 'text', text: 'session only' }
        });

        await waitForCheck(() => {
            expect(mockAxiosPost).toHaveBeenCalledTimes(1);
        });

        const payload = mockAxiosPost.mock.calls[0][1];
        expect(payload.messages).toHaveLength(1);

        const sessionOnly = decrypt(
            session.encryptionKey,
            session.encryptionVariant,
            decodeBase64(payload.messages[0].content)
        );

        expect(sessionOnly).toMatchObject({
            role: 'session',
            content: {
                role: 'user',
                ev: { t: 'text', text: 'session only' }
            },
            meta: {
                sentFrom: 'cli'
            }
        });
        expect(typeof (sessionOnly as any).content.time).toBe('number');
    });

    it('sends session events through enqueueMessage', async () => {
        const client = new ApiSessionClient('fake-token', session);
        mockAxiosPost.mockResolvedValueOnce({
            data: {
                messages: [{ id: 'msg-1', seq: 1, localId: 'local-1', createdAt: 1, updatedAt: 1 }]
            }
        });

        client.sendSessionEvent({ type: 'ready' }, 'event-1');

        await waitForCheck(() => {
            expect(mockAxiosPost).toHaveBeenCalledTimes(1);
        });

        const payload = mockAxiosPost.mock.calls[0][1];
        const decrypted = decrypt(
            session.encryptionKey,
            session.encryptionVariant,
            decodeBase64(payload.messages[0].content)
        );

        expect(decrypted).toEqual({
            role: 'agent',
            content: {
                id: 'event-1',
                type: 'event',
                data: {
                    type: 'ready'
                }
            }
        });
    });

    it('replays unacked user commands from after_seq=0 after daemon client reconstruction', async () => {
        const client = new ApiSessionClient('fake-token', session);
        const onUserMessage = vi.fn();
        client.onUserMessage(onUserMessage);

        const userMessage = {
            role: 'user',
            content: {
                type: 'text',
                text: 'from fetch'
            }
        };

        mockAxiosGet.mockResolvedValueOnce({
            data: {
                messages: [
                    {
                        id: 'msg-1',
                        seq: 1,
                        content: {
                            t: 'encrypted',
                            c: encryptContent(session, userMessage)
                        },
                        localId: null,
                        createdAt: 1000,
                        updatedAt: 1000
                    }
                ],
                hasMore: false
            }
        });

        await (client as any).fetchMessages();

        expect(mockAxiosGet).toHaveBeenCalledTimes(1);
        expect(mockAxiosGet.mock.calls[0][0]).toBe('https://server.test/v3/sessions/test-session-id/messages');
        expect(mockAxiosGet.mock.calls[0][1].params).toEqual({
            after_seq: 0,
            limit: 100
        });
        expect(onUserMessage).toHaveBeenCalledWith({ ...userMessage, localKey: 'msg-1' });
        expect((client as any).lastSeq).toBe(1);
    });

    it('skips only the fixed construction snapshot and still routes commands arriving during initialization', async () => {
        const snapshot = { ...session, seq: 1 };
        const client = new ApiSessionClient('fake-token', snapshot);
        const onUserMessage = vi.fn();
        client.onUserMessage(onUserMessage);
        client.skipExistingMessages();
        const oldMessage = {
            role: 'session',
            content: { id: 'existing-envelope', time: 1, role: 'agent', ev: { t: 'text', text: 'old' } },
        };
        const newMessage = { role: 'user', content: { type: 'text', text: 'new' } };
        mockAxiosGet.mockResolvedValueOnce({
            data: {
                messages: [
                    { id: 'msg-1', seq: 1, localId: 'old-key', content: { t: 'encrypted', c: encryptContent(session, oldMessage) } },
                    { id: 'msg-2', seq: 2, localId: 'new-key', content: { t: 'encrypted', c: encryptContent(session, newMessage) } },
                ],
                hasMore: false,
            },
        });

        await (client as any).fetchMessages();

        expect(onUserMessage).toHaveBeenCalledTimes(1);
        expect(onUserMessage).toHaveBeenCalledWith({ ...newMessage, localKey: 'new-key' });
        expect(client.hasSessionProtocolEnvelope('existing-envelope')).toBe(true);
        expect(client.getSessionProtocolCoveredThrough()).toBe(1);
    });

    it('fails relay history inventory on endpoint rejection', async () => {
        const client = new ApiSessionClient('fake-token', session);
        mockAxiosGet.mockRejectedValueOnce(new Error('inventory unavailable'));

        await expect(client.syncExistingSessionProtocolEnvelopeIds(50)).rejects.toThrow('inventory unavailable');
    });

    it('bounds relay history inventory when the endpoint never settles', async () => {
        const client = new ApiSessionClient('fake-token', session);
        mockAxiosGet.mockImplementationOnce(() => new Promise(() => undefined));

        await expect(client.syncExistingSessionProtocolEnvelopeIds(5)).rejects.toThrow('Relay history inventory timed out');
    });

    it('keeps initial replay at seq0 even when an outbox POST advances the known server seq first', async () => {
        const client = new ApiSessionClient('fake-token', session);
        (client as any).lastSeq = 10;
        (client as any).receiveSeq = 0;
        mockAxiosGet.mockResolvedValueOnce({ data: { messages: [], hasMore: false } });

        await (client as any).fetchMessages();

        expect(mockAxiosGet.mock.calls[0][1].params.after_seq).toBe(0);
        expect((client as any).lastSeq).toBe(10);
        expect((client as any).receiveSeq).toBe(0);
    });

    it('fetchMessages uses incremental cursor and paginates while hasMore is true', async () => {
        const client = new ApiSessionClient('fake-token', session);
        const onUserMessage = vi.fn();
        client.onUserMessage(onUserMessage);

        (client as any).lastSeq = 2;
        (client as any).receiveSeq = 2;

        const message3 = {
            role: 'user',
            content: { type: 'text', text: 'm3' }
        };
        const message4 = {
            role: 'user',
            content: { type: 'text', text: 'm4' }
        };

        mockAxiosGet
            .mockResolvedValueOnce({
                data: {
                    messages: [
                        {
                            id: 'msg-3',
                            seq: 3,
                            content: { t: 'encrypted', c: encryptContent(session, message3) },
                            localId: null,
                            createdAt: 3000,
                            updatedAt: 3000
                        }
                    ],
                    hasMore: true
                }
            })
            .mockResolvedValueOnce({
                data: {
                    messages: [
                        {
                            id: 'msg-4',
                            seq: 4,
                            content: { t: 'encrypted', c: encryptContent(session, message4) },
                            localId: null,
                            createdAt: 4000,
                            updatedAt: 4000
                        }
                    ],
                    hasMore: false
                }
            });

        await (client as any).fetchMessages();

        expect(mockAxiosGet).toHaveBeenCalledTimes(2);
        expect(mockAxiosGet.mock.calls[0][1].params.after_seq).toBe(2);
        expect(mockAxiosGet.mock.calls[1][1].params.after_seq).toBe(3);
        expect(onUserMessage).toHaveBeenCalledTimes(2);
        expect((client as any).lastSeq).toBe(4);
    });

    it('fetchMessages stops pagination when hasMore is true but seq cursor does not advance', async () => {
        const client = new ApiSessionClient('fake-token', session);
        (client as any).lastSeq = 2;
        (client as any).receiveSeq = 2;

        mockAxiosGet
            .mockResolvedValueOnce({
                data: {
                    messages: [],
                    hasMore: true
                }
            })
            .mockRejectedValueOnce(new Error('should not request another page when cursor is stalled'));

        await expect((client as any).fetchMessages()).resolves.toBeUndefined();

        expect(mockAxiosGet).toHaveBeenCalledTimes(1);
        expect(mockAxiosGet.mock.calls[0][1].params.after_seq).toBe(2);
        expect((client as any).lastSeq).toBe(2);
    });

    it('routes non-user fetched messages through EventEmitter message event', async () => {
        const client = new ApiSessionClient('fake-token', session);
        const onUserMessage = vi.fn();
        const onMessage = vi.fn();
        client.onUserMessage(onUserMessage);
        client.on('message', onMessage);

        const userMessage = {
            role: 'user',
            content: { type: 'text', text: 'user text' }
        };
        const agentMessage = {
            role: 'agent',
            content: {
                type: 'output',
                data: { answer: 'agent response' }
            }
        };

        mockAxiosGet.mockResolvedValueOnce({
            data: {
                messages: [
                    {
                        id: 'msg-1',
                        seq: 1,
                        content: { t: 'encrypted', c: encryptContent(session, userMessage) },
                        localId: null,
                        createdAt: 1000,
                        updatedAt: 1000
                    },
                    {
                        id: 'msg-2',
                        seq: 2,
                        content: { t: 'encrypted', c: encryptContent(session, agentMessage) },
                        localId: null,
                        createdAt: 2000,
                        updatedAt: 2000
                    }
                ],
                hasMore: false
            }
        });

        await (client as any).fetchMessages();

        expect(onUserMessage).toHaveBeenCalledTimes(1);
        expect(onUserMessage).toHaveBeenCalledWith({ ...userMessage, localKey: 'msg-1' });
        expect(onMessage).toHaveBeenCalledTimes(1);
        expect(onMessage).toHaveBeenCalledWith(agentMessage);
    });

    it('routes file events without logging sensitive names or refs', async () => {
        const client = new ApiSessionClient('fake-token', session);
        const onFileEvent = vi.fn();
        const sensitiveName = 'https://upload.example.test/image.png?token=secret';
        const sensitiveRef = 'sessions/test-session-id/attachments/secret-ref.enc?signature=secret';
        client.onFileEvent(onFileEvent);

        const fileMessage = {
            role: 'session',
            content: {
                type: 'session',
                data: {
                    id: 'file-event-1',
                    time: 1000,
                    role: 'user',
                    ev: {
                        t: 'file',
                        ref: sensitiveRef,
                        name: sensitiveName,
                        size: 42,
                        mimeType: 'image/png',
                    }
                }
            }
        };

        mockAxiosGet.mockResolvedValueOnce({
            data: {
                messages: [
                    {
                        id: 'msg-1',
                        seq: 1,
                        content: { t: 'encrypted', c: encryptContent(session, fileMessage) },
                        localId: null,
                        createdAt: 1000,
                        updatedAt: 1000
                    }
                ],
                hasMore: false
            }
        });

        await (client as any).fetchMessages();

        expect(onFileEvent).toHaveBeenCalledWith(fileMessage);
        const debugOutput = JSON.stringify(vi.mocked(logger.debug).mock.calls);
        expect(debugOutput).not.toContain(sensitiveName);
        expect(debugOutput).not.toContain(sensitiveRef);
        expect(debugOutput).not.toContain('signature=secret');
    });

    it('applies file event socket updates directly without logging sensitive names or refs', () => {
        const client = new ApiSessionClient('fake-token', session);
        const onFileEvent = vi.fn();
        const sensitiveName = 'https://upload.example.test/image.png?token=socket-secret';
        const sensitiveRef = 'sessions/test-session-id/attachments/socket-secret-ref.enc?signature=socket-secret';
        client.onFileEvent(onFileEvent);

        (client as any).lastSeq = 1;
        (client as any).receiveSeq = 1;
        const fileMessage = {
            role: 'session',
            content: {
                type: 'session',
                data: {
                    id: 'file-event-2',
                    time: 1000,
                    role: 'user',
                    ev: {
                        t: 'file',
                        ref: sensitiveRef,
                        name: sensitiveName,
                        size: 64,
                        mimeType: 'image/png',
                    }
                }
            }
        };

        emitSocketEvent('update', createNewMessageUpdate(2, encryptContent(session, fileMessage)));

        expect(onFileEvent).toHaveBeenCalledWith(fileMessage);
        expect((client as any).lastSeq).toBe(2);
        const debugOutput = JSON.stringify([
            ...vi.mocked(logger.debug).mock.calls,
            ...vi.mocked(logger.debugLargeJson).mock.calls,
        ]);
        expect(debugOutput).not.toContain(sensitiveName);
        expect(debugOutput).not.toContain(sensitiveRef);
        expect(debugOutput).not.toContain('socket-secret');
    });

    it('applies consecutive new-message updates directly (fast path)', () => {
        const client = new ApiSessionClient('fake-token', session);
        const onUserMessage = vi.fn();
        client.onUserMessage(onUserMessage);

        (client as any).lastSeq = 1;
        (client as any).receiveSeq = 1;
        const userMessage = {
            role: 'user',
            content: { type: 'text', text: 'fast-path' }
        };

        emitSocketEvent('update', createNewMessageUpdate(2, encryptContent(session, userMessage)));

        expect(onUserMessage).toHaveBeenCalledTimes(1);
        expect(onUserMessage).toHaveBeenCalledWith({ ...userMessage, localKey: 'msg-2' });
        expect((client as any).lastSeq).toBe(2);
        expect(mockAxiosGet).not.toHaveBeenCalled();
    });

    it('invalidates receive sync and fetches on seq gap', async () => {
        const client = new ApiSessionClient('fake-token', session);
        (client as any).lastSeq = 1;
        (client as any).receiveSeq = 1;

        mockAxiosGet.mockResolvedValueOnce({
            data: {
                messages: [],
                hasMore: false
            }
        });

        emitSocketEvent('update', createNewMessageUpdate(3, encryptContent(session, {
            role: 'user',
            content: { type: 'text', text: 'gap' }
        })));

        await waitForCheck(() => {
            expect(mockAxiosGet).toHaveBeenCalledTimes(1);
        });
        expect(mockAxiosGet.mock.calls[0][1].params.after_seq).toBe(1);
    });

    it('applies first live new-message update directly when lastSeq is 0', async () => {
        const client = new ApiSessionClient('fake-token', session);
        const onUserMessage = vi.fn();
        client.onUserMessage(onUserMessage);
        mockAxiosGet.mockResolvedValueOnce({
            data: {
                messages: [],
                hasMore: false
            }
        });

        const firstMessage = {
            role: 'user',
            content: { type: 'text', text: 'first' }
        };

        try {
            emitSocketEvent('update', createNewMessageUpdate(1, encryptContent(session, firstMessage)));

            expect(onUserMessage).toHaveBeenCalledTimes(1);
            expect(onUserMessage).toHaveBeenCalledWith({ ...firstMessage, localKey: 'msg-1' });
            expect((client as any).lastSeq).toBe(1);
            expect(mockAxiosGet).not.toHaveBeenCalled();
        } finally {
            await client.close();
        }
    });

    it('invalidates receive sync for duplicate and stale seq values', async () => {
        const client = new ApiSessionClient('fake-token', session);
        (client as any).lastSeq = 5;
        (client as any).receiveSeq = 5;

        mockAxiosGet.mockResolvedValue({
            data: {
                messages: [],
                hasMore: false
            }
        });

        emitSocketEvent('update', createNewMessageUpdate(5, encryptContent(session, {
            role: 'user',
            content: { type: 'text', text: 'duplicate' }
        })));
        emitSocketEvent('update', createNewMessageUpdate(4, encryptContent(session, {
            role: 'user',
            content: { type: 'text', text: 'stale' }
        })));

        await waitForCheck(() => {
            expect(mockAxiosGet).toHaveBeenCalledTimes(2);
        });
        expect(mockAxiosGet.mock.calls[0][1].params.after_seq).toBe(5);
        expect(mockAxiosGet.mock.calls[1][1].params.after_seq).toBe(5);
    });

    it('updates lastSeq after successful outbox flush and never moves it backward', async () => {
        const client = new ApiSessionClient('fake-token', session);
        (client as any).lastSeq = 10;

        mockAxiosPost.mockResolvedValueOnce({
            data: {
                messages: [{ id: 'msg-9', seq: 9, localId: 'l9', createdAt: 9, updatedAt: 9 }]
            }
        });

        client.sendSessionEvent({ type: 'ready' }, 'older');
        await waitForCheck(() => {
            expect(mockAxiosPost).toHaveBeenCalledTimes(1);
        });
        expect((client as any).lastSeq).toBe(10);

        mockAxiosPost.mockResolvedValueOnce({
            data: {
                messages: [{ id: 'msg-11', seq: 11, localId: 'l11', createdAt: 11, updatedAt: 11 }]
            }
        });

        client.sendSessionEvent({ type: 'ready' }, 'newer');
        await waitForCheck(() => {
            expect(mockAxiosPost).toHaveBeenCalledTimes(2);
        });
        expect((client as any).lastSeq).toBe(11);
    });

    it('flushOutbox tolerates missing response.data.messages and keeps lastSeq unchanged', async () => {
        const client = new ApiSessionClient('fake-token', session);
        (client as any).lastSeq = 7;

        mockAxiosPost.mockResolvedValueOnce({
            data: {}
        });

        client.sendSessionEvent({ type: 'ready' }, 'no-messages-field');
        await waitForCheck(() => {
            expect(mockAxiosPost).toHaveBeenCalledTimes(1);
        });

        expect((client as any).lastSeq).toBe(7);
        expect((client as any).pendingOutbox).toHaveLength(0);
    });

    it('triggers receive catch-up fetch on socket reconnect', async () => {
        new ApiSessionClient('fake-token', session);

        mockAxiosGet.mockResolvedValueOnce({
            data: {
                messages: [],
                hasMore: false
            }
        });

        emitSocketEvent('connect');

        await waitForCheck(() => {
            expect(mockAxiosGet).toHaveBeenCalledTimes(1);
        });
        expect(mockAxiosGet.mock.calls[0][1].params.after_seq).toBe(0);
    });

    it('keeps session-protocol local ids stable across client reconstruction', () => {
        const first = new ApiSessionClient('fake-token', session);
        const second = new ApiSessionClient('fake-token', session);
        const envelope = { id: 'stable-entry', role: 'agent', time: 1, turn: 'turn-1', ev: { t: 'text', text: 'hello' } } as const;

        (first as any).enqueueSessionProtocolEnvelope(envelope, false);
        (second as any).enqueueSessionProtocolEnvelope(envelope, false);

        const firstLocalId = (first as any).pendingOutbox[0].localId;
        const secondLocalId = (second as any).pendingOutbox[0].localId;
        expect(firstLocalId).toBe('session:stable-entry');
        expect(secondLocalId).toBe(firstLocalId);
    });

    it('never reconnects after close triggers a disconnect event', async () => {
        vi.useFakeTimers();
        try {
            const client = new ApiSessionClient('fake-token', session);
            mockSocket.connect.mockClear();
            await client.close();

            emitSocketEvent('disconnect', 'io client disconnect');
            emitSocketEvent('connect_error', new Error('after close'));
            await vi.advanceTimersByTimeAsync(10_000);

            expect(mockSocket.connect).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('stops send and receive sync loops on close', async () => {
        const client = new ApiSessionClient('fake-token', session);
        await client.close();

        mockAxiosGet.mockResolvedValue({
            data: {
                messages: [],
                hasMore: false
            }
        });
        mockAxiosPost.mockResolvedValue({
            data: {
                messages: []
            }
        });

        emitSocketEvent('update', createNewMessageUpdate(1, encryptContent(session, {
            role: 'user',
            content: { type: 'text', text: 'after-close' }
        })));
        client.sendSessionEvent({ type: 'ready' }, 'after-close-send');

        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(mockSocket.close).toHaveBeenCalledTimes(1);
        expect(mockAxiosGet).not.toHaveBeenCalled();
        expect(mockAxiosPost).not.toHaveBeenCalled();
    });
});
