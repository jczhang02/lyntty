import { describe, expect, it } from 'vitest';
import { validateServerUrlForEnvironment } from './serverConfigUtils';

describe('serverConfig URL validation', () => {
    it('rejects cleartext HTTP in production builds', () => {
        expect(validateServerUrlForEnvironment('http://192.168.1.10:3005', 'production')).toEqual({
            valid: false,
            error: 'Production builds require an HTTPS Lyntty relay URL',
        });
    });

    it('allows cleartext HTTP outside production for local relay testing', () => {
        expect(validateServerUrlForEnvironment('http://10.0.2.2:3005', 'development')).toEqual({ valid: true });
    });
});
