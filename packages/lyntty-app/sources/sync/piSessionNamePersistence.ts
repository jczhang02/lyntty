import { normalizeCanonicalPiSessionTitle } from './piDiscoveredSessions';
import type { Metadata, Session } from './storageTypes';

type SessionSnapshot = Omit<Session, 'presence'> & { presence?: Session['presence'] };

type CanonicalPiIdentity = {
    name: string;
    machineId?: string;
    piSessionId?: string;
    flavor: 'pi';
};

export type PiSessionNameBackfill = {
    sessionId: string;
    expectedVersion: number;
    metadata: Metadata;
    canonical: CanonicalPiIdentity;
};

type MetadataUpdateResult =
    | { result: 'success'; version: number; metadata: string }
    | { result: 'version-mismatch'; version: number; metadata: string }
    | { result: 'error'; message?: string };

export type PiSessionNameBackfillAdapter = {
    encryptMetadata: (sessionId: string, metadata: Metadata) => Promise<string>;
    decryptMetadata: (sessionId: string, version: number, ciphertext: string) => Promise<Metadata | null>;
    updateMetadata: (request: {
        sessionId: string;
        metadata: string;
        expectedVersion: number;
    }) => Promise<MetadataUpdateResult>;
};

function canonicalPiIdentity(metadata: Metadata | null): CanonicalPiIdentity | null {
    if (!metadata) return null;
    const name = normalizeCanonicalPiSessionTitle(metadata.name);
    if (!name || metadata.piSynthetic === true) {
        return null;
    }
    return {
        name,
        machineId: metadata.machineId,
        piSessionId: metadata.piSessionId,
        flavor: 'pi',
    };
}

export function findPiSessionNameBackfills(
    relaySessions: SessionSnapshot[],
    mergedSessions: SessionSnapshot[],
): PiSessionNameBackfill[] {
    const mergedById = new Map(mergedSessions.map((session) => [session.id, session]));
    return relaySessions.flatMap((relaySession) => {
        const relayMetadata = relaySession.metadata;
        if (
            !relayMetadata
            || (relayMetadata.flavor !== 'pi' && !relaySession.tag?.startsWith('pi:'))
        ) return [];
        const canonical = canonicalPiIdentity(mergedById.get(relaySession.id)?.metadata ?? null);
        if (!canonical || relayMetadata.name?.trim() === canonical.name) return [];
        return [{
            sessionId: relaySession.id,
            expectedVersion: relaySession.metadataVersion,
            metadata: relayMetadata,
            canonical,
        }];
    });
}

function applyCanonicalIdentity(metadata: Metadata, canonical: CanonicalPiIdentity): Metadata {
    return {
        ...metadata,
        name: canonical.name,
        ...(canonical.machineId ? { machineId: canonical.machineId } : {}),
        ...(canonical.piSessionId ? { piSessionId: canonical.piSessionId } : {}),
        flavor: 'pi',
    };
}

async function persistOnePiSessionNameBackfill(
    candidate: PiSessionNameBackfill,
    adapter: PiSessionNameBackfillAdapter,
): Promise<void> {
    let version = candidate.expectedVersion;
    let metadata = candidate.metadata;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const encrypted = await adapter.encryptMetadata(
            candidate.sessionId,
            applyCanonicalIdentity(metadata, candidate.canonical),
        );
        const result = await adapter.updateMetadata({
            sessionId: candidate.sessionId,
            metadata: encrypted,
            expectedVersion: version,
        });
        if (result.result === 'success') return;
        if (result.result === 'error') {
            throw new Error(result.message || 'Failed to persist canonical Pi session name');
        }
        const latest = await adapter.decryptMetadata(candidate.sessionId, result.version, result.metadata);
        if (!latest) {
            throw new Error('Failed to decrypt concurrent Pi session metadata update');
        }
        version = result.version;
        metadata = latest;
    }
    throw new Error('Failed to persist canonical Pi session name after version retries');
}

export async function persistPiSessionNameBackfills(
    candidates: PiSessionNameBackfill[],
    adapter: PiSessionNameBackfillAdapter,
    concurrency = 4,
): Promise<{ updated: number; failed: number }> {
    let nextIndex = 0;
    let updated = 0;
    let failed = 0;
    const worker = async (): Promise<void> => {
        while (nextIndex < candidates.length) {
            const candidate = candidates[nextIndex++];
            try {
                await persistOnePiSessionNameBackfill(candidate, adapter);
                updated += 1;
            } catch {
                failed += 1;
            }
        }
    };
    const workerCount = Math.min(Math.max(Math.floor(concurrency), 1), candidates.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return { updated, failed };
}
