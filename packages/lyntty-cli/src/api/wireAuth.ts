import { configuration } from '@/configuration';
import { CURRENT_WIRE_OFFER } from 'lyntty-wire';

export function createCliSocketAuth<T extends Record<string, unknown>>(
  auth: T,
  clientName: 'cli-daemon' | 'cli-coding-session' | 'cli-remote' | 'cli-remote-session',
) {
  return {
    ...auth,
    lynttyClient: `${clientName}/${configuration.currentCliVersion}`,
    wire: CURRENT_WIRE_OFFER,
    component: { kind: 'cli' as const, version: configuration.currentCliVersion },
  };
}
