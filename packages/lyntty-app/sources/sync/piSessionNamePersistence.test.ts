import { describe, expect, it, mock } from 'bun:test';

import type { Session } from './storageTypes';
import { mergePiDiscoveredSessions } from './piDiscoveredSessions';
import {
    findPiSessionNameBackfills,
    persistPiSessionNameBackfills,
} from './piSessionNamePersistence';

function session(id: string, name: string, overrides: Partial<Session> = {}): Session {
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
            host: 'workstation',
            machineId: 'machine-1',
            piSessionId: `pi-${id}`,
            flavor: 'pi',
            name,
        },
        metadataVersion: 2,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        presence: 1,
        ...overrides,
    };
}

describe('Pi session name persistence', () => {
    it('selects only existing relay rows whose canonical local title improved', () => {
        const relay = [
            session('one', 'Pi session'),
            session('two', 'Already canonical'),
            session('three', 'Relay title'),
            session('four', 'Useful relay title'),
        ];
        const merged = [
            session('one', 'Canonical one'),
            session('two', 'Already canonical'),
            session('three', 'Pi session'),
            session('four', '(NO MESSAGES)'),
        ];

        const candidates = findPiSessionNameBackfills(relay, merged);

        expect(candidates).toEqual([{
            sessionId: 'one',
            expectedVersion: 2,
            metadata: relay[0].metadata!,
            canonical: {
                name: 'Canonical one',
                machineId: 'machine-1',
                piSessionId: 'pi-one',
                flavor: 'pi',
            },
        }]);
    });

    it('retries a version race while preserving newer unrelated metadata', async () => {
        const candidate = findPiSessionNameBackfills(
            [session('one', 'Pi session')],
            [session('one', 'Canonical one')],
        );
        const encryptedMetadata: unknown[] = [];
        const updateMetadata = mock()
            .mockResolvedValueOnce({
                result: 'version-mismatch' as const,
                version: 3,
                metadata: 'latest-ciphertext',
            })
            .mockResolvedValueOnce({
                result: 'success' as const,
                version: 4,
                metadata: 'saved-ciphertext',
            });

        const result = await persistPiSessionNameBackfills(candidate, {
            encryptMetadata: async (_sessionId, metadata) => {
                encryptedMetadata.push(metadata);
                return JSON.stringify(metadata);
            },
            decryptMetadata: async () => ({
                path: '/newer-path',
                host: 'workstation',
                name: 'Concurrent title',
                summary: { text: 'preserve me', updatedAt: 10 },
            }),
            updateMetadata,
        });

        expect(result).toEqual({ updated: 1, failed: 0 });
        expect(updateMetadata).toHaveBeenCalledTimes(2);
        expect(encryptedMetadata[1]).toMatchObject({
            path: '/newer-path',
            summary: { text: 'preserve me', updatedAt: 10 },
            name: 'Canonical one',
            machineId: 'machine-1',
            piSessionId: 'pi-one',
            flavor: 'pi',
        });
    });

    it('keeps the persisted canonical title on an offline cold relaunch', async () => {
        const relay = session('one', 'Pi session');
        const merged = session('one', 'Canonical one');
        let persistedMetadata = relay.metadata!;
        let persistedVersion = relay.metadataVersion;

        const result = await persistPiSessionNameBackfills(
            findPiSessionNameBackfills([relay], [merged]),
            {
                encryptMetadata: async (_sessionId, metadata) => JSON.stringify(metadata),
                decryptMetadata: async (_sessionId, _version, ciphertext) => JSON.parse(ciphertext),
                updateMetadata: async ({ metadata }) => {
                    persistedMetadata = JSON.parse(metadata);
                    persistedVersion += 1;
                    return { result: 'success', version: persistedVersion, metadata };
                },
            },
        );
        const relaunchedRelay = session('one', 'Pi session', {
            metadata: persistedMetadata,
            metadataVersion: persistedVersion,
        });
        const offlineSessions = mergePiDiscoveredSessions([relaunchedRelay], []);

        expect(result).toEqual({ updated: 1, failed: 0 });
        expect(offlineSessions[0].metadata?.name).toBe('Canonical one');
        expect(findPiSessionNameBackfills([relaunchedRelay], offlineSessions)).toEqual([]);
    });

    it('backfills an older stable-tag row even when its encrypted metadata lacks Pi identity', () => {
        const legacy = session('legacy', 'Pi session', {
            metadata: {
                path: '/repo',
                host: 'workstation',
                name: 'Pi session',
            },
        });
        const canonical = session('legacy', 'Canonical legacy title');

        expect(findPiSessionNameBackfills([legacy], [canonical])).toHaveLength(1);
    });

    it('fails one row without preventing other canonical names from persisting', async () => {
        const candidates = findPiSessionNameBackfills(
            [session('one', 'Pi session'), session('two', 'Pi session')],
            [session('one', 'Canonical one'), session('two', 'Canonical two')],
        );

        const result = await persistPiSessionNameBackfills(candidates, {
            encryptMetadata: async (_sessionId, metadata) => JSON.stringify(metadata),
            decryptMetadata: async () => null,
            updateMetadata: async ({ sessionId }) => sessionId === 'one'
                ? { result: 'error' as const, message: 'offline' }
                : { result: 'success' as const, version: 3, metadata: 'saved' },
        });

        expect(result).toEqual({ updated: 1, failed: 1 });
    });
});
