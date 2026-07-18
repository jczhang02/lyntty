import { describe, expect, it } from 'bun:test';
import { fetchBoundedJson } from './boundedJsonFetch';

function chunkedResponse(chunks: string[], headers: Record<string, string> = {}) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }), { status: 200, headers });
}

describe('bounded release metadata fetch', () => {
  it('parses a chunked JSON body below the actual-byte limit', async () => {
    expect(await fetchBoundedJson({
      url: 'https://example.invalid/bom.json',
      maxBytes: 64,
      fetcher: async () => chunkedResponse(['{"ok":', 'true}']),
    })).toEqual({ ok: true });
  });

  it('enforces exact canonical file bytes when a trust format supplies them', async () => {
    const canonicalBytes = (value: unknown) => new TextEncoder().encode(`${JSON.stringify(value)}\n`);
    expect(await fetchBoundedJson({
      url: 'https://example.invalid/canonical.json',
      canonicalBytes,
      fetcher: async () => new Response('{"ok":true}\n'),
    })).toEqual({ ok: true });
    await expect(fetchBoundedJson({
      url: 'https://example.invalid/noncanonical.json',
      canonicalBytes,
      fetcher: async () => new Response('{ "ok": true }\n'),
    })).rejects.toThrow('not in canonical file form');
  });

  it('aborts chunked and declared oversized bodies before JSON parsing', async () => {
    await expect(fetchBoundedJson({
      url: 'https://example.invalid/bom.json',
      maxBytes: 8,
      fetcher: async () => chunkedResponse(['{"value":', '"too-large"}']),
    })).rejects.toThrow('exceeds size limit');
    await expect(fetchBoundedJson({
      url: 'https://example.invalid/bom.json',
      maxBytes: 8,
      fetcher: async () => chunkedResponse(['{}'], { 'content-length': '9' }),
    })).rejects.toThrow('exceeds size limit');
  });

  it('aborts a stalled request at the configured deadline', async () => {
    const fetcher = ((_: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    })) as typeof fetch;
    await expect(fetchBoundedJson({
      url: 'https://example.invalid/bom.json',
      timeoutMs: 10,
      fetcher,
    })).rejects.toThrow('timed out after 10ms');
  });
});
