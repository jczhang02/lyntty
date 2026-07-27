import { logger } from '@/ui/logger'
import { EventEmitter } from 'node:events'
import { io, Socket } from 'socket.io-client'
import { AgentState, ClientToServerEvents, FileEventMessage, FileEventMessageSchema, Metadata, ServerToClientEvents, Session, Update, UserMessage, UserMessageSchema } from './types'
import { decodeBase64, decryptBlob, decrypt, encodeBase64, encrypt, encryptBlob } from './encryption';
import { backoff, delay } from '@/utils/time';
import { configuration } from '@/configuration';
import { createHash, randomUUID } from 'node:crypto';
import { AsyncLock } from '@/utils/lock';
import { deriveKey } from '@/utils/deriveKey';
import { RpcHandlerManager } from './rpc/RpcHandlerManager';
import { registerCommonHandlers } from '../modules/common/registerCommonHandlers';
import { shouldReconnect } from '@/utils/lidState';
import { createEnvelope, type CreateEnvelopeOptions, type SessionEnvelope } from 'lyntty-wire';
import { createCliSocketAuth } from './wireAuth';
import { InvalidateSync } from '@/utils/sync';
import axios from 'axios';

type V3SessionMessage = {
    id: string;
    seq: number;
    content: { t: 'encrypted'; c: string };
    localId: string | null;
    createdAt: number;
    updatedAt: number;
};

type V3GetSessionMessagesResponse = {
    messages: V3SessionMessage[];
    hasMore: boolean;
};

type V3PostSessionMessagesResponse = {
    messages: Array<{
        id: string;
        seq: number;
        localId: string | null;
        createdAt: number;
        updatedAt: number;
    }>;
};

type AttachmentUploadResult = {
    ref: string;
    uploadUrl: string;
    method?: 'PUT' | 'POST';
    formFields?: Record<string, string>;
};

export type LocalImageAttachment = {
    data: Uint8Array;
    mimeType: string;
    name: string;
};

type PendingRemoteInputEvent =
    | { type: 'user'; message: UserMessage }
    | { type: 'file'; message: FileEventMessage };

type PendingOutboxMessage = {
    content: string;
    localId: string;
    logicalDigest: string;
};

export type SessionProtocolEnvelopeStatus = 'missing' | 'matching' | 'conflict';

export class SessionOutboxConflictError extends Error {
    readonly localIds: string[];

    constructor(localIds: string[]) {
        super(`Relay localId content conflict: ${localIds.join(', ')}`);
        this.name = 'SessionOutboxConflictError';
        this.localIds = localIds;
    }
}

function canonicalizeForDigest(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(canonicalizeForDigest);
    }
    if (!value || typeof value !== 'object') {
        return value;
    }
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
        const child = (value as Record<string, unknown>)[key];
        if (child !== undefined) {
            result[key] = canonicalizeForDigest(child);
        }
    }
    return result;
}

function logicalMessageValue(message: unknown): unknown {
    if (message && typeof message === 'object' && (message as { role?: unknown }).role === 'session') {
        return {
            role: 'session',
            content: (message as { content?: unknown }).content,
        };
    }
    return message;
}

function logicalMessageDigest(message: unknown): string {
    const canonical = JSON.stringify(canonicalizeForDigest(logicalMessageValue(message)));
    return createHash('sha256').update(canonical ?? 'null').digest('base64url');
}

function relayConflictLocalId(error: unknown): string | null {
    if (!error || typeof error !== 'object') return null;
    const response = (error as { response?: unknown }).response;
    if (!response || typeof response !== 'object' || (response as { status?: unknown }).status !== 409) return null;
    const data = (response as { data?: unknown }).data;
    if (!data || typeof data !== 'object') return '';
    const localId = (data as { localId?: unknown }).localId;
    return typeof localId === 'string' && localId.length > 0 ? localId : '';
}

function escapeMultipartValue(value: string): string {
    return value.replaceAll('\r', '').replaceAll('\n', '').replaceAll('"', '%22');
}

function buildMultipartUploadBody(
    fields: Record<string, string> | undefined,
    data: Uint8Array,
): { body: Buffer; boundary: string } {
    const boundary = `----lyntty-cli-${randomUUID()}`;
    const chunks: Buffer[] = [];

    for (const [key, value] of Object.entries(fields ?? {})) {
        chunks.push(Buffer.from(
            `--${boundary}\r\n`
            + `Content-Disposition: form-data; name="${escapeMultipartValue(key)}"\r\n\r\n`
            + `${value}\r\n`,
            'utf8',
        ));
    }

    chunks.push(Buffer.from(
        `--${boundary}\r\n`
        + 'Content-Disposition: form-data; name="file"; filename="blob"\r\n'
        + 'Content-Type: application/octet-stream\r\n\r\n',
        'utf8',
    ));
    chunks.push(Buffer.from(data));
    chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'));

    return {
        body: Buffer.concat(chunks),
        boundary,
    };
}

