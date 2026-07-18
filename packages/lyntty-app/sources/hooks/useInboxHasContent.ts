import { useNativeUpdate } from './useNativeUpdate';
import { useChangelog } from './useChangelog';

// Hook to check if inbox has content to show
export function useInboxHasContent(): boolean {
    const nativeUpdate = useNativeUpdate();
    const changelog = useChangelog();

    return nativeUpdate?.available === true || changelog.hasUnread === true;
}
