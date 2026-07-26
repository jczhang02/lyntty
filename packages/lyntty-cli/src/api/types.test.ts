import { describe, expect, it } from 'bun:test';

import { MachineMetadataSchema } from './types';

const baseMetadata = {
  host: 'workstation',
  platform: 'linux',
  lynttyCliVersion: '2.0.0',
  homeDir: '/tmp/home',
  lynttyHomeDir: '/tmp/lyntty',
  lynttyLibDir: '/tmp/lyntty/lib',
};

describe('MachineMetadataSchema', () => {
  it('advertises Pi session discovery separately from executable availability', () => {
    const parsed = MachineMetadataSchema.parse({
      ...baseMetadata,
      cliAvailability: { pi: false, detectedAt: 1 },
      piSessionDiscovery: { available: true },
    });

    expect(parsed.cliAvailability?.pi).toBe(false);
    expect(parsed.piSessionDiscovery).toEqual({ available: true });
  });

  it('keeps metadata from older daemons readable', () => {
    const parsed = MachineMetadataSchema.parse(baseMetadata);

    expect(parsed.piSessionDiscovery).toBeUndefined();
  });
});
