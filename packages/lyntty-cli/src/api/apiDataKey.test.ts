import { describe, expect, it } from 'vitest';

import { deriveSessionDataKey } from './api';

describe('deriveSessionDataKey', () => {
  it('derives stable per-tag data keys for tag-idempotent sessions', () => {
    const machineKey = new Uint8Array(32).fill(7);

    expect(deriveSessionDataKey(machineKey, 'pi:abc')).toEqual(deriveSessionDataKey(machineKey, 'pi:abc'));
    expect(deriveSessionDataKey(machineKey, 'pi:abc')).not.toEqual(deriveSessionDataKey(machineKey, 'pi:def'));
    expect(deriveSessionDataKey(machineKey, 'pi:abc')).toHaveLength(32);
  });
});
