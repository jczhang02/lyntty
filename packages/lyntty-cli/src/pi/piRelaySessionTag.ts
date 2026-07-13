import { createHash } from 'node:crypto';

export function resolvePiRelaySessionTag(machineId: string, piSessionId: string): string {
  const digest = createHash('sha256')
    .update(`${machineId}:${piSessionId}`)
    .digest('hex')
    .slice(0, 32);
  return `pi:${digest}`;
}
