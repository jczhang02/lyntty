import type { Metadata } from '@/sync/storageTypes';
import { getCodeAgentDefaults } from '@/sync/agentDefaults';

export type ModeOption = {
    key: string;
    name: string;
    description?: string | null;
};

export type PermissionMode = ModeOption;
export type ModelMode = ModeOption;
export type EffortLevel = ModeOption;
export type PermissionModeKey = string;
export type ModelModeKey = string;
export type AgentFlavor = string | null | undefined;

type Translate = (key: any) => string;
type MetadataOption = {
    code: string;
    value: string;
    description?: string | null;
};

export function mapMetadataOptions(options?: MetadataOption[] | null): ModeOption[] {
    return (options ?? []).map((option) => ({
        key: option.code,
        name: option.value,
        description: option.description ?? null,
    }));
}

export function getPiPermissionModes(translate: Translate): PermissionMode[] {
    return [{ key: 'default', name: translate('agentInput.permissionMode.default'), description: null }];
}

export function getHardcodedPermissionModes(flavor: AgentFlavor, translate: Translate): PermissionMode[] {
    return flavor && flavor !== 'pi' ? [] : getPiPermissionModes(translate);
}

export function getPiModelModes(): ModelMode[] {
    return [{ key: 'default', name: 'pi default', description: null }];
}

export function getHardcodedModelModes(flavor: AgentFlavor, _translate: Translate): ModelMode[] {
    return flavor && flavor !== 'pi' ? [] : getPiModelModes();
}

export function getAvailableModels(
    flavor: AgentFlavor,
    metadata: Metadata | null | undefined,
    translate: Translate,
): ModelMode[] {
    if (flavor && flavor !== 'pi') return [];
    const metadataModels = mapMetadataOptions(metadata?.models);
    if (metadataModels.length > 0) {
        return metadataModels;
    }
    return getHardcodedModelModes(flavor, translate);
}

export function getAvailablePermissionModes(
    flavor: AgentFlavor,
    _metadata: Metadata | null | undefined,
    translate: Translate,
): PermissionMode[] {
    return getHardcodedPermissionModes(flavor, translate);
}

export function findOptionByKey<T extends ModeOption>(options: T[], key: string | null | undefined): T | null {
    if (!key) {
        return null;
    }
    return options.find((option) => option.key === key) ?? null;
}

export function resolveCurrentOption<T extends ModeOption>(
    options: T[],
    preferredKeys: Array<string | null | undefined>,
): T | null {
    for (const key of preferredKeys) {
        const option = findOptionByKey(options, key);
        if (option) {
            return option;
        }
    }
    return null;
}

export function getDefaultModelKey(flavor: AgentFlavor): string {
    return getCodeAgentDefaults(flavor).modelMode;
}

export function getDefaultPermissionModeKey(flavor: AgentFlavor): string {
    return getCodeAgentDefaults(flavor).permissionMode;
}

export function getPiEffortLevels(): EffortLevel[] {
    // lynttyd does not advertise or apply remote thinking-level changes in v1.
    return [];
}

export function getHardcodedEffortLevels(_flavor: AgentFlavor): EffortLevel[] {
    return getPiEffortLevels();
}

export function getDefaultEffortKey(flavor: AgentFlavor): string | null {
    return getCodeAgentDefaults(flavor).effortLevel;
}

export function getEffortLevelsForModel(_flavor: AgentFlavor, _modelKey: string): EffortLevel[] {
    return getPiEffortLevels();
}

export function getDefaultEffortKeyForModel(flavor: AgentFlavor, modelKey: string): string | null {
    const levels = getEffortLevelsForModel(flavor, modelKey);
    return getCodeAgentDefaults(flavor).effortLevel ?? levels[levels.length - 1]?.key ?? null;
}

export function getSupportsWorktree(_flavor: AgentFlavor): boolean {
    return true;
}
