import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { apiSocket, getCurrentAppState, getLynttyClientId } from '@/sync/apiSocket';
import { AuthCredentials } from '@/auth/tokenStorage';
import { Encryption } from '@/sync/encryption/encryption';
import { decodeBase64 } from '@/encryption/base64';
import { storage } from './storage';
import { getImageAttachmentSendPlan, isCompleteImageAttachmentUpload } from './attachmentSupport';
import {
    errorMessageFromUnknown,
    formatAttachmentDiagnosticForLog,
    getAttachmentDiagnostic,
} from './attachmentDiagnostics';
import { ApiEphemeralUpdateSchema, ApiMessage, ApiUpdateContainerSchema } from './apiTypes';
import { orderApiMessagesForReducer } from './messageOrdering';
import type { ApiEphemeralActivityUpdate } from './apiTypes';
import { Session, Machine, type PiMachineSessionRecord } from './storageTypes';
import { InvalidateSync } from '@/utils/sync';
import { ActivityUpdateAccumulator } from './reducer/activityUpdateAccumulator';
import { randomUUID } from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import { syncCurrentPushToken } from './pushRegistration';
import { Platform, AppState, type AppStateStatus } from 'react-native';
import { isRunningOnMac } from '@/utils/platform';
import { NormalizedMessage, normalizeRawMessage, RawRecord } from './typesRaw';
import { applySettings, Settings, settingsDefaults, settingsParse, settingsToSyncPayload, SUPPORTED_SCHEMA_VERSION } from './settings';
import {
    addPiSessionTombstone,
    loadPendingOutbox,
    loadPendingSettings,
    loadPendingSyntheticOutbox,
    loadPiSessionTombstones,
    savePendingOutbox,
    savePendingSettings,
    savePendingSyntheticOutbox,
    savePiSessionTombstones,
    type PersistedPiSessionTombstone,
} from './persistence';
import { parseToken } from '@/utils/parseToken';
import { expectsRemotePiEcho } from './remoteCommandEcho';
import { getServerUrl } from './serverConfig';
import { log } from '@/log';
import { gitStatusSync } from './gitStatusSync';
import { AsyncLock } from '@/utils/lock';
import { EncryptionCache } from './encryption/encryptionCache';
import { systemPrompt } from './prompt/systemPrompt';
import type { AttachmentPreview, UploadedAttachment } from './attachmentTypes';
import { requestAttachmentUpload, uploadEncryptedBlob } from './apiAttachments';
import { encryptBlob } from '@/encryption/blob';
import { readFileBytes } from '@/utils/readFileBytes';
import { Modal } from '@/modal';
import { t } from '@/text';
import { shouldFetchPiSessionDiscovery } from './piDiscoveredSessions';
import { fetchPiSessionPages, PiSessionIndexRefreshingError } from './piSessionDiscoveryFetch';
import { PiSessionListSnapshot } from './piSessionListSnapshot';
import { findPiSessionNameBackfills, persistPiSessionNameBackfills } from './piSessionNamePersistence';
import {
    resolvePiSessionRetryDelay,
    shouldRefreshPiSessionsForMachineTransition,
} from './piSessionRefreshPolicy';
import { canControlSession } from './sessionControlPolicy';
import { applyPiHistoryPageResult, type PiHistoryPageResult } from './piHistoryPage';
import { listPiSessionsResultSchema, parseMachineRpcResult } from './machineRpcSchemas';
import { resolveAndroidUpdateChannel } from './nativeUpdateChannel';
import { fetchJsonWithTimeout } from './boundedJsonRequest';
import { mergeAuthoritativeMachineSnapshot } from './machineSnapshotMerge';

type V3GetSessionMessagesResponse = {
    messages: ApiMessage[];
    hasMore: boolean;
};

// Sentinel used as `before_seq` for the very first backward fetch of a
// session. It must exceed any real `seq` value the server can produce.
// `seq` is stored as Postgres int4 on the server, so the maximum is
// 2_147_483_647. We use that exact upper bound to keep the request safely
// within int4 while still being effectively "infinite" for any session.
const SEQ_BACKWARD_INITIAL_SENTINEL = 2_147_483_647;
const SESSION_LIST_REQUEST_TIMEOUT_MS = 5_000;
const MACHINE_LIST_REQUEST_TIMEOUT_MS = 5_000;
const SESSION_LIST_REQUEST_LABEL = 'Session list request';
const MACHINE_LIST_REQUEST_LABEL = 'Machine list request';

type V3PostSessionMessagesResponse = {
    messages: Array<{
        id: string;
        seq: number;
        localId: string | null;
        createdAt: number;
        updatedAt: number;
    }>;
};

type OutboxMessage = {
    localId: string;
    content: string;
};

type RelayUpdateContext = {
    generation: number;
    encryption: Encryption;
    sessionsSync: InvalidateSync;
    tombstoneScope: string;
};

type SyncRuntimeContext = Pick<RelayUpdateContext, 'generation' | 'encryption'>;

class ObsoletePiSessionRefreshError extends Error {
    constructor() {
        super('Pi session refresh was superseded');
        this.name = 'ObsoletePiSessionRefreshError';
    }
}

type SendMessageOptions = {
    /** Stable transport id used when migrating a persisted synthetic send. */
    localId?: string;
    /** Persist first; caller atomically removes the synthetic source before send. */
    deferSend?: boolean;
    displayText?: string;
    source?: 'chat' | 'new_session' | 'option' | 'question';
    /** Optional image attachments to send before the text message. */
    attachments?: AttachmentPreview[];
};

class Sync {
    private static readonly BACKGROUND_SEND_TIMEOUT_MS = 30_000;
    private static readonly PI_SESSION_TRANSPORT_MAX_RETRIES = 3;
    private static readonly PI_SESSION_INDEX_MAX_RETRIES = 12;
    encryption!: Encryption;
    serverID!: string;
    private credentials!: AuthCredentials;
    public encryptionCache = new EncryptionCache();
    private sessionsSync: InvalidateSync;
    private messagesSync = new Map<string, InvalidateSync>();
    private sendSync = new Map<string, InvalidateSync>();
    private sendAbortControllers = new Map<string, AbortController>();
    private readAbortControllers = new Set<AbortController>();
    private settingsAbortControllers = new Set<AbortController>();
    private sessionLastSeq = new Map<string, number>();
    // Lowest seq value we have already fetched and applied for a session.
    // Used as the cursor for backward pagination when the user scrolls up to
    // load older history. Set after the initial latest-page fetch and
    // advanced downward by loadOlderMessages.
    private sessionOldestSeq = new Map<string, number>();
    private pendingOutbox: Map<string, OutboxMessage[]> = loadPendingOutbox();
    private pendingSyntheticOutbox = loadPendingSyntheticOutbox() as Map<string, Array<{ localId: string; machineId: string; piSessionId: string; text: string; options?: SendMessageOptions }>>;
    private piSessionTombstones: PersistedPiSessionTombstone[] = loadPiSessionTombstones();
    private flushingSyntheticOutbox = new Set<string>();
    private sessionMessageQueue = new Map<string, NormalizedMessage[]>();
    private sessionQueueProcessing = new Set<string>();
    private sessionMessageLocks = new Map<string, AsyncLock>();
    private updateProcessingChain: Promise<void> = Promise.resolve();
    private sessionDataKeys = new Map<string, Uint8Array>(); // Store session data encryption keys internally
    private machineDataKeys = new Map<string, Uint8Array>(); // Store machine data encryption keys internally
    private settingsSync: InvalidateSync;
    private machinesSync: InvalidateSync;
    private piSessionsSync: InvalidateSync;
    private pushTokenSync: InvalidateSync;
    private nativeUpdateSync: InvalidateSync;
    private sessionListSnapshot: PiSessionListSnapshot;
    private piSessionNameBackfillRelaySessions: Array<Omit<Session, 'presence'> & { presence?: Session['presence'] }> = [];
    private piSessionNameBackfillPending: {
        context: SyncRuntimeContext;
        relaySessions: Array<Omit<Session, 'presence'> & { presence?: Session['presence'] }>;
        mergedSessions: Array<Omit<Session, 'presence'> & { presence?: Session['presence'] }>;
    } | null = null;
    private piSessionNameBackfillInFlight: Promise<void> | null = null;
    private activityAccumulator: ActivityUpdateAccumulator;
    private pendingSettings: Partial<Settings> = loadPendingSettings();
    private appState: AppStateStatus = AppState.currentState;
    private syncStarted = false;
    private sessionSnapshotGeneration = 0;
    private relayInitialAttempt: Promise<void> = Promise.resolve();
    private resolveRelayInitialAttempt: (() => void) | null = null;
    private piSessionRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    private piSessionRefreshGenerationInFlight: number | null = null;
    private piSessionRefreshPending = false;
    private piSessionFullRefreshEpoch = 0;
    private piSessionHandledFullRefreshEpoch = 0;
    private piSessionTransportRetryAttempt = 0;
    private piSessionIndexRetryAttempt = 0;
    private piSessionTransportRetryMachineIds = new Set<string>();
    private piSessionIndexRetryMachineIds = new Set<string>();
    private backgroundSendTimeout: ReturnType<typeof setTimeout> | null = null;
    private backgroundSendNotificationId: string | null = null;
    private backgroundSendStartedAt: number | null = null;
    // Generic locking mechanism
    private recalculationLockCount = 0;
    private lastRecalculationTime = 0;

    constructor() {
        this.sessionListSnapshot = new PiSessionListSnapshot(
            () => Object.values(storage.getState().sessions),
            (machineId) => storage.getState().machines[machineId],
            (sessions) => {
                this.applySessions(sessions, { replace: true });
                this.queueCanonicalPiSessionNamePersistence(
                    this.piSessionNameBackfillRelaySessions,
                    sessions,
                );
                if (sessions.length > 0) storage.getState().applyReady();
            },
            (identity) => this.persistPiSessionTombstone(identity),
        );
        this.sessionsSync = new InvalidateSync(this.refreshSessionSnapshot);
        this.settingsSync = this.createSettingsSync();
        this.machinesSync = new InvalidateSync(this.fetchMachines);
        this.piSessionsSync = new InvalidateSync(this.fetchMachinePiSessions);
        this.nativeUpdateSync = new InvalidateSync(this.fetchNativeUpdate);

        const registerPushToken = async () => {
            await this.registerPushToken();
        }
        this.pushTokenSync = new InvalidateSync(registerPushToken);
        this.activityAccumulator = this.createActivityAccumulator();

        AppState.addEventListener('change', (nextAppState) => {
            const previousAppState = this.appState;
            this.appState = nextAppState;

            // Notify server of focus state for push notification routing.
            // Re-derive the native app state so the wire value matches push suppression.
            apiSocket.sendAppState(getCurrentAppState());

            if (nextAppState === 'active') {
                const shouldFailAfterResume = this.backgroundSendStartedAt !== null
                    && this.hasPendingOutboxMessages()
                    && (Date.now() - this.backgroundSendStartedAt) >= Sync.BACKGROUND_SEND_TIMEOUT_MS;
                void this.cancelBackgroundSendTimeoutNotification();
                this.clearBackgroundSendWatchdog();
                if (shouldFailAfterResume) {
                    void this.notifyMessageSendFailed();
                    this.failPendingOutboxMessages('Message failed to send in background after 30s. Please retry.');
                }
                if (previousAppState !== 'active') {
                    log.log('📱 App became active');
                    if (this.syncStarted) {
                        this.requestPiSessionFullRefresh();
                        this.schedulePiSessionRefresh();
                        this.machinesSync.invalidate();
                        this.pushTokenSync.invalidate();
                        this.sessionsSync.invalidate();
                        this.nativeUpdateSync.invalidate();
                    }
                }
            } else {
                log.log(`📱 App state changed to: ${nextAppState}`);
                this.maybeStartBackgroundSendWatchdog();
            }
        });
    }

