type AuthInvalidationListener = (reason: string) => void | Promise<void>;

const listeners = new Set<AuthInvalidationListener>();
let invalidationRequested = false;

export function isAuthInvalidationMessage(message: string): boolean {
    return /(:\s*401\b|\b401\b|Invalid token|Invalid authentication token|Unauthorized)/i.test(message);
}

export function isAuthInvalidationError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }
    return isAuthInvalidationMessage(error.message);
}

export function subscribeAuthInvalidation(listener: AuthInvalidationListener): () => void {
    listeners.add(listener);
    if (invalidationRequested) {
        void listener('authentication was invalidated before listener registration');
    }
    return () => {
        listeners.delete(listener);
    };
}

export function requestAuthInvalidation(reason: string) {
    if (invalidationRequested) {
        return;
    }
    invalidationRequested = true;
    console.warn(`[auth] Invalid credentials detected; clearing local auth: ${reason}`);
    for (const listener of listeners) {
        void listener(reason);
    }
}

export function resetAuthInvalidationForTests() {
    invalidationRequested = false;
    listeners.clear();
}
