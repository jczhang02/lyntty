type RpcFailureResult = {
    ok?: boolean;
    error?: unknown;
    message?: unknown;
};

function stringifyRpcFailureDetail(result: RpcFailureResult): string {
    const detail = typeof result.error === 'string'
        ? result.error
        : typeof result.message === 'string'
            ? result.message
            : undefined;
    return detail?.trim() || 'unknown error';
}

export function formatSessionRpcFailure(method: string, result: RpcFailureResult): string {
    return `RPC call failed for ${method}: ${stringifyRpcFailureDetail(result)}`;
}

/**
 * Daemon RpcHandlerManager encrypts handler failures as an exact `{ error }`
 * payload while the relay transport itself still reports `ok: true`.
 */
export function unwrapRpcHandlerResponse<T>(value: unknown): T {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const record = value as Record<string, unknown>;
        if (Object.keys(record).length === 1 && typeof record.error === 'string') {
            throw new Error(record.error.trim() || 'RPC handler failed');
        }
    }
    return value as T;
}
