import type { AuthTokenExtras } from './auth';

export type SocketClientType = 'session-scoped' | 'user-scoped' | 'machine-scoped';

export function isClientTypeAllowedByToken(extras: AuthTokenExtras | undefined, clientType: SocketClientType): boolean {
    const allowedClientTypes = extras?.allowedClientTypes;
    return !Array.isArray(allowedClientTypes) || allowedClientTypes.includes(clientType);
}
