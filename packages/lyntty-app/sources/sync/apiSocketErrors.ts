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