    resetRuntimeState() {
        this.activityAccumulator.cancel();
        for (const sync of [
            this.sessionsSync,
            this.settingsSync,
            this.machinesSync,
            this.piSessionsSync,
            this.pushTokenSync,
            this.nativeUpdateSync,
            ...this.messagesSync.values(),
            ...this.sendSync.values(),
        ]) {
            sync.stop();
        }
        for (const controller of this.sendAbortControllers.values()) {
            controller.abort();
        }
        for (const controller of this.readAbortControllers) {
            controller.abort();
        }
        for (const controller of this.settingsAbortControllers) {
            controller.abort();
        }
        this.messagesSync.clear();
        this.sendSync.clear();
        this.sendAbortControllers.clear();
        this.readAbortControllers.clear();
        this.settingsAbortControllers.clear();
        this.sessionLastSeq.clear();
        this.sessionOldestSeq.clear();
        this.pendingOutbox.clear();
        savePendingOutbox(this.pendingOutbox);
        this.pendingSyntheticOutbox.clear();
        savePendingSyntheticOutbox(this.pendingSyntheticOutbox);
        this.flushingSyntheticOutbox.clear();
        this.sessionMessageQueue.clear();
        this.sessionQueueProcessing.clear();
        this.sessionMessageLocks.clear();
        this.sessionDataKeys.clear();
        this.machineDataKeys.clear();
        this.encryptionCache = new EncryptionCache();
        this.pendingSettings = {};
        savePendingSettings(this.pendingSettings);
        this.sessionListSnapshot.reset();
        this.piSessionNameBackfillRelaySessions = [];
        this.piSessionNameBackfillPending = null;
        this.piSessionNameBackfillInFlight = null;
        this.sessionSnapshotGeneration += 1;
        this.updateProcessingChain = Promise.resolve();
        this.resolveRelayInitialAttempt?.();
        this.resolveRelayInitialAttempt = null;
        this.relayInitialAttempt = Promise.resolve();
        this.syncStarted = false;
        if (this.piSessionRefreshTimer) clearTimeout(this.piSessionRefreshTimer);
        this.piSessionRefreshTimer = null;
        this.piSessionRefreshGenerationInFlight = null;
        this.piSessionRefreshPending = false;
        this.piSessionFullRefreshEpoch = 0;
        this.piSessionHandledFullRefreshEpoch = 0;
        this.piSessionTransportRetryAttempt = 0;
        this.piSessionIndexRetryAttempt = 0;
        this.piSessionTransportRetryMachineIds.clear();
        this.piSessionIndexRetryMachineIds.clear();
        this.clearBackgroundSendWatchdog();
        void this.cancelBackgroundSendTimeoutNotification();
        this.backgroundSendStartedAt = null;
        this.sessionsSync = new InvalidateSync(this.refreshSessionSnapshot);
        this.settingsSync = this.createSettingsSync();
        this.machinesSync = new InvalidateSync(this.fetchMachines);
        this.piSessionsSync = new InvalidateSync(this.fetchMachinePiSessions);
        this.nativeUpdateSync = new InvalidateSync(this.fetchNativeUpdate);
        this.pushTokenSync = new InvalidateSync(async () => {
            await this.registerPushToken();
        });
        this.activityAccumulator = this.createActivityAccumulator();
    }

    async create(credentials: AuthCredentials, encryption: Encryption) {
        this.credentials = credentials;
        this.encryption = encryption;
        this.serverID = parseToken(credentials.token);
        this.restorePiSessionTombstonesForAccount();
        await this.#init();

        // Await settings sync to have fresh settings
        await this.settingsSync.awaitQueue();

    }

    async restore(credentials: AuthCredentials, encryption: Encryption) {
        // NOTE: No awaiting anything here, we're restoring from disk (for example after an app restart).
        this.credentials = credentials;
        this.encryption = encryption;
        this.serverID = parseToken(credentials.token);
        this.restorePiSessionTombstonesForAccount();
        await this.#init();
    }

    async #init() {
        this.relayInitialAttempt = new Promise<void>((resolve) => {
            this.resolveRelayInitialAttempt = resolve;
        });

        // Subscribe to updates
        this.subscribeToUpdates();

        // Invalidate sync. Re-read the native state here because this singleton
        // is constructed before auth/bootstrap and its initial value may be stale.
        this.appState = AppState.currentState;
        this.syncStarted = true;
        log.log('🔄 #init: Invalidating all syncs');
        this.sessionsSync.invalidate();
        this.settingsSync.invalidate();
        this.machinesSync.invalidate();
        this.pushTokenSync.invalidate();
        this.nativeUpdateSync.invalidate();
        log.log('🔄 #init: All syncs invalidated');

