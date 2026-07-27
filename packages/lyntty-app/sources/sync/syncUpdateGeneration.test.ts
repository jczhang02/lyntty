import { describe, expect, it, vi } from 'bun:test';

import { apiSocket } from './apiSocket';
import { storage } from './storage';
import type { Machine, Session } from './storageTypes';
import { sync } from './sync';

function piSession(id: string, name: string): Session {
    return {
        id,
        tag: `pi:${id}`,
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: false,
        activeAt: 1,
        metadata: {
            path: '/repo',
            host: 'machine-1',
            machineId: 'machine-1',
            piSessionId: `pi-${id}`,
            flavor: 'pi',
            name,
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        presence: 1,
    };
}

function machine(id: string): Machine {
    return {
        id,
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: {
            host: id,
            platform: 'linux',
            lynttyCliVersion: '1.2.0',
            lynttyHomeDir: `/home/${id}/.lyntty`,
            homeDir: `/home/${id}`,
            cliAvailability: { pi: true, detectedAt: 1 },
        },
        metadataVersion: 1,
        daemonState: null,
        daemonStateVersion: 0,
    };
}

describe('relay update generation isolation', () => {
    it('drops an old account update that resumes after a sync reset', async () => {
        let resolveQueue!: () => void;
        let markQueueStarted!: () => void;
        const queueStarted = new Promise<void>((resolve) => { markQueueStarted = resolve; });
        const queue = new Promise<void>((resolve) => { resolveQueue = resolve; });
        const invalidate = vi.fn();
        const fakeSessionsSync = {
            awaitQueue: async () => {
                markQueueStarted();
                await queue;
            },
            invalidate,
        };
        const fakeEncryption = {
            getSessionEncryption: () => undefined,
        };
        const internals = sync as unknown as {
            syncStarted: boolean;
            sessionSnapshotGeneration: number;
            encryption: unknown;
            sessionsSync: unknown;
            serverID: string;
            piSessionTombstoneScope: () => string;
            processUpdate: (update: unknown, context: unknown) => Promise<void>;
        };
        const previous = {
            syncStarted: internals.syncStarted,
            generation: internals.sessionSnapshotGeneration,
            encryption: internals.encryption,
            sessionsSync: internals.sessionsSync,
            serverID: internals.serverID,
        };

        try {
            internals.syncStarted = true;
            internals.encryption = fakeEncryption;
            internals.sessionsSync = fakeSessionsSync;
            internals.serverID = 'generation-test-account';
            const generation = internals.sessionSnapshotGeneration;
            const processing = internals.processUpdate({
                id: 'generation-test-update',
                seq: 1,
                createdAt: 1,
                body: {
                    t: 'update-session',
                    id: 'generation-test-missing-session',
                    metadata: null,
                    agentState: null,
                },
            }, {
                generation,
                encryption: fakeEncryption,
                sessionsSync: fakeSessionsSync,
                tombstoneScope: internals.piSessionTombstoneScope(),
            });
            await queueStarted;
            internals.sessionSnapshotGeneration += 1;
            resolveQueue();
            await processing;

            expect(invalidate).not.toHaveBeenCalled();
        } finally {
            internals.syncStarted = previous.syncStarted;
            internals.sessionSnapshotGeneration = previous.generation;
            internals.encryption = previous.encryption;
            internals.sessionsSync = previous.sessionsSync;
            internals.serverID = previous.serverID;
        }
    });

    it('drops canonical-name persistence after its runtime generation is replaced', async () => {
        let releaseEncryption!: () => void;
        let markEncryptionStarted!: () => void;
        const encryptionStarted = new Promise<void>((resolve) => { markEncryptionStarted = resolve; });
        const encryptionGate = new Promise<void>((resolve) => { releaseEncryption = resolve; });
        const emitWithAck = vi.spyOn(apiSocket, 'emitWithAck').mockResolvedValue({
            result: 'success',
            version: 2,
            metadata: 'saved',
        });
        const sessionEncryption = {
            encryptMetadata: async (metadata: unknown) => {
                markEncryptionStarted();
                await encryptionGate;
                return JSON.stringify(metadata);
            },
            decryptMetadata: async () => null,
        };
        const fakeEncryption = { getSessionEncryption: () => sessionEncryption };
        const internals = sync as unknown as {
            syncStarted: boolean;
            sessionSnapshotGeneration: number;
            encryption: unknown;
            piSessionNameBackfillPending: unknown;
            piSessionNameBackfillInFlight: Promise<void> | null;
            queueCanonicalPiSessionNamePersistence: (relay: Session[], merged: Session[]) => void;
        };
        const previous = {
            syncStarted: internals.syncStarted,
            generation: internals.sessionSnapshotGeneration,
            encryption: internals.encryption,
            pending: internals.piSessionNameBackfillPending,
            inFlight: internals.piSessionNameBackfillInFlight,
        };

        try {
            internals.syncStarted = true;
            internals.encryption = fakeEncryption;
            internals.queueCanonicalPiSessionNamePersistence(
                [piSession('old-generation', 'Pi session')],
                [piSession('old-generation', 'Canonical old generation')],
            );
            const task = internals.piSessionNameBackfillInFlight;
            expect(task).not.toBeNull();
            await encryptionStarted;
            internals.sessionSnapshotGeneration += 1;
            internals.encryption = { getSessionEncryption: () => undefined };
            releaseEncryption();
            await task;

            expect(emitWithAck).not.toHaveBeenCalled();
        } finally {
            emitWithAck.mockRestore();
            internals.syncStarted = previous.syncStarted;
            internals.sessionSnapshotGeneration = previous.generation;
            internals.encryption = previous.encryption;
            internals.piSessionNameBackfillPending = previous.pending;
            internals.piSessionNameBackfillInFlight = previous.inFlight;
        }
    });

    it('coalesces later discovery pages while canonical-name persistence is in flight', async () => {
        let releaseFirstEncryption!: () => void;
        let markFirstEncryptionStarted!: () => void;
        const firstEncryptionStarted = new Promise<void>((resolve) => { markFirstEncryptionStarted = resolve; });
        const firstEncryptionGate = new Promise<void>((resolve) => { releaseFirstEncryption = resolve; });
        let encryptionCalls = 0;
        const sessionEncryption = {
            encryptMetadata: async (metadata: unknown) => {
                encryptionCalls += 1;
                if (encryptionCalls === 1) {
                    markFirstEncryptionStarted();
                    await firstEncryptionGate;
                }
                return JSON.stringify(metadata);
            },
            decryptMetadata: async (_version: number, ciphertext: string) => JSON.parse(ciphertext),
        };
        const fakeEncryption = { getSessionEncryption: () => sessionEncryption };
        const emitWithAck = vi.spyOn(apiSocket, 'emitWithAck').mockImplementation(async (_event, payload) => ({
            result: 'success',
            version: 2,
            metadata: (payload as { metadata: string }).metadata,
        }) as never);
        const internals = sync as unknown as {
            syncStarted: boolean;
            sessionSnapshotGeneration: number;
            encryption: unknown;
            piSessionNameBackfillPending: unknown;
            piSessionNameBackfillInFlight: Promise<void> | null;
            queueCanonicalPiSessionNamePersistence: (relay: Session[], merged: Session[]) => void;
        };
        const previous = {
            syncStarted: internals.syncStarted,
            generation: internals.sessionSnapshotGeneration,
            encryption: internals.encryption,
            pending: internals.piSessionNameBackfillPending,
            inFlight: internals.piSessionNameBackfillInFlight,
        };

        try {
            internals.syncStarted = true;
            internals.encryption = fakeEncryption;
            const firstRelay = piSession('first-page', 'Pi session');
            const secondRelay = piSession('second-page', 'Pi session');
            internals.queueCanonicalPiSessionNamePersistence(
                [firstRelay],
                [piSession('first-page', 'Canonical first page')],
            );
            const task = internals.piSessionNameBackfillInFlight;
            expect(task).not.toBeNull();
            await firstEncryptionStarted;
            internals.queueCanonicalPiSessionNamePersistence(
                [firstRelay, secondRelay],
                [
                    piSession('first-page', 'Canonical first page'),
                    piSession('second-page', 'Canonical second page'),
                ],
            );
            releaseFirstEncryption();
            await task;

            const submittedSessionIds = emitWithAck.mock.calls.map((call) => (
                call[1] as { sid: string }
            ).sid);
            expect(submittedSessionIds).toContain('second-page');
        } finally {
            emitWithAck.mockRestore();
            internals.syncStarted = previous.syncStarted;
            internals.sessionSnapshotGeneration = previous.generation;
            internals.encryption = previous.encryption;
            internals.piSessionNameBackfillPending = previous.pending;
            internals.piSessionNameBackfillInFlight = previous.inFlight;
        }
    });

    it('hides an unknown ordinary delete from in-flight relay snapshots without persisting a Pi tombstone', async () => {
        const hideDeletedSession = vi.fn();
        const fakeSnapshot = {
            findPiIdentityByRelaySessionId: () => undefined,
            hideDeletedSession,
        };
        const fakeEncryption = {
            removeSessionEncryption: vi.fn(),
        };
        const fakeSessionsSync = {};
        const internals = sync as unknown as {
            syncStarted: boolean;
            sessionSnapshotGeneration: number;
            encryption: unknown;
            sessionsSync: unknown;
            serverID: string;
            sessionListSnapshot: unknown;
            piSessionTombstones: unknown[];
            piSessionTombstoneScope: () => string;
            processUpdate: (update: unknown, context: unknown) => Promise<void>;
        };
        const previous = {
            syncStarted: internals.syncStarted,
            encryption: internals.encryption,
            sessionsSync: internals.sessionsSync,
            serverID: internals.serverID,
            snapshot: internals.sessionListSnapshot,
            tombstones: internals.piSessionTombstones,
        };

        try {
            internals.syncStarted = true;
            internals.encryption = fakeEncryption;
            internals.sessionsSync = fakeSessionsSync;
            internals.serverID = 'ordinary-delete-account';
            internals.sessionListSnapshot = fakeSnapshot;
            internals.piSessionTombstones = [];
            const generation = internals.sessionSnapshotGeneration;
            await internals.processUpdate({
                id: 'ordinary-delete-update',
                seq: 1,
                createdAt: 1,
                body: { t: 'delete-session', sid: 'ordinary-deleted' },
            }, {
                generation,
                encryption: fakeEncryption,
                sessionsSync: fakeSessionsSync,
                tombstoneScope: internals.piSessionTombstoneScope(),
            });

            expect(hideDeletedSession).toHaveBeenCalledWith({
                relaySessionId: 'ordinary-deleted',
                machineId: undefined,
                piSessionId: undefined,
            });
            expect(internals.piSessionTombstones).toEqual([]);
        } finally {
            internals.syncStarted = previous.syncStarted;
            internals.encryption = previous.encryption;
            internals.sessionsSync = previous.sessionsSync;
            internals.serverID = previous.serverID;
            internals.sessionListSnapshot = previous.snapshot;
            internals.piSessionTombstones = previous.tombstones;
        }
    });

    it('persists a deleted Pi stable tag before local discovery resolves its identity', async () => {
        const hideDeletedSession = vi.fn();
        const fakeSnapshot = {
            findPiIdentityByRelaySessionId: () => undefined,
            hideDeletedSession,
        };
        const fakeEncryption = { removeSessionEncryption: vi.fn() };
        const fakeSessionsSync = {};
        const internals = sync as unknown as {
            syncStarted: boolean;
            sessionSnapshotGeneration: number;
            encryption: unknown;
            sessionsSync: unknown;
            serverID: string;
            sessionListSnapshot: unknown;
            piSessionTombstones: Array<{ relaySessionId: string; relaySessionTag?: string }>;
            piSessionTombstoneScope: () => string;
            processUpdate: (update: unknown, context: unknown) => Promise<void>;
        };
        const previous = {
            syncStarted: internals.syncStarted,
            encryption: internals.encryption,
            sessionsSync: internals.sessionsSync,
            serverID: internals.serverID,
            snapshot: internals.sessionListSnapshot,
            tombstones: internals.piSessionTombstones,
        };

        storage.getState().applySessions([{
            id: 'legacy-pi-delete',
            tag: 'pi:stable-delete',
            seq: 1,
            createdAt: 1,
            updatedAt: 1,
            active: false,
            activeAt: 1,
            metadata: { path: '/repo', host: 'machine-1', name: 'Pi session' },
            metadataVersion: 1,
            agentState: null,
            agentStateVersion: 0,
            thinking: false,
            thinkingAt: 0,
        }]);
        try {
            internals.syncStarted = true;
            internals.encryption = fakeEncryption;
            internals.sessionsSync = fakeSessionsSync;
            internals.serverID = 'tag-delete-account';
            internals.sessionListSnapshot = fakeSnapshot;
            internals.piSessionTombstones = [];
            const generation = internals.sessionSnapshotGeneration;
            await internals.processUpdate({
                id: 'tag-delete-update',
                seq: 1,
                createdAt: 1,
                body: { t: 'delete-session', sid: 'legacy-pi-delete' },
            }, {
                generation,
                encryption: fakeEncryption,
                sessionsSync: fakeSessionsSync,
                tombstoneScope: internals.piSessionTombstoneScope(),
            });

            expect(hideDeletedSession).toHaveBeenCalledWith({
                relaySessionId: 'legacy-pi-delete',
                relaySessionTag: 'pi:stable-delete',
                machineId: undefined,
                piSessionId: undefined,
            });
            expect(internals.piSessionTombstones).toHaveLength(1);
            expect(internals.piSessionTombstones[0]).toMatchObject({
                relaySessionId: 'legacy-pi-delete',
                relaySessionTag: 'pi:stable-delete',
            });
        } finally {
            storage.getState().deleteSession('legacy-pi-delete');
            internals.syncStarted = previous.syncStarted;
            internals.encryption = previous.encryption;
            internals.sessionsSync = previous.sessionsSync;
            internals.serverID = previous.serverID;
            internals.sessionListSnapshot = previous.snapshot;
            internals.piSessionTombstones = previous.tombstones;
        }
    });

    it('drops a message page whose body completes after the runtime generation changes', async () => {
        let resolveBody!: (value: unknown) => void;
        let markBodyStarted!: () => void;
        const bodyStarted = new Promise<void>((resolve) => { markBodyStarted = resolve; });
        const body = new Promise<unknown>((resolve) => { resolveBody = resolve; });
        const request = vi.spyOn(apiSocket, 'request').mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => {
                markBodyStarted();
                return body;
            },
        } as Response);
        const decryptMessages = vi.fn(async () => []);
        const fakeEncryption = { getSessionEncryption: () => undefined };
        const internals = sync as unknown as {
            syncStarted: boolean;
            sessionSnapshotGeneration: number;
            encryption: unknown;
            fetchInitialLatestPage: (
                sessionId: string,
                encryption: { decryptMessages: typeof decryptMessages },
                context: { generation: number; encryption: unknown },
            ) => Promise<void>;
        };
        const previous = {
            syncStarted: internals.syncStarted,
            generation: internals.sessionSnapshotGeneration,
            encryption: internals.encryption,
        };

        try {
            internals.syncStarted = true;
            internals.encryption = fakeEncryption;
            const generation = internals.sessionSnapshotGeneration;
            const loading = internals.fetchInitialLatestPage(
                'generation-test-message-page',
                { decryptMessages },
                { generation, encryption: fakeEncryption },
            );
            await bodyStarted;
            internals.sessionSnapshotGeneration += 1;
            resolveBody({ messages: [{ seq: 1 }], hasMore: false });
            await loading;

            expect(decryptMessages).not.toHaveBeenCalled();
        } finally {
            request.mockRestore();
            internals.syncStarted = previous.syncStarted;
            internals.sessionSnapshotGeneration = previous.generation;
            internals.encryption = previous.encryption;
        }
    });

    it('does not resurrect a session deleted while a Pi history page is in flight', async () => {
        const sessionId = 'deleted-history-page';
        storage.getState().applySessions([{
            ...piSession(sessionId, 'Canonical history session'),
            metadata: {
                ...piSession(sessionId, 'Canonical history session').metadata!,
                piHistoryCursor: 'cursor-1',
                piHistoryHasMore: true,
                controlState: 'ready',
            },
        }]);
        storage.getState().applyMessagesLoaded(sessionId);
        storage.getState().applyOlderMessagesPagination(sessionId, { hasMore: true });

        const sessionEncryption = {};
        const fakeEncryption = { getSessionEncryption: () => sessionEncryption };
        const sessionRpc = vi.spyOn(apiSocket, 'sessionRPC').mockImplementation(async () => {
            storage.getState().deleteSession(sessionId);
            return {
                type: 'success',
                sent: 0,
                nextCursor: undefined,
                hasMore: false,
                totalMessages: 1,
            } as never;
        });
        const internals = sync as unknown as {
            syncStarted: boolean;
            sessionSnapshotGeneration: number;
            encryption: unknown;
            sessionOldestSeq: Map<string, number>;
            sessionLastSeq: Map<string, number>;
            sessionMessageLocks: Map<string, unknown>;
            loadOlderMessages: (id: string) => Promise<void>;
        };
        const previous = {
            syncStarted: internals.syncStarted,
            generation: internals.sessionSnapshotGeneration,
            encryption: internals.encryption,
            oldest: internals.sessionOldestSeq,
            last: internals.sessionLastSeq,
            locks: internals.sessionMessageLocks,
        };

        try {
            internals.syncStarted = true;
            internals.encryption = fakeEncryption;
            internals.sessionOldestSeq = new Map([[sessionId, 1]]);
            internals.sessionLastSeq = new Map([[sessionId, 1]]);
            internals.sessionMessageLocks = new Map();

            await internals.loadOlderMessages(sessionId);

            expect(storage.getState().sessions[sessionId]).toBeUndefined();
        } finally {
            sessionRpc.mockRestore();
            storage.getState().deleteSession(sessionId);
            internals.syncStarted = previous.syncStarted;
            internals.sessionSnapshotGeneration = previous.generation;
            internals.encryption = previous.encryption;
            internals.sessionOldestSeq = previous.oldest;
            internals.sessionLastSeq = previous.last;
            internals.sessionMessageLocks = previous.locks;
        }
    });

    it('keeps the durable outbox intact when an old send response crosses a reset', async () => {
        let resolveBody!: (value: unknown) => void;
        let markBodyStarted!: () => void;
        const bodyStarted = new Promise<void>((resolve) => { markBodyStarted = resolve; });
        const body = new Promise<unknown>((resolve) => { resolveBody = resolve; });
        const request = vi.spyOn(apiSocket, 'request').mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => {
                markBodyStarted();
                return body;
            },
        } as Response);
        const fakeEncryption = { getSessionEncryption: () => undefined };
        const sessionId = 'generation-test-outbox';
        const pending = [{ localId: 'local-1', content: 'encrypted' }];
        const internals = sync as unknown as {
            syncStarted: boolean;
            sessionSnapshotGeneration: number;
            encryption: unknown;
            pendingOutbox: Map<string, typeof pending>;
            sessionLastSeq: Map<string, number>;
            flushOutbox: (
                id: string,
                context: { generation: number; encryption: unknown },
            ) => Promise<void>;
        };
        const previous = {
            syncStarted: internals.syncStarted,
            generation: internals.sessionSnapshotGeneration,
            encryption: internals.encryption,
            pendingOutbox: internals.pendingOutbox,
            sessionLastSeq: internals.sessionLastSeq,
        };

        try {
            internals.syncStarted = true;
            internals.encryption = fakeEncryption;
            internals.pendingOutbox = new Map([[sessionId, pending]]);
            internals.sessionLastSeq = new Map();
            const generation = internals.sessionSnapshotGeneration;
            const sending = internals.flushOutbox(sessionId, { generation, encryption: fakeEncryption });
            await bodyStarted;
            internals.sessionSnapshotGeneration += 1;
            resolveBody({ messages: [{ seq: 99 }] });
            await sending;

            expect(internals.pendingOutbox.get(sessionId)).toEqual(pending);
            expect(internals.sessionLastSeq.has(sessionId)).toBe(false);
        } finally {
            request.mockRestore();
            internals.syncStarted = previous.syncStarted;
            internals.sessionSnapshotGeneration = previous.generation;
            internals.encryption = previous.encryption;
            internals.pendingOutbox = previous.pendingOutbox;
            internals.sessionLastSeq = previous.sessionLastSeq;
        }
    });

    it('does not apply an old account settings response after the generation changes', async () => {
        let resolveBody!: (value: unknown) => void;
        let markBodyStarted!: () => void;
        const bodyStarted = new Promise<void>((resolve) => { markBodyStarted = resolve; });
        const body = new Promise<unknown>((resolve) => { resolveBody = resolve; });
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => {
                markBodyStarted();
                return body;
            },
        } as Response);
        type TestCredentials = { token: string; secret: string };
        const credentials: TestCredentials = { token: 'generation-test-token', secret: 'generation-test-secret' };
        const fakeEncryption = { decryptRaw: vi.fn(async (value) => value) };
        const internals = sync as unknown as {
            syncStarted: boolean;
            sessionSnapshotGeneration: number;
            encryption: unknown;
            credentials: TestCredentials;
            pendingSettings: Record<string, unknown>;
            syncSettings: (
                context: { generation: number; encryption: unknown },
                credentials: TestCredentials,
            ) => Promise<void>;
        };
        const previous = {
            syncStarted: internals.syncStarted,
            generation: internals.sessionSnapshotGeneration,
            encryption: internals.encryption,
            credentials: internals.credentials,
            pendingSettings: internals.pendingSettings,
        };
        const previousSettingsVersion = storage.getState().settingsVersion;

        try {
            internals.syncStarted = true;
            internals.encryption = fakeEncryption;
            internals.credentials = credentials;
            internals.pendingSettings = {};
            const generation = internals.sessionSnapshotGeneration;
            const loading = internals.syncSettings(
                { generation, encryption: fakeEncryption },
                credentials,
            );
            await bodyStarted;
            internals.sessionSnapshotGeneration += 1;
            resolveBody({ settings: null, settingsVersion: 999 });
            await loading;

            expect(storage.getState().settingsVersion).toBe(previousSettingsVersion);
        } finally {
            fetchMock.mockRestore();
            internals.syncStarted = previous.syncStarted;
            internals.sessionSnapshotGeneration = previous.generation;
            internals.encryption = previous.encryption;
            internals.credentials = previous.credentials;
            internals.pendingSettings = previous.pendingSettings;
        }
    });

    it('honors a full refresh requested while an index retry is in flight', async () => {
        let resolveFirst!: (value: unknown) => void;
        let markFirstStarted!: () => void;
        const firstStarted = new Promise<void>((resolve) => { markFirstStarted = resolve; });
        const firstResult = new Promise<unknown>((resolve) => { resolveFirst = resolve; });
        const calls: string[] = [];
        const applyMachinePage = vi.fn();
        let firstCall = true;
        const machineRpc = vi.spyOn(apiSocket, 'machineRPC').mockImplementation(async (machineId) => {
            calls.push(machineId);
            if (firstCall) {
                firstCall = false;
                markFirstStarted();
                return firstResult as never;
            }
            return { type: 'success', sessions: [], total: 0 } as never;
        });
        const internals = sync as unknown as {
            syncStarted: boolean;
            relayInitialAttempt: Promise<void>;
            piSessionRefreshTimer: ReturnType<typeof setTimeout> | null;
            piSessionRefreshGenerationInFlight: number | null;
            piSessionRefreshPending: boolean;
            piSessionFullRefreshEpoch: number;
            piSessionHandledFullRefreshEpoch: number;
            piSessionTransportRetryAttempt: number;
            piSessionIndexRetryAttempt: number;
            piSessionTransportRetryMachineIds: Set<string>;
            piSessionIndexRetryMachineIds: Set<string>;
            sessionListSnapshot: unknown;
            requestPiSessionFullRefresh: () => void;
            fetchMachinePiSessions: () => Promise<void>;
        };
        const previous = {
            syncStarted: internals.syncStarted,
            relayInitialAttempt: internals.relayInitialAttempt,
            timer: internals.piSessionRefreshTimer,
            inFlight: internals.piSessionRefreshGenerationInFlight,
            pending: internals.piSessionRefreshPending,
            fullEpoch: internals.piSessionFullRefreshEpoch,
            handledEpoch: internals.piSessionHandledFullRefreshEpoch,
            transportAttempt: internals.piSessionTransportRetryAttempt,
            indexAttempt: internals.piSessionIndexRetryAttempt,
            transportIds: internals.piSessionTransportRetryMachineIds,
            indexIds: internals.piSessionIndexRetryMachineIds,
            snapshot: internals.sessionListSnapshot,
            machines: Object.values(storage.getState().machines),
        };

        try {
            if (internals.piSessionRefreshTimer) clearTimeout(internals.piSessionRefreshTimer);
            internals.syncStarted = true;
            internals.relayInitialAttempt = Promise.resolve();
            internals.piSessionRefreshTimer = null;
            internals.piSessionRefreshGenerationInFlight = null;
            internals.piSessionRefreshPending = false;
            internals.piSessionFullRefreshEpoch = 0;
            internals.piSessionHandledFullRefreshEpoch = 0;
            internals.piSessionTransportRetryAttempt = 0;
            internals.piSessionIndexRetryAttempt = 0;
            internals.piSessionTransportRetryMachineIds = new Set();
            internals.piSessionIndexRetryMachineIds = new Set();
            internals.sessionListSnapshot = {
                beginMachineRefresh: () => 1,
                applyMachinePage,
                failMachineRefresh: () => undefined,
                cancelPendingMachineRefreshes: () => undefined,
            };
            storage.getState().applyMachines([machine('old-machine')], true);

            const firstRefresh = internals.fetchMachinePiSessions();
            await firstStarted;
            storage.getState().applyMachines([machine('old-machine'), machine('new-machine')], true);
            internals.requestPiSessionFullRefresh();
            resolveFirst({ type: 'success', sessions: [], total: 0, refreshing: true });
            await firstRefresh;
            expect(applyMachinePage).not.toHaveBeenCalled();

            const secondRunStartsAt = calls.length;
            await internals.fetchMachinePiSessions();
            expect(new Set(calls.slice(secondRunStartsAt))).toEqual(new Set(['old-machine', 'new-machine']));
        } finally {
            if (internals.piSessionRefreshTimer) clearTimeout(internals.piSessionRefreshTimer);
            machineRpc.mockRestore();
            storage.getState().applyMachines(previous.machines, true);
            internals.syncStarted = previous.syncStarted;
            internals.relayInitialAttempt = previous.relayInitialAttempt;
            internals.piSessionRefreshTimer = previous.timer;
            internals.piSessionRefreshGenerationInFlight = previous.inFlight;
            internals.piSessionRefreshPending = previous.pending;
            internals.piSessionFullRefreshEpoch = previous.fullEpoch;
            internals.piSessionHandledFullRefreshEpoch = previous.handledEpoch;
            internals.piSessionTransportRetryAttempt = previous.transportAttempt;
            internals.piSessionIndexRetryAttempt = previous.indexAttempt;
            internals.piSessionTransportRetryMachineIds = previous.transportIds;
            internals.piSessionIndexRetryMachineIds = previous.indexIds;
            internals.sessionListSnapshot = previous.snapshot;
        }
    });
});
