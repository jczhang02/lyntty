import { MMKV } from 'react-native-mmkv';
import { Settings, settingsDefaults, settingsParse, settingsToSyncPayload, SettingsSchema } from './settings';
import { LocalSettings, localSettingsDefaults, localSettingsParse } from './localSettings';
import type { PermissionModeKey } from '@/components/PermissionModeSelector';

const mmkv = new MMKV();
const NEW_SESSION_DRAFT_KEY = 'new-session-draft-v1';
const REGISTERED_PUSH_TOKEN_KEY = 'registered-push-token-v1';
const PENDING_OUTBOX_KEY = 'pending-message-outbox-v1';
const PENDING_SYNTHETIC_OUTBOX_KEY = 'pending-synthetic-message-outbox-v1';

export type PersistedOutboxMessage = {
    localId: string;
    content: string;
};

export function parsePendingOutbox(raw: string | undefined): Map<string, PersistedOutboxMessage[]> {
    const result = new Map<string, PersistedOutboxMessage[]>();
    if (!raw) return result;
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return result;
        for (const [sessionId, entries] of Object.entries(parsed).slice(0, 100)) {
            if (!sessionId || !Array.isArray(entries)) continue;
            const valid = entries.slice(0, 1_000).filter((entry): entry is PersistedOutboxMessage => (
                Boolean(entry)
                && typeof entry === 'object'
                && typeof (entry as PersistedOutboxMessage).localId === 'string'
                && typeof (entry as PersistedOutboxMessage).content === 'string'
            ));
            if (valid.length > 0) result.set(sessionId, valid);
        }
    } catch (error) {
        console.error('Failed to parse pending message outbox', error);
    }
    return result;
}

export function loadPendingOutbox(): Map<string, PersistedOutboxMessage[]> {
    return parsePendingOutbox(mmkv.getString(PENDING_OUTBOX_KEY));
}

export function savePendingOutbox(outbox: Map<string, PersistedOutboxMessage[]>): void {
    mmkv.set(PENDING_OUTBOX_KEY, JSON.stringify(Object.fromEntries(outbox)));
}

export type PersistedSyntheticOutboxMessage = {
    localId: string;
    machineId: string;
    piSessionId: string;
    text: string;
    options?: unknown;
};

export function parsePendingSyntheticOutbox(raw: string | undefined): Map<string, PersistedSyntheticOutboxMessage[]> {
    const result = new Map<string, PersistedSyntheticOutboxMessage[]>();
    if (!raw) return result;
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return result;
        for (const [sessionId, entries] of Object.entries(parsed).slice(0, 100)) {
            if (!sessionId || !Array.isArray(entries)) continue;
            const identity = /^pi-local:([^:]+):(.+)$/.exec(sessionId);
            const valid = entries.slice(0, 1_000).flatMap((entry, index): PersistedSyntheticOutboxMessage[] => {
                if (!entry || typeof entry !== 'object' || typeof (entry as { text?: unknown }).text !== 'string') return [];
                const candidate = entry as Partial<PersistedSyntheticOutboxMessage>;
                const text = (entry as { text: string }).text;
                if (
                    typeof candidate.localId === 'string'
                    && typeof candidate.machineId === 'string'
                    && typeof candidate.piSessionId === 'string'
                ) return [candidate as PersistedSyntheticOutboxMessage];
                if (!identity) return [];
                // v1 migration: the synthetic row id already carried both Pi
                // identity fields. Derive a stable id so restart migration is
                // idempotent rather than silently dropping the queued send.
                return [{
                    localId: `synthetic:${sessionId}:${index}`,
                    machineId: identity[1],
                    piSessionId: identity[2],
                    text,
                    options: candidate.options,
                }];
            });
            if (valid.length > 0) result.set(sessionId, valid);
        }
    } catch (error) {
        console.error('Failed to parse pending synthetic message outbox', error);
    }
    return result;
}

export function loadPendingSyntheticOutbox(): Map<string, PersistedSyntheticOutboxMessage[]> {
    return parsePendingSyntheticOutbox(mmkv.getString(PENDING_SYNTHETIC_OUTBOX_KEY));
}

export function savePendingSyntheticOutbox(outbox: Map<string, PersistedSyntheticOutboxMessage[]>): void {
    mmkv.set(PENDING_SYNTHETIC_OUTBOX_KEY, JSON.stringify(Object.fromEntries(outbox)));
}

export type NewSessionAgentType = 'pi';
export type NewSessionSessionType = 'simple' | 'worktree';

export interface NewSessionDraft {
    input: string;
    selectedMachineId: string | null;
    selectedPath: string | null;
    agentType: NewSessionAgentType;
    permissionMode: PermissionModeKey;
    modelMode: string;
    sessionType: NewSessionSessionType;
    worktreeKey: string | null;
    updatedAt: number;
}

export function loadSettings(): { settings: Settings, version: number | null } {
    const settings = mmkv.getString('settings');
    if (settings) {
        try {
            const parsed = JSON.parse(settings);
            return { settings: settingsParse(parsed.settings), version: parsed.version };
        } catch (e) {
            console.error('Failed to parse settings', e);
            return { settings: { ...settingsDefaults }, version: null };
        }
    }
    return { settings: { ...settingsDefaults }, version: null };
}

export function saveSettings(settings: Settings, version: number) {
    mmkv.set('settings', JSON.stringify({ settings: settingsToSyncPayload(settings), version }));
}

