export type AppEnvironment = 'development' | 'preview' | 'production' | string | undefined;

function isPrivateIpv4(hostname: string): boolean {
    const octets = hostname.split('.').map(Number);
    if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
        return false;
    }
    return octets[0] === 10
        || (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31)
        || (octets[0] === 192 && octets[1] === 168)
        || (octets[0] === 100 && octets[1]! >= 64 && octets[1]! <= 127);
}

function isLoopbackIpv4(hostname: string): boolean {
    const octets = hostname.split('.').map(Number);
    return octets.length === 4
        && octets.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)
        && octets[0] === 127;
}

function isLocalPreviewHostname(hostname: string): boolean {
    const normalized = hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1');
    const isLocalIpv6 = normalized.includes(':') && (
        normalized === '::1'
        || normalized.startsWith('fc')
        || normalized.startsWith('fd')
        || normalized.startsWith('fe80:')
    );
    return normalized === 'localhost'
        || normalized.endsWith('.localhost')
        || isLocalIpv6
        || isPrivateIpv4(normalized)
        || isLoopbackIpv4(normalized);
}

export type ServerUrlValidationResult = {
    valid: boolean;
    error?: string;
    errorCode?: 'preview-http-requires-local-network';
};

export function validateServerUrlForEnvironment(url: string, appEnv: AppEnvironment = process.env.APP_ENV): ServerUrlValidationResult {
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
        if (appEnv === 'preview' && parsed.protocol === 'http:' && !isLocalPreviewHostname(parsed.hostname)) {
            return {
                valid: false,
                error: 'Preview HTTP requires a localhost or private LAN relay address',
                errorCode: 'preview-http-requires-local-network',
            };
        }
        return { valid: true };
    } catch {
        return { valid: false, error: 'Invalid URL format' };
    }
}

export function requiresPreviewServerSetupForEnvironment(
    appEnv: AppEnvironment,
    configuredServerUrl: string | null | undefined,
): boolean {
    return appEnv === 'preview' && (
        !configuredServerUrl?.trim()
        || !validateServerUrlForEnvironment(configuredServerUrl, appEnv).valid
    );
}

export async function replaceServerUrlWithAuthBoundary(options: {
    currentUrl: string | null;
    nextUrl: string | null;
    clearAuth: () => Promise<void>;
    persistUrl: (url: string | null) => void;
    forceAuthClear?: boolean;
}): Promise<void> {
    if (options.forceAuthClear || options.currentUrl !== options.nextUrl) {
        await options.clearAuth();
    }
    options.persistUrl(options.nextUrl);
}

export function getLynttyRelayHealthUrl(url: string): string {
    return new URL('/health', url).toString();
}

export function isLynttyRelayHealthResponse(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
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
        headers: { Accept: 'application/json' },
    });
    if (!response.ok) return 'server-error';

    try {
        return isLynttyRelayHealthResponse(await response.json()) ? 'ok' : 'not-relay';
    } catch {
        return 'not-relay';
    }
}
