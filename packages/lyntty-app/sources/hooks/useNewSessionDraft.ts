/**
 * Zustand store for the Pi new-session draft, backed by MMKV.
 * Persists the prompt, node, path, and worktree selection across navigation.
 */
import { create } from 'zustand';
import {
    loadNewSessionDraft,
    saveNewSessionDraft,
    type NewSessionSessionType,
} from '@/sync/persistence';

interface NewSessionDraftState {
    input: string;
    selectedMachineId: string | null;
    selectedPath: string | null;
    sessionType: NewSessionSessionType;
    worktreeKey: string | null;

    setInput: (input: string) => void;
    setMachineId: (id: string | null) => void;
    setPath: (path: string | null) => void;
    setSessionType: (type: NewSessionSessionType) => void;
    setWorktreeKey: (key: string | null) => void;
}

function persist(state: NewSessionDraftState) {
    saveNewSessionDraft({
        input: state.input,
        selectedMachineId: state.selectedMachineId,
        selectedPath: state.selectedPath,
        sessionType: state.sessionType,
        worktreeKey: state.worktreeKey,
        updatedAt: Date.now(),
    });
}

const initial = loadNewSessionDraft();

export const useNewSessionDraft = create<NewSessionDraftState>()((set, get) => ({
    input: initial?.input ?? '',
    selectedMachineId: initial?.selectedMachineId ?? null,
    selectedPath: initial?.selectedPath ?? null,
    sessionType: initial?.sessionType ?? 'simple',
    worktreeKey: initial?.worktreeKey ?? null,

    setInput: (input) => { set({ input }); persist(get()); },
    setMachineId: (id) => {
        set({ selectedMachineId: id, selectedPath: null, sessionType: 'simple', worktreeKey: null });
        persist(get());
    },
    setPath: (path) => {
        set({ selectedPath: path, sessionType: 'simple', worktreeKey: null });
        persist(get());
    },
    setSessionType: (type) => { set({ sessionType: type }); persist(get()); },
    setWorktreeKey: (key) => { set({ worktreeKey: key }); persist(get()); },
}));
