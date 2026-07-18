import {
    CURRENT_WIRE_OFFER,
    LEGACY_WIRE_OFFER,
    negotiateWireCompatibility,
} from 'lyntty-wire';

export function negotiateSocketWireOffer(explicitWireOffer: unknown) {
    const legacyPeer = explicitWireOffer === undefined;
    const decision = negotiateWireCompatibility({
        local: CURRENT_WIRE_OFFER,
        remote: legacyPeer ? LEGACY_WIRE_OFFER : explicitWireOffer,
        requiredRemoteCapabilities: [
            'pi.command-idempotency.v1',
            'pi.shared-control.v1',
        ],
    });
    return { decision, legacyPeer };
}
