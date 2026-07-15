import * as z from 'zod';
import { AgentDefaultOverridesSchema } from './agentDefaults';

//
// Settings Schema
//

// Current schema version for backward compatibility
export const SUPPORTED_SCHEMA_VERSION = 2;

export const SettingsSchema = z.object({
    // Schema version for compatibility detection
    schemaVersion: z.number().default(SUPPORTED_SCHEMA_VERSION).describe('Settings schema version for compatibility checks'),

    viewInline: z.boolean().describe('Whether to view inline tool calls'),
    expandTodos: z.boolean().describe('Whether to expand todo lists'),
    showLineNumbers: z.boolean().describe('Whether to show line numbers in diffs'),
    showLineNumbersInToolViews: z.boolean().describe('Whether to show line numbers in tool view diffs'),
    wrapLinesInDiffs: z.boolean().describe('Whether to wrap long lines in diff views'),
    diffStyle: z.enum(['unified', 'split']).describe('Diff view style'),
    experiments: z.boolean().describe('Whether to enable experimental features'),
    alwaysShowContextSize: z.boolean().describe('Always show context size in agent input'),
    avatarStyle: z.string().describe('Avatar display style'),

    hideInactiveSessions: z.boolean().describe('Hide inactive sessions in the main list'),
    fileDiffsSidebar: z.boolean().describe('Show the file diffs sidebar next to the chat on desktop'),
    groupToolCalls: z.boolean().describe('Collapse consecutive tool calls into grouped containers in chat'),
    sendMobileContextToPi: z.boolean().describe('Tell pi when user messages are sent from Lyntty mobile'),
    reviewPromptAnswered: z.boolean().describe('Whether the review prompt has been answered'),
    reviewPromptLikedApp: z.boolean().nullish().describe('Whether user liked the app when asked'),
    preferredLanguage: z.string().nullable().describe('Preferred UI language (null for auto-detect from device locale)'),
    recentMachinePaths: z.array(z.object({
        machineId: z.string(),
        path: z.string()
    })).describe('Last 10 machine-path combinations, ordered by most recent first'),
    lastUsedAgent: z.string().nullable().describe('Last selected agent type for new sessions'),
    lastUsedPermissionMode: z.string().nullable().describe('Last selected permission mode for new sessions'),
    lastUsedModelMode: z.string().nullable().describe('Last selected model mode for new sessions'),
    agentDefaultOverrides: AgentDefaultOverridesSchema.describe('User-selected agent defaults. Missing values use code defaults and are not sent as agent metadata.'),
});

//
// NOTE: Settings must be a flat object with no to minimal nesting, one field == one setting,
// you can name them with a prefix if you want to group them, but don't nest them.
// You can nest if value is a single value (like image with url and width and height)
// Settings are always merged with defaults and field by field.
//
// This structure must be forward and backward compatible. Meaning that some versions of the app
// could be missing some fields or have a new fields. Everything must be preserved and client must
// only touch the fields it knows about.
//

const SettingsSchemaPartial = SettingsSchema.partial();

export type Settings = z.infer<typeof SettingsSchema>;

//
// Defaults
//

export const settingsDefaults: Settings = {
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    viewInline: false,
    expandTodos: true,
    showLineNumbers: true,
    showLineNumbersInToolViews: false,
    wrapLinesInDiffs: true,
    diffStyle: 'unified',
    experiments: false,
    alwaysShowContextSize: false,
    avatarStyle: 'gradient',

    hideInactiveSessions: false,
    fileDiffsSidebar: false,
    groupToolCalls: false,
    sendMobileContextToPi: true,
    reviewPromptAnswered: false,
    reviewPromptLikedApp: null,
    preferredLanguage: null,
    recentMachinePaths: [],
    lastUsedAgent: null,
    lastUsedPermissionMode: null,
    lastUsedModelMode: null,
    agentDefaultOverrides: {},
};
Object.freeze(settingsDefaults);

//
// Resolving
//

export function settingsParse(settings: unknown): Settings {
    // Handle null/undefined/invalid inputs
    if (!settings || typeof settings !== 'object') {
        return { ...settingsDefaults };
    }

    const parsed = SettingsSchemaPartial.safeParse(settings);
    if (!parsed.success) {
        // For invalid settings, preserve unknown fields but use defaults for known fields
        const unknownFields = { ...(settings as any) };
        // Remove all known schema fields from unknownFields
        const knownFields = Object.keys(SettingsSchema.shape);
        knownFields.forEach(key => delete unknownFields[key]);
        return { ...settingsDefaults, ...unknownFields };
    }

    // Migration: Convert old 'zh' language code to 'zh-Hans'
    if (parsed.data.preferredLanguage === 'zh') {
        console.log('[Settings Migration] Converting language code from "zh" to "zh-Hans"');
        parsed.data.preferredLanguage = 'zh-Hans';
    }

    // Merge defaults, parsed settings, and preserve unknown fields
    const unknownFields = { ...(settings as any) };
    // Remove known fields from unknownFields to preserve only the unknown ones
    Object.keys(parsed.data).forEach(key => delete unknownFields[key]);

    return { ...settingsDefaults, ...parsed.data, ...unknownFields };
}

//
// Applying changes
// NOTE: May be something more sophisticated here around defaults and merging, but for now this is fine.
//

export function applySettings(settings: Settings, delta: Partial<Settings>): Settings {
    // Original behavior: start with settings, apply delta, fill in missing with defaults
    const result = { ...settings, ...delta };

    // Fill in any missing fields with defaults
    Object.keys(settingsDefaults).forEach(key => {
        if (!(key in result)) {
            (result as any)[key] = (settingsDefaults as any)[key];
        }
    });

    return result;
}

export function settingsToSyncPayload(settings: Settings): Partial<Settings> {
    const result: Partial<Settings> = { ...settings };
    const compactAgentOverrides = Object.fromEntries(
        Object.entries(settings.agentDefaultOverrides ?? {}).filter(([, value]) => (
            value && typeof value === 'object' && Object.keys(value).length > 0
        )),
    ) as Settings['agentDefaultOverrides'];
    if (Object.keys(compactAgentOverrides).length === 0) {
        delete result.agentDefaultOverrides;
    } else {
        result.agentDefaultOverrides = compactAgentOverrides;
    }
    return result;
}