export class ApiSessionClient extends EventEmitter {
    private readonly token: string;
    readonly sessionId: string;
    private metadata: Metadata | null;
    private metadataVersion: number;
    private agentState: AgentState | null;
    private agentStateVersion: number;
    private socket: Socket<ServerToClientEvents, ClientToServerEvents>;
    private pendingRemoteInputEvents: PendingRemoteInputEvent[] = [];
    private pendingMessageCallback: ((message: UserMessage) => void) | null = null;
    private pendingFileEventCallback: ((data: FileEventMessage) => void) | null = null;
    private blobKey: Uint8Array | null = null;
    /**
     * In-flight attachment download promises that belong to the *current*
     * (not-yet-drained) batch. Each promise resolves to the decoded blob (or
     * null on failure), so per-message ownership is intrinsic — there is no
     * shared push-array between batches that a late download could leak into.
     */
    private pendingDownloads: Promise<{ data: Uint8Array; mimeType: string; name: string } | null>[] = [];
    readonly rpcHandlerManager: RpcHandlerManager;
    private agentStateLock = new AsyncLock();
    private metadataLock = new AsyncLock();
    private encryptionKey: Uint8Array;
    private encryptionVariant: 'legacy' | 'dataKey';
    private reconnectInterval: NodeJS.Timeout | null = null;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private closed = false;
    private ignoreArchiveSignal = false;
    private readonly initialServerSeq: number;
    private skipMessagesThroughSeq: number | null = null;
    private lastSeq = 0;
    // Receive cursor is independent from lastSeq because posting our own outbox
    // can advance the server sequence before the initial relay replay completes.
    private receiveSeq = 0;
    private pendingOutbox: PendingOutboxMessage[] = [];
    private readonly knownRelayMessageDigests = new Map<string, string>();
    private knownSessionProtocolCoveredThrough: number | null = null;
    private readonly pendingOutboxConflicts = new Set<string>();
    private readonly sendSync: InvalidateSync;
    private readonly receiveSync: InvalidateSync;

    constructor(token: string, session: Session) {
        super()
        this.token = token;
        this.sessionId = session.id;
        this.initialServerSeq = session.seq;
        this.metadata = session.metadata;
        this.metadataVersion = session.metadataVersion;
        this.agentState = session.agentState;
        this.agentStateVersion = session.agentStateVersion;
        this.encryptionKey = session.encryptionKey;
        this.encryptionVariant = session.encryptionVariant;
        this.sendSync = new InvalidateSync(() => this.flushOutbox());
        this.receiveSync = new InvalidateSync(() => this.fetchMessages());

        // Initialize RPC handler manager
        this.rpcHandlerManager = new RpcHandlerManager({
            scopePrefix: this.sessionId,
            encryptionKey: this.encryptionKey,
            encryptionVariant: this.encryptionVariant,
            logger: (msg, data) => logger.debug(msg, data)
        });
        registerCommonHandlers(this.rpcHandlerManager, this.metadata.path);

        //
        // Create socket
        //

        this.socket = io(configuration.serverUrl, {
            auth: createCliSocketAuth({
                token: this.token,
                clientType: 'session-scoped' as const,
                sessionId: this.sessionId,
            }, 'cli-coding-session'),
            path: '/v1/updates',
            reconnection: false,
            transports: ['websocket'],
            withCredentials: true,
            autoConnect: false
        });

        //
        // Handlers
        //

        this.socket.on('connect', () => {
            if (this.closed) {
                this.socket.close();
                return;
            }
            logger.debug('Socket connected successfully');
            if (this.reconnectInterval) {
                clearInterval(this.reconnectInterval);
                this.reconnectInterval = null;
            }
            if (this.reconnectTimeout) {
                clearTimeout(this.reconnectTimeout);
                this.reconnectTimeout = null;
            }
            this.rpcHandlerManager.onSocketConnect(this.socket);
            this.receiveSync.invalidate();
        })

        // Set up global RPC request handler
        this.socket.on('rpc-request', async (data: { method: string, params: string }, callback: (response: string) => void) => {
            callback(await this.rpcHandlerManager.handleRequest(data));
        })

        this.socket.on('disconnect', (reason) => {
            logger.debug(`[API] Socket disconnected: ${reason}`);
            this.rpcHandlerManager.onSocketDisconnect();
            if (!this.closed) this.startSmartReconnect();
        })

        this.socket.on('connect_error', (error) => {
            logger.debug('[API] Socket connection error:', error);
            this.rpcHandlerManager.onSocketDisconnect();
            if (!this.closed) this.startSmartReconnect();
        })

        // Server events
        this.socket.on('update', (data: Update) => {
            try {
                logger.debugLargeJson('[SOCKET] [UPDATE] Received update:', data);

                if (!data.body) {
                    logger.debug('[SOCKET] [UPDATE] [ERROR] No body in update!');
                    return;
                }

                if (data.body.t === 'new-message') {
                    const messageSeq = data.body.message?.seq;
                    if (typeof messageSeq !== 'number' || messageSeq !== this.lastSeq + 1 || messageSeq !== this.receiveSeq + 1 || data.body.message.content.t !== 'encrypted') {
                        this.receiveSync.invalidate();
                        return;
                    }
                    const body = decrypt(this.encryptionKey, this.encryptionVariant, decodeBase64(data.body.message.content.c));
                    logger.debug('[SOCKET] [UPDATE] Decrypted message', {
                        role: typeof (body as { role?: unknown })?.role === 'string'
                            ? (body as { role: string }).role
                            : 'unknown',
                        contentType: typeof (body as { content?: { type?: unknown } })?.content?.type === 'string'
                            ? (body as { content: { type: string } }).content.type
                            : 'unknown',
                    });
                    this.routeIncomingMessage(body, data.body.message.localId ?? data.body.message.id);
                    this.lastSeq = messageSeq;
                    this.receiveSeq = messageSeq;
                } else if (data.body.t === 'update-session') {
                    if (data.body.metadata && data.body.metadata.version > this.metadataVersion) {
                        this.metadata = decrypt(this.encryptionKey, this.encryptionVariant, decodeBase64(data.body.metadata.value));
                        this.metadataVersion = data.body.metadata.version;
                        // Check if session was archived from web/mobile
                        const meta = this.metadata as any;
                        if (meta?.lifecycleState === 'archiveRequested' || meta?.lifecycleState === 'archived') {
                            if (this.ignoreArchiveSignal) {
                                logger.debug(`[SOCKET] Session archived (${meta.lifecycleState}) but suppressed for reconnect`);
                                this.ignoreArchiveSignal = false;
                            } else {
                                logger.debug(`[SOCKET] Session archived (${meta.lifecycleState}), exiting...`);
                                this.emit('archived');
                            }
                        }
                    }
                    if (data.body.agentState && data.body.agentState.version > this.agentStateVersion) {
                        this.agentState = data.body.agentState.value ? decrypt(this.encryptionKey, this.encryptionVariant, decodeBase64(data.body.agentState.value)) : null;
                        this.agentStateVersion = data.body.agentState.version;
                    }
                } else if (data.body.t === 'update-machine') {
                    // Session clients shouldn't receive machine updates - log warning
                    logger.debug(`[SOCKET] WARNING: Session client received unexpected machine update - ignoring`);
                } else {
                    // If not a user message, it might be a permission response or other message type
                    this.emit('message', data.body);
                }
            } catch (error) {
                logger.debug('[SOCKET] [UPDATE] [ERROR] Error handling update', { error });
            }
        });

        // DEATH
        this.socket.on('error', (error) => {
            logger.debug('[API] Socket error:', error);
        });

        //
        // Connect (after short delay to give a time to add handlers)
        //

        this.socket.connect();
    }

