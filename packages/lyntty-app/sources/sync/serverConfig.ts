import { MMKV } from 'react-native-mmkv';
import { loadAppConfig } from './appConfig';
import {
    requiresPreviewServerSetupForEnvironment,
    validateServerUrlForEnvironment,
} from './serverConfigUtils';

// Separate MMKV instance for server config that persists across logouts
const serverConfigStorage = new MMKV({ id: 'server-config' });

const SERVER_KEY = 'custom-server-url';
const LOG_SERVER_KEY = 'log-server-url';
const DEFAULT_SERVER_URL = 'https://relay.jczhang.cc';
const serverConfigListeners = new Set<() => void>();

function appEnvironment(): string | undefined {
    return loadAppConfig().appEnv || process.env.APP_ENV;
}

function notifyServerConfigListeners(): void {
    for (const listener of serverConfigListeners) listener();
}

export function getConfiguredServerUrl(): string | null {
    return serverConfigStorage.getString(SERVER_KEY) || null;
}

export function isPreviewAppEnvironment(): boolean {
    return appEnvironment() === 'preview';
}

export function isPreviewServerSetupRequired(): boolean {
    return requiresPreviewServerSetupForEnvironment(appEnvironment(), getConfiguredServerUrl());
}

export function subscribeServerConfig(listener: () => void): () => void {
    serverConfigListeners.add(listener);
    return () => serverConfigListeners.delete(listener);
}

export function getServerUrl(): string {
    const configured = getConfiguredServerUrl();
    if (configured) return configured;
    if (isPreviewServerSetupRequired()) {
        throw new Error('Preview Relay URL must be configured before use');
    }
    return (globalThis as any).__LYNTTY_CONFIG__?.serverUrl
        || process.env.EXPO_PUBLIC_LYNTTY_SERVER_URL
        || DEFAULT_SERVER_URL;
}

export function setServerUrl(url: string | null): void {
    const previous = getConfiguredServerUrl();
    const next = url?.trim() || null;
    if (next) serverConfigStorage.set(SERVER_KEY, next);
    else serverConfigStorage.delete(SERVER_KEY);
    if (previous !== next) notifyServerConfigListeners();
}

export function getLogServerUrl(): string | null {
    return serverConfigStorage.getString(LOG_SERVER_KEY)
        || process.env.EXPO_PUBLIC_LOG_SERVER_URL
        || null;
}

export function setLogServerUrl(url: string | null): void {
    if (url && url.trim()) {
        serverConfigStorage.set(LOG_SERVER_KEY, url.trim());
    } else {
        serverConfigStorage.delete(LOG_SERVER_KEY);
    }
}

export function isUsingCustomServer(): boolean {
    const configured = getConfiguredServerUrl();
    if (configured) return true;
    if (isPreviewServerSetupRequired()) return false;
    return getServerUrl() !== DEFAULT_SERVER_URL;
}

export function getServerInfo(): { hostname: string; port?: number; isCustom: boolean } {
    const configured = getConfiguredServerUrl();
    const url = configured || (isPreviewServerSetupRequired() ? '' : getServerUrl());
    const isCustom = isUsingCustomServer();

    try {
        const parsed = new URL(url);
        const port = parsed.port ? parseInt(parsed.port) : undefined;
        return {
            hostname: parsed.hostname,
            port,
            isCustom,
        };
    } catch {
        return {
            hostname: url,
            port: undefined,
            isCustom,
        };
    }
}

export function validateServerUrl(url: string): { valid: boolean; error?: string } {
    return validateServerUrlForEnvironment(url, appEnvironment());
}
