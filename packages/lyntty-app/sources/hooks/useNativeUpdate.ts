import { storage } from '@/sync/storage';
import { useShallow } from 'zustand/react/shallow';

export type NativeUpdateStatus = {
    available: boolean;
    updateUrl?: string;
    versionName?: string;
    versionCode?: number;
    sha256?: string;
    notes?: string;
};

export function useNativeUpdate(): NativeUpdateStatus | null {
    return storage(useShallow((state) => state.nativeUpdateStatus));
}
