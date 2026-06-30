export interface SafePreviewConfig {
    uri: string;
    originWhitelist: string[];
    javaScriptEnabled: boolean;
    allowFileAccess: boolean;
    allowUniversalAccessFromFileURLs: boolean;
    allowsInlineMediaPlayback: boolean;
    nativeBridgeEnabled: boolean;
}

export type PreviewAccessDecision =
    | { allowed: true }
    | { allowed: false; reason: 'outside_jail' | 'expired_token' | 'write_method' | 'missing_path' };

export interface PreviewAccessRequest {
    rootRealPath: string;
    requestedRealPath: string;
    method: string;
    tokenExpiresAt: number;
    now: number;
}

const ALLOWED_PREVIEW_PROTOCOLS = new Set(['http:', 'https:']);

export function normalizeSafePreviewUri(rawUri: string): string | null {
    try {
        const url = new URL(rawUri);
        if (!ALLOWED_PREVIEW_PROTOCOLS.has(url.protocol)) return null;
        if (!url.hostname) return null;
        if (url.username || url.password) return null;
        url.hash = '';
        return url.toString();
    } catch {
        return null;
    }
}

export function createSafePreviewConfig(rawUri: string): SafePreviewConfig | null {
    const uri = normalizeSafePreviewUri(rawUri);
    if (!uri) return null;
    return {
        uri,
        originWhitelist: ['http://*', 'https://*'],
        javaScriptEnabled: false,
        allowFileAccess: false,
        allowUniversalAccessFromFileURLs: false,
        allowsInlineMediaPlayback: false,
        nativeBridgeEnabled: false,
    };
}

function normalizeRealPath(path: string): string {
    return path.replace(/\/+$/g, '');
}

export function validatePreviewAccess(request: PreviewAccessRequest): PreviewAccessDecision {
    const root = normalizeRealPath(request.rootRealPath);
    const target = normalizeRealPath(request.requestedRealPath);
    if (!root || !target) {
        return { allowed: false, reason: 'missing_path' };
    }
    if (request.now > request.tokenExpiresAt) {
        return { allowed: false, reason: 'expired_token' };
    }
    const method = request.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
        return { allowed: false, reason: 'write_method' };
    }
    if (target !== root && !target.startsWith(`${root}/`)) {
        return { allowed: false, reason: 'outside_jail' };
    }
    return { allowed: true };
}
