import { z } from 'zod';

export const WireCapabilitySchema = z.enum([
  'pi.activation-lock.v1',
  'pi.command-idempotency.v1',
  'pi.history-gap.v1',
  'pi.history-pagination.v1',
  'pi.owner-epoch.v1',
  'pi.shared-control.v1',
]);

export type WireCapability = z.infer<typeof WireCapabilitySchema>;

export const WireOfferSchema = z.object({
  protocolMajor: z.number().int().positive(),
  protocolMinor: z.number().int().nonnegative(),
  capabilities: z.array(WireCapabilitySchema).max(32),
}).strict().superRefine((offer, context) => {
  if (new Set(offer.capabilities).size !== offer.capabilities.length) {
    context.addIssue({
      code: 'custom',
      path: ['capabilities'],
      message: 'Wire capabilities must be unique',
    });
  }
});

export type WireOffer = z.infer<typeof WireOfferSchema>;

export const CURRENT_WIRE_OFFER: Readonly<WireOffer> = Object.freeze({
  protocolMajor: 1,
  protocolMinor: 1,
  capabilities: Object.freeze([
    'pi.activation-lock.v1',
    'pi.command-idempotency.v1',
    'pi.history-gap.v1',
    'pi.history-pagination.v1',
    'pi.owner-epoch.v1',
    'pi.shared-control.v1',
  ]) as unknown as WireCapability[],
});

export const LEGACY_WIRE_OFFER: Readonly<WireOffer> = Object.freeze({
  protocolMajor: 1,
  protocolMinor: 0,
  capabilities: CURRENT_WIRE_OFFER.capabilities,
});

export type WireCompatibilityDecision = {
  compatible: true;
  protocolMajor: number;
  protocolMinor: number;
  capabilities: WireCapability[];
} | {
  compatible: false;
  reason: 'invalid-offer' | 'major-mismatch' | 'minor-skew' | 'missing-capability';
  details: string;
};

export function normalizeWireOffer(value: unknown): WireOffer | null {
  const parsed = WireOfferSchema.safeParse(value);
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    capabilities: [...parsed.data.capabilities].sort(),
  };
}

export function negotiateWireCompatibility(options: {
  local: unknown;
  remote: unknown;
  requiredRemoteCapabilities?: readonly WireCapability[];
  maxMinorSkew?: number;
}): WireCompatibilityDecision {
  const local = normalizeWireOffer(options.local);
  const remote = normalizeWireOffer(options.remote);
  if (!local || !remote) {
    return { compatible: false, reason: 'invalid-offer', details: 'Wire offer is malformed' };
  }
  if (local.protocolMajor !== remote.protocolMajor) {
    return {
      compatible: false,
      reason: 'major-mismatch',
      details: `Wire protocol major ${local.protocolMajor} cannot connect to ${remote.protocolMajor}`,
    };
  }
  const maxMinorSkew = options.maxMinorSkew ?? 1;
  if (!Number.isInteger(maxMinorSkew) || maxMinorSkew < 0) {
    throw new Error('maxMinorSkew must be a non-negative integer');
  }
  if (Math.abs(local.protocolMinor - remote.protocolMinor) > maxMinorSkew) {
    return {
      compatible: false,
      reason: 'minor-skew',
      details: `Wire protocol minor ${local.protocolMinor} is outside the supported window of ${remote.protocolMinor}`,
    };
  }
  const remoteCapabilities = new Set(remote.capabilities);
  const missing = [...(options.requiredRemoteCapabilities ?? [])]
    .filter(capability => !remoteCapabilities.has(capability))
    .sort();
  if (missing.length > 0) {
    return {
      compatible: false,
      reason: 'missing-capability',
      details: `Remote is missing required Wire capability ${missing.join(', ')}`,
    };
  }
  const localCapabilities = new Set(local.capabilities);
  return {
    compatible: true,
    protocolMajor: local.protocolMajor,
    protocolMinor: Math.min(local.protocolMinor, remote.protocolMinor),
    capabilities: [...remoteCapabilities]
      .filter(capability => localCapabilities.has(capability))
      .sort(),
  };
}
