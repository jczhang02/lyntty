import { beforeEach, describe, expect, it, vi } from 'bun:test';

const values = new Map<string, string>();
let appEnv: 'preview' | 'production' = 'preview';

vi.mock('react-native-mmkv', () => ({
    MMKV: class {
        getString(key: string): string | undefined {
            return values.get(key);
        }
        set(key: string, value: string): void {
            values.set(key, value);
        }
        delete(key: string): void {
            values.delete(key);
        }
    },
}));

vi.mock('./appConfig', () => ({
    loadAppConfig: () => ({ appEnv }),
}));

const {
    getConfiguredServerUrl,
    getServerUrl,
    isPreviewServerSetupRequired,
    setServerUrl,
    subscribeServerConfig,
} = await import('./serverConfig');

describe('Preview server configuration storage', () => {
    beforeEach(() => {
        values.clear();
        appEnv = 'preview';
        delete process.env.EXPO_PUBLIC_LYNTTY_SERVER_URL;
    });

    it('fails closed instead of contacting the public default before Preview setup', () => {
        process.env.EXPO_PUBLIC_LYNTTY_SERVER_URL = 'https://relay.example.test';

        expect(getConfiguredServerUrl()).toBeNull();
        expect(isPreviewServerSetupRequired()).toBe(true);
        expect(() => getServerUrl()).toThrow('Preview Relay URL must be configured before use');
    });

    it('persists an explicit Preview Relay and notifies the bootstrap gate', () => {
        let notifications = 0;
        const unsubscribe = subscribeServerConfig(() => { notifications += 1; });

        setServerUrl('  http://192.168.100.21:58821  ');

        expect(getConfiguredServerUrl()).toBe('http://192.168.100.21:58821');
        expect(getServerUrl()).toBe('http://192.168.100.21:58821');
        expect(isPreviewServerSetupRequired()).toBe(false);
        expect(notifications).toBe(1);
        unsubscribe();
    });

    it('returns Preview to mandatory setup after clearing the Relay', () => {
        setServerUrl('http://10.0.2.2:3005');
        setServerUrl(null);

        expect(isPreviewServerSetupRequired()).toBe(true);
        expect(() => getServerUrl()).toThrow('Preview Relay URL must be configured before use');
    });

    it('keeps the Stable public Relay fallback unchanged', () => {
        appEnv = 'production';

        expect(isPreviewServerSetupRequired()).toBe(false);
        expect(getServerUrl()).toBe('https://relay.jczhang.cc');
    });
});
