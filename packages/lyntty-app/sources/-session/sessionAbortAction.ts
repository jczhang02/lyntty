import { sessionAbort } from '@/sync/ops';
import { sync } from '@/sync/sync';
import type { Metadata } from '@/sync/storageTypes';

export function usesPiExtensionControl(metadata?: Metadata | null): boolean {
    return metadata?.runtimeOwner === 'pi-extension'
        || metadata?.lifecycleState === 'external_pi';
}

export async function abortSessionFromMobile(sessionId: string, metadata?: Metadata | null): Promise<void> {
    if (usesPiExtensionControl(metadata)) {
        await sync.sendMessage(sessionId, '/abort', {
            source: 'chat',
            displayText: 'Stop current Pi turn',
        });
        return;
    }

    await sessionAbort(sessionId);
}