        // The first relay attempt is bounded. Commit it before Pi discovery, but
        // never keep Sessions Home waiting for a successful network response.
        void this.relayInitialAttempt.then(() => {
            storage.getState().applyReady();
            for (const sessionId of this.pendingOutbox.keys()) {
                this.getSendSync(sessionId).invalidate();
            }
            if (this.hasPendingOutboxMessages()) {
                this.maybeStartBackgroundSendWatchdog();
            }
        });
    }


    onSessionVisible = (sessionId: string) => {
        this.getMessagesSync(sessionId).invalidate();

        const session = storage.getState().sessions[sessionId];
        if (session && canControlSession(session.metadata)) {
            gitStatusSync.getSync(sessionId).invalidate();
        }
    }

    private captureRuntimeContext = (): SyncRuntimeContext => ({
        generation: this.sessionSnapshotGeneration,
        encryption: this.encryption,
    });

    private isRuntimeContextCurrent = (context: SyncRuntimeContext): boolean => (
        this.syncStarted
        && context.generation === this.sessionSnapshotGeneration
        && context.encryption === this.encryption
    );

    private isSettingsContextCurrent = (
        context: SyncRuntimeContext,
        credentials: AuthCredentials,
    ): boolean => this.isRuntimeContextCurrent(context) && credentials === this.credentials;

    private createSettingsSync = (): InvalidateSync => new InvalidateSync(async () => {
        const credentials = this.credentials;
        const context = this.captureRuntimeContext();
        if (!credentials || !this.isSettingsContextCurrent(context, credentials)) return;
        await this.syncSettings(context, credentials);
    });

    private getMessagesSync(sessionId: string): InvalidateSync {
        let sync = this.messagesSync.get(sessionId);
        if (!sync) {
            const context = this.captureRuntimeContext();
            sync = new InvalidateSync(() => this.fetchMessages(sessionId, context));
            this.messagesSync.set(sessionId, sync);
        }
        return sync;
    }

    private getSendSync(sessionId: string): InvalidateSync {
        let sync = this.sendSync.get(sessionId);
        if (!sync) {
            const context = this.captureRuntimeContext();
            sync = new InvalidateSync(() => this.flushOutbox(sessionId, context));
            this.sendSync.set(sessionId, sync);
        }
        return sync;
    }

    private enqueueMessages(sessionId: string, messages: NormalizedMessage[]) {
        if (messages.length === 0) {
            return;
        }

        let queue = this.sessionMessageQueue.get(sessionId);
        if (!queue) {
            queue = [];
            this.sessionMessageQueue.set(sessionId, queue);
        }
        queue.push(...messages);

        this.scheduleQueuedMessagesProcessing(sessionId, this.sessionSnapshotGeneration);
    }

    private getSessionMessageLock(sessionId: string): AsyncLock {
        let lock = this.sessionMessageLocks.get(sessionId);
        if (!lock) {
            lock = new AsyncLock();
            this.sessionMessageLocks.set(sessionId, lock);
        }
        return lock;
    }

    private scheduleQueuedMessagesProcessing(sessionId: string, generation: number) {
        if (generation !== this.sessionSnapshotGeneration || this.sessionQueueProcessing.has(sessionId)) {
            return;
        }

        this.sessionQueueProcessing.add(sessionId);
        const lock = this.getSessionMessageLock(sessionId);
        void lock.inLock(() => {
            while (generation === this.sessionSnapshotGeneration) {
                const pending = this.sessionMessageQueue.get(sessionId);
                if (!pending || pending.length === 0) {
                    break;
                }
                const batch = pending.splice(0, pending.length);
                this.applyMessages(sessionId, batch);
            }
        }).finally(() => {
            if (generation !== this.sessionSnapshotGeneration) return;
            this.sessionQueueProcessing.delete(sessionId);
            const pending = this.sessionMessageQueue.get(sessionId);
            if (pending && pending.length > 0) {
                this.scheduleQueuedMessagesProcessing(sessionId, generation);
            }
        });
    }

    private hasPendingOutboxMessages() {
        if (this.sendAbortControllers.size > 0) {
            return true;
        }
        for (const messages of this.pendingOutbox.values()) {
            if (messages.length > 0) {
                return true;
            }
        }
        return false;
    }

    private maybeStartBackgroundSendWatchdog() {
        if (this.appState === 'active') {
            return;
        }
        if (!this.hasPendingOutboxMessages() || this.backgroundSendTimeout) {
            return;
        }

        log.log('📨 Pending messages detected in background. Starting 30s send watchdog.');
        this.backgroundSendStartedAt = Date.now();
        const context = this.captureRuntimeContext();
        this.backgroundSendTimeout = setTimeout(() => {
            this.backgroundSendTimeout = null;
            void this.handleBackgroundSendTimeout(context);
        }, Sync.BACKGROUND_SEND_TIMEOUT_MS);
        void this.scheduleBackgroundSendTimeoutNotification();
    }

    private clearBackgroundSendWatchdog() {
        if (this.backgroundSendTimeout) {
            clearTimeout(this.backgroundSendTimeout);
            this.backgroundSendTimeout = null;
        }
        this.backgroundSendStartedAt = null;
    }

    private async scheduleBackgroundSendTimeoutNotification() {
        if (this.backgroundSendNotificationId) {
            return;
        }
        try {
            this.backgroundSendNotificationId = await Notifications.scheduleNotificationAsync({
                content: {
                    title: t('appWide.messageNotSent'),
                    body: t('appWide.messageStillSendingInBackground'),
                    sound: true
                },
                trigger: {
                    type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                    seconds: Math.ceil(Sync.BACKGROUND_SEND_TIMEOUT_MS / 1000)
                }
            });
        } catch (error) {
            log.log(`Failed to schedule background send timeout notification: ${error}`);
        }
    }

    private async cancelBackgroundSendTimeoutNotification() {
        if (!this.backgroundSendNotificationId) {
            return;
        }
        try {
            await Notifications.cancelScheduledNotificationAsync(this.backgroundSendNotificationId);
        } catch (error) {
            log.log(`Failed to cancel background send timeout notification: ${error}`);
        } finally {
            this.backgroundSendNotificationId = null;
        }
    }

    private async notifyMessageSendFailed() {
        try {
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: t('appWide.messageFailed'),
                    body: t('appWide.messageFailedInBackground'),
                    sound: true
                },
                trigger: null
            });
        } catch (error) {
            log.log(`Failed to schedule message failure notification: ${error}`);
        }
    }

    private failPendingOutboxMessages(reasonText: string) {
        for (const controller of this.sendAbortControllers.values()) {
            controller.abort();
        }
        this.sendAbortControllers.clear();

        const now = Date.now();
        const sessionIds: string[] = [];
        for (const [sessionId, pending] of this.pendingOutbox) {
            if (pending.length === 0) {
                continue;
            }
            pending.length = 0;
            this.pendingOutbox.delete(sessionId);
            sessionIds.push(sessionId);
        }

        savePendingOutbox(this.pendingOutbox);

        for (const sessionId of sessionIds) {
            this.enqueueMessages(sessionId, [{
                id: randomUUID(),
                localId: null,
                createdAt: now,
                role: 'event',
                isSidechain: false,
                content: {
                    type: 'message',
                    message: reasonText
                }
            }]);
        }
    }

    private async handleBackgroundSendTimeout(context: SyncRuntimeContext) {
        if (!this.isRuntimeContextCurrent(context)) return;
        if (!this.hasPendingOutboxMessages()) {
            await this.cancelBackgroundSendTimeoutNotification();
            if (!this.isRuntimeContextCurrent(context)) return;
            this.backgroundSendStartedAt = null;
            return;
        }

        await this.cancelBackgroundSendTimeoutNotification();
        if (!this.isRuntimeContextCurrent(context)) return;
        await this.notifyMessageSendFailed();
        if (!this.isRuntimeContextCurrent(context)) return;
        this.failPendingOutboxMessages('Message failed to send in background after 30s. Please retry.');
        this.backgroundSendStartedAt = null;
    }

    /**
     * Upload image attachments for a session: read bytes → encrypt → upload to server.
     * Returns successful uploads and a failure count. The caller commits file/text
     * envelopes only when the entire requested batch succeeds.
     */
    private async uploadAttachmentsForSession(
        sessionId: string,
        attachments: AttachmentPreview[],
        context: SyncRuntimeContext,
    ): Promise<{ uploaded: UploadedAttachment[]; failed: number }> {
        const credentials = this.credentials;
        if (!credentials || !this.isRuntimeContextCurrent(context)) {
            return { uploaded: [], failed: attachments.length };
        }

        const blobKey = context.encryption.getSessionBlobKey(sessionId);
        if (!blobKey) {
            console.error(`[attachments] No blob key for session ${sessionId}`);
            return { uploaded: [], failed: attachments.length };
        }

        const uploaded: UploadedAttachment[] = [];
        let failed = 0;

        for (const attachment of attachments) {
            try {
                const bytes = await readFileBytes(attachment.uri);
                if (!this.isRuntimeContextCurrent(context)) return { uploaded: [], failed: attachments.length };
                const encrypted = encryptBlob(bytes, blobKey);

                const upload = await requestAttachmentUpload(
                    credentials,
                    sessionId,
                    attachment.name,
                    encrypted.length,
                );
                if (!this.isRuntimeContextCurrent(context)) return { uploaded: [], failed: attachments.length };

                await uploadEncryptedBlob(upload, encrypted, credentials);
                if (!this.isRuntimeContextCurrent(context)) return { uploaded: [], failed: attachments.length };
                const { ref } = upload;

                uploaded.push({
                    ref,
                    name: attachment.name,
                    mimeType: attachment.mimeType,
                    size: bytes.length,
                    width: attachment.width,
                    height: attachment.height,
                    thumbhash: attachment.thumbhash,
                });
            } catch (err) {
                if (!this.isRuntimeContextCurrent(context)) {
                    return { uploaded: [], failed: attachments.length };
                }
                const diagnostic = getAttachmentDiagnostic(err);
                if (diagnostic) {
                    console.error('[attachments] Failed to upload image attachment:', formatAttachmentDiagnosticForLog(diagnostic, {
                        platform: Platform.OS,
                        client: getLynttyClientId(),
                    }));
                } else {
                    const message = errorMessageFromUnknown(err);
                    console.error('[attachments] Failed to upload image attachment:', {
                        leg: 'blob-upload',
                        message,
                        platform: Platform.OS,
                        client: getLynttyClientId(),
                    });
                }
                failed++;
                // Continue collecting diagnostics; the caller rejects the batch atomically.
            }
        }

        return { uploaded, failed };
    }

    private queueSyntheticMessage(sessionId: string, text: string, options?: SendMessageOptions): boolean {
        const session = storage.getState().sessions[sessionId];
        if (!session?.metadata?.machineId || !session.metadata.piSessionId) return false;
        const localId = randomUUID();
        const pending = this.pendingSyntheticOutbox.get(sessionId) ?? [];
        pending.push({
            localId,
            machineId: session.metadata.machineId,
            piSessionId: session.metadata.piSessionId,
            text,
            options,
        });
        this.pendingSyntheticOutbox.set(sessionId, pending);
        savePendingSyntheticOutbox(this.pendingSyntheticOutbox);

        const now = Date.now();
        if (session) {
            storage.getState().applySessions([{
                ...session,
                updatedAt: Math.max(session.updatedAt, now),
                activeAt: Math.max(session.activeAt, now),
            }]);
        }

        const record: RawRecord = {
            role: 'user',
            content: { type: 'text', text },
            meta: {
                sentFrom: Platform.OS === 'android' ? 'android' : isRunningOnMac() ? 'mac' : 'ios',
                ...(options?.displayText ? { displayText: options.displayText } : {}),
            },
        };
        const normalized = normalizeRawMessage(localId, localId, now, record);
        if (normalized) {
            this.enqueueMessages(sessionId, [normalized]);
        }
        return true;
    }

    private reconcileSyntheticOutbox(): void {
        const normalLocalIds = new Set(
            [...this.pendingOutbox.values()].flatMap((entries) => entries.map((entry) => entry.localId)),
        );
        let changed = false;
        for (const [syntheticSessionId, entries] of this.pendingSyntheticOutbox) {
            const remaining = entries.filter((entry) => !normalLocalIds.has(entry.localId));
            if (remaining.length !== entries.length) {
                changed = true;
                if (remaining.length > 0) this.pendingSyntheticOutbox.set(syntheticSessionId, remaining);
                else this.pendingSyntheticOutbox.delete(syntheticSessionId);
            }
            const identity = remaining[0];
            if (!identity) continue;
            const relaySession = Object.values(storage.getState().sessions).find((candidate) => (
                candidate.metadata?.piSynthetic !== true
                && candidate.metadata?.machineId === identity.machineId
                && candidate.metadata?.piSessionId === identity.piSessionId
            ));
            if (relaySession) void this.flushSyntheticMessages(syntheticSessionId, relaySession.id);
        }
        if (changed) savePendingSyntheticOutbox(this.pendingSyntheticOutbox);
    }

    async flushSyntheticMessages(syntheticSessionId: string, relaySessionId: string) {
        const context = this.captureRuntimeContext();
        if (!this.isRuntimeContextCurrent(context)) return;
        if (this.flushingSyntheticOutbox.has(syntheticSessionId)) {
            return;
        }
        this.flushingSyntheticOutbox.add(syntheticSessionId);
        try {
            const pending = this.pendingSyntheticOutbox.get(syntheticSessionId);
            if (!pending || pending.length === 0) {
                return;
            }
            await this.sessionsSync.awaitQueue();
            if (!this.isRuntimeContextCurrent(context)
                || !context.encryption.getSessionEncryption(relaySessionId)) {
                return;
            }
            while (true) {
                if (!this.isRuntimeContextCurrent(context)) return;
                const current = this.pendingSyntheticOutbox.get(syntheticSessionId);
                if (!current || current.length === 0) {
                    this.pendingSyntheticOutbox.delete(syntheticSessionId);
                    savePendingSyntheticOutbox(this.pendingSyntheticOutbox);
                    return;
                }
                const item = current[0];
                // Reuse the synthetic local id so a crash during migration is
                // idempotent against both the durable normal and synthetic queues.
                const queued = await this.sendMessage(relaySessionId, item.text, {
                    ...item.options,
                    localId: item.localId,
                    deferSend: true,
                });
                if (!queued || !this.isRuntimeContextCurrent(context)) return;
                const afterSend = this.pendingSyntheticOutbox.get(syntheticSessionId) ?? [];
                const remaining = afterSend.filter((entry) => entry !== item);
                if (remaining.length > 0) {
                    this.pendingSyntheticOutbox.set(syntheticSessionId, remaining);
                } else {
                    this.pendingSyntheticOutbox.delete(syntheticSessionId);
                }
                savePendingSyntheticOutbox(this.pendingSyntheticOutbox);
                // The normal encrypted outbox is durable and the synthetic
                // source is now durably removed, so network delivery may begin.
                this.getSendSync(relaySessionId).invalidate();
                this.maybeStartBackgroundSendWatchdog();
            }
        } finally {
            if (this.isRuntimeContextCurrent(context)) {
                this.flushingSyntheticOutbox.delete(syntheticSessionId);
            }
        }
    }

    async sendMessage(sessionId: string, text: string, options?: SendMessageOptions): Promise<boolean> {
        const context = this.captureRuntimeContext();
        if (!this.isRuntimeContextCurrent(context)) return false;

        // Get session data from storage
        let session = storage.getState().sessions[sessionId];
        if (!session) {
            await this.sessionsSync.awaitQueue();
            if (!this.isRuntimeContextCurrent(context)) return false;
            session = storage.getState().sessions[sessionId];
            if (!session) {
                console.error(`Session ${sessionId} not found in storage after sync`);
                Modal.alert(t('common.error'), t('appWide.messageFailed'));
                return false;
            }
        }

        if (!canControlSession(session.metadata)) {
            Modal.alert(t('common.error'), t('session.legacyHistoryOnly'));
            return false;
        }

        // Get encryption — may not be ready yet if sessions are still syncing.
        // Synthetic Pi rows intentionally have no relay encryption yet; queue
        // their sends locally until the background open call resolves a real
        // relay session id.
        let encryption = context.encryption.getSessionEncryption(sessionId);
        if (!encryption) {
            await this.sessionsSync.awaitQueue();
            if (!this.isRuntimeContextCurrent(context)) return false;
            encryption = context.encryption.getSessionEncryption(sessionId);
            if (!encryption && session.metadata?.piSynthetic) {
                return this.queueSyntheticMessage(sessionId, text, options);
            }
            if (!encryption) {
                console.error(`Session ${sessionId} not found after sync`);
                Modal.alert(t('common.error'), t('appWide.messageFailed'));
                return false;
            }
        }

        const settings = storage.getState().settings;
        const { displayText, attachments } = options ?? {};

        const flavor = session.metadata?.flavor;
        const attachmentPlan = getImageAttachmentSendPlan({
            flavor,
            text,
            attachmentCount: attachments?.length ?? 0,
        });
        const effectiveAttachments = attachmentPlan.shouldUseAttachments ? attachments : undefined;

        if (attachmentPlan.shouldShowUnsupportedAlert) {
            Modal.alert(
                t('imageUpload.notSupportedTitle'),
                t('imageUpload.notSupportedMessage'),
                [{ text: t('common.ok'), style: 'cancel' }],
            );
            if (!attachmentPlan.shouldSendText) {
                return false;
            }
        }

        // Prepare one durable outbox transaction. File events must never be
        // persisted without the text envelope that closes their Pi input batch:
        // after a crash, the next user command must not inherit stale images.
        const outboxBatch: OutboxMessage[] = [];
        const localMessageBatch: NormalizedMessage[] = [];

        if (effectiveAttachments && effectiveAttachments.length > 0) {
            const { uploaded, failed } = await this.uploadAttachmentsForSession(sessionId, effectiveAttachments, context);
            if (!this.isRuntimeContextCurrent(context)) return false;

            if (!isCompleteImageAttachmentUpload({
                requested: effectiveAttachments.length,
                uploaded: uploaded.length,
                failed,
            })) {
                Modal.alert(
                    t('imageUpload.uploadFailedTitle'),
                    t('imageUpload.uploadFailedMessage', { count: Math.max(failed, effectiveAttachments.length - uploaded.length) }),
                    [{ text: t('common.ok'), style: 'cancel' }],
                );
                return false;
            }

            if (uploaded.length > 0) {
                for (const att of uploaded) {
                    const fileRecord: RawRecord = {
                        role: 'session',
                        content: {
                            type: 'session',
                            data: {
                                id: randomUUID(),
                                time: Date.now(),
                                role: 'user',
                                ev: {
                                    t: 'file',
                                    ref: att.ref,
                                    name: att.name,
                                    size: att.size,
                                    mimeType: att.mimeType,
                                    // Include image metadata when we have dimensions; thumbhash is
                                    // optional. The native iOS picker can't generate a thumbhash
                                    // without Canvas, so requiring it here would reduce the chat
                                    // bubble to a compact filename row instead of an inline picture.
                                    // FileView only needs w/h to size the inline render — placeholder
                                    // is absent, but the real image is decrypted on mount.
                                    ...(att.width > 0 && att.height > 0
                                        ? {
                                            image: {
                                                width: att.width,
                                                height: att.height,
                                                ...(att.thumbhash ? { thumbhash: att.thumbhash } : {}),
                                            },
                                        }
                                        : {}),
                                },
                            },
                        },
                    };
                    const encryptedFileRecord = await encryption.encryptRawRecord(fileRecord);
                    if (!this.isRuntimeContextCurrent(context)) return false;
                    const fileLocalId = randomUUID();
                    const fileNormalized = normalizeRawMessage(fileLocalId, fileLocalId, Date.now(), fileRecord);
                    if (fileNormalized) {
                        localMessageBatch.push(fileNormalized);
                    }
                    outboxBatch.push({ localId: fileLocalId, content: encryptedFileRecord });
                }
            }
        }

        // Generate local ID
        const localId = options?.localId ?? randomUUID();

        const sentFrom = Platform.OS === 'android' ? 'android' : isRunningOnMac() ? 'mac' : 'ios';

        const expectsPiEcho = expectsRemotePiEcho(text);

        // Create user message content with metadata
        const content: RawRecord = {
            role: 'user',
            content: {
                type: 'text',
                text
            },
            meta: {
                sentFrom,
                appendSystemPrompt: systemPrompt,
                ...(displayText && { displayText }),
                remoteCommandLocalKey: localId,
                sendMobileContextToPi: settings.sendMobileContextToPi !== false,
                ...(expectsPiEcho ? { remoteCommandState: 'queued' as const } : {}),
            }
        };
        const encryptedRawRecord = await encryption.encryptRawRecord(content);
        if (!this.isRuntimeContextCurrent(context)) return false;

        // Add to messages - normalize the raw record
        const createdAt = Date.now();
        const normalizedMessage = normalizeRawMessage(localId, localId, createdAt, content);
        if (normalizedMessage) {
            localMessageBatch.push(normalizedMessage);
        }
        outboxBatch.push({ localId, content: encryptedRawRecord });

        if (!this.isRuntimeContextCurrent(context)) return false;
        let pending = this.pendingOutbox.get(sessionId);
        if (!pending) {
            pending = [];
            this.pendingOutbox.set(sessionId, pending);
        }
        pending.push(...outboxBatch);
        savePendingOutbox(this.pendingOutbox);
        this.enqueueMessages(sessionId, localMessageBatch);
        if (!options?.deferSend) {
            this.getSendSync(sessionId).invalidate();
            this.maybeStartBackgroundSendWatchdog();
        }
        return true;
    }

    /** Server sent us settings — merge any pending local changes on top, then apply as one update. */
    private applyServerSettings = (serverSettings: Settings, version: number) => {
        const merged = Object.keys(this.pendingSettings).length > 0
            ? applySettings(serverSettings, this.pendingSettings)
            : serverSettings;
        storage.getState().applySettings(merged, version);
    }

    applySettings = (delta: Partial<Settings>) => {
        storage.getState().applySettingsLocal(delta);

        // Save pending settings
        this.pendingSettings = { ...this.pendingSettings, ...delta };
        savePendingSettings(this.pendingSettings);

        // Invalidate settings sync
        this.settingsSync.invalidate();
    }

    //
    // Private
    //

    private persistCanonicalPiSessionNames = async (
        context: SyncRuntimeContext,
        relaySessions: Array<Omit<Session, 'presence'> & { presence?: Session['presence'] }>,
        mergedSessions: Array<Omit<Session, 'presence'> & { presence?: Session['presence'] }>,
    ): Promise<void> => {
        if (!this.isRuntimeContextCurrent(context)) return;
        const candidates = findPiSessionNameBackfills(relaySessions, mergedSessions);
        if (candidates.length === 0) return;
        const result = await persistPiSessionNameBackfills(candidates, {
            encryptMetadata: async (sessionId, metadata) => {
                if (!this.isRuntimeContextCurrent(context)) {
                    throw new Error('Pi session name persistence was superseded');
                }
                const sessionEncryption = context.encryption.getSessionEncryption(sessionId);
                if (!sessionEncryption) throw new Error('Session encryption is unavailable');
                const encrypted = await sessionEncryption.encryptMetadata(metadata);
                if (!this.isRuntimeContextCurrent(context)) {
                    throw new Error('Pi session name persistence was superseded');
                }
                return encrypted;
            },
            decryptMetadata: async (sessionId, version, ciphertext) => {
                if (!this.isRuntimeContextCurrent(context)) return null;
                const sessionEncryption = context.encryption.getSessionEncryption(sessionId);
                if (!sessionEncryption) return null;
                const metadata = await sessionEncryption.decryptMetadata(version, ciphertext);
                return this.isRuntimeContextCurrent(context) ? metadata : null;
            },
            updateMetadata: async ({ sessionId, metadata, expectedVersion }) => {
                if (!this.isRuntimeContextCurrent(context)) {
                    return { result: 'error' };
                }
                const response = await apiSocket.emitWithAck<{
                    result: 'success' | 'version-mismatch' | 'error';
                    version?: number;
                    metadata?: string;
                    message?: string;
                }>('update-metadata', {
                    sid: sessionId,
                    metadata,
                    expectedVersion,
                }, 10_000);
                if (!this.isRuntimeContextCurrent(context)) {
                    return { result: 'error' };
                }
                if (
                    (response.result === 'success' || response.result === 'version-mismatch')
                    && typeof response.version === 'number'
                    && typeof response.metadata === 'string'
                ) {
                    return {
                        result: response.result,
                        version: response.version,
                        metadata: response.metadata,
                    };
                }
                return { result: 'error', message: response.message };
            },
        });
        if (result.failed > 0 && this.isRuntimeContextCurrent(context)) {
            console.warn(`Failed to persist ${result.failed}/${candidates.length} canonical Pi session name(s)`);
        }
    };

    private startCanonicalPiSessionNamePersistence = (): void => {
        if (this.piSessionNameBackfillInFlight || !this.piSessionNameBackfillPending) return;
        const task = (async () => {
            while (this.piSessionNameBackfillPending) {
                const job = this.piSessionNameBackfillPending;
                this.piSessionNameBackfillPending = null;
                if (!this.isRuntimeContextCurrent(job.context)) continue;
                await this.persistCanonicalPiSessionNames(
                    job.context,
                    job.relaySessions,
                    job.mergedSessions,
                );
            }
        })().catch((error) => {
            console.warn('Failed to persist canonical Pi session names', error);
        });
        this.piSessionNameBackfillInFlight = task;
        void task.finally(() => {
            if (this.piSessionNameBackfillInFlight === task) {
                this.piSessionNameBackfillInFlight = null;
            }
            if (this.piSessionNameBackfillPending) {
                this.startCanonicalPiSessionNamePersistence();
            }
        });
    };

    private queueCanonicalPiSessionNamePersistence = (
        relaySessions: Array<Omit<Session, 'presence'> & { presence?: Session['presence'] }>,
        mergedSessions: Array<Omit<Session, 'presence'> & { presence?: Session['presence'] }>,
    ): void => {
        const context = this.captureRuntimeContext();
        if (!this.isRuntimeContextCurrent(context)
            || findPiSessionNameBackfills(relaySessions, mergedSessions).length === 0) return;
        this.piSessionNameBackfillPending = { context, relaySessions, mergedSessions };
        this.startCanonicalPiSessionNamePersistence();
    };

    private piSessionTombstoneScope = (): string => `${getServerUrl()}#${this.serverID}`;

    private restorePiSessionTombstonesForAccount = (): void => {
        const scope = this.piSessionTombstoneScope();
        this.sessionListSnapshot.setDeletedSessions(
            this.piSessionTombstones.filter((tombstone) => tombstone.serverId === scope),
        );
    }

    private persistPiSessionTombstone = (
        identity: {
            relaySessionId: string;
            relaySessionTag?: string;
            machineId?: string;
            piSessionId?: string;
        },
        serverId = this.piSessionTombstoneScope(),
    ): void => {
        if (!identity.relaySessionTag && (!identity.machineId || !identity.piSessionId)) return;
        this.piSessionTombstones = addPiSessionTombstone(this.piSessionTombstones, {
            serverId,
            relaySessionId: identity.relaySessionId,
            relaySessionTag: identity.relaySessionTag,
            machineId: identity.machineId,
            piSessionId: identity.piSessionId,
            deletedAt: Date.now(),
        });
        savePiSessionTombstones(this.piSessionTombstones);
    };

    private resetPiSessionRetryBudget = (): void => {
        if (this.piSessionRefreshTimer) clearTimeout(this.piSessionRefreshTimer);
        this.piSessionRefreshTimer = null;
        this.piSessionTransportRetryAttempt = 0;
        this.piSessionIndexRetryAttempt = 0;
        this.piSessionTransportRetryMachineIds.clear();
        this.piSessionIndexRetryMachineIds.clear();
    }

    private requestPiSessionFullRefresh = (): void => {
        this.resetPiSessionRetryBudget();
        this.sessionListSnapshot.cancelPendingMachineRefreshes();
        this.piSessionFullRefreshEpoch += 1;
        if (this.piSessionRefreshGenerationInFlight === this.sessionSnapshotGeneration) {
            this.piSessionRefreshPending = true;
        }
    };

    private schedulePiSessionRefresh = (delayMs = 150): void => {
        if (!this.syncStarted) return;
        if (this.piSessionRefreshGenerationInFlight === this.sessionSnapshotGeneration) {
            this.piSessionRefreshPending = true;
            return;
        }
        if (this.piSessionRefreshTimer) return;
        this.piSessionRefreshTimer = setTimeout(() => {
            this.piSessionRefreshTimer = null;
            if (this.syncStarted) this.piSessionsSync.invalidate();
        }, delayMs);
    }

    private fetchMachinePiSessions = async (): Promise<void> => {
        const generation = this.sessionSnapshotGeneration;
        await this.relayInitialAttempt;
        if (generation !== this.sessionSnapshotGeneration || !this.syncStarted) return;
        if (this.piSessionRefreshTimer) clearTimeout(this.piSessionRefreshTimer);
        this.piSessionRefreshTimer = null;
        this.piSessionRefreshPending = false;

        const refreshEpoch = this.piSessionFullRefreshEpoch;
        const hasRequestedFullRefresh = this.piSessionHandledFullRefreshEpoch < refreshEpoch;
        const retryMachineIds = new Set([
            ...this.piSessionTransportRetryMachineIds,
            ...this.piSessionIndexRetryMachineIds,
        ]);
        const retryOnly = !hasRequestedFullRefresh && retryMachineIds.size > 0;
        const machines = Object.values(storage.getState().machines)
            .filter(shouldFetchPiSessionDiscovery)
            .filter(machine => !retryOnly || retryMachineIds.has(machine.id));
        const refreshId = this.sessionListSnapshot.beginMachineRefresh(machines, !retryOnly);
        const failures: string[] = [];
        const failedMachineIds = new Set<string>();
        const refreshingMachineIds = new Set<string>();
        const isRefreshCurrent = () => (
            generation === this.sessionSnapshotGeneration
            && refreshEpoch === this.piSessionFullRefreshEpoch
            && this.syncStarted
        );

        this.piSessionRefreshGenerationInFlight = generation;
        try {
            await fetchPiSessionPages({
                machines,
                requestPage: async ({ machine, limit, cursor }) => {
                    if (!isRefreshCurrent()) throw new ObsoletePiSessionRefreshError();
                    const response = await apiSocket.machineRPC<
                        { type: 'success'; sessions: PiMachineSessionRecord[]; nextCursor?: string; total?: number; refreshing?: boolean } | { type: 'error'; errorMessage: string },
                        { scope: 'machine'; limit: number; cursor?: string }
                    >(
                        machine.id,
                        'list-pi-sessions',
                        { scope: 'machine', limit, cursor },
                        parseMachineRpcResult('list-pi-sessions', listPiSessionsResultSchema),
                        { timeoutMs: 15_000 },
                    );
                    if (!isRefreshCurrent()) throw new ObsoletePiSessionRefreshError();
                    if (response.type !== 'success') throw new Error(response.errorMessage);
                    return response;
                },
                onPage: ({ machine, sessions, complete, truncated, total }) => {
                    if (!isRefreshCurrent()) return;
                    this.sessionListSnapshot.applyMachinePage(refreshId, machine.id, sessions, complete);
                    if (truncated) {
                        this.sessionListSnapshot.failMachineRefresh(refreshId, machine.id);
                        console.warn(`Pi session discovery for machine ${machine.id} truncated at 5000/${total ?? 'unknown'} records`);
                    }
                },
                onError: ({ machine, error }) => {
                    this.sessionListSnapshot.failMachineRefresh(refreshId, machine.id);
                    if (error instanceof ObsoletePiSessionRefreshError || !isRefreshCurrent()) return;
                    if (error instanceof PiSessionIndexRefreshingError) {
                        refreshingMachineIds.add(machine.id);
                        return;
                    }
                    failedMachineIds.add(machine.id);
                    failures.push(`${machine.id}: ${error.message}`);
                    console.warn(`Failed to list Pi sessions for machine ${machine.id}: ${error.message}`);
                },
            });
        } finally {
            if (this.piSessionRefreshGenerationInFlight === generation) {
                this.piSessionRefreshGenerationInFlight = null;
            }
        }
        if (generation !== this.sessionSnapshotGeneration || !this.syncStarted) return;
        if (refreshEpoch !== this.piSessionFullRefreshEpoch) {
            this.piSessionRefreshPending = false;
            this.schedulePiSessionRefresh();
            return;
        }
        if (hasRequestedFullRefresh) {
            this.piSessionHandledFullRefreshEpoch = refreshEpoch;
        }
        const retryDelays: number[] = [];
        this.piSessionTransportRetryMachineIds = failedMachineIds;
        if (failedMachineIds.size > 0) {
            const delay = resolvePiSessionRetryDelay(
                this.piSessionTransportRetryAttempt,
                Sync.PI_SESSION_TRANSPORT_MAX_RETRIES,
            );
            this.piSessionTransportRetryAttempt += 1;
            if (delay === undefined) {
                this.piSessionTransportRetryMachineIds.clear();
                console.warn(`Pi session discovery paused after ${failures.length} machine failure(s); waiting for a lifecycle refresh`);
            } else {
                retryDelays.push(delay);
            }
        } else {
            this.piSessionTransportRetryAttempt = 0;
        }

        // Warming nodes retain their independent, longer retry budget even if
        // another node exhausts transport retries in the same refresh cycle.
        this.piSessionIndexRetryMachineIds = refreshingMachineIds;
        if (refreshingMachineIds.size > 0) {
            const delay = resolvePiSessionRetryDelay(
                this.piSessionIndexRetryAttempt,
                Sync.PI_SESSION_INDEX_MAX_RETRIES,
            );
            this.piSessionIndexRetryAttempt += 1;
            if (delay === undefined) {
                this.piSessionIndexRetryMachineIds.clear();
                console.warn('Pi session index refresh polling paused; waiting for a lifecycle refresh');
            } else {
                retryDelays.push(delay);
            }
        } else {
            this.piSessionIndexRetryAttempt = 0;
        }

        if (this.piSessionRefreshPending) {
            this.piSessionRefreshPending = false;
            this.schedulePiSessionRefresh();
        } else if (retryDelays.length > 0) {
            this.schedulePiSessionRefresh(Math.min(...retryDelays));
        }
    }

    private refreshSessionSnapshot = async (): Promise<void> => {
        const generation = this.sessionSnapshotGeneration;
        const resolveInitialAttempt = this.resolveRelayInitialAttempt;
        try {
            await this.fetchSessions();
        } finally {
            if (generation === this.sessionSnapshotGeneration
                && this.resolveRelayInitialAttempt === resolveInitialAttempt) {
                this.resolveRelayInitialAttempt = null;
            }
            resolveInitialAttempt?.();
        }
    }

    private fetchSessions = async () => {
        if (!this.credentials) return;
        const credentials = this.credentials;
        const encryption = this.encryption;
        const generation = this.sessionSnapshotGeneration;
        const requestStartIds = this.sessionListSnapshot.captureRelaySessionIds();

        const API_ENDPOINT = getServerUrl();
        const data = await fetchJsonWithTimeout({
            url: `${API_ENDPOINT}/v1/sessions`,
            timeoutMs: SESSION_LIST_REQUEST_TIMEOUT_MS,
            label: SESSION_LIST_REQUEST_LABEL,
            init: {
                headers: {
                    'Authorization': `Bearer ${credentials.token}`,
                    'Content-Type': 'application/json',
                    'X-Lyntty-Client': getLynttyClientId(),
                },
            },
        });
        if (generation !== this.sessionSnapshotGeneration || encryption !== this.encryption) return;
        if (!data || typeof data !== 'object' || !Array.isArray((data as { sessions?: unknown }).sessions)) {
            throw new Error('Session list request returned an invalid response');
        }
        const sessions = (data as { sessions: Array<{
            id: string;
            tag: string;
            seq: number;
            metadata: string;
            metadataVersion: number;
            agentState: string | null;
            agentStateVersion: number;
            dataEncryptionKey: string | null;
            active: boolean;
            activeAt: number;
            createdAt: number;
            updatedAt: number;
            lastMessage: ApiMessage | null;
        }> }).sessions;

        // Initialize all session encryptions first
        const sessionKeys = new Map<string, Uint8Array | null>();
        for (const session of sessions) {
            if (session.dataEncryptionKey) {
                let decrypted = await encryption.decryptEncryptionKey(session.dataEncryptionKey);
                if (!decrypted) {
                    console.error(`Failed to decrypt data encryption key for session ${session.id}`);
                    continue;
                }
                sessionKeys.set(session.id, decrypted);
            } else {
                sessionKeys.set(session.id, null);
            }
        }
        await encryption.initializeSessions(sessionKeys);

        // Decrypt sessions
        let decryptedSessions: (Omit<Session, 'presence'> & { presence?: "online" | number })[] = [];
        for (const session of sessions) {
            // Get session encryption (should always exist after initialization)
            const sessionEncryption = encryption.getSessionEncryption(session.id);
            if (!sessionEncryption) {
                console.error(`Session encryption not found for ${session.id} - this should never happen`);
                continue;
            }

            // Decrypt metadata using session-specific encryption
            let metadata = await sessionEncryption.decryptMetadata(session.metadataVersion, session.metadata);

            // Decrypt agent state using session-specific encryption
            let agentState = await sessionEncryption.decryptAgentState(session.agentStateVersion, session.agentState);

            // Put it all together
            const processedSession = {
                ...session,
                thinking: false,
                thinkingAt: 0,
                metadata,
                agentState
            };
            decryptedSessions.push(processedSession);
        }

        // A logout/server reset can finish while decryption is in flight. Never
        // let that obsolete account snapshot write into the new sync generation.
        if (generation !== this.sessionSnapshotGeneration || encryption !== this.encryption) return;
        // Keep the raw Relay view as the optimistic-concurrency baseline for
        // canonical Pi title persistence. Progressive discovery snapshots merge
        // synchronously and queue only the newest resulting backfill work.
        this.piSessionNameBackfillRelaySessions = decryptedSessions;
        // Publish the relay snapshot immediately. Existing Pi discovery rows stay
        // present until their own progressive refresh finishes.
        this.sessionListSnapshot.commitRelaySnapshot(decryptedSessions, requestStartIds);
        // Canonical relay sessions may appear after startup. Reconcile after
        // every relay snapshot so their synthetic sends cannot be stranded.
        this.reconcileSyntheticOutbox();
        log.log(`📥 fetchSessions completed - processed ${decryptedSessions.length} relay sessions`);

    }

    public refreshMachines = async () => {
        this.requestPiSessionFullRefresh();
        return this.machinesSync.invalidateAndAwait();
    }

    public refreshSessions = async () => {
        this.requestPiSessionFullRefresh();
        await this.sessionsSync.invalidateAndAwait();
        return this.piSessionsSync.invalidateAndAwait();
    }

    public getCredentials() {
        return this.credentials;
    }

    private fetchMachines = async () => {
        if (!this.credentials) return;
        const credentials = this.credentials;
        const encryption = this.encryption;
        const generation = this.sessionSnapshotGeneration;
        const requestStartMachines = new Map(
            Object.values(storage.getState().machines).map((machine) => [machine.id, machine]),
        );

        console.log('📊 Sync: Fetching machines...');
        const API_ENDPOINT = getServerUrl();
        const data = await fetchJsonWithTimeout({
            url: `${API_ENDPOINT}/v1/machines`,
            timeoutMs: MACHINE_LIST_REQUEST_TIMEOUT_MS,
            label: MACHINE_LIST_REQUEST_LABEL,
            init: {
                headers: {
                    'Authorization': `Bearer ${credentials.token}`,
                    'Content-Type': 'application/json',
                    'X-Lyntty-Client': getLynttyClientId(),
                },
            },
        });
        if (generation !== this.sessionSnapshotGeneration
            || credentials !== this.credentials
            || encryption !== this.encryption) return;
        if (!Array.isArray(data)) throw new Error('Machine list request returned an invalid response');
        console.log(`📊 Sync: Fetched ${data.length} machines from server`);
        const machines = data as Array<{
            id: string;
            metadata: string;
            metadataVersion: number;
            daemonState?: string | null;
            daemonStateVersion?: number;
            dataEncryptionKey?: string | null; // Add support for per-machine encryption keys
            seq: number;
            active: boolean;
            activeAt: number;  // Changed from lastActiveAt
            createdAt: number;
            updatedAt: number;
        }>;

        // First, collect and decrypt encryption keys for all machines.
        //
        // Resilience: a single machine whose data key cannot be decrypted
        // (legacy/foreign key format, contentKeyPair mismatch, malformed
        // base64) must NOT abort the whole sync. Previously a throw here
        // rejected fetchMachines entirely — backoff() only console.warn's and
        // retries forever, so applyMachines was never reached and EVERY
        // machine silently vanished from the store (empty /new, no
        // console.error). On failure we fall back to a null key: the machine
        // still gets a (legacy) encryptor and stays visible/selectable, just
        // with undecryptable metadata.
        const machineKeysMap = new Map<string, Uint8Array | null>();
        for (const machine of machines) {
            if (machine.dataEncryptionKey) {
                let decryptedKey: Uint8Array | null = null;
                try {
                    decryptedKey = await encryption.decryptEncryptionKey(machine.dataEncryptionKey);
                } catch (error) {
                    console.error(`Failed to decrypt data encryption key for machine ${machine.id}:`, error);
                }
                if (decryptedKey) {
                    machineKeysMap.set(machine.id, decryptedKey);
                } else {
                    console.error(`Failed to decrypt data encryption key for machine ${machine.id} - keeping machine with undecryptable metadata`);
                    machineKeysMap.set(machine.id, null);
                }
            } else {
                machineKeysMap.set(machine.id, null);
            }
        }

        // Initialize machine encryptions. Guard so an init failure cannot
        // reject the whole sync and wipe the machine list.
        try {
            await encryption.initializeMachines(machineKeysMap);
        } catch (error) {
            console.error('Failed to initialize machine encryptions:', error);
        }

        // Process all machines first, then update state once. Every machine is
        // pushed exactly once — decryption failures degrade to null metadata
        // instead of dropping the machine, so a machine never disappears from
        // the picker just because its metadata could not be read.
        const decryptedMachines: Machine[] = [];

        for (const machine of machines) {
            try {
                const machineEncryption = encryption.getMachineEncryption(machine.id);

                // Use machine-specific encryption (which handles fallback internally)
                const metadata = machineEncryption && machine.metadata
                    ? await machineEncryption.decryptMetadata(machine.metadataVersion, machine.metadata)
                    : null;

                const daemonState = machineEncryption && machine.daemonState
                    ? await machineEncryption.decryptDaemonState(machine.daemonStateVersion || 0, machine.daemonState)
                    : null;

                decryptedMachines.push({
                    id: machine.id,
                    seq: machine.seq,
                    createdAt: machine.createdAt,
                    updatedAt: machine.updatedAt,
                    active: machine.active,
                    activeAt: machine.activeAt,
                    metadata,
                    metadataVersion: machine.metadataVersion,
                    daemonState,
                    daemonStateVersion: machine.daemonStateVersion || 0
                });
            } catch (error) {
                console.error(`Failed to decrypt machine ${machine.id}:`, error);
                // Still add the machine with null metadata so it stays visible.
                decryptedMachines.push({
                    id: machine.id,
                    seq: machine.seq,
                    createdAt: machine.createdAt,
                    updatedAt: machine.updatedAt,
                    active: machine.active,
                    activeAt: machine.activeAt,
                    metadata: null,
                    metadataVersion: machine.metadataVersion,
                    daemonState: null,
                    daemonStateVersion: 0
                });
            }
        }

        // A logout/server switch or a newer account generation can complete
        // while keys/metadata are being decrypted. Never commit that late work.
        if (generation !== this.sessionSnapshotGeneration
            || credentials !== this.credentials
            || encryption !== this.encryption) return;
        const mergedMachines = mergeAuthoritativeMachineSnapshot(
            decryptedMachines,
            Object.values(storage.getState().machines),
            requestStartMachines,
        );
        const retainedMachineIds = new Set(mergedMachines.map((machine) => machine.id));
        for (const machineId of this.machineDataKeys.keys()) {
            if (!retainedMachineIds.has(machineId)) this.machineDataKeys.delete(machineId);
        }
        for (const [machineId, key] of machineKeysMap) {
            if (key) this.machineDataKeys.set(machineId, key);
        }
        // A validated HTTP 200 empty list is authoritative (for example after
        // the account's last node is deleted) and must clear stale node rows.
        storage.getState().applyMachines(mergedMachines, true);
        this.sessionListSnapshot.retainMachines(retainedMachineIds);
        this.requestPiSessionFullRefresh();
        this.piSessionsSync.invalidate();
        log.log(`🖥️ fetchMachines completed - processed ${mergedMachines.length} machines`);
    }

    private requestSettingsJson = async <T>(
        url: string,
        init: RequestInit,
        context: SyncRuntimeContext,
        credentials: AuthCredentials,
    ): Promise<{ ok: boolean; status: number; data: T } | undefined> => {
        if (!this.isSettingsContextCurrent(context, credentials)) return undefined;
        const controller = new AbortController();
        this.settingsAbortControllers.add(controller);
        try {
            const response = await fetch(url, { ...init, signal: controller.signal });
            if (!this.isSettingsContextCurrent(context, credentials)) return undefined;
            const data = await response.json() as T;
            if (!this.isSettingsContextCurrent(context, credentials)) return undefined;
            return { ok: response.ok, status: response.status, data };
        } catch (error) {
            if (!this.isSettingsContextCurrent(context, credentials)) return undefined;
            throw error;
        } finally {
            this.settingsAbortControllers.delete(controller);
        }
    };

    private syncSettings = async (
        context: SyncRuntimeContext,
        credentials: AuthCredentials,
    ) => {
        if (!this.isSettingsContextCurrent(context, credentials)) return;

        const API_ENDPOINT = getServerUrl();
        const headers = {
            'Authorization': `Bearer ${credentials.token}`,
            'Content-Type': 'application/json',
            'X-Lyntty-Client': getLynttyClientId(),
        };
        const maxRetries = 3;
        let retryCount = 0;

        if (Object.keys(this.pendingSettings).length > 0) {
            while (retryCount < maxRetries) {
                if (!this.isSettingsContextCurrent(context, credentials)) return;
                const sentPending = { ...this.pendingSettings };
                const version = storage.getState().settingsVersion;
                const settings = applySettings(storage.getState().settings, this.pendingSettings);
                const encryptedSettings = await context.encryption.encryptRaw(settingsToSyncPayload(settings));
                if (!this.isSettingsContextCurrent(context, credentials)) return;
                const response = await this.requestSettingsJson<{
                    success: false;
                    error: string;
                    currentVersion: number;
                    currentSettings: string | null;
                } | {
                    success: true;
                }>(`${API_ENDPOINT}/v1/account/settings`, {
                    method: 'POST',
                    body: JSON.stringify({
                        settings: encryptedSettings,
                        expectedVersion: version ?? 0,
                    }),
                    headers,
                }, context, credentials);
                if (!response) return;
                const data = response.data;
                if (data.success) {
                    const newPending: Partial<Settings> = {};
                    for (const key of Object.keys(this.pendingSettings) as (keyof Settings)[]) {
                        if (!(key in sentPending) || this.pendingSettings[key] !== sentPending[key]) {
                            (newPending as any)[key] = this.pendingSettings[key];
                        }
                    }
                    if (!this.isSettingsContextCurrent(context, credentials)) return;
                    this.pendingSettings = newPending;
                    savePendingSettings(this.pendingSettings);
                    break;
                }
                if (data.error !== 'version-mismatch') {
                    throw new Error(`Failed to sync settings: ${data.error}`);
                }
                const decryptedSettings = data.currentSettings
                    ? await context.encryption.decryptRaw(data.currentSettings)
                    : null;
                if (!this.isSettingsContextCurrent(context, credentials)) return;
                const serverSettings = decryptedSettings
                    ? settingsParse(decryptedSettings)
                    : { ...settingsDefaults };
                const mergedSettings = applySettings(serverSettings, this.pendingSettings);
                this.applyServerSettings(mergedSettings, data.currentVersion);
                console.log('settings version-mismatch, retrying', {
                    serverVersion: data.currentVersion,
                    retry: retryCount + 1,
                    pendingKeys: Object.keys(this.pendingSettings),
                });
                retryCount++;
            }
        }

        if (retryCount >= maxRetries) {
            throw new Error(`Settings sync failed after ${maxRetries} retries due to version conflicts`);
        }

        const response = await this.requestSettingsJson<{
            settings: string | null;
            settingsVersion: number;
        }>(`${API_ENDPOINT}/v1/account/settings`, { headers }, context, credentials);
        if (!response) return;
        if (!response.ok) throw new Error(`Failed to fetch settings: ${response.status}`);
        const parsedSettings = response.data.settings
            ? settingsParse(await context.encryption.decryptRaw(response.data.settings))
            : { ...settingsDefaults };
        if (!this.isSettingsContextCurrent(context, credentials)) return;

        console.log('settings', JSON.stringify({
            settings: parsedSettings,
            version: response.data.settingsVersion,
        }));
        this.applyServerSettings(parsedSettings, response.data.settingsVersion);
    }

    private fetchNativeUpdate = async () => {
        try {
            if (Platform.OS !== 'android') return;

            const serverUrl = getServerUrl();

            // Get platform and app identifiers
            const platform = Platform.OS;
            const version = Application.nativeApplicationVersion || Constants.expoConfig?.version;
            const appId = Application.applicationId || Constants.expoConfig?.android?.package;
            if (!version || !appId) return;
            const appEnv = Constants.expoConfig?.extra?.app?.appEnv;
            const releaseChannel = resolveAndroidUpdateChannel(appEnv, appId);
            if (!releaseChannel) return;
            const parsedBuildVersion = Number(Application.nativeBuildVersion);
            const versionCode = Platform.OS === 'android' && Number.isFinite(parsedBuildVersion)
                ? parsedBuildVersion
                : undefined;

            const response = await fetch(`${serverUrl}/v1/version`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Lyntty-Client': getLynttyClientId(),
                },
                body: JSON.stringify({
                    platform,
                    version,
                    app_id: appId,
                    version_code: versionCode,
                    release_channel: releaseChannel,
                }),
            });

            if (!response.ok) {
                console.log(`[fetchNativeUpdate] Request failed: ${response.status}`);
                return;
            }

            const data = await response.json();
            console.log('[fetchNativeUpdate] Data:', data);

            // Apply update status to storage
            if (data.update_required && data.update_url && data.release_channel === releaseChannel) {
                storage.getState().applyNativeUpdateStatus({
                    available: true,
                    updateUrl: data.update_url,
                    versionName: data.version_name,
                    versionCode: data.version_code,
                    sha256: data.sha256,
                    notes: data.notes,
                });
            } else {
                storage.getState().applyNativeUpdateStatus({
                    available: false
                });
            }
        } catch (error) {
            console.log('[fetchNativeUpdate] Error:', error);
            storage.getState().applyNativeUpdateStatus(null);
        }
    }

    private flushOutbox = async (sessionId: string, context: SyncRuntimeContext) => {
        if (!this.isRuntimeContextCurrent(context)) return;
        const pending = this.pendingOutbox.get(sessionId);
        if (!pending || pending.length === 0) {
            if (!this.hasPendingOutboxMessages()) {
                this.clearBackgroundSendWatchdog();
                await this.cancelBackgroundSendTimeoutNotification();
                if (!this.isRuntimeContextCurrent(context)) return;
                this.backgroundSendStartedAt = null;
            }
            return;
        }

        const batch = pending.slice();
        const controller = new AbortController();
        this.sendAbortControllers.set(sessionId, controller);
        try {
            const response = await apiSocket.request(`/v3/sessions/${sessionId}/messages`, {
                method: 'POST',
                body: JSON.stringify({
                    messages: batch.map((message) => ({
                        localId: message.localId,
                        content: message.content
                    }))
                }),
                headers: {
                    'Content-Type': 'application/json'
                },
                signal: controller.signal
            });
            if (!response.ok) {
                throw new Error(`Failed to send messages for ${sessionId}: ${response.status}`);
            }

            const data = await response.json() as V3PostSessionMessagesResponse;
            if (!this.isRuntimeContextCurrent(context)) return;
            pending.splice(0, batch.length);
            if (pending.length === 0) this.pendingOutbox.delete(sessionId);
            savePendingOutbox(this.pendingOutbox);
            if (Array.isArray(data.messages) && data.messages.length > 0) {
                const currentLastSeq = this.sessionLastSeq.get(sessionId) ?? 0;
                let maxSeq = currentLastSeq;
                for (const message of data.messages) {
                    if (message.seq > maxSeq) {
                        maxSeq = message.seq;
                    }
                }
                this.sessionLastSeq.set(sessionId, maxSeq);
            }
        } catch (error) {
            if (!this.isRuntimeContextCurrent(context)) return;
            this.maybeStartBackgroundSendWatchdog();
            throw error;
        } finally {
            if (this.sendAbortControllers.get(sessionId) === controller) {
                this.sendAbortControllers.delete(sessionId);
            }
        }

        if (!this.isRuntimeContextCurrent(context)) return;
        if (pending.length === 0) {
            this.pendingOutbox.delete(sessionId);
        }
        if (!this.hasPendingOutboxMessages()) {
            this.clearBackgroundSendWatchdog();
            await this.cancelBackgroundSendTimeoutNotification();
            if (!this.isRuntimeContextCurrent(context)) return;
            this.backgroundSendStartedAt = null;
        } else if (this.appState !== 'active') {
            this.maybeStartBackgroundSendWatchdog();
        }
    }

    private requestRuntimeJson = async <T>(
        path: string,
        context: SyncRuntimeContext,
        failureMessage: (status: number) => string,
    ): Promise<T | undefined> => {
        if (!this.isRuntimeContextCurrent(context)) return undefined;
        const controller = new AbortController();
        this.readAbortControllers.add(controller);
        try {
            const response = await apiSocket.request(path, { signal: controller.signal });
            if (!this.isRuntimeContextCurrent(context)) return undefined;
            if (!response.ok) throw new Error(failureMessage(response.status));
            const data = await response.json() as T;
            if (!this.isRuntimeContextCurrent(context)) return undefined;
            return data;
        } catch (error) {
            if (!this.isRuntimeContextCurrent(context)) return undefined;
            throw error;
        } finally {
            this.readAbortControllers.delete(controller);
        }
    };

    private fetchMessages = async (sessionId: string, context: SyncRuntimeContext) => {
        if (!this.isRuntimeContextCurrent(context)) return;
        log.log(`💬 fetchMessages starting for session ${sessionId} - acquiring lock`);
        const lock = this.getSessionMessageLock(sessionId);
        let shouldLoadInitialPiHistory = false;
        await lock.inLock(async () => {
            if (!this.isRuntimeContextCurrent(context)) return;
            const encryption = context.encryption.getSessionEncryption(sessionId);
            if (!encryption) {
                log.log(`💬 fetchMessages: Session encryption not ready for ${sessionId}, will retry`);
                throw new Error(`Session encryption not ready for ${sessionId}`);
            }

            const knownLastSeq = this.sessionLastSeq.get(sessionId);
            const isInitialLoad = knownLastSeq === undefined;
            if (isInitialLoad) {
                // Initial load. Pull only the most recent page so the user can
                // start chatting immediately. Older history streams in lazily
                // through loadOlderMessages() when the user scrolls up or when
                // an empty Pi history session needs its first visible tail page.
                //
                // Previously this method walked forward from seq=0 until every
                // page had been fetched and decrypted, which blocked the chat
                // from displaying anything for sessions with thousands of
                // messages. The user's reported pain point was "opening a long
                // session feels frozen" — this is the fix.
                await this.fetchInitialLatestPage(sessionId, encryption, context);
            } else {
                // Forward incremental sync. Used after reconnect, invalidate,
                // or any subsequent visit. Only pulls messages newer than what
                // we already have, so it's bounded and fast in normal use.
                await this.fetchForwardSince(sessionId, encryption, knownLastSeq, context);
            }

            if (!this.isRuntimeContextCurrent(context)) return;
            storage.getState().applyMessagesLoaded(sessionId);
            log.log(`💬 fetchMessages completed for session ${sessionId}`);

            const sessionMessages = storage.getState().sessionMessages[sessionId];
            const session = storage.getState().sessions[sessionId];
            shouldLoadInitialPiHistory = isInitialLoad
                && session?.metadata?.piHistoryHasMore === true
                && (sessionMessages?.messages.length ?? 0) === 0;

            // Older pages load on demand when the user scrolls upward. Do not
            // background-drain long Pi/relay histories; that keeps session open
            // fast and avoids APK freezes on large timelines.
        });
        if (shouldLoadInitialPiHistory && this.isRuntimeContextCurrent(context)) {
            void this.loadOlderMessages(sessionId).catch(() => undefined);
        }
    }

    private fetchInitialLatestPage = async (
        sessionId: string,
        encryption: ReturnType<Encryption['getSessionEncryption']> & {},
        context: SyncRuntimeContext,
    ) => {
        const data = await this.requestRuntimeJson<V3GetSessionMessagesResponse>(
            `/v3/sessions/${sessionId}/messages?before_seq=${SEQ_BACKWARD_INITIAL_SENTINEL}&limit=100`,
            context,
            (status) => `Failed to fetch initial page for ${sessionId}: ${status}`,
        );
        if (!data || !this.isRuntimeContextCurrent(context)) return;
        const messages = Array.isArray(data.messages) ? data.messages : [];

        await this.applyFetchedMessages(sessionId, encryption, messages, context);
        if (!this.isRuntimeContextCurrent(context)) return;

        // Anchor both ends so future incremental forward sync resumes from
        // maxSeq, and loadOlderMessages can page backward from minSeq.
        let maxSeq = 0;
        let minSeq = Number.POSITIVE_INFINITY;
        for (const message of messages) {
            if (message.seq > maxSeq) maxSeq = message.seq;
            if (message.seq < minSeq) minSeq = message.seq;
        }
        this.sessionLastSeq.set(sessionId, maxSeq);
        if (messages.length > 0) {
            this.sessionOldestSeq.set(sessionId, minSeq);
        }
        const session = storage.getState().sessions[sessionId];
        storage.getState().applyOlderMessagesPagination(sessionId, {
            hasMore: (!!data.hasMore && messages.length > 0) || session?.metadata?.piHistoryHasMore === true
        });
    }

    private fetchForwardSince = async (
        sessionId: string,
        encryption: ReturnType<Encryption['getSessionEncryption']> & {},
        fromSeq: number,
        context: SyncRuntimeContext,
    ) => {
        let afterSeq = fromSeq;
        while (true) {
            const data = await this.requestRuntimeJson<V3GetSessionMessagesResponse>(
                `/v3/sessions/${sessionId}/messages?after_seq=${afterSeq}&limit=100`,
                context,
                (status) => `Failed to forward-sync ${sessionId}: ${status}`,
            );
            if (!data || !this.isRuntimeContextCurrent(context)) return;
            const messages = Array.isArray(data.messages) ? data.messages : [];

            await this.applyFetchedMessages(sessionId, encryption, messages, context);
            if (!this.isRuntimeContextCurrent(context)) return;

            let maxSeq = afterSeq;
            for (const message of messages) {
                if (message.seq > maxSeq) maxSeq = message.seq;
            }
            this.sessionLastSeq.set(sessionId, maxSeq);

            if (!data.hasMore) break;
            if (maxSeq === afterSeq) {
                log.log(`💬 fetchForwardSince: pagination stalled for ${sessionId}, stopping to avoid infinite loop`);
                break;
            }
            afterSeq = maxSeq;
        }
    }

    private applyFetchedMessages = async (
        sessionId: string,
        encryption: ReturnType<Encryption['getSessionEncryption']> & {},
        messages: ApiMessage[],
        context: SyncRuntimeContext,
    ) => {
        if (messages.length === 0 || !this.isRuntimeContextCurrent(context)) return;
        // Backward pages arrive newest-first from the relay, but session
        // protocol turn-start/text/turn-end events are stateful and must be
        // reduced in ascending sequence order.
        const decryptedMessages = await encryption.decryptMessages(orderApiMessagesForReducer(messages));
        if (!this.isRuntimeContextCurrent(context)) return;
        const normalizedMessages: NormalizedMessage[] = [];
        for (let i = 0; i < decryptedMessages.length; i++) {
            const decrypted = decryptedMessages[i];
            if (!decrypted) continue;
            const normalized = normalizeRawMessage(decrypted.id, decrypted.localId, decrypted.createdAt, decrypted.content, decrypted.seq);
            if (normalized) {
                normalizedMessages.push(normalized);
            }
        }
        if (normalizedMessages.length > 0 && this.isRuntimeContextCurrent(context)) {
            this.applyMessages(sessionId, normalizedMessages);
        }
    }

    /**
     * Fetch one page of older messages for a session and prepend them to the
     * store. Called from the chat UI when the user scrolls past the top of
     * the currently loaded history. No-op when we have already fetched the
     * earliest message, when no initial fetch has happened yet, or when an
     * older-fetch is already in flight for this session.
     */
    loadOlderMessages = async (sessionId: string) => {
        const context = this.captureRuntimeContext();
        if (!this.isRuntimeContextCurrent(context)) return;
        const oldestSeq = this.sessionOldestSeq.get(sessionId);
        const session = storage.getState().sessions[sessionId];
        const hasMorePiHistory = session?.metadata?.piHistoryHasMore === true;
        if ((oldestSeq === undefined || oldestSeq <= 1) && !hasMorePiHistory) {
            return;
        }
        const sessionMessages = storage.getState().sessionMessages[sessionId];
        if (!sessionMessages || sessionMessages.isLoadingOlder || (!sessionMessages.hasMoreOlder && !hasMorePiHistory)) {
            return;
        }

        storage.getState().applyOlderMessagesLoading(sessionId, true);
        const lock = this.getSessionMessageLock(sessionId);
        let historyGapReason: string | null = null;
        try {
            await lock.inLock(async () => {
                if (!this.isRuntimeContextCurrent(context)) return;
                const encryption = context.encryption.getSessionEncryption(sessionId);
                if (!encryption) {
                    log.log(`💬 loadOlderMessages: encryption not ready for ${sessionId}`);
                    return;
                }
                const currentSession = storage.getState().sessions[sessionId];
                if (
                    currentSession?.metadata?.piHistoryHasMore === true
                    && canControlSession(currentSession.metadata)
                ) {
                    const fromSeq = this.sessionLastSeq.get(sessionId) ?? 0;
                    const requestedCursor = currentSession.metadata.piHistoryCursor;
                    const requestedMetadataVersion = currentSession.metadataVersion;
                    const controller = new AbortController();
                    this.readAbortControllers.add(controller);
                    let result: PiHistoryPageResult;
                    try {
                        result = await apiSocket.sessionRPC<PiHistoryPageResult, { beforeEntryId?: string }>(
                            sessionId,
                            'pi-history-page',
                            requestedCursor ? { beforeEntryId: requestedCursor } : {},
                            { timeoutMs: 15_000, signal: controller.signal },
                        );
                    } finally {
                        this.readAbortControllers.delete(controller);
                    }
                    if (!this.isRuntimeContextCurrent(context)) return;
                    // A delete received while the RPC was in flight is
                    // authoritative. Never use the request-time row as a
                    // fallback or recreate it through a delayed response.
                    const latestSession = storage.getState().sessions[sessionId];
                    const latestMetadata = latestSession?.metadata;
                    if (!latestSession || !latestMetadata) return;
                    if (
                        latestSession.metadataVersion !== requestedMetadataVersion
                        || latestMetadata.piHistoryCursor !== requestedCursor
                    ) {
                        // Another client or socket update advanced coverage while
                        // this RPC was in flight. Fetch any newly confirmed
                        // messages, but never let the delayed response regress
                        // the newer cursor or pagination state.
                        await this.fetchForwardSince(sessionId, encryption, fromSeq, context);
                        if (!this.isRuntimeContextCurrent(context)) return;
                        storage.getState().applyOlderMessagesPagination(sessionId, {
                            hasMore: latestMetadata.piHistoryHasMore === true
                                || (this.sessionOldestSeq.get(sessionId) ?? 0) > 1,
                        });
                        return;
                    }
                    storage.getState().applySessions([{
                        ...latestSession,
                        metadata: applyPiHistoryPageResult(
                            latestMetadata,
                            result,
                            { expectedCursor: requestedCursor },
                        ),
                    }]);
                    if (result.type === 'history_gap') {
                        historyGapReason = `history_gap: ${result.reason}`;
                        storage.getState().applyOlderMessagesPagination(sessionId, {
                            hasMore: (this.sessionOldestSeq.get(sessionId) ?? 0) > 1,
                        });
                        return;
                    }
                    await this.fetchForwardSince(sessionId, encryption, fromSeq, context);
                    if (!this.isRuntimeContextCurrent(context)) return;
                    storage.getState().applyOlderMessagesPagination(sessionId, {
                        hasMore: result.hasMore || (this.sessionOldestSeq.get(sessionId) ?? 0) > 1,
                    });
                    return;
                }
                // Re-read the cursor inside the lock. A concurrent
                // socket-pushed update or reload could have changed it.
                const beforeSeq = this.sessionOldestSeq.get(sessionId);
                if (beforeSeq === undefined || beforeSeq <= 1) {
                    return;
                }
                const data = await this.requestRuntimeJson<V3GetSessionMessagesResponse>(
                    `/v3/sessions/${sessionId}/messages?before_seq=${beforeSeq}&limit=100`,
                    context,
                    (status) => `Failed to load older messages for ${sessionId}: ${status}`,
                );
                if (!data || !this.isRuntimeContextCurrent(context)) return;
                const messages = Array.isArray(data.messages) ? data.messages : [];

                await this.applyFetchedMessages(sessionId, encryption, messages, context);
                if (!this.isRuntimeContextCurrent(context)) return;

                let minSeq = beforeSeq;
                for (const message of messages) {
                    if (message.seq < minSeq) minSeq = message.seq;
                }
                if (messages.length > 0) {
                    this.sessionOldestSeq.set(sessionId, minSeq);
                }
                storage.getState().applyOlderMessagesPagination(sessionId, {
                    hasMore: !!data.hasMore && messages.length > 0
                });
            });
            if (this.isRuntimeContextCurrent(context)) {
                storage.getState().applyOlderMessagesError(sessionId, historyGapReason);
            }
        } catch (error) {
            if (!this.isRuntimeContextCurrent(context)) return;
            storage.getState().applyOlderMessagesError(
                sessionId,
                error instanceof Error ? error.message : String(error),
            );
            throw error;
        } finally {
            if (this.isRuntimeContextCurrent(context)) {
                storage.getState().applyOlderMessagesLoading(sessionId, false);
            }
        }
    }

    private registerPushToken = async () => {
        log.log('registerPushToken');
        try {
            const result = await syncCurrentPushToken(this.credentials);
            log.log('Push token sync result: ' + JSON.stringify({
                registered: result.registered,
                hasToken: !!result.token,
                permission: result.permission.status,
            }));
            if (!result.permission.granted) {
                console.log('Failed to get push token for push notification!');
            }
        } catch (error) {
            log.log('Failed to register push token: ' + JSON.stringify(error));
        }
    }

    private createActivityAccumulator = (): ActivityUpdateAccumulator => {
        const generation = this.sessionSnapshotGeneration;
        return new ActivityUpdateAccumulator((updates) => {
            if (generation === this.sessionSnapshotGeneration) this.flushActivityUpdates(updates);
        }, 2000);
    }

    private subscribeToUpdates = () => {
        // Subscribe to message updates
        apiSocket.onMessage('update', this.handleUpdate.bind(this));
        apiSocket.onMessage('ephemeral', this.handleEphemeralUpdate.bind(this));

        // Subscribe to connection state changes
        apiSocket.onReconnected(() => {
            log.log('🔌 Socket reconnected');

            // Send current focus state on reconnect so the server's
            // suppression rules pick up where we left off (handshake.auth.appState
            // covers the very first connect; this covers reconnects).
            apiSocket.sendAppState(getCurrentAppState());

            this.requestPiSessionFullRefresh();
            this.schedulePiSessionRefresh();
            this.sessionsSync.invalidate();
            this.machinesSync.invalidate();
            // Messages are fetched lazily per-session via onSessionVisible (called by SessionView
            // when realtimeStatus changes). Session metadata + agentState (including permission
            // requests) are already refreshed by sessionsSync.invalidate() above.
            for (const sync of this.sendSync.values()) {
                sync.invalidate();
            }
        });
    }

    private handleUpdate = (update: unknown) => {
        const context: RelayUpdateContext = {
            generation: this.sessionSnapshotGeneration,
            encryption: this.encryption,
            sessionsSync: this.sessionsSync,
            tombstoneScope: this.piSessionTombstoneScope(),
        };
        this.updateProcessingChain = this.updateProcessingChain
            .then(() => this.processUpdate(update, context))
            .catch((error) => {
                console.error('Failed to process relay update in order', error);
            });
    }

    private isRelayUpdateContextCurrent = (context: RelayUpdateContext): boolean => (
        this.syncStarted
        && context.generation === this.sessionSnapshotGeneration
        && context.encryption === this.encryption
        && context.sessionsSync === this.sessionsSync
        && context.tombstoneScope === this.piSessionTombstoneScope()
    );

    private processUpdate = async (update: unknown, context: RelayUpdateContext) => {
        if (!this.isRelayUpdateContextCurrent(context)) return;
        const validatedUpdate = ApiUpdateContainerSchema.safeParse(update);
        if (!validatedUpdate.success) {
            console.log('❌ Sync: Invalid update received:', validatedUpdate.error);
            console.error('❌ Sync: Invalid update data:', update);
            return;
        }
        const updateData = validatedUpdate.data;
        console.log(`🔄 Sync: Validated update type: ${updateData.body.t}`);

        if (updateData.body.t === 'new-message') {

            // Get encryption — may not be ready if sessions are still syncing
            let encryption = context.encryption.getSessionEncryption(updateData.body.sid);
            if (!encryption) {
                await context.sessionsSync.awaitQueue();
                if (!this.isRelayUpdateContextCurrent(context)) return;
                encryption = context.encryption.getSessionEncryption(updateData.body.sid);
                if (!encryption) {
                    console.error(`Session ${updateData.body.sid} not found after sync`);
                    this.sessionsSync.invalidate();
                    return;
                }
            }

            // Decrypt message
            let lastMessage: NormalizedMessage | null = null;
            if (updateData.body.message) {
                const decrypted = await encryption.decryptMessage(updateData.body.message);
                if (!this.isRelayUpdateContextCurrent(context)) return;
                if (decrypted) {
                    lastMessage = normalizeRawMessage(decrypted.id, decrypted.localId, decrypted.createdAt, decrypted.content, decrypted.seq);

                    // Check for task lifecycle events to update thinking state
                    // This ensures UI updates even if volatile activity updates are lost
                    const rawContent = decrypted.content as {
                        role?: string;
                        content?: {
                            type?: string;
                            data?: {
                                type?: string;
                                ev?: { t?: string };
                            }
                        }
                    } | null;
                    const contentType = rawContent?.content?.type;
                    const sessionEventType = rawContent?.content?.data?.ev?.t;

                    // Debug logging to trace lifecycle events
                    if (sessionEventType === 'turn-start' || sessionEventType === 'turn-end') {
                        console.log(`🔄 [Sync] Lifecycle event detected: contentType=${contentType}, sessionEventType=${sessionEventType}`);
                    }

                    const isTaskComplete = contentType === 'session' && sessionEventType === 'turn-end';
                    const isTaskStarted = contentType === 'session' && sessionEventType === 'turn-start';

                    if (isTaskComplete || isTaskStarted) {
                        console.log(`🔄 [Sync] Updating thinking state: isTaskComplete=${isTaskComplete}, isTaskStarted=${isTaskStarted}`);
                    }

                    // Update session
                    const session = storage.getState().sessions[updateData.body.sid];
                    if (session) {
                        this.applySessions([{
                            ...session,
                            updatedAt: updateData.createdAt,
                            seq: updateData.seq,
                            // Update thinking state based on task lifecycle events
                            ...(isTaskComplete ? { thinking: false } : {}),
                            ...(isTaskStarted ? { thinking: true } : {})
                        }])
                    } else {
                        // Fetch sessions again if we don't have this session
                        this.sessionsSync.invalidate();
                    }

                    // Fast-path only on consecutive seq values, otherwise fetch from server.
                    const currentLastSeq = this.sessionLastSeq.get(updateData.body.sid);
                    const incomingSeq = updateData.body.message.seq;
                    if (lastMessage && currentLastSeq !== undefined && incomingSeq === currentLastSeq + 1) {
                        this.enqueueMessages(updateData.body.sid, [lastMessage]);
                        this.sessionLastSeq.set(updateData.body.sid, incomingSeq);
                        let hasMutableTool = false;
                        if (lastMessage.role === 'agent' && lastMessage.content[0] && lastMessage.content[0].type === 'tool-result') {
                            hasMutableTool = storage.getState().isMutableToolCall(updateData.body.sid, lastMessage.content[0].tool_use_id);
                        }
                        if (hasMutableTool) {
                            gitStatusSync.invalidate(updateData.body.sid);
                        }
                    } else {
                        this.getMessagesSync(updateData.body.sid).invalidate();
                    }
                }
            }

            // Ping session
            this.onSessionVisible(updateData.body.sid);

        } else if (updateData.body.t === 'new-session') {
            log.log('🆕 New session update received');
            this.sessionsSync.invalidate();
        } else if (updateData.body.t === 'delete-session') {
            log.log('🗑️ Delete session update received');
            const sessionId = updateData.body.sid;
            const deletedSession = storage.getState().sessions[sessionId];
            const discoveredIdentity = this.sessionListSnapshot.findPiIdentityByRelaySessionId(sessionId);
            const relaySessionTag = deletedSession?.tag ?? discoveredIdentity?.relaySessionTag;
            const machineId = deletedSession?.metadata?.machineId ?? discoveredIdentity?.machineId;
            const piSessionId = deletedSession?.metadata?.piSessionId ?? discoveredIdentity?.piSessionId;
            const isPiSession = deletedSession?.metadata?.flavor === 'pi'
                || relaySessionTag?.startsWith('pi:') === true
                || Boolean(machineId && piSessionId);
            const deletedIdentity = {
                relaySessionId: sessionId,
                ...(relaySessionTag ? { relaySessionTag } : {}),
                machineId,
                piSessionId,
            };
            this.sessionListSnapshot.hideDeletedSession(deletedIdentity);
            if (isPiSession) {
                this.persistPiSessionTombstone(deletedIdentity, context.tombstoneScope);
            }

            // Remove session from storage
            storage.getState().deleteSession(sessionId);

            // Remove encryption keys from memory
            context.encryption.removeSessionEncryption(sessionId);

            // Clear any cached git status
            gitStatusSync.clearForSession(sessionId);
            this.messagesSync.delete(sessionId);
            this.sendSync.delete(sessionId);
            this.pendingOutbox.delete(sessionId);
            savePendingOutbox(this.pendingOutbox);
            this.sessionLastSeq.delete(sessionId);
            this.sessionOldestSeq.delete(sessionId);
            this.sessionMessageLocks.delete(sessionId);
            this.sessionMessageQueue.delete(sessionId);
            this.sessionQueueProcessing.delete(sessionId);

            log.log(`🗑️ Session ${sessionId} deleted from local storage`);
        } else if (updateData.body.t === 'update-session') {
            // Session + encryption may not be initialized yet if sessions are
            // still syncing on startup. Mirror the new-message path: await the
            // sessions sync queue and re-check before giving up — dropping here
            // silently loses the metadata update that carries the chat title
            // (#1251: every chat stuck on "New chat" after the lazy-load change).
            let session = storage.getState().sessions[updateData.body.id];
            let sessionEncryption = context.encryption.getSessionEncryption(updateData.body.id);
            if (!session || !sessionEncryption) {
                await context.sessionsSync.awaitQueue();
                if (!this.isRelayUpdateContextCurrent(context)) return;
                session = storage.getState().sessions[updateData.body.id];
                sessionEncryption = context.encryption.getSessionEncryption(updateData.body.id);
            }
            if (session) {
                if (!sessionEncryption) {
                    console.error(`Session encryption not found for ${updateData.body.id} after sync`);
                    this.sessionsSync.invalidate();
                    return;
                }

                const agentState = updateData.body.agentState && sessionEncryption
                    ? await sessionEncryption.decryptAgentState(updateData.body.agentState.version, updateData.body.agentState.value)
                    : session.agentState;
                const metadata = updateData.body.metadata && sessionEncryption
                    ? await sessionEncryption.decryptMetadata(updateData.body.metadata.version, updateData.body.metadata.value)
                    : session.metadata;
                if (!this.isRelayUpdateContextCurrent(context)) return;

                this.applySessions([{
                    ...session,
                    agentState,
                    agentStateVersion: updateData.body.agentState
                        ? updateData.body.agentState.version
                        : session.agentStateVersion,
                    metadata,
                    metadataVersion: updateData.body.metadata
                        ? updateData.body.metadata.version
                        : session.metadataVersion,
                    updatedAt: updateData.createdAt,
                    seq: updateData.seq
                }]);

                // Invalidate git status when agent state changes (files may have been modified)
                if (updateData.body.agentState) {
                    gitStatusSync.invalidate(updateData.body.id);

                    // Re-fetch messages when control returns to mobile (local -> remote mode switch)
                    // This catches up on any messages that were exchanged while desktop had control
                    const wasControlledByUser = session.agentState?.controlledByUser;
                    const isNowControlledByUser = agentState?.controlledByUser;
                    if (!wasControlledByUser && isNowControlledByUser) {
                        log.log(`🔄 Control returned to mobile for session ${updateData.body.id}, re-fetching messages`);
                        this.onSessionVisible(updateData.body.id);
                    }
                }
            }
        } else if (updateData.body.t === 'update-account') {
            const accountUpdate = updateData.body;
            // Account updates carry encrypted settings changes.
            if (accountUpdate.settings?.value) {
                try {
                    const decryptedSettings = await context.encryption.decryptRaw(accountUpdate.settings.value);
                    if (!this.isRelayUpdateContextCurrent(context)) return;
                    const parsedSettings = settingsParse(decryptedSettings);

                    // Version compatibility check
                    const settingsSchemaVersion = parsedSettings.schemaVersion ?? 1;
                    if (settingsSchemaVersion > SUPPORTED_SCHEMA_VERSION) {
                        console.warn(
                            `⚠️ Received settings schema v${settingsSchemaVersion}, ` +
                            `we support v${SUPPORTED_SCHEMA_VERSION}. Update app for full functionality.`
                        );
                    }

                    this.applyServerSettings(parsedSettings, accountUpdate.settings.version);
                    log.log(`📋 Settings synced from server (schema v${settingsSchemaVersion}, version ${accountUpdate.settings.version})`);
                } catch (error) {
                    console.error('❌ Failed to process settings update:', error);
                    // Don't crash on settings sync errors, just log
                }
            }
        } else if (updateData.body.t === 'new-machine') {
            const machineUpdate = updateData.body;
            const machineId = machineUpdate.machineId;

            // Brand-new machines (cold onboarding) are delivered via 'new-machine'
            // before any fetchMachines has seen them, so their per-machine
            // encryption isn't initialized yet. The update carries the data
            // encryption key — register it here (mirroring fetchMachines) or every
            // later decrypt for this machine fails and it never lands in storage,
            // leaving the new-session screen unable to start a session until an app
            // restart / socket reconnect triggers a full machine refetch.
            const machineKeysMap = new Map<string, Uint8Array | null>();
            if (machineUpdate.dataEncryptionKey) {
                const decryptedKey = await context.encryption.decryptEncryptionKey(machineUpdate.dataEncryptionKey);
                if (!this.isRelayUpdateContextCurrent(context)) return;
                if (decryptedKey) {
                    machineKeysMap.set(machineId, decryptedKey);
                    this.machineDataKeys.set(machineId, decryptedKey);
                } else {
                    console.error(`Failed to decrypt data encryption key for new machine ${machineId}`);
                    machineKeysMap.set(machineId, null);
                }
            } else {
                machineKeysMap.set(machineId, null);
            }
            await context.encryption.initializeMachines(machineKeysMap);
            if (!this.isRelayUpdateContextCurrent(context)) return;

            const machineEncryption = context.encryption.getMachineEncryption(machineId);
            if (!machineEncryption) {
                console.error(`Machine encryption not found for ${machineId} after init - cannot apply new-machine`);
                return;
            }

            // Preserve an existing createdAt if we somehow already know this machine.
            const existing = storage.getState().machines[machineId];
            const newMachine: Machine = {
                id: machineId,
                seq: machineUpdate.seq,
                createdAt: existing?.createdAt ?? machineUpdate.createdAt,
                updatedAt: machineUpdate.updatedAt,
                active: machineUpdate.active,
                activeAt: machineUpdate.activeAt,
                metadata: null,
                metadataVersion: machineUpdate.metadataVersion,
                daemonState: null,
                daemonStateVersion: machineUpdate.daemonStateVersion
            };

            // Decrypt best-effort; still apply the machine on failure so it stays
            // visible/usable (matches fetchMachines' fallback behavior).
            try {
                newMachine.metadata = machineUpdate.metadata
                    ? await machineEncryption.decryptMetadata(machineUpdate.metadataVersion, machineUpdate.metadata)
                    : null;
                newMachine.daemonState = machineUpdate.daemonState
                    ? await machineEncryption.decryptDaemonState(machineUpdate.daemonStateVersion, machineUpdate.daemonState)
                    : null;
            } catch (error) {
                console.error(`Failed to decrypt new machine ${machineId}:`, error);
            }
            if (!this.isRelayUpdateContextCurrent(context)) return;

            storage.getState().applyMachines([newMachine]);
            if (shouldRefreshPiSessionsForMachineTransition(existing?.active, newMachine.active)) {
                this.requestPiSessionFullRefresh();
                this.schedulePiSessionRefresh();
            }
        } else if (updateData.body.t === 'update-machine') {
            const machineUpdate = updateData.body;
            const machineId = machineUpdate.machineId;  // Changed from .id to .machineId
            const machine = storage.getState().machines[machineId];

            // Create or update machine with all required fields
            const updatedMachine: Machine = {
                id: machineId,
                seq: updateData.seq,
                createdAt: machine?.createdAt ?? updateData.createdAt,
                updatedAt: updateData.createdAt,
                active: machineUpdate.active ?? true,
                activeAt: machineUpdate.activeAt ?? updateData.createdAt,
                metadata: machine?.metadata ?? null,
                metadataVersion: machine?.metadataVersion ?? 0,
                daemonState: machine?.daemonState ?? null,
                daemonStateVersion: machine?.daemonStateVersion ?? 0
            };

            // Get machine-specific encryption (might not exist if machine wasn't initialized)
            const machineEncryption = context.encryption.getMachineEncryption(machineId);
            if (!machineEncryption) {
                console.error(`Machine encryption not found for ${machineId} - cannot decrypt updates`);
                return;
            }

            // If metadata is provided, decrypt and update it
            const metadataUpdate = machineUpdate.metadata;
            if (metadataUpdate) {
                try {
                    const metadata = await machineEncryption.decryptMetadata(metadataUpdate.version, metadataUpdate.value);
                    if (!this.isRelayUpdateContextCurrent(context)) return;
                    updatedMachine.metadata = metadata;
                    updatedMachine.metadataVersion = metadataUpdate.version;
                } catch (error) {
                    console.error(`Failed to decrypt machine metadata for ${machineId}:`, error);
                }
            }

            // If daemonState is provided, decrypt and update it
            const daemonStateUpdate = machineUpdate.daemonState;
            if (daemonStateUpdate) {
                try {
                    const daemonState = await machineEncryption.decryptDaemonState(daemonStateUpdate.version, daemonStateUpdate.value);
                    if (!this.isRelayUpdateContextCurrent(context)) return;
                    updatedMachine.daemonState = daemonState;
                    updatedMachine.daemonStateVersion = daemonStateUpdate.version;
                } catch (error) {
                    console.error(`Failed to decrypt machine daemonState for ${machineId}:`, error);
                }
            }

            // Update storage using applyMachines which rebuilds sessionListViewData
            if (!this.isRelayUpdateContextCurrent(context)) return;
            storage.getState().applyMachines([updatedMachine]);
            if (shouldRefreshPiSessionsForMachineTransition(machine?.active, updatedMachine.active)) {
                this.requestPiSessionFullRefresh();
                this.schedulePiSessionRefresh();
            }
        } else if (updateData.body.t === 'delete-machine') {
            const machineId = updateData.body.machineId;
            log.log(`🗑️ Delete machine update received for ${machineId}`);
            if (!storage.getState().machines[machineId]) {
                log.log(`Machine ${machineId} not in storage, skipping delete`);
            } else {
                storage.getState().deleteMachine(machineId);
                this.sessionListSnapshot.removeMachine(machineId);
                context.encryption.removeMachineEncryption(machineId);
                this.machineDataKeys.delete(machineId);
            }
        }
    }

    private flushActivityUpdates = (updates: Map<string, ApiEphemeralActivityUpdate>) => {
        // log.log(`🔄 Flushing activity updates for ${updates.size} sessions - acquiring lock`);


        const sessions: Session[] = [];

        for (const [sessionId, update] of updates) {
            const session = storage.getState().sessions[sessionId];
            if (session) {
                sessions.push({
                    ...session,
                    active: update.active,
                    activeAt: update.activeAt,
                    thinking: update.thinking ?? false,
                    thinkingAt: update.activeAt // Always use activeAt for consistency
                });
            }
        }

        if (sessions.length > 0) {
            // console.log('flushing activity updates ' + sessions.length);
            this.applySessions(sessions);
            // log.log(`🔄 Activity updates flushed - updated ${sessions.length} sessions`);
        }
    }

    private handleEphemeralUpdate = (update: unknown) => {
        const validatedUpdate = ApiEphemeralUpdateSchema.safeParse(update);
        if (!validatedUpdate.success) {
            console.log('Invalid ephemeral update received:', validatedUpdate.error);
            console.error('Invalid ephemeral update received:', update);
            return;
        } else {
            // console.log('Ephemeral update received:', update);
        }
        const updateData = validatedUpdate.data;

        // Process activity updates through smart debounce accumulator
        if (updateData.type === 'activity') {
            // console.log('adding activity update ' + updateData.id);
            this.activityAccumulator.addUpdate(updateData);
        }

        // Handle machine activity updates
        if (updateData.type === 'machine-activity') {
            // Update machine's active status and lastActiveAt
            const machine = storage.getState().machines[updateData.id];
            if (machine) {
                const updatedMachine: Machine = {
                    ...machine,
                    active: updateData.active,
                    activeAt: updateData.activeAt
                };
                storage.getState().applyMachines([updatedMachine]);
                if (shouldRefreshPiSessionsForMachineTransition(machine.active, updatedMachine.active)) {
                    this.requestPiSessionFullRefresh();
                    this.schedulePiSessionRefresh();
                }
            }
        }

        // daemon-status ephemeral updates are deprecated; machine status is handled via machine-activity.
    }

    //
    // Apply store
    //

    private applyMessages = (sessionId: string, messages: NormalizedMessage[]) => {
        storage.getState().applyMessages(sessionId, messages);
    }

    private applySessions = (sessions: (Omit<Session, "presence"> & {
        presence?: "online" | number;
    })[], options?: { replace?: boolean }) => {
        storage.getState().applySessions(sessions, options);
    }

}

