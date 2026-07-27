import { afterEach, beforeEach, describe, expect, it, mock, spyOn, jest } from 'bun:test';
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
} = {
    mockIo: mock(),
    mockAxiosGet: mock(),
    mockAxiosPost: mock(),
    mockAxiosPut: mock(),
    mockBackoff: mock(async <T>(callback: () => Promise<T>) => {
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
    mockDelay: mock(async () => undefined),
    mockShouldReconnect: mock(() => true)
};

mock.module('socket.io-client', () => ({
    io: mockIo
}));

mock.module('axios', () => ({
    default: {
        get: mockAxiosGet,
        post: mockAxiosPost,
        put: mockAxiosPut
    }
}));

mock.module('@/configuration', () => ({
    configuration: {
        serverUrl: 'https://server.test'
    }
}));

mock.module('@/ui/logger', () => ({
    logger: {
        debug: mock(),
        debugLargeJson: mock()
    }
}));

mock.module('@/api/rpc/RpcHandlerManager', () => ({
    RpcHandlerManager: class {
        onSocketConnect = mock();
        onSocketDisconnect = mock();
        handleRequest = mock(async () => '');
    }
}));

mock.module('@/modules/common/registerCommonHandlers', () => ({
    registerCommonHandlers: mock()
}));

mock.module('@/utils/time', () => ({
    backoff: mockBackoff,
    delay: mockDelay
}));

mock.module('@/utils/lidState', () => ({
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

const loggerDebugMock = logger.debug as unknown as ReturnType<typeof mock>;
const loggerDebugLargeJsonMock = logger.debugLargeJson as unknown as ReturnType<typeof mock>;

describe('ApiSessionClient v3 messages API migration', () => {
    let socketHandlers: SocketHandlers;
    let mockSocket: any;
    let session: ReturnType<typeof makeSession>;

    const emitSocketEvent = (event: string, ...args: any[]) => {
        const handlers = socketHandlers[event] || [];
        handlers.forEach((handler) => handler(...args));
    };

    beforeEach(() => {
        mock.clearAllMocks();
        mockAxiosGet.mockReset();
        mockAxiosPost.mockReset();
        mockAxiosPut.mockReset();
        mockAxiosPost.mockImplementation(async (_url: string, payload: { messages?: Array<{ localId: string }> }) => ({
            data: {
                messages: (payload.messages ?? []).map((message, index) => ({
                    id: `default-message-${index + 1}`,
                    seq: index + 1,
                    localId: message.localId,
                    createdAt: index + 1,
                    updatedAt: index + 1,
                })),
            },
        }));
        mockShouldReconnect.mockReturnValue(true);
        socketHandlers = {};
        session = makeSession();
        mockSocket = {
            connected: true,
            connect: mock(),
            on: mock((event: string, handler: SocketHandler) => {
                if (!socketHandlers[event]) {
                    socketHandlers[event] = [];
                }
                socketHandlers[event].push(handler);
            }),
            off: mock(),
            emit: mock(),
            emitWithAck: mock(async () => ({ result: 'error' })),
            timeout: mock(() => mockSocket),
            volatile: {
                emit: mock()
            },
            close: mock()
        };

        mockIo.mockReturnValue(mockSocket);
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('registers core socket handlers and connects', () => {
        new ApiSessionClient('fake-token', session);

        expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
        expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
        expect(mockSocket.on).toHaveBeenCalledWith('update', expect.any(Function));
        expect(mockSocket.connect).toHaveBeenCalledTimes(1);
    });

    it('bounds every metadata commit and releases the metadata lock for history retry', async () => {
        const client = new ApiSessionClient('fake-token', session);
        mockSocket.emitWithAck.mockResolvedValue({ result: 'error' });

        await expect(client.updateMetadataAndAwait(
            (metadata) => ({ ...metadata, name: 'first attempt' }),
        )).rejects.toThrow('Metadata update did not complete within 10000ms');

        const recoveredMetadata = { ...session.metadata, name: 'recovered' };
        mockSocket.emitWithAck.mockResolvedValue({
            result: 'success',
            metadata: encryptContent(session, recoveredMetadata),
            version: 1,
        });
        await client.updateMetadataAndAwait(
            (metadata) => ({ ...metadata, name: 'recovered' }),
            { timeoutMs: 100 },
        );

        expect(mockSocket.timeout).toHaveBeenCalled();
        expect(client.getMetadata()?.name).toBe('recovered');
    });

    it('releases a queued history commit after a prior metadata ACK is lost', async () => {
        const client = new ApiSessionClient('fake-token', session);
        let rejectLostAck: ((error: Error) => void) | undefined;
        mockSocket.emitWithAck.mockImplementationOnce(() => new Promise((_resolve, reject) => {
            rejectLostAck = reject;
        }));

        const lostAckUpdate = client.updateMetadataAndAwait(
            (metadata) => ({ ...metadata, name: 'lost ack' }),
            { timeoutMs: 100 },
        );
        for (let attempt = 0; attempt < 10 && !rejectLostAck; attempt++) {
            await Promise.resolve();
        }

        const recoveredMetadata = { ...session.metadata, name: 'history recovered' };
        mockSocket.emitWithAck.mockResolvedValueOnce({
            result: 'success',
            metadata: encryptContent(session, recoveredMetadata),
            version: 1,
        });
        const historyUpdate = client.updateMetadataAndAwait(
            (metadata) => ({ ...metadata, name: 'history recovered' }),
            { timeoutMs: 100 },
        );

        rejectLostAck?.(new Error('operation has timed out'));

        await expect(lostAckUpdate).rejects.toThrow('Metadata update did not complete within 100ms');
        await expect(historyUpdate).resolves.toBeUndefined();
        expect(client.getMetadata()?.name).toBe('history recovered');
    });

    it('retries after initial socket connection error', async () => {
        jest.useFakeTimers();
        mockSocket.connected = false;

        const client = new ApiSessionClient('fake-token', session);

        expect(mockSocket.connect).toHaveBeenCalledTimes(1);

        emitSocketEvent('connect_error', new Error('ECONNREFUSED'));

        await jest.advanceTimersByTime(1000);
        expect(mockSocket.connect).toHaveBeenCalledTimes(2);

        await jest.advanceTimersByTime(3000);
        expect(mockSocket.connect).toHaveBeenCalledTimes(3);

        await client.close();
    });

    it('flushes long outbox batches in enqueue order', async () => {
        const client = new ApiSessionClient('fake-token', session);
        (client as any).pendingOutbox = Array.from({ length: 120 }, (_value, index) => ({
            content: `encrypted-${index + 1}`,
            localId: `local-${index + 1}`,
            logicalDigest: `digest-${index + 1}`,
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
        const onUserMessage = mock();
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
        const onUserMessage = mock();
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
        // Legacy/non-deterministic localIds contribute time coverage but must
        // not prove the canonical `session:<envelope.id>` identity.
        expect(client.hasSessionProtocolEnvelope('existing-envelope')).toBe(false);
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
        const onUserMessage = mock();
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
        const onUserMessage = mock();
        const onMessage = mock();
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

    it('preserves pre-binding file/text order for attachment ownership', () => {
        const client = new ApiSessionClient('fake-token', session);
        const order: string[] = [];
        const fileMessage = (id: string) => ({
            role: 'session',
            content: {
                type: 'session',
                data: {
                    id: `file-${id}`,
                    time: 1000,
                    role: 'user',
                    ev: { t: 'file', ref: `ref-${id}`, name: `${id}.png`, size: 3, mimeType: 'image/png' },
                },
            },
        });
        const userMessage = (text: string) => ({ role: 'user', content: { type: 'text', text } });

        (client as any).routeIncomingMessage(fileMessage('a'), 'file-a');
        (client as any).routeIncomingMessage(userMessage('text-a'), 'text-a');
        (client as any).routeIncomingMessage(fileMessage('b'), 'file-b');
        (client as any).routeIncomingMessage(userMessage('text-b'), 'text-b');

        client.onFileEvent((message) => order.push(message.content.data.ev.ref));
        client.onUserMessage((message) => order.push(message.content.text));

        expect(order).toEqual(['ref-a', 'text-a', 'ref-b', 'text-b']);
    });

    it('routes file events without logging sensitive names or refs', async () => {
        const client = new ApiSessionClient('fake-token', session);
        const onFileEvent = mock();
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
        const debugOutput = JSON.stringify(loggerDebugMock.mock.calls);
        expect(debugOutput).not.toContain(sensitiveName);
        expect(debugOutput).not.toContain(sensitiveRef);
        expect(debugOutput).not.toContain('signature=secret');
    });

    it('applies file event socket updates directly without logging sensitive names or refs', () => {
        const client = new ApiSessionClient('fake-token', session);
        const onFileEvent = mock();
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
            ...loggerDebugMock.mock.calls,
            ...loggerDebugLargeJsonMock.mock.calls,
        ]);
        expect(debugOutput).not.toContain(sensitiveName);
        expect(debugOutput).not.toContain(sensitiveRef);
        expect(debugOutput).not.toContain('socket-secret');
    });

    it('applies consecutive new-message updates directly (fast path)', () => {
        const client = new ApiSessionClient('fake-token', session);
        const onUserMessage = mock();
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
        const onUserMessage = mock();
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

        mockAxiosPost.mockImplementationOnce(async (_url: string, payload: { messages: Array<{ localId: string }> }) => ({
            data: {
                messages: [{ id: 'msg-9', seq: 9, localId: payload.messages[0].localId, createdAt: 9, updatedAt: 9 }]
            }
        }));

        client.sendSessionEvent({ type: 'ready' }, 'older');
        await waitForCheck(() => {
            expect(mockAxiosPost).toHaveBeenCalledTimes(1);
        });
        expect((client as any).lastSeq).toBe(10);

        mockAxiosPost.mockImplementationOnce(async (_url: string, payload: { messages: Array<{ localId: string }> }) => ({
            data: {
                messages: [{ id: 'msg-11', seq: 11, localId: payload.messages[0].localId, createdAt: 11, updatedAt: 11 }]
            }
        }));

        client.sendSessionEvent({ type: 'ready' }, 'newer');
        await waitForCheck(() => {
            expect(mockAxiosPost).toHaveBeenCalledTimes(2);
        });
        expect((client as any).lastSeq).toBe(11);
    });

    it('keeps unconfirmed outbox messages when the relay response omits acknowledgements', async () => {
        const client = new ApiSessionClient('fake-token', session);
        (client as any).lastSeq = 7;

        mockAxiosPost.mockResolvedValueOnce({
            data: {}
        });

        (client as any).enqueueMessage({
            role: 'agent',
            content: { id: 'no-messages-field', type: 'event', data: { type: 'ready' } },
        }, false, 'no-messages-field');

        await expect((client as any).flushOutbox()).rejects.toThrow('did not acknowledge');

        expect((client as any).lastSeq).toBe(7);
        expect((client as any).pendingOutbox).toHaveLength(1);
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

    it('reuses one encrypted outbox item when the same logical envelope is queued twice', () => {
        const client = new ApiSessionClient('fake-token', session);
        const envelope = { id: 'stable-entry', role: 'agent', time: 1, turn: 'turn-1', ev: { t: 'text', text: 'hello' } } as const;

        (client as any).enqueueSessionProtocolEnvelope(envelope, false);
        const firstCiphertext = (client as any).pendingOutbox[0].content;
        (client as any).enqueueSessionProtocolEnvelope(envelope, false);

        expect((client as any).pendingOutbox).toHaveLength(1);
        expect((client as any).pendingOutbox[0].content).toBe(firstCiphertext);
    });

    it('reuses ciphertext after a response-loss retry in the same process', async () => {
        const client = new ApiSessionClient('fake-token', session);
        (client as any).enqueueSessionProtocolEnvelope({
            id: 'response-loss-entry',
            role: 'user',
            time: 1,
            ev: { t: 'text', text: 'retry me' },
        }, false);
        mockAxiosPost.mockRejectedValueOnce(new Error('response lost after persistence'));

        await expect((client as any).flushOutbox()).rejects.toThrow('response lost');
        const firstCiphertext = mockAxiosPost.mock.calls[0][1].messages[0].content;
        mockAxiosPost.mockImplementationOnce(async (_url: string, payload: { messages: Array<{ localId: string }> }) => ({
            data: {
                messages: payload.messages.map((message) => ({
                    id: 'relay-message-1',
                    seq: 1,
                    localId: message.localId,
                    createdAt: 1,
                    updatedAt: 1,
                })),
            },
        }));

        await (client as any).flushOutbox();

        expect(mockAxiosPost.mock.calls[1][1].messages[0].content).toBe(firstCiphertext);
        expect((client as any).pendingOutbox).toHaveLength(0);
    });

    it('reconciles a persisted 50-message prefix after restart and sends the remaining suffix', async () => {
        const persistedClient = new ApiSessionClient('fake-token', session);
        const restartedClient = new ApiSessionClient('fake-token', session);
        const envelopes = Array.from({ length: 51 }, (_value, index) => ({
            id: `restart-entry-${index + 1}`,
            role: 'user' as const,
            time: index + 1,
            ev: { t: 'text' as const, text: `message ${index + 1}` },
        }));
        for (const envelope of envelopes) {
            (persistedClient as any).enqueueSessionProtocolEnvelope(envelope, false);
            (restartedClient as any).enqueueSessionProtocolEnvelope(envelope, false);
        }
        const persistedPrefix = (persistedClient as any).pendingOutbox.slice(0, 50);
        expect((restartedClient as any).pendingOutbox[0].content).not.toBe(persistedPrefix[0].content);

        mockAxiosPost
            .mockRejectedValueOnce({
                response: {
                    status: 409,
                    data: {
                        code: 'LOCAL_ID_CONTENT_CONFLICT',
                        localId: 'session:restart-entry-1',
                    },
                },
            })
            .mockImplementationOnce(async (_url: string, payload: { messages: Array<{ localId: string }> }) => ({
                data: {
                    messages: payload.messages.map((message) => ({
                        id: 'relay-message-51',
                        seq: 51,
                        localId: message.localId,
                        createdAt: 51,
                        updatedAt: 51,
                    })),
                },
            }));
        mockAxiosGet.mockResolvedValueOnce({
            data: {
                messages: persistedPrefix.map((message: { content: string; localId: string }, index: number) => ({
                    id: `relay-message-${index + 1}`,
                    seq: index + 1,
                    localId: message.localId,
                    content: { t: 'encrypted', c: message.content },
                    createdAt: index + 1,
                    updatedAt: index + 1,
                })),
                hasMore: false,
            },
        });

        await (restartedClient as any).flushOutbox();

        expect(mockAxiosPost).toHaveBeenCalledTimes(2);
        expect(mockAxiosPost.mock.calls[1][1].messages.map((message: { localId: string }) => message.localId)).toEqual([
            'session:restart-entry-51',
        ]);
        expect((restartedClient as any).pendingOutbox).toHaveLength(0);
        await expect(restartedClient.flushConfirmed(100)).resolves.toBeUndefined();
    });

    it('reconciles randomized ciphertext after the relay persisted the same logical envelope', async () => {
        const client = new ApiSessionClient('fake-token', session);
        const envelope = { id: 'persisted-entry', role: 'agent', time: 1, turn: 'turn-1', ev: { t: 'text', text: 'hello' } } as const;
        const persistedContent = {
            role: 'session',
            content: envelope,
            meta: { sentFrom: 'cli' },
        };
        (client as any).enqueueSessionProtocolEnvelope(envelope, false);

        mockAxiosPost.mockRejectedValueOnce({
            response: {
                status: 409,
                data: {
                    code: 'LOCAL_ID_CONTENT_CONFLICT',
                    localId: 'session:persisted-entry',
                },
            },
        });
        mockAxiosGet.mockResolvedValueOnce({
            data: {
                messages: [{
                    id: 'relay-message-1',
                    seq: 1,
                    localId: 'session:persisted-entry',
                    content: { t: 'encrypted', c: encryptContent(session, persistedContent) },
                    createdAt: 1,
                    updatedAt: 1,
                }],
                hasMore: false,
            },
        });

        await (client as any).flushOutbox();

        expect((client as any).pendingOutbox).toHaveLength(0);
        await expect(client.flushConfirmed(100)).resolves.toBeUndefined();
    });

    it('quarantines a true localId conflict and still sends later messages', async () => {
        const client = new ApiSessionClient('fake-token', session);
        const conflicting = { id: 'conflict-entry', role: 'agent', time: 1, turn: 'turn-1', ev: { t: 'text', text: 'new text' } } as const;
        const later = { id: 'later-entry', role: 'agent', time: 2, turn: 'turn-2', ev: { t: 'text', text: 'later text' } } as const;
        (client as any).enqueueSessionProtocolEnvelope(conflicting, false);
        (client as any).enqueueSessionProtocolEnvelope(later, false);

        mockAxiosPost
            .mockRejectedValueOnce({
                response: {
                    status: 409,
                    data: {
                        code: 'LOCAL_ID_CONTENT_CONFLICT',
                        localId: 'session:conflict-entry',
                    },
                },
            })
            .mockImplementationOnce(async (_url: string, payload: { messages: Array<{ localId: string }> }) => ({
                data: {
                    messages: payload.messages.map((message, index) => ({
                        id: `relay-message-${index + 2}`,
                        seq: index + 2,
                        localId: message.localId,
                        createdAt: index + 2,
                        updatedAt: index + 2,
                    })),
                },
            }));
        mockAxiosGet.mockResolvedValueOnce({
            data: {
                messages: [{
                    id: 'relay-message-1',
                    seq: 1,
                    localId: 'session:conflict-entry',
                    content: { t: 'encrypted', c: encryptContent(session, {
                        role: 'session',
                        content: { ...conflicting, ev: { t: 'text', text: 'different persisted text' } },
                        meta: { sentFrom: 'cli' },
                    }) },
                    createdAt: 1,
                    updatedAt: 1,
                }],
                hasMore: false,
            },
        });

        await (client as any).flushOutbox();

        expect(mockAxiosPost).toHaveBeenCalledTimes(2);
        expect(mockAxiosPost.mock.calls[1][1].messages.map((message: { localId: string }) => message.localId)).toEqual([
            'session:later-entry',
        ]);
        expect((client as any).pendingOutbox).toHaveLength(0);
        await expect(client.flushConfirmed(100)).rejects.toThrow('session:conflict-entry');
    });

    it('distinguishes matching and divergent canonical envelopes during restart inventory', async () => {
        const client = new ApiSessionClient('fake-token', session);
        const persisted = { id: 'inventory-entry', role: 'agent', time: 1, turn: 'turn-1', ev: { t: 'text', text: 'persisted text' } } as const;
        mockAxiosGet.mockResolvedValueOnce({
            data: {
                messages: [{
                    id: 'relay-message-1',
                    seq: 1,
                    localId: 'session:inventory-entry',
                    content: { t: 'encrypted', c: encryptContent(session, {
                        role: 'session',
                        content: persisted,
                        meta: { sentFrom: 'cli' },
                    }) },
                    createdAt: 1,
                    updatedAt: 1,
                }],
                hasMore: false,
            },
        });

        await client.syncExistingSessionProtocolEnvelopeIds();

        expect(client.getSessionProtocolEnvelopeStatus(persisted)).toBe('matching');
        expect(client.getSessionProtocolEnvelopeStatus({
            ...persisted,
            ev: { t: 'text', text: 'different text' },
        })).toBe('conflict');
        expect(client.getSessionProtocolEnvelopeStatus({
            ...persisted,
            id: 'missing-entry',
        })).toBe('missing');
    });

    it('binds canonical envelope status to its deterministic Relay localId', async () => {
        const client = new ApiSessionClient('fake-token', session);
        const canonical = { id: 'bound-entry', role: 'agent', time: 1, turn: 'turn-1', ev: { t: 'text', text: 'canonical text' } } as const;
        mockAxiosGet.mockResolvedValueOnce({
            data: {
                messages: [
                    {
                        id: 'relay-message-1',
                        seq: 1,
                        localId: 'session:bound-entry',
                        content: { t: 'encrypted', c: encryptContent(session, {
                            role: 'session',
                            content: { ...canonical, ev: { t: 'text', text: 'divergent text' } },
                        }) },
                    },
                    {
                        id: 'relay-message-2',
                        seq: 2,
                        localId: 'unrelated-local-id',
                        content: { t: 'encrypted', c: encryptContent(session, {
                            role: 'session',
                            content: canonical,
                        }) },
                    },
                ],
                hasMore: false,
            },
        });

        await client.syncExistingSessionProtocolEnvelopeIds();

        expect(client.getSessionProtocolEnvelopeStatus(canonical)).toBe('conflict');
        expect(client.hasSessionProtocolEnvelope('bound-entry')).toBe(true);
    });

    it('never reconnects after close triggers a disconnect event', async () => {
        jest.useFakeTimers();
        try {
            const client = new ApiSessionClient('fake-token', session);
            mockSocket.connect.mockClear();
            await client.close();

            emitSocketEvent('disconnect', 'io client disconnect');
            emitSocketEvent('connect_error', new Error('after close'));
            await jest.advanceTimersByTime(10_000);

            expect(mockSocket.connect).not.toHaveBeenCalled();
        } finally {
            jest.useRealTimers();
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
