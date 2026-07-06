import type { Session } from './storageTypes';
import { sessionArchive, sessionKill } from './ops';

type ArchiveableSession = Pick<Session, 'id' | 'active'> & {
    metadata?: Pick<NonNullable<Session['metadata']>, 'controlState' | 'runtimeOwner'> | null;
};

export type StopAndArchiveSessionResult = {
    success: boolean;
    stopped: boolean;
    archived: boolean;
    message?: string;
};

export function shouldStopBeforeArchive(session: ArchiveableSession): boolean {
    const controlState = session.metadata?.controlState;
    if (controlState === 'missing_local_history' || controlState === 'computer_offline') {
        return false;
    }

    if (session.active) {
        return true;
    }

    // Relay `active` can lag behind ordinary computer-side Pi extension presence.
    // Treat ready pi-extension sessions as stoppable so archive does not hide a live TUI.
    return session.metadata?.runtimeOwner === 'pi-extension' && controlState === 'ready';
}

function formatStopFailure(message?: string): string {
    if (message?.includes('RPC method not available')) {
        return 'Unable to stop this Pi session from Lyntty. Make sure the Pi extension is loaded, then try again.';
    }
    return message || 'Unable to stop this Pi session from Lyntty.';
}

export async function stopAndArchiveSession(session: ArchiveableSession): Promise<StopAndArchiveSessionResult> {
    const shouldStop = shouldStopBeforeArchive(session);

    if (shouldStop) {
        const killResult = await sessionKill(session.id);
        if (!killResult.success) {
            return {
                success: false,
                stopped: false,
                archived: false,
                message: formatStopFailure(killResult.message),
            };
        }
    }

    const archiveResult = await sessionArchive(session.id);
    if (!archiveResult.success) {
        return {
            success: false,
            stopped: shouldStop,
            archived: false,
            message: archiveResult.message || 'Failed to archive this session.',
        };
    }

    return {
        success: true,
        stopped: shouldStop,
        archived: true,
    };
}
