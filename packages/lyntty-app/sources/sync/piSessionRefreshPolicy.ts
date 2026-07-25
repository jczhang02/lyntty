const PI_SESSION_RETRY_BASE_MS = 1_000;
const PI_SESSION_RETRY_MAX_DELAY_MS = 5_000;

export function resolvePiSessionRetryDelay(attempt: number, maxAttempts: number): number | undefined {
    if (!Number.isInteger(attempt) || attempt < 0 || attempt >= maxAttempts) return undefined;
    return Math.min(PI_SESSION_RETRY_BASE_MS * (2 ** attempt), PI_SESSION_RETRY_MAX_DELAY_MS);
}

export function shouldRefreshPiSessionsForMachineTransition(
    wasActive: boolean | undefined,
    isActive: boolean,
): boolean {
    return isActive && wasActive !== true;
}
