import { afterAll } from 'vitest';
import {
    applyEnvironmentToProcess,
    createIntegrationEnvironment,
    destroyIntegrationEnvironment,
    type EnvironmentTemplate,
    type IntegrationEnvironment,
} from './integrationEnvironment';

type IntegrationEnvironmentProfile = {
    template: EnvironmentTemplate;
    up: boolean;
};

declare global {
    // eslint-disable-next-line no-var
    var __lynttyIntegrationEnv: IntegrationEnvironment | undefined;
}

export async function installIntegrationEnvironment(profile: IntegrationEnvironmentProfile) {
    const previousEnv = {
        LYNTTY_SERVER_URL: process.env.LYNTTY_SERVER_URL,
        LYNTTY_WEBAPP_URL: process.env.LYNTTY_WEBAPP_URL,
        LYNTTY_HOME_DIR: process.env.LYNTTY_HOME_DIR,
        LYNTTY_PROJECT_DIR: process.env.LYNTTY_PROJECT_DIR,
        LYNTTY_VARIANT: process.env.LYNTTY_VARIANT,
        DEBUG: process.env.DEBUG,
    };

    const env = await createIntegrationEnvironment(profile);
    applyEnvironmentToProcess(env);
    globalThis.__lynttyIntegrationEnv = env;

    afterAll(async () => {
        try {
            await destroyIntegrationEnvironment(env);
        } finally {
            for (const [key, value] of Object.entries(previousEnv)) {
                if (value === undefined) {
                    delete process.env[key];
                } else {
                    process.env[key] = value;
                }
            }

            if (globalThis.__lynttyIntegrationEnv?.name === env.name) {
                globalThis.__lynttyIntegrationEnv = undefined;
            }
        }
    });
}
