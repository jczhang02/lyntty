import { describe, expect, it } from 'vitest';

import { MachineMetadataSchema } from './storageTypes';

const baseMetadata = {
    host: 'workstation',
    platform: 'linux',
    lynttyCliVersion: '2.0.0',
    lynttyHomeDir: '/tmp/lyntty',
    homeDir: '/tmp/home',
};

describe('MachineMetadataSchema', () => {
    it('accepts Pi-only CLI capability metadata', () => {
        const parsed = MachineMetadataSchema.parse({
            ...baseMetadata,
            cliAvailability: { pi: true, detectedAt: 1 },
            resumeSupport: {
                rpcAvailable: true,
                requiresSameMachine: true,
                requiresRemoteAuth: true,
                remoteAuthenticated: true,
                detectedAt: 2,
            },
        });

        expect(parsed.cliAvailability).toEqual({ pi: true, detectedAt: 1 });
        expect(parsed.resumeSupport?.remoteAuthenticated).toBe(true);
    });

    it('keeps older machine metadata readable during the compatibility window', () => {
        expect(() => MachineMetadataSchema.parse({
            ...baseMetadata,
            cliAvailability: {
                pi: true,
                claude: false,
                codex: false,
                gemini: false,
                openclaw: false,
                detectedAt: 1,
            },
            resumeSupport: {
                rpcAvailable: true,
                requiresSameMachine: true,
                requiresLynttyAgentAuth: true,
                lynttyAgentAuthenticated: true,
                detectedAt: 2,
            },
        })).not.toThrow();
    });
});
