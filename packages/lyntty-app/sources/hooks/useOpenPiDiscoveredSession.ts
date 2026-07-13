import React from 'react';

import { Modal } from '@/modal';
import { machineEnsurePiSessionMirror, machineSpawnNewSession } from '@/sync/ops';
import { applyOptimisticPiSession, buildPiSessionSpawnRequest, shouldOpenPiSessionImmediately, shouldReportPiSpawnError } from '@/sync/piSessionOpen';
import type { SessionRowData } from '@/sync/storage';
import { sync } from '@/sync/sync';
import { t } from '@/text';
import { useNavigateToSession } from './useNavigateToSession';

export function useOpenPiDiscoveredSession() {
    const navigateToSession = useNavigateToSession();

    return React.useCallback(async (session: SessionRowData) => {
        const request = buildPiSessionSpawnRequest(session);
        if (!request) {
            Modal.alert(t('common.error'), t('appWide.cannotOpenThisLocalPiSessionBecauseNodeMetadata'));
            return;
        }

        const shouldOpenImmediately = shouldOpenPiSessionImmediately(session);
        let resolvedRelaySessionId: string | null = null;
        const attachRelaySession = async (relaySessionId: string) => {
            if (resolvedRelaySessionId) {
                return;
            }
            resolvedRelaySessionId = relaySessionId;
            applyOptimisticPiSession(session, relaySessionId);
            if (relaySessionId !== session.id) {
                navigateToSession(relaySessionId);
            }
            await sync.refreshSessions();
            void sync.flushSyntheticMessages(session.id, relaySessionId);
        };

        const ensureMirror = async (): Promise<boolean> => {
            if (!session.machineId || !session.piSessionId) {
                return false;
            }
            const mirrorResult = await machineEnsurePiSessionMirror({
                machineId: session.machineId,
                piSessionId: session.piSessionId,
                directory: session.path ?? undefined,
            });
            if (mirrorResult.type === 'success') {
                await attachRelaySession(mirrorResult.sessionId);
                return true;
            }
            Modal.alert(t('common.error'), mirrorResult.errorMessage);
            return false;
        };

        if (shouldOpenImmediately) {
            navigateToSession(session.id);
            void ensureMirror();
            return;
        } else if (session.piSynthetic) {
            await ensureMirror();
            // A discovered computer-side Pi session must never fall through to
            // managed runtime spawn when its extension is missing or stale.
            return;
        }

        const result = await machineSpawnNewSession(request);
        if (result.type === 'success') {
            await attachRelaySession(result.sessionId);
        } else if (result.type === 'error' && shouldReportPiSpawnError(resolvedRelaySessionId)) {
            Modal.alert(t('common.error'), result.errorMessage);
        }
    }, [navigateToSession]);
}
