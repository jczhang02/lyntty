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
            Modal.alert(t('common.error'), 'Cannot open this local Pi session because node metadata is incomplete.');
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
            if (relaySessionId !== session.id) {
                void sync.flushSyntheticMessages(session.id, relaySessionId);
            }
        };

        if (shouldOpenImmediately) {
            navigateToSession(session.id);
            if (session.machineId && session.piSessionId) {
                void machineEnsurePiSessionMirror({
                    machineId: session.machineId,
                    piSessionId: session.piSessionId,
                    directory: session.path ?? undefined,
                }).then((mirrorResult) => {
                    if (mirrorResult.type === 'success') {
                        void attachRelaySession(mirrorResult.sessionId);
                    }
                });
            }
        }

        const result = await machineSpawnNewSession(request);
        if (result.type === 'success') {
            await attachRelaySession(result.sessionId);
        } else if (result.type === 'error' && shouldReportPiSpawnError(resolvedRelaySessionId)) {
            Modal.alert(t('common.error'), result.errorMessage);
        }
    }, [navigateToSession]);
}
