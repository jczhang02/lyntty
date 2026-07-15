import { ToolCall } from '@/sync/typesMessage';
import { stringifyToolCommand } from './toolCommand';

const TERMINAL_TOOL_NAMES = new Set([
    'Bash',
    'CodexBash',
    'GeminiBash',
    'bash',
    'shell',
    'execute',
]);

const EDIT_TOOL_NAMES = new Set([
    'Edit',
    'MultiEdit',
    'Write',
    'CodexPatch',
    'GeminiPatch',
    'edit',
    'NotebookEdit',
]);

const READ_TOOL_NAMES = new Set([
    'Read',
    'read',
    'NotebookRead',
    'LS',
    'ls',
]);

const SEARCH_TOOL_NAMES = new Set([
    'Grep',
    'grep',
    'Glob',
    'find',
    'search',
    'WebSearch',
]);

const WEB_TOOL_NAMES = new Set([
    'WebFetch',
    'web_search',
    'fetch_content',
]);

const TASK_TOOL_NAMES = new Set([
    'Task',
    'Agent',
]);

export type ToolSummaryCategory = 'terminal' | 'edit' | 'read' | 'search' | 'web' | 'task' | 'other';

const TOOL_DISPLAY_NAMES: Record<string, string> = {
    Bash: 'Bash',
    CodexBash: 'Bash',
    GeminiBash: 'Bash',
    bash: 'Bash',
    shell: 'Shell',
    execute: 'Bash',
    Read: 'Read',
    read: 'Read',
    NotebookRead: 'Read',
    LS: 'List files',
    ls: 'List files',
    Edit: 'Edit',
    MultiEdit: 'Edit',
    Write: 'Write',
    CodexPatch: 'Edit',
    GeminiPatch: 'Edit',
    edit: 'Edit',
    NotebookEdit: 'Edit',
    Grep: 'Grep',
    grep: 'Grep',
    Glob: 'Find',
    find: 'Find',
    search: 'Search',
    WebSearch: 'Web search',
    web_search: 'Web search',
    WebFetch: 'Fetch',
    fetch_content: 'Fetch',
    Task: 'Task',
    Agent: 'Task',
};

export function getToolDisplayName(name: string): string {
    return TOOL_DISPLAY_NAMES[name] || name;
}

export function isTerminalToolName(name: string): boolean {
    return TERMINAL_TOOL_NAMES.has(name);
}

export function getToolSummaryCategory(toolName: string): ToolSummaryCategory {
    if (TERMINAL_TOOL_NAMES.has(toolName)) {
        return 'terminal';
    }
    if (EDIT_TOOL_NAMES.has(toolName)) {
        return 'edit';
    }
    if (READ_TOOL_NAMES.has(toolName)) {
        return 'read';
    }
    if (SEARCH_TOOL_NAMES.has(toolName)) {
        return 'search';
    }
    if (WEB_TOOL_NAMES.has(toolName)) {
        return 'web';
    }
    if (TASK_TOOL_NAMES.has(toolName)) {
        return 'task';
    }
    return 'other';
}

export function getToolDurationMs(tool: Pick<ToolCall, 'startedAt' | 'createdAt' | 'completedAt' | 'state'>): number | null {
    if (tool.state === 'running' || tool.completedAt === null || tool.completedAt === undefined) {
        return null;
    }
    const startedAt = tool.startedAt ?? tool.createdAt;
    if (tool.completedAt < startedAt) {
        return null;
    }
    return tool.completedAt - startedAt;
}

