import type { Machine, PiMachineSessionRecord } from './storageTypes';

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_RECORDS_PER_MACHINE = 5_000;
const DEFAULT_MAX_PAGES_PER_MACHINE = 100;

export class PiSessionIndexRefreshingError extends Error {
    constructor(machineId: string) {
        super(`Pi session index is refreshing for machine ${machineId}`);
        this.name = 'PiSessionIndexRefreshingError';
    }
}

export interface PiSessionDiscoveryPage {
    sessions: PiMachineSessionRecord[];
    nextCursor?: string;
    total?: number;
    refreshing?: boolean;
}

export interface FetchPiSessionPagesOptions {
    machines: Machine[];
    pageSize?: number;
    maxRecordsPerMachine?: number;
    maxPagesPerMachine?: number;
    requestPage: (options: {
        machine: Machine;
        limit: number;
        cursor?: string;
    }) => Promise<PiSessionDiscoveryPage>;
    onPage: (page: {
        machine: Machine;
        sessions: PiMachineSessionRecord[];
        complete: boolean;
        truncated: boolean;
        total?: number;
    }) => void;
    onError: (failure: { machine: Machine; error: Error }) => void;
}

export async function fetchPiSessionPages(options: FetchPiSessionPagesOptions): Promise<void> {
    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    const maxRecordsPerMachine = options.maxRecordsPerMachine ?? DEFAULT_MAX_RECORDS_PER_MACHINE;
    const maxPagesPerMachine = options.maxPagesPerMachine ?? DEFAULT_MAX_PAGES_PER_MACHINE;

    await Promise.all(options.machines.map(async (machine) => {
        let cursor: string | undefined;
        let loaded = 0;
        let pageCount = 0;
        const seenCursors = new Set<string>();
        try {
            do {
                const page = await options.requestPage({ machine, limit: pageSize, cursor });
                pageCount += 1;
                if (page.sessions.length === 0 && page.nextCursor) {
                    throw new Error(`Pi session discovery returned an empty page with another cursor for machine ${machine.id}`);
                }
                loaded += page.sessions.length;
                const complete = !page.nextCursor && page.refreshing !== true;
                const truncated = !complete && page.refreshing !== true
                    && (loaded >= maxRecordsPerMachine || pageCount >= maxPagesPerMachine);
                options.onPage({
                    machine,
                    sessions: page.sessions,
                    complete,
                    truncated,
                    total: page.total,
                });
                if (page.refreshing) {
                    throw new PiSessionIndexRefreshingError(machine.id);
                }
                if (complete || truncated) return;
                if (page.nextCursor === cursor || seenCursors.has(page.nextCursor!)) {
                    throw new Error(`Pi session discovery cursor did not advance for machine ${machine.id}`);
                }
                seenCursors.add(page.nextCursor!);
                cursor = page.nextCursor;
            } while (cursor);
        } catch (error) {
            options.onError({
                machine,
                error: error instanceof Error ? error : new Error(String(error)),
            });
        }
    }));
}
