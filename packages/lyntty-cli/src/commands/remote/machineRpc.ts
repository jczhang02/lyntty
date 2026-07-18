import { io, Socket } from 'socket.io-client';
import type { Config } from './config';
import type { DecryptedMachine } from './api';
import { decodeBase64, encodeBase64, encrypt, decrypt } from './encryption';
import { createCliSocketAuth } from '../../api/wireAuth';

export type SupportedAgent = 'pi';

export type SpawnMachineSessionResult =
    | { type: 'success'; sessionId: string }
    | { type: 'requestToApproveDirectoryCreation'; directory: string }
    | { type: 'error'; errorMessage: string };

type RpcAck = {
    ok: boolean;
    result?: string;
    error?: string;
};

function waitForConnect(socket: Socket, timeoutMs = 10_000): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        if (socket.connected) {
            resolve();
            return;
        }

        const timeout = setTimeout(() => {
            socket.off('connect', onConnect);
            socket.off('connect_error', onError);
            reject(new Error('Timeout waiting for socket connection'));
        }, timeoutMs);

        const onConnect = () => {
            clearTimeout(timeout);
            socket.off('connect_error', onError);
            resolve();
        };

        const onError = (error: Error) => {
            clearTimeout(timeout);
            socket.off('connect', onConnect);
            reject(error);
        };

        socket.once('connect', onConnect);
        socket.once('connect_error', onError);
    });
}

function normalizeRpcError(error: string | undefined, machineId: string): string {
    if (!error) {
        return 'RPC call failed';
    }
    if (error === 'RPC method not available') {
        return `Machine ${machineId} is offline or its daemon is not connected.`;
    }
    return error;
}

export function parseSpawnMachineSessionResult(value: unknown): SpawnMachineSessionResult {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('RPC call returned invalid data');
    }
    const result = value as Record<string, unknown>;
    if (result.type === 'success' && typeof result.sessionId === 'string' && result.sessionId.length > 0) {
        return { type: 'success', sessionId: result.sessionId };
    }
    if (
        result.type === 'requestToApproveDirectoryCreation'
        && typeof result.directory === 'string'
        && result.directory.length > 0
    ) {
        return { type: 'requestToApproveDirectoryCreation', directory: result.directory };
    }
    if (result.type === 'error' && typeof result.errorMessage === 'string' && result.errorMessage.length > 0) {
        return { type: 'error', errorMessage: result.errorMessage };
    }
    throw new Error('RPC call returned unexpected data');
}

export async function spawnSessionOnMachine(
    config: Config,
    machine: DecryptedMachine,
    token: string,
    options: {
        directory: string;
        sessionId?: string;
        approvedNewDirectoryCreation?: boolean;
        agent: SupportedAgent;
        takeoverChoice?: 'wait' | 'stop' | 'interrupt';
    },
): Promise<SpawnMachineSessionResult> {
    const socket = io(config.serverUrl, {
        auth: createCliSocketAuth({
            token,
            clientType: 'user-scoped' as const,
        }, 'cli-remote'),
        path: '/v1/updates',
        transports: ['websocket'],
        autoConnect: false,
        reconnection: false,
    });

    socket.connect();

    try {
        await waitForConnect(socket);

        const params = encodeBase64(
            encrypt(machine.encryption.key, machine.encryption.variant, {
                type: 'spawn-in-directory',
                directory: options.directory,
                sessionId: options.sessionId,
                approvedNewDirectoryCreation: options.approvedNewDirectoryCreation ?? false,
                agent: options.agent,
                takeoverChoice: options.takeoverChoice,
            }),
        );

        const response = await socket.timeout(30_000).emitWithAck('rpc-call', {
            method: `${machine.id}:spawn-lyntty-session`,
            params,
        }) as RpcAck;

        if (!response.ok) {
            throw new Error(normalizeRpcError(response.error, machine.id));
        }
        if (!response.result) {
            throw new Error('RPC call returned no result');
        }

        const decrypted = decrypt(
            machine.encryption.key,
            machine.encryption.variant,
            decodeBase64(response.result),
        );

        if (decrypted != null && typeof decrypted === 'object' && !Array.isArray(decrypted)) {
            const rpcError = (decrypted as Record<string, unknown>).error;
            if (typeof rpcError === 'string') {
                throw new Error(rpcError);
            }
        }
        return parseSpawnMachineSessionResult(decrypted);
    } finally {
        socket.close();
    }
}