    onUserMessage(callback: (data: UserMessage) => void) {
        this.pendingMessageCallback = callback;
        this.flushPendingRemoteInputEvents();
    }

    onFileEvent(callback: (data: FileEventMessage) => void) {
        this.pendingFileEventCallback = callback;
        this.flushPendingRemoteInputEvents();
    }

    private flushPendingRemoteInputEvents(): void {
        while (this.pendingRemoteInputEvents.length > 0) {
            const next = this.pendingRemoteInputEvents[0];
            if (next.type === 'user') {
                if (!this.pendingMessageCallback) return;
                this.pendingRemoteInputEvents.shift();
                this.pendingMessageCallback(next.message);
                continue;
            }
            if (!this.pendingFileEventCallback) return;
            this.pendingRemoteInputEvents.shift();
            this.pendingFileEventCallback(next.message);
        }
    }

    /**
     * Derive (and cache) the blob decryption key for this session.
     * Legacy sessions use deriveKey(masterSecret, 'Lyntty Blobs', ['master']).
     * DataKey sessions use deriveKey(dataKey, 'Lyntty Blobs', ['session']).
     */
    async getBlobKey(): Promise<Uint8Array> {
        if (!this.blobKey) {
            const path = this.encryptionVariant === 'dataKey' ? ['session'] : ['master'];
            this.blobKey = await deriveKey(this.encryptionKey, 'Lyntty Blobs', path);
        }
        return this.blobKey;
    }

    private async requestAttachmentUpload(filename: string, size: number): Promise<AttachmentUploadResult> {
        const response = await axios.post<AttachmentUploadResult>(
            `${configuration.serverUrl}/v1/sessions/${encodeURIComponent(this.sessionId)}/attachments/request-upload`,
            { filename, size },
            {
                headers: this.authHeaders(),
                timeout: 30000,
            },
        );

        const upload = response.data;
        if (
            !upload
            || typeof upload.ref !== 'string'
            || typeof upload.uploadUrl !== 'string'
            || (upload.method !== undefined && upload.method !== 'PUT' && upload.method !== 'POST')
        ) {
            throw new Error('request-upload returned an invalid response');
        }

        return {
            ...upload,
            method: upload.method ?? 'PUT',
        };
    }

