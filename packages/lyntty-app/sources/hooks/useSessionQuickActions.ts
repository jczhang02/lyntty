import * as React from 'react';
import { useLynttyAction } from '@/hooks/useLynttyAction';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { Modal } from '@/modal';
import { machineResumePiWithActivationChoice } from '@/sync/ops';
import { stopAndArchiveSession } from '@/sync/archiveSessionAction';
import { maybeCleanupWorktree } from '@/hooks/useWorktreeCleanup';
import { useMachine } from '@/sync/storage';
import { Machine, Session } from '@/sync/storageTypes';
import { canControlSession } from '@/sync/sessionControlPolicy';
import { sync } from '@/sync/sync';
import { t } from '@/text';
import { LynttyError } from '@/utils/errors';
import { useSessionStatus } from '@/utils/sessionUtils';
import { isMachineOnline } from '@/utils/machineUtils';
import { useRouter } from 'expo-router';
import { useSession } from '@/sync/storage';
import { requestPiResumeTakeoverChoice } from './piResumeTakeoverChoice';

export interface SessionActionItem {
    id: string;
    label: string;
    icon: string;
    onPress: () => void;
    destructive?: boolean;
}

interface UseSessionQuickActionsOptions {
    onAfterArchive?: () => void;
    onAfterDelete?: () => void;
}

type ResumeAvailability = {
    canResume: boolean;
    canShowResume: boolean;
    subtitle: string;
    message: string;
};

export function getResumeAvailability(session: Session, machine: Machine | null | undefined, isConnected: boolean): ResumeAvailability {
    if (!canControlSession(session.metadata) || isConnected) {
        return {
            canResume: false,
            canShowResume: false,
            subtitle: '',
            message: '',
        };
    }

    const machineId = session.metadata?.machineId;
    if (!machineId) {
        const message = t('sessionInfo.resumeSessionMissingMachine');
        return {
            canResume: false,
            canShowResume: true,
            subtitle: message,
            message,
        };
    }

    const hasPiSessionId = Boolean(session.metadata?.piSessionId);
    if (!hasPiSessionId) {
        const message = t('sessionInfo.resumeSessionMissingBackendId');
        return {
            canResume: false,
            canShowResume: true,
            subtitle: message,
            message,
        };
    }

    if (!machine) {
        const message = t('sessionInfo.resumeSessionSameMachineOnly');
        return {
            canResume: false,
            canShowResume: true,
            subtitle: message,
            message,
        };
    }

    if (!isMachineOnline(machine)) {
        return {
            canResume: false,
            canShowResume: true,
            subtitle: t('sessionInfo.resumeSessionMachineOffline'),
            message: t('sessionInfo.resumeSessionMachineOffline'),
        };
    }

    return {
        canResume: true,
        canShowResume: true,
        subtitle: t('sessionInfo.resumeSessionSubtitle'),
        message: t('sessionInfo.resumeSessionSubtitle'),
    };
}

export function useSessionQuickActions(
    session: Session,
    options: UseSessionQuickActionsOptions = {},
) {
    const { onAfterArchive } = options;
    const router = useRouter();
    const navigateToSession = useNavigateToSession();
    const sessionStatus = useSessionStatus(session);
    const machineId = session.metadata?.machineId ?? '';
    const machine = useMachine(machineId);
    const resumeAvailability = React.useMemo(
        () => getResumeAvailability(session, machine, sessionStatus.isConnected),
        [machine, session, sessionStatus.isConnected],
    );

    const openDetails = React.useCallback(() => {
        router.push(`/session/${session.id}/info`);
    }, [router, session.id]);

    const [resumingSession, performResume] = useLynttyAction(async () => {
        if (!resumeAvailability.canResume) {
            throw new LynttyError(resumeAvailability.message, false);
        }

        if (!machineId) {
            throw new LynttyError(t('sessionInfo.resumeSessionMissingMachine'), false);
        }

        const piSessionId = session.metadata?.piSessionId;
        const directory = session.metadata?.path;
        if (!piSessionId) {
            throw new LynttyError(t('sessionInfo.resumeSessionMissingBackendId'), false);
        }
        if (!directory) {
            throw new LynttyError(t('sessionInfo.resumeSessionUnexpectedDirectoryPrompt'), false);
        }
        const result = await machineResumePiWithActivationChoice(
            { machineId, directory, piSessionId },
            requestPiResumeTakeoverChoice,
        );
        if (!result) {
            return;
        }

        switch (result.type) {
            case 'success': {
                // Session reconnects to the same ID, so messages are preserved.
                // Refresh to pick up the updated session state.
                await sync.refreshSessions();

                navigateToSession(result.sessionId);
                return;
            }
            case 'requestToApproveDirectoryCreation':
                throw new LynttyError(t('sessionInfo.resumeSessionUnexpectedDirectoryPrompt'), false);
            case 'error':
                throw new LynttyError(result.errorMessage, false);
        }
    });

    const [archivingSession, performArchive] = useLynttyAction(async () => {
        await maybeCleanupWorktree(session.id, session.metadata?.path, session.metadata?.machineId);

        const result = await stopAndArchiveSession(session);
        if (!result.success) {
            throw new LynttyError(result.message || t('sessionInfo.failedToArchiveSession'), false);
        }
        onAfterArchive?.();
    });

    const archiveSession = React.useCallback(() => {
        performArchive();
    }, [performArchive]);

    const resumeSession = React.useCallback(() => {
        performResume();
    }, [performResume]);

    const actionItems = React.useMemo<SessionActionItem[]>(() => {
        const items: SessionActionItem[] = [
            { id: 'details', icon: 'information-circle-outline', label: t('appWide.details'), onPress: openDetails },
        ];

        if (resumeAvailability.canShowResume) {
            items.push({ id: 'resume', icon: 'play-circle-outline', label: t('sessionInfo.resumeSession'), onPress: resumeSession });
        }

        items.push({ id: 'archive', icon: 'archive-outline', label: t('sessionInfo.stopAndArchiveSession'), onPress: archiveSession, destructive: true });

        return items;
    }, [
        archiveSession,
        openDetails,
        resumeAvailability.canShowResume,
        resumeSession,
    ]);

    const showActionAlert = React.useCallback(() => {
        const buttons: Array<{ text: string; onPress?: () => void; style?: 'cancel' | 'destructive' | 'default' }> = actionItems.map(item => ({
            text: item.label,
            onPress: item.onPress,
            style: item.destructive ? 'destructive' as const : undefined,
        }));
        buttons.push({ text: t('common.cancel'), style: 'cancel' });
        Modal.alert(t('appWide.session'), undefined, buttons);
    }, [actionItems]);

    return {
        actionItems,
        showActionAlert,
        archiveSession,
        archivingSession,
        canArchive: true,
        canResume: resumeAvailability.canResume,
        canShowResume: resumeAvailability.canShowResume,
        openDetails,
        resumeSession,
        resumeSessionSubtitle: resumeAvailability.subtitle,
        resumingSession,
    };
}

/**
 * Lightweight hook for list items that only have a sessionId.
 * Returns a long-press handler that shows the action alert on mobile.
 */
export function useSessionActionAlert(sessionId: string) {
    const session = useSession(sessionId);
    const { showActionAlert } = useSessionQuickActions(session!, {});
    return session ? showActionAlert : undefined;
}
