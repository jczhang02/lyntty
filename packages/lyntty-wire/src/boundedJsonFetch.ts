export type ReleaseMetadataFetcher = (input: string, init?: RequestInit) => Promise<Response>;

export const DEFAULT_RELEASE_METADATA_LIMIT_BYTES = 1024 * 1024;
export const DEFAULT_RELEASE_METADATA_TIMEOUT_MS = 10_000;

export async function fetchBoundedJson(options: {
  url: string;
  fetcher?: ReleaseMetadataFetcher;
  maxBytes?: number;
  timeoutMs?: number;
  canonicalBytes?: (value: unknown) => Uint8Array;
}): Promise<unknown> {
  const maxBytes = options.maxBytes ?? DEFAULT_RELEASE_METADATA_LIMIT_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_RELEASE_METADATA_TIMEOUT_MS;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('Release metadata byte limit must be positive');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('Release metadata timeout must be positive');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const fetcher = options.fetcher ?? (globalThis.fetch as unknown as ReleaseMetadataFetcher);
    const response = await fetcher(options.url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal as unknown as RequestInit['signal'],
    });
    if (!response.ok) throw new Error(`Release metadata request failed with HTTP ${response.status}`);
    const contentLengthValue = response.headers.get('content-length');
    if (contentLengthValue !== null) {
      const contentLength = Number(contentLengthValue);
      if (!Number.isSafeInteger(contentLength) || contentLength < 0) throw new Error('Release metadata has an invalid Content-Length');
      if (contentLength > maxBytes) throw new Error('Release metadata exceeds size limit');
    }
    if (!response.body) throw new Error('Release metadata response has no body');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel('release metadata exceeds size limit').catch(() => undefined);
          throw new Error('Release metadata exceeds size limit');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const value: unknown = JSON.parse(text);
    const canonical = options.canonicalBytes?.(value);
    if (canonical && (canonical.byteLength !== bytes.byteLength || canonical.some((byte, index) => byte !== bytes[index]))) {
      throw new Error('Release metadata is not in canonical file form');
    }
    return value;
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`Release metadata request timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
