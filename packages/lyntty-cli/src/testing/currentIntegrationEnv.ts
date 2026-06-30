import type { IntegrationEnvironment } from './integrationEnvironment';

declare global {
    // eslint-disable-next-line no-var
    var __lynttyIntegrationEnv: IntegrationEnvironment | undefined;
}

export function getIntegrationEnv(): IntegrationEnvironment {
    if (!globalThis.__lynttyIntegrationEnv) {
        throw new Error('No active integration environment');
    }

    return globalThis.__lynttyIntegrationEnv;
}
