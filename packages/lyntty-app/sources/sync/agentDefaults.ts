import * as z from 'zod';

export const agentKeys = ['pi'] as const;
export type AgentKey = typeof agentKeys[number];

export const AgentDefaultOverrideSchema = z.object({
    permissionMode: z.string().optional(),
    modelMode: z.string().optional(),
    effortLevel: z.string().optional(),
}).passthrough();

// Passthrough preserves inherited settings on read, while the active product
// surface only reads and writes the Pi override.
export const AgentDefaultOverridesSchema = z.object({
    pi: AgentDefaultOverrideSchema.optional(),
}).passthrough().default({});

export type AgentDefaultOverride = z.infer<typeof AgentDefaultOverrideSchema>;
export type AgentDefaultOverrides = z.infer<typeof AgentDefaultOverridesSchema>;
export type AgentDefaultField = keyof Pick<AgentDefaultOverride, 'permissionMode' | 'modelMode' | 'effortLevel'>;

export type AgentDefaultConfig = {
    permissionMode: string;
    modelMode: string;
    effortLevel: string | null;
};

const piDefaults: AgentDefaultConfig = {
    permissionMode: 'default',
    modelMode: 'default',
    // Remote model/thinking-level changes are intentionally outside v1 scope.
    effortLevel: null,
};

export function normalizeAgentKey(_flavor: string | null | undefined): AgentKey {
    return 'pi';
}

export function getCodeAgentDefaults(_flavor: string | null | undefined): AgentDefaultConfig {
    return piDefaults;
}

export function getAgentDefaultOverride(
    overrides: AgentDefaultOverrides | null | undefined,
    _flavor: string | null | undefined,
): AgentDefaultOverride {
    return overrides?.pi ?? {};
}

export function resolveAgentDefaultConfig(
    overrides: AgentDefaultOverrides | null | undefined,
    flavor: string | null | undefined,
): AgentDefaultConfig {
    const codeDefaults = getCodeAgentDefaults(flavor);
    const userOverride = getAgentDefaultOverride(overrides, flavor);
    return {
        permissionMode: userOverride.permissionMode ?? codeDefaults.permissionMode,
        modelMode: userOverride.modelMode ?? codeDefaults.modelMode,
        effortLevel: userOverride.effortLevel ?? codeDefaults.effortLevel,
    };
}

export function hasAgentDefaultOverride(
    overrides: AgentDefaultOverrides | null | undefined,
    flavor: string | null | undefined,
    field: AgentDefaultField,
): boolean {
    return getAgentDefaultOverride(overrides, flavor)[field] !== undefined;
}

export function getAgentDefaultOverrideValue(
    overrides: AgentDefaultOverrides | null | undefined,
    flavor: string | null | undefined,
    field: AgentDefaultField,
): string | undefined {
    return getAgentDefaultOverride(overrides, flavor)[field];
}

export function setAgentDefaultOverride(
    overrides: AgentDefaultOverrides | null | undefined,
    _flavor: string | null | undefined,
    field: AgentDefaultField,
    value: string | null | undefined,
): AgentDefaultOverrides {
    const next: AgentDefaultOverrides = { ...(overrides ?? {}) };
    const current: AgentDefaultOverride = { ...(next.pi ?? {}) };

    if (value === null || value === undefined) {
        delete current[field];
    } else {
        current[field] = value;
    }

    if (current.permissionMode === undefined && current.modelMode === undefined && current.effortLevel === undefined) {
        delete next.pi;
    } else {
        next.pi = current;
    }

    return next;
}
