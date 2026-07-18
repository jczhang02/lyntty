import { describe, expect, it, mock, spyOn, jest } from 'bun:test';

import { PiActivationLeaseRegistry } from './activationLeaseRegistry';

describe('PiActivationLeaseRegistry', () => {
  it('serializes concurrent activation attempts without swallowing a later takeover intent', async () => {
    const registry = new PiActivationLeaseRegistry();
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = registry.run('machine:pi-session', async () => {
      order.push('reuse-start');
      await firstGate;
      order.push('reuse-end');
      return 'reused';
    });
    const secondActivate = mock(async () => {
      order.push('takeover');
      return 'taken-over';
    });
    const second = registry.run('machine:pi-session', secondActivate);

    await Promise.resolve();
    expect(secondActivate).not.toHaveBeenCalled();
    releaseFirst();

    await expect(first).resolves.toBe('reused');
    await expect(second).resolves.toBe('taken-over');
    expect(order).toEqual(['reuse-start', 'reuse-end', 'takeover']);
  });

  it('releases the lease after a failed activation', async () => {
    const registry = new PiActivationLeaseRegistry();
    await expect(registry.run('machine:pi-session', async () => {
      throw new Error('failed');
    })).rejects.toThrow('failed');

    await expect(registry.run('machine:pi-session', async () => 'retry')).resolves.toBe('retry');
  });
});
