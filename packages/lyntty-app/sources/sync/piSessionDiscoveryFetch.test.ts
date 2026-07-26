import { describe, expect, it } from 'bun:test';

import type { Machine, PiMachineSessionRecord } from './storageTypes';
import { fetchPiSessionPages, PiSessionIndexRefreshingError } from './piSessionDiscoveryFetch';

function machine(id = 'machine-1'): Machine {
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
        },
        metadataVersion: 1,
        daemonState: null,
        daemonStateVersion: 1,
    };
}

function record(id: string): PiMachineSessionRecord {
    return {
        state: 'discovered_local',
        piSessionId: id,
        cwd: `/repo/${id}`,
        name: id,
        messageCount: 1,
        needsRegistration: true,
        needsBackfill: true,
        hasHistoryGap: false,
        reason: 'local Pi JSONL session is not registered with relay',
    };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolvePromise) => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
}

describe('fetchPiSessionPages', () => {
    it('publishes the first page without waiting for later pages', async () => {
        const node = machine();
        const secondPage = deferred<{ sessions: PiMachineSessionRecord[]; total: number }>();
        const firstPageApplied = deferred<void>();
        const pages: Array<{ ids: string[]; complete: boolean }> = [];

        const request = fetchPiSessionPages({
            machines: [node],
            pageSize: 1,
            requestPage: async ({ cursor }) => cursor
                ? secondPage.promise
                : { sessions: [record('pi-new')], nextCursor: 'next', total: 2 },
            onPage: ({ sessions, complete }) => {
                pages.push({ ids: sessions.map((session) => session.piSessionId), complete });
                firstPageApplied.resolve();
            },
            onError: () => undefined,
        });

        await firstPageApplied.promise;
        expect(pages).toEqual([{ ids: ['pi-new'], complete: false }]);

        secondPage.resolve({ sessions: [record('pi-old')], total: 2 });
        await request;
        expect(pages).toEqual([
            { ids: ['pi-new'], complete: false },
            { ids: ['pi-old'], complete: true },
        ]);
    });

    it('reports a bounded transport timeout as a recoverable machine error', async () => {
        const errors: Error[] = [];

        await fetchPiSessionPages({
            machines: [machine()],
            requestPage: async () => {
                throw new Error('operation has timed out');
            },
            onPage: () => {
                throw new Error('unexpected page');
            },
            onError: ({ error }) => errors.push(error),
        });

        expect(errors).toHaveLength(1);
        expect(errors[0]?.message).toContain('timed out');
    });

    it('publishes an index-warming tail without EOF pruning and requests a retry', async () => {
        const pages: Array<{ ids: string[]; complete: boolean }> = [];
        const errors: Error[] = [];

        await fetchPiSessionPages({
            machines: [machine()],
            requestPage: async () => ({
                sessions: [record('pi-tail')],
                total: 10,
                refreshing: true,
            }),
            onPage: ({ sessions, complete }) => pages.push({
                ids: sessions.map((session) => session.piSessionId),
                complete,
            }),
            onError: ({ error }) => errors.push(error),
        });

        expect(pages).toEqual([{ ids: ['pi-tail'], complete: false }]);
        expect(errors[0]).toBeInstanceOf(PiSessionIndexRefreshingError);
        expect(errors[0]?.message).toContain('index is refreshing');
    });

    it('isolates machine failures so another machine can still publish sessions', async () => {
        const pages: string[] = [];
        const errors: string[] = [];

        await fetchPiSessionPages({
            machines: [machine('good'), machine('bad')],
            requestPage: async ({ machine: node }) => {
                if (node.id === 'bad') throw new Error('offline');
                return { sessions: [record('pi-good')], total: 1 };
            },
            onPage: ({ machine: node, sessions }) => pages.push(`${node.id}:${sessions[0]?.piSessionId}`),
            onError: ({ machine: node }) => errors.push(node.id),
        });

        expect(pages).toEqual(['good:pi-good']);
        expect(errors).toEqual(['bad']);
    });

    it('stops a non-advancing cursor instead of looping forever', async () => {
        const errors: Error[] = [];
        let requests = 0;

        await fetchPiSessionPages({
            machines: [machine()],
            pageSize: 1,
            requestPage: async () => {
                requests += 1;
                return { sessions: [record(`pi-${requests}`)], nextCursor: 'same', total: 3 };
            },
            onPage: () => undefined,
            onError: ({ error }) => errors.push(error),
        });

        expect(requests).toBe(2);
        expect(errors[0]?.message).toContain('cursor did not advance');
    });

    it('rejects an empty page that claims another cursor', async () => {
        const errors: Error[] = [];
        let requests = 0;

        await fetchPiSessionPages({
            machines: [machine()],
            requestPage: async () => {
                requests += 1;
                return { sessions: [], nextCursor: `cursor-${requests}`, total: 1 };
            },
            onPage: () => undefined,
            onError: ({ error }) => errors.push(error),
        });

        expect(requests).toBe(1);
        expect(errors[0]?.message).toContain('empty page');
    });

    it('caps page count even when every cursor is unique', async () => {
        const pages: Array<{ complete: boolean; truncated: boolean }> = [];
        const errors: Error[] = [];
        let requests = 0;

        await fetchPiSessionPages({
            machines: [machine()],
            maxPagesPerMachine: 2,
            requestPage: async () => {
                requests += 1;
                return { sessions: [record(`pi-${requests}`)], nextCursor: `cursor-${requests}`, total: 10 };
            },
            onPage: ({ complete, truncated }) => pages.push({ complete, truncated }),
            onError: ({ error }) => errors.push(error),
        });

        expect(requests).toBe(2);
        expect(pages.at(-1)).toEqual({ complete: false, truncated: true });
        expect(errors).toEqual([]);
    });

    it('reports truncation without claiming the machine snapshot is complete', async () => {
        const pages: Array<{ complete: boolean; truncated: boolean }> = [];

        await fetchPiSessionPages({
            machines: [machine()],
            pageSize: 1,
            maxRecordsPerMachine: 1,
            requestPage: async () => ({ sessions: [record('pi-1')], nextCursor: 'more', total: 2 }),
            onPage: ({ complete, truncated }) => pages.push({ complete, truncated }),
            onError: () => undefined,
        });

        expect(pages).toEqual([{ complete: false, truncated: true }]);
    });
});
