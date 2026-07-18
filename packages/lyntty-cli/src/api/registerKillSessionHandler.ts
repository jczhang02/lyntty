import { RpcHandlerManager } from './rpc/RpcHandlerManager';
import { logger } from '@/ui/logger';

export function registerKillSessionHandler(
    rpcHandlerManager: RpcHandlerManager,
    killSession: () => Promise<void>,
): void {
    rpcHandlerManager.registerHandler('killSession', async () => {
        logger.debug('Kill session request received');
        void killSession();
        return {
            success: true,
            message: 'Killing lyntty Pi process',
        };
    });
}
