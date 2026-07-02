import { describe, expect, it } from 'vitest';

import { resolvePiRelaySessionTag } from './piRelaySessionTag';

describe('resolvePiRelaySessionTag', () => {
  it('uses a stable relay tag for the same machine and Pi session', () => {
    expect(resolvePiRelaySessionTag('machine-1', 'pi-session-1')).toBe(resolvePiRelaySessionTag('machine-1', 'pi-session-1'));
    expect(resolvePiRelaySessionTag('machine-1', 'pi-session-1')).toMatch(/^pi:[a-f0-9]{32}$/);
  });

  it('keeps unrelated Pi sessions isolated', () => {
    expect(resolvePiRelaySessionTag('machine-1', 'pi-session-1')).not.toBe(resolvePiRelaySessionTag('machine-1', 'pi-session-2'));
    expect(resolvePiRelaySessionTag('machine-1', 'pi-session-1')).not.toBe(resolvePiRelaySessionTag('machine-2', 'pi-session-1'));
  });
});