export function formatToolDuration(durationMs: number): string {
    if (durationMs < 1000) {
        return `${Math.max(0, Math.round(durationMs))}ms`;
    }
    const seconds = durationMs / 1000;
    if (seconds < 60) {
        return `${seconds.toFixed(1)}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remaining = Math.round(seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${remaining}`;
}

export function getToolStateText(tool: Pick<ToolCall, 'state' | 'completedAt' | 'startedAt' | 'createdAt' | 'permission'>): string | null {
    if (tool.permission?.status === 'pending') {
        return 'Needs approval';
    }
    if (tool.permission?.status === 'denied') {
        return 'Denied';
    }
    if (tool.permission?.status === 'canceled') {
        return 'Canceled';
    }
    if (tool.state === 'running') {
        return 'Running';
    }
    if (tool.state === 'error') {
        const duration = getToolDurationMs(tool);
        return duration === null ? 'Failed' : `Failed · ${formatToolDuration(duration)}`;
    }
    const duration = getToolDurationMs(tool);
    return duration === null ? 'Completed' : `Completed · ${formatToolDuration(duration)}`;
}

export function getToolSummaryDetail(tool: Pick<ToolCall, 'name' | 'input' | 'description'>): string | null {
    const terminalCommand = getTerminalToolCommand(tool);
    if (terminalCommand) {
        return terminalCommand;
    }

    const filePath = tool.input?.file_path;
    if (typeof filePath === 'string' && filePath.trim().length > 0) {
        return filePath.trim();
    }

    const patchFiles = getPatchFiles(tool.input);
    if (patchFiles.length > 0) {
        if (patchFiles.length === 1) {
            return patchFiles[0];
        }
        return `${patchFiles[0]} +${patchFiles.length - 1}`;
    }

    const path = tool.input?.path;
    if (typeof path === 'string' && path.trim().length > 0) {
        return path.trim();
    }

    const pattern = tool.input?.pattern;
    if (typeof pattern === 'string' && pattern.trim().length > 0) {
        return pattern.trim();
    }

    const url = tool.input?.url;
    if (typeof url === 'string' && url.trim().length > 0) {
        return url.trim();
    }

    return tool.description?.trim() || null;
}

export function getTerminalToolCommand(tool: Pick<ToolCall, 'name' | 'input'>): string | null {
    if (!isTerminalToolName(tool.name)) {
        return null;
    }

    const parsedCmd = tool.input?.parsed_cmd;
    if (Array.isArray(parsedCmd) && parsedCmd.length > 0) {
        const cmd = parsedCmd.find((item) => typeof item?.cmd === 'string' && item.cmd.trim().length > 0)?.cmd;
        if (cmd) {
            return cmd.trim();
        }
    }

    const directCommand = stringifyToolCommand(tool.input?.command);
    if (directCommand) {
        return directCommand;
    }

    const title = tool.input?.toolCall?.title;
    if (typeof title === 'string') {
        const bracketIdx = title.indexOf(' [');
        const command = bracketIdx > 0 ? title.substring(0, bracketIdx) : title;
        const trimmed = command.trim();
        if (trimmed.length > 0) {
            return trimmed;
        }
    }

    return null;
}

function getPatchFiles(input: any): string[] {
    if (input?.changes && typeof input.changes === 'object' && !Array.isArray(input.changes)) {
        return Object.keys(input.changes);
    }
    if (input?.fileChanges && typeof input.fileChanges === 'object' && !Array.isArray(input.fileChanges)) {
        return Object.keys(input.fileChanges);
    }
    if (Array.isArray(input?.changes)) {
        return input.changes
            .map((change: unknown) => {
                if (!change || typeof change !== 'object' || Array.isArray(change)) {
                    return null;
                }
                const path = (change as { path?: unknown }).path;
                return typeof path === 'string' && path.trim().length > 0 ? path.trim() : null;
            })
            .filter((path: string | null): path is string => path !== null);
    }
    if (Array.isArray(input?.fileChanges)) {
        return input.fileChanges
            .map((change: unknown) => {
                if (!change || typeof change !== 'object' || Array.isArray(change)) {
                    return null;
                }
                const path = (change as { path?: unknown }).path;
                return typeof path === 'string' && path.trim().length > 0 ? path.trim() : null;
            })
            .filter((path: string | null): path is string => path !== null);
    }
    return [];
}