// Global singleton instance
export const sync = new Sync();

//
// Init sequence
//

let isInitialized = false;
export async function syncCreate(credentials: AuthCredentials) {
    if (isInitialized) {
        console.warn('Sync already initialized: ignoring');
        return;
    }
    isInitialized = true;
    await syncInit(credentials, false);
}

export async function syncRestore(credentials: AuthCredentials) {
    if (isInitialized) {
        console.warn('Sync already initialized: ignoring');
        return;
    }
    isInitialized = true;
    await syncInit(credentials, true);
}

export function syncReset() {
    sync.resetRuntimeState();
    apiSocket.reset();
    storage.getState().resetVolatileState();
    isInitialized = false;
}

async function syncInit(credentials: AuthCredentials, restore: boolean) {

    // Initialize sync engine
    const secretKey = decodeBase64(credentials.secret, 'base64url');
    if (secretKey.length !== 32) {
        throw new Error(`Invalid secret key length: ${secretKey.length}, expected 32`);
    }
    const encryption = await Encryption.create(secretKey);

    // Initialize socket connection
    const API_ENDPOINT = getServerUrl();
    apiSocket.initialize({ endpoint: API_ENDPOINT, token: credentials.token }, encryption);

    // Wire socket status to storage
    apiSocket.onStatusChange((status) => {
        storage.getState().setSocketStatus(status);
    });

    // Initialize sessions engine
    if (restore) {
        await sync.restore(credentials, encryption);
    } else {
        await sync.create(credentials, encryption);
    }
}
