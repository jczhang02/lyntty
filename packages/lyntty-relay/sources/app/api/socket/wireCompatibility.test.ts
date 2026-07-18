import { describe, expect, it } from 'bun:test';
import { CURRENT_WIRE_OFFER } from 'lyntty-wire';
import { negotiateSocketWireOffer } from './wireCompatibility';

describe('Relay socket Wire negotiation', () => {
    it('admits missing offers only through the explicit legacy window', () => {
        expect(negotiateSocketWireOffer(undefined)).toMatchObject({
            legacyPeer: true,
            decision: { compatible: true, protocolMajor: 1, protocolMinor: 0 },
        });
    });

    it('negotiates current and one-minor future peers', () => {
        expect(negotiateSocketWireOffer(CURRENT_WIRE_OFFER)).toMatchObject({
            legacyPeer: false,
            decision: { compatible: true, protocolMinor: 1 },
        });
        expect(negotiateSocketWireOffer({ ...CURRENT_WIRE_OFFER, protocolMinor: 2 }))
            .toMatchObject({ decision: { compatible: true, protocolMinor: 1 } });
    });

    it('rejects malformed, major-incompatible, two-minor, and under-capable peers', () => {
        expect(negotiateSocketWireOffer({ ...CURRENT_WIRE_OFFER, protocolMinor: 3 }))
            .toMatchObject({ decision: { compatible: false, reason: 'minor-skew' } });
        expect(negotiateSocketWireOffer({ ...CURRENT_WIRE_OFFER, protocolMajor: 2 }))
            .toMatchObject({ decision: { compatible: false, reason: 'major-mismatch' } });
        expect(negotiateSocketWireOffer({ ...CURRENT_WIRE_OFFER, capabilities: [] }))
            .toMatchObject({ decision: { compatible: false, reason: 'missing-capability' } });
        expect(negotiateSocketWireOffer({ protocolMajor: '1' }))
            .toMatchObject({ decision: { compatible: false, reason: 'invalid-offer' } });
        expect(negotiateSocketWireOffer(null))
            .toMatchObject({ legacyPeer: false, decision: { compatible: false, reason: 'invalid-offer' } });
    });
});
