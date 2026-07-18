import { describe, expect, it } from 'bun:test';
import {
  CURRENT_WIRE_OFFER,
  LEGACY_WIRE_OFFER,
  negotiateWireCompatibility,
  normalizeWireOffer,
} from './wireCompatibility';

describe('Wire compatibility negotiation', () => {
  it('negotiates the current offer with the legacy one-minor window', () => {
    expect(negotiateWireCompatibility({
      local: CURRENT_WIRE_OFFER,
      remote: LEGACY_WIRE_OFFER,
      requiredRemoteCapabilities: ['pi.shared-control.v1', 'pi.command-idempotency.v1'],
    })).toEqual({
      compatible: true,
      protocolMajor: 1,
      protocolMinor: 0,
      capabilities: [...CURRENT_WIRE_OFFER.capabilities].sort(),
    });
  });

  it('allows a one-minor rolling upgrade in either direction', () => {
    const next = { ...CURRENT_WIRE_OFFER, protocolMinor: 2 };
    expect(negotiateWireCompatibility({ local: CURRENT_WIRE_OFFER, remote: next }).compatible).toBe(true);
    expect(negotiateWireCompatibility({ local: next, remote: CURRENT_WIRE_OFFER }).compatible).toBe(true);
  });

  it('rejects major mismatch and a two-minor skew', () => {
    expect(negotiateWireCompatibility({
      local: CURRENT_WIRE_OFFER,
      remote: { ...CURRENT_WIRE_OFFER, protocolMajor: 2 },
    })).toMatchObject({ compatible: false, reason: 'major-mismatch' });
    expect(negotiateWireCompatibility({
      local: LEGACY_WIRE_OFFER,
      remote: { ...CURRENT_WIRE_OFFER, protocolMinor: 2 },
    })).toMatchObject({ compatible: false, reason: 'minor-skew' });
  });

  it('fails closed for malformed offers and missing required capabilities', () => {
    expect(normalizeWireOffer({ ...CURRENT_WIRE_OFFER, capabilities: ['pi.shared-control.v1', 'pi.shared-control.v1'] })).toBeNull();
    expect(negotiateWireCompatibility({ local: CURRENT_WIRE_OFFER, remote: null }))
      .toMatchObject({ compatible: false, reason: 'invalid-offer' });
    expect(negotiateWireCompatibility({
      local: CURRENT_WIRE_OFFER,
      remote: { ...CURRENT_WIRE_OFFER, capabilities: ['pi.shared-control.v1'] },
      requiredRemoteCapabilities: ['pi.owner-epoch.v1'],
    })).toMatchObject({ compatible: false, reason: 'missing-capability' });
  });
});
