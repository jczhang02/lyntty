import { createHash, randomUUID } from 'node:crypto';

export function resolvePiRelaySessionTag(machineId: string, piSessionId?: string): string {
  if (!piSessionId) {
    return randomUUID();
  }
  const digest = createHash('sha256')
    .update(`${machineId}:${piSessionId}`)
    .digest('hex')
    .slice(0, 32);
  return `pi:${digest}`;
}
