import React from 'react';

import { Modal } from '@/modal';
import { machineSpawnNewSession } from '@/sync/ops';
import { applyOptimisticPiSession, buildPiSessionSpawnRequest, shouldOpenPiSessionImmediately } from '@/sync/piSessionOpen';
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
        if (shouldOpenImmediately) {
            navigateToSession(session.id);
        }

        const result = await machineSpawnNewSession(request);
        if (result.type === 'success') {
            applyOptimisticPiSession(session, result.sessionId);
            if (result.sessionId !== session.id) {
                navigateToSession(result.sessionId);
            }
            await sync.refreshSessions();
            if (result.sessionId !== session.id) {
                void sync.flushSyntheticMessages(session.id, result.sessionId);
            }
        } else if (result.type === 'error') {
            Modal.alert(t('common.error'), result.errorMessage);
        }
    }, [navigateToSession]);
}