export function loadPendingSettings(): Partial<Settings> {
    const pending = mmkv.getString('pending-settings');
    if (pending) {
        try {
            const parsed = JSON.parse(pending);
            return SettingsSchema.partial().parse(parsed);
        } catch (e) {
            console.error('Failed to parse pending settings', e);
            return {};
        }
    }
    return {};
}

export function savePendingSettings(settings: Partial<Settings>) {
    mmkv.set('pending-settings', JSON.stringify(settings));
}

export function loadLocalSettings(): LocalSettings {
    const localSettings = mmkv.getString('local-settings');
    if (localSettings) {
        try {
            const parsed = JSON.parse(localSettings);
            return localSettingsParse(parsed);
        } catch (e) {
            console.error('Failed to parse local settings', e);
            return { ...localSettingsDefaults };
        }
    }
    return { ...localSettingsDefaults };
}

export function saveLocalSettings(settings: LocalSettings) {
    mmkv.set('local-settings', JSON.stringify(settings));
}

export function loadThemePreference(): 'light' | 'dark' | 'adaptive' {
    const localSettings = mmkv.getString('local-settings');
    if (localSettings) {
        try {
            const parsed = JSON.parse(localSettings);
            const settings = localSettingsParse(parsed);
            return settings.themePreference;
        } catch (e) {
            console.error('Failed to parse local settings for theme preference', e);
            return localSettingsDefaults.themePreference;
        }
    }
    return localSettingsDefaults.themePreference;
}

export function loadSessionDrafts(): Record<string, string> {
    const drafts = mmkv.getString('session-drafts');
    if (drafts) {
        try {
            return JSON.parse(drafts);
        } catch (e) {
            console.error('Failed to parse session drafts', e);
            return {};
        }
    }
    return {};
}

export function saveSessionDrafts(drafts: Record<string, string>) {
    mmkv.set('session-drafts', JSON.stringify(drafts));
}

export function loadNewSessionDraft(): NewSessionDraft | null {
    const raw = mmkv.getString(NEW_SESSION_DRAFT_KEY);
    if (!raw) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }

        const input = typeof parsed.input === 'string' ? parsed.input : '';
        const selectedMachineId = typeof parsed.selectedMachineId === 'string' ? parsed.selectedMachineId : null;
        const selectedPath = typeof parsed.selectedPath === 'string' ? parsed.selectedPath : null;
        // Normalize inherited runtime choices at the persistence boundary.
        const agentType: NewSessionAgentType = 'pi';
        const permissionMode: PermissionModeKey = typeof parsed.permissionMode === 'string'
            ? parsed.permissionMode
            : 'default';
        const modelMode: string = typeof parsed.modelMode === 'string' ? parsed.modelMode : 'default';
        const sessionType: NewSessionSessionType = parsed.sessionType === 'worktree' ? 'worktree' : 'simple';
        const worktreeKey = typeof parsed.worktreeKey === 'string' ? parsed.worktreeKey : null;
        const updatedAt = typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now();

        return {
            input,
            selectedMachineId,
            selectedPath,
            agentType,
            permissionMode,
            modelMode,
            sessionType,
            worktreeKey,
            updatedAt,
        };
    } catch (e) {
        console.error('Failed to parse new session draft', e);
        return null;
    }
}

export function saveNewSessionDraft(draft: NewSessionDraft) {
    mmkv.set(NEW_SESSION_DRAFT_KEY, JSON.stringify(draft));
}

export function clearNewSessionDraft() {
    mmkv.delete(NEW_SESSION_DRAFT_KEY);
}

export function loadRegisteredPushToken(): string | null {
    return mmkv.getString(REGISTERED_PUSH_TOKEN_KEY) ?? null;
}

export function saveRegisteredPushToken(token: string) {
    mmkv.set(REGISTERED_PUSH_TOKEN_KEY, token);
}

export function clearRegisteredPushToken() {
    mmkv.delete(REGISTERED_PUSH_TOKEN_KEY);
}

export function loadSessionPermissionModes(): Record<string, string> {
    const modes = mmkv.getString('session-permission-modes');
    if (modes) {
        try {
            return JSON.parse(modes);
        } catch (e) {
            console.error('Failed to parse session permission modes', e);
            return {};
        }
    }
    return {};
}

export function saveSessionPermissionModes(modes: Record<string, string>) {
    mmkv.set('session-permission-modes', JSON.stringify(modes));
}

export function loadSessionModelModes(): Record<string, string> {
    const modes = mmkv.getString('session-model-modes');
    if (modes) {
        try {
            return JSON.parse(modes);
        } catch (e) {
            console.error('Failed to parse session model modes', e);
            return {};
        }
    }
    return {};
}

export function saveSessionModelModes(modes: Record<string, string>) {
    mmkv.set('session-model-modes', JSON.stringify(modes));
}

export function loadSessionEffortLevels(): Record<string, string> {
    const levels = mmkv.getString('session-effort-levels');
    if (levels) {
        try {
            return JSON.parse(levels);
        } catch (e) {
            console.error('Failed to parse session effort levels', e);
            return {};
        }
    }
    return {};
}

export function saveSessionEffortLevels(levels: Record<string, string>) {
    mmkv.set('session-effort-levels', JSON.stringify(levels));
}

// Simple temporary text storage for passing large strings between screens
export function storeTempText(content: string): string {
    const id = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    mmkv.set(`temp_text_${id}`, content);
    return id;
}

export function retrieveTempText(id: string): string | null {
    const content = mmkv.getString(`temp_text_${id}`);
    if (content) {
        // Auto-delete after retrieval
        mmkv.delete(`temp_text_${id}`);
        return content;
    }
    return null;
}

export function clearPersistence() {
    mmkv.clearAll();
}
