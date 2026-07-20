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
