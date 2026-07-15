import { describe, expect, it } from 'vitest';
import { ToolCall } from '@/sync/typesMessage';
import {
    formatToolDuration,
    getTerminalToolCommand,
    getToolDisplayName,
    getToolDurationMs,
    getToolStateText,
    getToolSummaryCategory,
    getToolSummaryDetail,
    isTerminalToolName,
} from './toolDisplay';

function tool(name: string, input: unknown): ToolCall {
    return {
        name,
        state: 'completed',
        input,
        createdAt: 1,
        startedAt: 1,
        completedAt: 2,
        description: null,
    };
}

describe('terminal tool display helpers', () => {
    it('detects command-like terminal tools', () => {
        expect(isTerminalToolName('Bash')).toBe(true);
        expect(isTerminalToolName('CodexBash')).toBe(true);
        expect(isTerminalToolName('GeminiBash')).toBe(true);
        expect(isTerminalToolName('execute')).toBe(true);
        expect(isTerminalToolName('bash')).toBe(true);
        expect(isTerminalToolName('Read')).toBe(false);
    });

    it('extracts one-line command summaries from shell tools', () => {
        expect(getTerminalToolCommand(tool('Bash', { command: 'bun test' }))).toBe('bun test');
        expect(getTerminalToolCommand(tool('bash', { command: 'git status --short' }))).toBe('git status --short');

        expect(getTerminalToolCommand(tool(
            'CodexBash',
            {
                command: ['/usr/bin/zsh', '-lc', 'git status --short'],
                parsed_cmd: [{ type: 'bash', cmd: 'git status --short' }],
            },
        ))).toBe('git status --short');
    });

    it('extracts Gemini execute titles without cwd metadata', () => {
        expect(getTerminalToolCommand(tool(
            'execute',
            { toolCall: { title: 'rm tmp.txt [current working directory /repo] (cleanup)' } },
        ))).toBe('rm tmp.txt');
    });

    it('normalizes display names without changing raw tool names', () => {
        expect(getToolDisplayName('bash')).toBe('Bash');
        expect(getToolDisplayName('CodexBash')).toBe('Bash');
        expect(getToolDisplayName('web_search')).toBe('Web search');
        expect(getToolDisplayName('fetch_content')).toBe('Fetch');
        expect(getToolDisplayName('custom_pi_tool')).toBe('custom_pi_tool');
    });

    it('formats fixed durations only for completed or failed tools', () => {
        expect(getToolDurationMs(tool('bash', { command: 'echo ok' }))).toBe(1);
        expect(formatToolDuration(1250)).toBe('1.3s');
        expect(formatToolDuration(65_000)).toBe('1:05');
        expect(getToolStateText(tool('bash', { command: 'echo ok' }))).toBe('Completed · 1ms');
        expect(getToolStateText({ ...tool('bash', { command: 'sleep 1' }), state: 'running', completedAt: null })).toBe('Running');
    });

    it('classifies tools for compact transcript rows', () => {
        expect(getToolSummaryCategory('CodexBash')).toBe('terminal');
        expect(getToolSummaryCategory('bash')).toBe('terminal');
        expect(getToolSummaryCategory('CodexPatch')).toBe('edit');
        expect(getToolSummaryCategory('Read')).toBe('read');
        expect(getToolSummaryCategory('ls')).toBe('read');
        expect(getToolSummaryCategory('Grep')).toBe('search');
        expect(getToolSummaryCategory('grep')).toBe('search');
        expect(getToolSummaryCategory('find')).toBe('search');
        expect(getToolSummaryCategory('WebFetch')).toBe('web');
        expect(getToolSummaryCategory('web_search')).toBe('web');
    });

    it('extracts compact transcript row details', () => {
        expect(getToolSummaryDetail(tool('CodexBash', {
            command: ['/usr/bin/zsh', '-lc', 'git status --short'],
            parsed_cmd: [{ type: 'bash', cmd: 'git status --short' }],
        }))).toBe('git status --short');

        expect(getToolSummaryDetail(tool('CodexPatch', {
            changes: {
                'README-RU.md': { kind: { type: 'update' } },
            },
        }))).toBe('README-RU.md');

        expect(getToolSummaryDetail(tool('MultiEdit', {
            file_path: '/repo/src/app.tsx',
        }))).toBe('/repo/src/app.tsx');
    });
});
