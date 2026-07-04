import { describe, expect, it } from 'vitest';
import { AxiosError } from 'axios';

import { formatAuthRequestFailure } from './auth';

function axiosError(code?: string, status?: number) {
    return new AxiosError('request failed', code, undefined, undefined, status ? {
        status,
        statusText: String(status),
        headers: {},
        config: {} as any,
        data: {},
    } : undefined);
}

describe('formatAuthRequestFailure', () => {
    it('prints actionable relay-start guidance for refused local relay connections', () => {
        const message = formatAuthRequestFailure(axiosError('ECONNREFUSED'), 'http://127.0.0.1:3005');

        expect(message).toContain('Lyntty relay is not running');
        expect(message).toContain('lyntty server --host 0.0.0.0 --port 3005');
        expect(message).toContain('lyntty auth login --force --method mobile');
    });

    it('prints route mismatch guidance for incompatible relay URLs', () => {
        const message = formatAuthRequestFailure(axiosError(undefined, 404), 'http://127.0.0.1:3005');

        expect(message).toContain('/v1/auth/request');
        expect(message).toContain('compatible Lyntty relay');
    });
});
