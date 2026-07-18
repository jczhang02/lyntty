export type NewSessionPromptDeliveryResult = {
    queued: boolean;
    error?: unknown;
};

export async function deliverNewSessionPrompt(options: {
    rawPrompt: string;
    send: (trimmedPrompt: string) => Promise<boolean>;
    clearIfUnchanged: (expectedRawPrompt: string) => void;
    preserveForSession: (rawPrompt: string) => void;
}): Promise<NewSessionPromptDeliveryResult> {
    const trimmedPrompt = options.rawPrompt.trim();
    if (!trimmedPrompt) {
        options.clearIfUnchanged(options.rawPrompt);
        return { queued: true };
    }

    try {
        const queued = await options.send(trimmedPrompt);
        if (queued) {
            options.clearIfUnchanged(options.rawPrompt);
        } else {
            options.preserveForSession(options.rawPrompt);
        }
        return { queued };
    } catch (error) {
        options.preserveForSession(options.rawPrompt);
        return { queued: false, error };
    }
}
