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
 * Daemon RpcHandlerManager encrypts handler failures inside an `{ error }`
 * payload while the relay transport itself still reports `ok: true`. Treat
 * an own `error` field unless the payload explicitly represents a typed
 * business failure, so enriched or malformed handler envelopes cannot look
 * successful.
 */
export function unwrapRpcHandlerResponse<T>(value: unknown): T {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const record = value as Record<string, unknown>;
        const hasError = Object.prototype.hasOwnProperty.call(record, 'error');
        const hasSuccessDiscriminator = Object.prototype.hasOwnProperty.call(record, 'success');
        const hasTypeDiscriminator = Object.prototype.hasOwnProperty.call(record, 'type');
        const isTypedBusinessError = (record.success === false && !hasTypeDiscriminator)
            || (record.type === 'error' && !hasSuccessDiscriminator);
        if (hasError && !isTypedBusinessError) {
            const message = typeof record.error === 'string' ? record.error.trim() : '';
            throw new Error(message || 'RPC handler failed');
        }
    }
    return value as T;
}
