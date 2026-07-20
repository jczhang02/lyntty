export function getLynttyRelayHealthUrl(url: string): string {
    return new URL('/health', url).toString();
}

export function isLynttyRelayHealthResponse(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }

    const response = value as Record<string, unknown>;
    return response.status === 'ok' && response.service === 'lyntty-relay';
}

type LynttyRelayFetcher = (url: string, init: RequestInit) => Promise<Response>;

export async function probeLynttyRelay(
    url: string,
    fetcher: LynttyRelayFetcher = fetch,
): Promise<'ok' | 'server-error' | 'not-relay'> {
    const response = await fetcher(getLynttyRelayHealthUrl(url), {
        method: 'GET',
        headers: {
            Accept: 'application/json',
        },
    });
    if (!response.ok) {
        return 'server-error';
    }

    try {
        return isLynttyRelayHealthResponse(await response.json()) ? 'ok' : 'not-relay';
    } catch {
        return 'not-relay';
    }
}

export function validateServerUrlForEnvironment(url: string, appEnv = process.env.APP_ENV): { valid: boolean; error?: string } {
    if (!url || !url.trim()) {
        return { valid: false, error: 'Server URL cannot be empty' };
    }

    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return { valid: false, error: 'Server URL must use HTTP or HTTPS protocol' };
        }
        if (appEnv === 'production' && parsed.protocol === 'http:') {
            return { valid: false, error: 'Production builds require an HTTPS Lyntty relay URL' };
        }
        return { valid: true };
    } catch {
        return { valid: false, error: 'Invalid URL format' };
    }
}
