export type PiEdit = {
    oldText: string;
    newText: string;
};

export function extractPiEdits(input: unknown): PiEdit[] {
    if (!input || typeof input !== 'object') return [];

    const value = input as Record<string, unknown>;
    if (Array.isArray(value.edits)) {
        return value.edits.flatMap((edit) => {
            if (!edit || typeof edit !== 'object') return [];
            const candidate = edit as Record<string, unknown>;
            if (typeof candidate.oldText !== 'string' || typeof candidate.newText !== 'string') return [];
            return [{ oldText: candidate.oldText, newText: candidate.newText }];
        });
    }

    if (typeof value.oldText === 'string' && typeof value.newText === 'string') {
        return [{ oldText: value.oldText, newText: value.newText }];
    }

    return [];
}