    private async uploadEncryptedAttachmentBlob(upload: AttachmentUploadResult, encrypted: Uint8Array): Promise<void> {
        if (upload.method === 'POST') {
            const { body, boundary } = buildMultipartUploadBody(upload.formFields, encrypted);
            await axios.post(upload.uploadUrl, body, {
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                },
                timeout: 60000,
                maxBodyLength: 10 * 1024 * 1024,
            });
            return;
        }

        const headers: Record<string, string> = {
            'Content-Type': 'application/octet-stream',
        };
        if (upload.uploadUrl.startsWith(configuration.serverUrl)) {
            headers.Authorization = `Bearer ${this.token}`;
        }

        await axios.put(upload.uploadUrl, Buffer.from(encrypted), {
            headers,
            timeout: 60000,
            maxBodyLength: 10 * 1024 * 1024,
        });
    }

    async uploadLocalImageAttachmentEnvelope(
        attachment: LocalImageAttachment,
        opts: Pick<CreateEnvelopeOptions, 'id' | 'time'> = {},
    ): Promise<SessionEnvelope> {
        const blobKey = await this.getBlobKey();
        const encrypted = encryptBlob(attachment.data, blobKey);
        const upload = await this.requestAttachmentUpload(attachment.name, encrypted.length);
        await this.uploadEncryptedAttachmentBlob(upload, encrypted);

        return createEnvelope('user', {
            t: 'file',
            ref: upload.ref,
            name: attachment.name,
            size: attachment.data.length,
            mimeType: attachment.mimeType,
        }, opts);
    }

    /**
     * Download an encrypted attachment blob via the request-download flow:
     * POST /request-download → { downloadUrl } → GET downloadUrl. Local mode
     * downloadUrl points back at our server (Bearer required); S3 mode is a
     * presigned URL that does not accept extra headers.
     */
    async downloadAttachment(ref: string): Promise<Uint8Array> {
        const requestUrl = `${configuration.serverUrl}/v1/sessions/${this.sessionId}/attachments/request-download`;
        const requestRes = await axios.post(
            requestUrl,
            { ref },
            {
                headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json' },
                timeout: 30000,
            },
        );
        const downloadUrl = requestRes.data?.downloadUrl;
        if (typeof downloadUrl !== 'string') {
            throw new Error('request-download returned no downloadUrl');
        }

        const isServerUrl = downloadUrl.startsWith(configuration.serverUrl);
        const headers: Record<string, string> = {};
        if (isServerUrl) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        const response = await axios.get(downloadUrl, {
            headers,
            responseType: 'arraybuffer',
            timeout: 60000,
            maxRedirects: 5,
            maxContentLength: 10 * 1024 * 1024,
        });
        return new Uint8Array(response.data);
    }

    /**
     * Download and decrypt an attachment blob.
     * Returns the decrypted binary data or null if decryption fails.
     */
    async downloadAndDecryptAttachment(ref: string): Promise<Uint8Array | null> {
        const encrypted = await this.downloadAttachment(ref);
        const key = await this.getBlobKey();
        const decrypted = decryptBlob(encrypted, key);
        return decrypted;
    }

    /**
     * Track an attachment download whose promise resolves to the decoded blob
     * (or null on failure). The download stays in the current batch until the
     * next drainAttachmentsForUserMessage call swaps the bucket out — file
     * events that arrive after the swap go into a fresh bucket bound to the
     * next user-text message.
     */
    trackAttachmentDownload(promise: Promise<{ data: Uint8Array; mimeType: string; name: string } | null>): void {
        this.pendingDownloads.push(promise);
    }

    /**
     * Atomically claim every download started before this call, wait for them
     * to resolve, and return the successful ones. The swap-then-await order
     * guarantees that a late-arriving file event cannot leak into this batch.
     */
    async drainAttachmentsForUserMessage(): Promise<Array<{ data: Uint8Array; mimeType: string; name: string }>> {
        const downloads = this.pendingDownloads;
        this.pendingDownloads = [];
        if (downloads.length === 0) return [];
        const results = await Promise.all(downloads);
        return results.filter((x): x is { data: Uint8Array; mimeType: string; name: string } => x !== null);
    }

    private authHeaders() {
        return {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            'X-Lyntty-Client': `cli-coding-session/${configuration.currentCliVersion}`
        };
    }

    private rememberRelayMessage(message: unknown, relayLocalId?: string | null): void {
        const digest = logicalMessageDigest(message);
        if (relayLocalId) {
            this.knownRelayMessageDigests.set(relayLocalId, digest);
        }
        if (!message || typeof message !== 'object' || (message as { role?: unknown }).role !== 'session') return;
        const envelope = (message as { content?: unknown }).content;
        if (envelope && typeof envelope === 'object' && typeof (envelope as { id?: unknown }).id === 'string') {
            const time = (envelope as { time?: unknown }).time;
            if (typeof time === 'number' && Number.isFinite(time)) {
                this.knownSessionProtocolCoveredThrough = Math.max(this.knownSessionProtocolCoveredThrough ?? 0, time);
            }
        }
    }

    private routeIncomingMessage(message: unknown, relayLocalId?: string) {
        this.rememberRelayMessage(message, relayLocalId);
        const userResult = UserMessageSchema.safeParse(message);
        if (userResult.success) {
            const userMessage = relayLocalId && !userResult.data.localKey
                ? { ...userResult.data, localKey: relayLocalId }
                : userResult.data;
            this.pendingRemoteInputEvents.push({ type: 'user', message: userMessage });
            this.flushPendingRemoteInputEvents();
            return;
        }

        // Check for file events (image attachments from app)
        const fileResult = FileEventMessageSchema.safeParse(message);
        if (fileResult.success) {
            const ev = fileResult.data.content.data.ev;
            logger.debug('[API] Received file event', {
                size: ev.size,
                hasMimeType: Boolean(ev.mimeType),
            });
            this.pendingRemoteInputEvents.push({ type: 'file', message: fileResult.data });
            this.flushPendingRemoteInputEvents();
            return;
        }

        this.emit('message', message);
    }

    private async fetchMessages() {
        // A reconnect cutover skips only messages that existed in the session
        // snapshot used to construct this client. Newer commands must still route.
        const skipThroughSeq = this.skipMessagesThroughSeq;
        let afterSeq = this.receiveSeq;
        while (true) {
            const response = await axios.get<V3GetSessionMessagesResponse>(
                `${configuration.serverUrl}/v3/sessions/${encodeURIComponent(this.sessionId)}/messages`,
                {
                    params: {
                        after_seq: afterSeq,
                        limit: 100
                    },
                    headers: this.authHeaders(),
                    timeout: 60000
                }
            );

            const messages = Array.isArray(response.data.messages) ? response.data.messages : [];
            let maxSeq = afterSeq;

            for (const message of messages) {
                if (message.seq > maxSeq) {
                    maxSeq = message.seq;
                }

                if (message.content?.t !== 'encrypted') {
                    continue;
                }

                try {
                    const body = decrypt(this.encryptionKey, this.encryptionVariant, decodeBase64(message.content.c));
                    if (skipThroughSeq !== null && message.seq <= skipThroughSeq) {
                        this.rememberRelayMessage(body, message.localId ?? message.id);
                        continue;
                    }
                    this.routeIncomingMessage(body, message.localId ?? message.id);
                } catch (error) {
                    logger.debug('[API] Failed to decrypt fetched message', {
                        sessionId: this.sessionId,
                        seq: message.seq,
                        error
                    });
                }
            }

            this.receiveSeq = Math.max(this.receiveSeq, maxSeq);
            this.lastSeq = Math.max(this.lastSeq, maxSeq);
            if (this.skipMessagesThroughSeq !== null && this.receiveSeq >= this.skipMessagesThroughSeq) {
                this.skipMessagesThroughSeq = null;
            }
            const hasMore = !!response.data.hasMore;
            if (hasMore && maxSeq === afterSeq) {
                logger.debug('[API] fetchMessages pagination stalled, stopping to avoid infinite loop', {
                    sessionId: this.sessionId,
                    afterSeq
                });
                break;
            }
            afterSeq = maxSeq;
            if (!hasMore) {
                break;
            }
        }
    }

    private static readonly MAX_OUTBOX_BATCH_SIZE = 50;

    private removePendingOutboxLocalIds(localIds: ReadonlySet<string>): void {
        if (localIds.size === 0) return;
        this.pendingOutbox = this.pendingOutbox.filter((message) => !localIds.has(message.localId));
    }

    private recordOutboxConflict(localId: string): void {
        this.pendingOutboxConflicts.add(localId);
    }

    private async reconcileOutboxConflict(batch: PendingOutboxMessage[], hintedLocalId: string): Promise<void> {
        try {
            await this.syncExistingSessionProtocolEnvelopeIds();
        } catch (error) {
            const quarantined = new Set(
                hintedLocalId
                    ? batch.filter((message) => message.localId === hintedLocalId).map((message) => message.localId)
                    : batch.map((message) => message.localId),
            );
            for (const localId of quarantined) this.recordOutboxConflict(localId);
            this.removePendingOutboxLocalIds(quarantined);
            logger.debug('[API] Could not inventory a relay localId conflict; quarantined affected outbox items', {
                sessionId: this.sessionId,
                conflictCount: quarantined.size,
                error,
            });
            return;
        }

        const reconciled = new Set<string>();
        for (const message of batch) {
            const persistedDigest = this.knownRelayMessageDigests.get(message.localId);
            if (!persistedDigest) continue;
            reconciled.add(message.localId);
            if (persistedDigest !== message.logicalDigest) {
                this.recordOutboxConflict(message.localId);
            }
        }

        if (reconciled.size === 0) {
            const candidates = hintedLocalId
                ? batch.filter((message) => message.localId === hintedLocalId)
                : batch;
            for (const message of candidates) {
                reconciled.add(message.localId);
                this.recordOutboxConflict(message.localId);
            }
        }
        this.removePendingOutboxLocalIds(reconciled);
    }

    private async flushOutbox() {
        // Preserve enqueue order across batches. Historical backfills and
        // session-protocol streams rely on relay seq matching the original
        // conversation order; reversing chunks makes long imports open on the
        // wrong message window.
        while (this.pendingOutbox.length > 0) {
            const batchSize = Math.min(this.pendingOutbox.length, ApiSessionClient.MAX_OUTBOX_BATCH_SIZE);
            const batch = this.pendingOutbox.slice(0, batchSize);

            let response;
            try {
                response = await axios.post<V3PostSessionMessagesResponse>(
                    `${configuration.serverUrl}/v3/sessions/${encodeURIComponent(this.sessionId)}/messages`,
                    {
                        messages: batch.map(({ content, localId }) => ({ content, localId }))
                    },
                    {
                        headers: this.authHeaders(),
                        timeout: 60000
                    }
                );
            } catch (error) {
                const conflictLocalId = relayConflictLocalId(error);
                if (conflictLocalId === null) throw error;
                await this.reconcileOutboxConflict(batch, conflictLocalId);
                continue;
            }

            const messages = Array.isArray(response.data.messages) ? response.data.messages : [];
            const maxSeq = messages.reduce((acc, message) => (
                message.seq > acc ? message.seq : acc
            ), this.lastSeq);
            this.lastSeq = maxSeq;
            const batchLocalIds = new Set(batch.map((message) => message.localId));
            const acknowledgedLocalIds = new Set(messages.flatMap((message) => (
                message.localId && batchLocalIds.has(message.localId) ? [message.localId] : []
            )));
            for (const message of batch) {
                if (!acknowledgedLocalIds.has(message.localId)) continue;
                this.knownRelayMessageDigests.set(message.localId, message.logicalDigest);
            }
            this.removePendingOutboxLocalIds(acknowledgedLocalIds);
            if (acknowledgedLocalIds.size !== batchLocalIds.size) {
                throw new Error(`Relay did not acknowledge ${batchLocalIds.size - acknowledgedLocalIds.size} session outbox message(s)`);
            }
        }
    }

    private enqueueMessage(content: unknown, invalidate: boolean = true, localId: string = randomUUID()) {
        const digest = logicalMessageDigest(content);
        const persistedDigest = this.knownRelayMessageDigests.get(localId);
        if (persistedDigest) {
            if (persistedDigest !== digest) this.recordOutboxConflict(localId);
            if (invalidate) this.sendSync.invalidate();
            return;
        }
        const pending = this.pendingOutbox.find((message) => message.localId === localId);
        if (pending) {
            if (pending.logicalDigest !== digest) this.recordOutboxConflict(localId);
            if (invalidate) this.sendSync.invalidate();
            return;
        }
        const encrypted = encodeBase64(encrypt(this.encryptionKey, this.encryptionVariant, content));
        this.pendingOutbox.push({
            content: encrypted,
            localId,
            logicalDigest: digest,
        });
        if (invalidate) {
            this.sendSync.invalidate();
        }
    }

    private enqueueSessionProtocolEnvelopes(envelopes: SessionEnvelope[], invalidate: boolean = true) {
        for (let i = 0; i < envelopes.length; i += 1) {
            this.enqueueSessionProtocolEnvelope(envelopes[i], invalidate && i === envelopes.length - 1);
        }
    }

    private enqueueSessionProtocolEnvelope(envelope: SessionEnvelope, invalidate: boolean = true, meta?: Record<string, unknown>) {
        const content = {
            role: 'session',
            content: envelope,
            meta: {
                sentFrom: 'cli',
                ...meta,
            }
        };

        // Preserve the original protocol transport key so upgraded daemons
        // can identify already-imported envelopes without duplicating history.
        this.enqueueMessage(content, invalidate, `session:${envelope.id}`);
    }

    async syncExistingSessionProtocolEnvelopeIds(timeoutMs: number = 10_000): Promise<void> {
        const inventory = async (): Promise<void> => {
            let afterSeq = 0;
            while (true) {
                const response = await axios.get<V3GetSessionMessagesResponse>(
                    `${configuration.serverUrl}/v3/sessions/${encodeURIComponent(this.sessionId)}/messages`,
                    {
                        params: { after_seq: afterSeq, limit: 100 },
                        headers: this.authHeaders(),
                        timeout: timeoutMs,
                    },
                );
                const messages = Array.isArray(response.data.messages) ? response.data.messages : [];
                let maxSeq = afterSeq;
                for (const message of messages) {
                    maxSeq = Math.max(maxSeq, message.seq);
                    if (message.content?.t !== 'encrypted') continue;
                    try {
                        this.rememberRelayMessage(
                            decrypt(this.encryptionKey, this.encryptionVariant, decodeBase64(message.content.c)),
                            message.localId ?? message.id,
                        );
                    } catch (error) {
                        logger.debug('[API] Failed to inventory encrypted relay message', {
                            sessionId: this.sessionId,
                            seq: message.seq,
                            error,
                        });
                        throw error;
                    }
                }
                if (!response.data.hasMore) return;
                if (maxSeq === afterSeq) throw new Error('Relay history inventory pagination stalled');
                afterSeq = maxSeq;
            }
        };

        let timeout: ReturnType<typeof setTimeout> | null = null;
        try {
            await Promise.race([
                inventory(),
                new Promise<never>((_resolve, reject) => {
                    timeout = setTimeout(() => reject(new Error('Relay history inventory timed out')), timeoutMs);
                }),
            ]);
        } finally {
            if (timeout) clearTimeout(timeout);
        }
    }

    hasSessionProtocolEnvelope(envelopeId: string): boolean {
        return this.knownRelayMessageDigests.has(`session:${envelopeId}`);
    }

    getSessionProtocolEnvelopeStatus(envelope: SessionEnvelope): SessionProtocolEnvelopeStatus {
        const knownDigest = this.knownRelayMessageDigests.get(`session:${envelope.id}`);
        if (!knownDigest) return 'missing';
        const intendedDigest = logicalMessageDigest({ role: 'session', content: envelope });
        return knownDigest === intendedDigest ? 'matching' : 'conflict';
    }

    getSessionProtocolCoveredThrough(): number | null {
        return this.knownSessionProtocolCoveredThrough;
    }

    sendSessionProtocolMessage(envelope: SessionEnvelope, meta?: Record<string, unknown>) {
        if (envelope.role !== 'user') {
            this.enqueueSessionProtocolEnvelope(envelope, true, meta);
            return;
        }

        if (envelope.ev.t !== 'text') {
            this.enqueueSessionProtocolEnvelope(envelope, true, meta);
            return;
        }

        this.enqueueSessionProtocolEnvelope(envelope, true, meta);
    }

    sendSessionEvent(event: {
        type: 'switch', mode: 'local' | 'remote'
    } | {
        type: 'message', message: string
    } | {
        type: 'permission-mode-changed', mode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
    } | {
        type: 'ready'
    }, id?: string) {
        let content = {
            role: 'agent',
            content: {
                id: id ?? randomUUID(),
                type: 'event',
                data: event
            }
        };
        this.enqueueMessage(content);
    }

    /**
     * Send a ping message to keep the connection alive
     */
    keepAlive(thinking: boolean, mode: 'local' | 'remote') {
        if (process.env.DEBUG) { // too verbose for production
            logger.debug(`[API] Sending keep alive message: ${thinking}`);
        }
        this.socket.volatile.emit('session-alive', {
            sid: this.sessionId,
            time: Date.now(),
            thinking,
            mode
        });
    }

    /**
     * Send session death message
     */
    sendSessionDeath() {
        this.socket.emit('session-end', { sid: this.sessionId, time: Date.now() });
    }

    /**
     * Returns the latest session metadata known to the client.
     */
    getMetadata(): Metadata | null {
        return this.metadata;
    }

    /**
     * Update session metadata
     * @param handler - Handler function that returns the updated metadata
     */
    suppressNextArchiveSignal() {
        this.ignoreArchiveSignal = true;
    }

    skipExistingMessages() {
        this.skipMessagesThroughSeq = this.initialServerSeq;
    }

    skipMessagesThrough(relaySeq: number) {
        this.skipMessagesThroughSeq = Math.max(0, Math.min(this.initialServerSeq, relaySeq));
    }

    async updateMetadataAndAwait(
        handler: (metadata: Metadata) => Metadata,
        options?: { timeoutMs?: number },
    ) {
        const timeoutMs = Math.max(1, options?.timeoutMs ?? 10_000);
        // Metadata ACKs are always bounded. Fire-and-forget callers share this
        // lock with history commits, so one lost ACK must never hold the lock
        // forever and strand every later cursor update.
        const deadline = Date.now() + timeoutMs;
        await this.metadataLock.inLock(async () => {
            const updateOnce = async () => {
                let updated = handler(this.metadata!); // Weird state if metadata is null - should never happen but here we are
                const payload = { sid: this.sessionId, expectedVersion: this.metadataVersion, metadata: encodeBase64(encrypt(this.encryptionKey, this.encryptionVariant, updated)) };
                const remainingMs = deadline - Date.now();
                if (remainingMs <= 0) {
                    throw new Error('Metadata update deadline exceeded');
                }
                const answer = await this.socket
                    .timeout(Math.max(1, Math.min(5_000, remainingMs)))
                    .emitWithAck('update-metadata', payload);
                if (answer.result === 'success') {
                    this.metadata = decrypt(this.encryptionKey, this.encryptionVariant, decodeBase64(answer.metadata));
                    this.metadataVersion = answer.version;
                } else if (answer.result === 'version-mismatch') {
                    if (answer.version > this.metadataVersion) {
                        this.metadataVersion = answer.version;
                        this.metadata = decrypt(this.encryptionKey, this.encryptionVariant, decodeBase64(answer.metadata));
                    }
                    throw new Error('Metadata version mismatch');
                } else if (answer.result === 'error') {
                    throw new Error('Metadata update was rejected by relay');
                }
            };

            const maxAttempts = Math.max(1, Math.ceil(timeoutMs / 250));
            let lastError: unknown;
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                try {
                    await updateOnce();
                    return;
                } catch (error) {
                    lastError = error;
                    const remainingMs = deadline - Date.now();
                    if (attempt === maxAttempts - 1 || remainingMs <= 0) {
                        break;
                    }
                    await delay(Math.min(250, remainingMs));
                }
            }
            throw new Error(`Metadata update did not complete within ${timeoutMs}ms`, {
                cause: lastError,
            });
        });
    }

    updateMetadata(handler: (metadata: Metadata) => Metadata) {
        void this.updateMetadataAndAwait(handler).catch((error) => {
            logger.debug('[API] Metadata update deferred after bounded retries', error);
        });
    }

    /**
     * Update session agent state
     * @param handler - Handler function that returns the updated agent state
     */
    updateAgentState(handler: (metadata: AgentState) => AgentState) {
        logger.debugLargeJson('Updating agent state', this.agentState);
        this.agentStateLock.inLock(async () => {
            await backoff(async () => {
                let updated = handler(this.agentState || {});
                const answer = await this.socket.emitWithAck('update-state', { sid: this.sessionId, expectedVersion: this.agentStateVersion, agentState: updated ? encodeBase64(encrypt(this.encryptionKey, this.encryptionVariant, updated)) : null });
                if (answer.result === 'success') {
                    this.agentState = answer.agentState ? decrypt(this.encryptionKey, this.encryptionVariant, decodeBase64(answer.agentState)) : null;
                    this.agentStateVersion = answer.version;
                    logger.debug('Agent state updated', this.agentState);
                } else if (answer.result === 'version-mismatch') {
                    if (answer.version > this.agentStateVersion) {
                        this.agentStateVersion = answer.version;
                        this.agentState = answer.agentState ? decrypt(this.encryptionKey, this.encryptionVariant, decodeBase64(answer.agentState)) : null;
                    }
                    throw new Error('Agent state version mismatch');
                } else if (answer.result === 'error') {
                    // console.error('Agent state update error', answer);
                    // Hard error - ignore
                }
            });
        });
    }

    /**
     * Wait for socket buffer to flush
     */
    async flushConfirmed(timeoutMs: number = 10000): Promise<void> {
        let timeout: NodeJS.Timeout | null = null;
        try {
            const completed = await Promise.race([
                this.sendSync.invalidateAndAwait().then(() => true),
                new Promise<false>((resolve) => {
                    timeout = setTimeout(() => resolve(false), timeoutMs);
                }),
            ]);
            if (!completed || this.pendingOutbox.length > 0) {
                throw new Error(`Session outbox was not acknowledged within ${timeoutMs}ms`);
            }
            if (this.pendingOutboxConflicts.size > 0) {
                const localIds = [...this.pendingOutboxConflicts].sort();
                this.pendingOutboxConflicts.clear();
                throw new SessionOutboxConflictError(localIds);
            }
        } finally {
            if (timeout) clearTimeout(timeout);
        }
    }

    async flush(): Promise<void> {
        await this.flushConfirmed();
        if (!this.socket.connected) {
            return;
        }
        return new Promise((resolve) => {
            this.socket.emit('ping', () => {
                resolve();
            });
            setTimeout(() => {
                resolve();
            }, 10000);
        });
    }

    async close() {
        logger.debug('[API] socket.close() called');
        this.closed = true;
        this.sendSync.stop();
        this.receiveSync.stop();
        if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
            this.reconnectInterval = null;
        }
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        this.socket.close();
    }

    private startSmartReconnect() {
        if (this.closed || this.reconnectInterval) return;

        this.reconnectInterval = setInterval(() => {
            if (this.closed) {
                clearInterval(this.reconnectInterval!);
                this.reconnectInterval = null;
                return;
            }
            if (this.socket.connected) {
                clearInterval(this.reconnectInterval!);
                this.reconnectInterval = null;
                return;
            }
            if (!shouldReconnect()) {
                logger.debug('[API] Still not ready to reconnect');
                return;
            }
            logger.debug('[API] Attempting reconnect');
            this.socket.connect();
        }, 3000);

        if (shouldReconnect()) {
            logger.debug('[API] Network up + lid open — reconnecting in 1s');
            this.reconnectTimeout = setTimeout(() => {
                this.reconnectTimeout = null;
                if (!this.closed && !this.socket.connected) this.socket.connect();
            }, 1000);
        }
    }
}
