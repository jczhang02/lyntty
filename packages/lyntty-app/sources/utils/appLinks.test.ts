import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('production deep-link association files', () => {
    it('declares the production Lyntty Android package', () => {
        const assetLinksPath = new URL('../../public/.well-known/assetlinks.json', import.meta.url);
        const assetLinks = JSON.parse(readFileSync(assetLinksPath, 'utf8')) as Array<{
            target?: { package_name?: string; sha256_cert_fingerprints?: string[] };
        }>;
        const packageNames = assetLinks.map((entry) => entry.target?.package_name);
        expect(packageNames).toContain('dev.jczhang.lyntty');
        expect(packageNames).not.toContain('com.ex3ndr.lyntty');
        expect(assetLinks[0]?.target?.sha256_cert_fingerprints?.[0]).toMatch(/^[A-F0-9]{2}(:[A-F0-9]{2}){31}$/);
    });

    it('declares the production Lyntty iOS bundle id', () => {
        const associationPath = new URL('../../public/.well-known/apple-app-site-association', import.meta.url);
        const association = JSON.parse(readFileSync(associationPath, 'utf8')) as {
            applinks?: { details?: Array<{ appIDs?: string[] }> };
            activitycontinuation?: { apps?: string[] };
        };
        expect(association.applinks?.details?.[0]?.appIDs).toContain('466DQWDR8C.dev.jczhang.lyntty');
        expect(association.activitycontinuation?.apps).toContain('466DQWDR8C.dev.jczhang.lyntty');
        expect(JSON.stringify(association)).not.toContain('com.ex3ndr.lyntty');
    });
});
