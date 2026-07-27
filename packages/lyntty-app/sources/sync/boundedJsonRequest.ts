type JsonFetcher = (input: string, init?: RequestInit) => Promise<Response>;

export async function fetchJsonWithTimeout(options: {
    url: string;
    init?: RequestInit;
    timeoutMs: number;
    label: string;
    fetcher?: JsonFetcher;
}): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
        const fetcher = options.fetcher ?? (globalThis.fetch as JsonFetcher);
        const response = await fetcher(options.url, {
            ...options.init,
            signal: controller.signal,
        });
        if (!response.ok) throw new Error(`${options.label} failed: ${response.status}`);
        return await response.json();
    } catch (error) {
        if (controller.signal.aborted) {
            throw new Error(`${options.label} timed out after ${options.timeoutMs}ms`);
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}
