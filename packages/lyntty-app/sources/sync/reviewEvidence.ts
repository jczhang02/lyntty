import type { Message, ToolCallMessage } from './typesMessage';

export type ReviewEvidenceSeverity = 'info' | 'warning' | 'error';

export interface ReviewEvidenceSummary {
    hasEvidence: boolean;
    changedFiles: string[];
    commands: string[];
    checks: string[];
    errors: string[];
    recoveryStates: string[];
    toolCount: number;
    failedToolCount: number;
    lastUpdatedAt: number | null;
    severity: ReviewEvidenceSeverity;
}

const CHECK_COMMAND_PATTERN = /\b(test|typecheck|tsc|vitest|lint|build|maestro|gradle|expo|pnpm|npm|bun)\b/i;
const RECOVERY_STATE_PATTERN = /\b(history_gap|discovered_local|registered|active_runtime|stale_local|missing_local_history|import_failed)\b/g;

function addUnique(items: Set<string>, value: unknown): void {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (trimmed) items.add(trimmed);
}

function collectFileHintsFromValue(value: unknown, files: Set<string>): void {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
        value.forEach((item) => collectFileHintsFromValue(item, files));
        return;
    }

    const record = value as Record<string, unknown>;
    for (const key of ['path', 'file', 'filePath', 'fullPath', 'targetFile', 'targetPath']) {
        addUnique(files, record[key]);
    }
    for (const key of ['files', 'changedFiles']) {
        collectFileHintsFromValue(record[key], files);
    }
    if (record.details) collectFileHintsFromValue(record.details, files);
}

function collectToolEvidence(message: ToolCallMessage, summary: {
    changedFiles: Set<string>;
    commands: Set<string>;
    checks: Set<string>;
    errors: Set<string>;
}): void {
    const tool = message.tool;
    collectFileHintsFromValue(tool.input, summary.changedFiles);
    collectFileHintsFromValue(tool.result, summary.changedFiles);

    const command = typeof tool.input?.command === 'string'
        ? tool.input.command
        : typeof tool.description === 'string'
            ? tool.description
            : undefined;
    addUnique(summary.commands, command);
    if (command && CHECK_COMMAND_PATTERN.test(command)) {
        summary.checks.add(command);
    }

    if (tool.state === 'error') {
        summary.errors.add(tool.description ?? `${tool.name} failed`);
    }
    if (tool.permission?.status === 'denied') {
        summary.errors.add(tool.permission.reason ?? `${tool.name} permission denied`);
    }
    if (tool.result && typeof tool.result === 'object') {
        const result = tool.result as Record<string, unknown>;
        if (result.isError === true || result.error) {
            addUnique(summary.errors, result.error ?? result.message ?? `${tool.name} returned an error`);
        }
    }
}

export function buildReviewEvidence(messages: Message[]): ReviewEvidenceSummary {
    const changedFiles = new Set<string>();
    const commands = new Set<string>();
    const checks = new Set<string>();
    const errors = new Set<string>();
    const recoveryStates = new Set<string>();
    let toolCount = 0;
    let failedToolCount = 0;
    let lastUpdatedAt: number | null = null;

    for (const message of messages) {
        lastUpdatedAt = Math.max(lastUpdatedAt ?? 0, message.createdAt);
        if (message.kind === 'tool-call') {
            toolCount += 1;
            if (message.tool.state === 'error' || message.tool.result?.isError === true) {
                failedToolCount += 1;
            }
            collectToolEvidence(message, { changedFiles, commands, checks, errors });
        }

        const text = message.kind === 'agent-text' || message.kind === 'user-text'
            ? message.text
            : message.kind === 'agent-event' && message.event.type === 'message'
                ? message.event.message
                : '';
        for (const match of text.matchAll(RECOVERY_STATE_PATTERN)) {
            recoveryStates.add(match[0]);
        }
        if (/\b(pi error|failed|error:)\b/i.test(text)) {
            errors.add(text);
        }
    }

    const severity: ReviewEvidenceSeverity = errors.size > 0 || failedToolCount > 0
        ? 'error'
        : recoveryStates.has('history_gap') || recoveryStates.has('missing_local_history') || recoveryStates.has('import_failed')
            ? 'warning'
            : 'info';

    return {
        hasEvidence: changedFiles.size > 0 || commands.size > 0 || checks.size > 0 || errors.size > 0 || recoveryStates.size > 0 || toolCount > 0,
        changedFiles: [...changedFiles].sort(),
        commands: [...commands],
        checks: [...checks],
        errors: [...errors],
        recoveryStates: [...recoveryStates].sort(),
        toolCount,
        failedToolCount,
        lastUpdatedAt,
        severity,
    };
}
