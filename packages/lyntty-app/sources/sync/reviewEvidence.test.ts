import { describe, expect, it } from 'vitest';

import { buildReviewEvidence } from './reviewEvidence';
import type { Message } from './typesMessage';

function tool(id: string, overrides: Partial<Message & any> = {}): Message {
    return {
        kind: 'tool-call',
        id,
        localId: null,
        createdAt: 10,
        tool: {
            name: 'bash',
            state: 'completed',
            input: { command: 'pnpm test', path: 'package.json' },
            createdAt: 10,
            startedAt: 10,
            completedAt: 11,
            description: 'pnpm test',
        },
        children: [],
        ...overrides,
    };
}

describe('buildReviewEvidence', () => {
    it('collects commands, checks, changed files, and counts tools', () => {
        expect(buildReviewEvidence([
            tool('tool-1', {
                tool: {
                    name: 'edit',
                    state: 'completed',
                    input: { path: 'src/app.ts' },
                    result: { details: { filePath: 'src/app.ts' } },
                    createdAt: 1,
                    startedAt: 1,
                    completedAt: 2,
                    description: 'edit src/app.ts',
                },
            }),
            tool('tool-2'),
        ])).toMatchObject({
            hasEvidence: true,
            changedFiles: ['package.json', 'src/app.ts'],
            commands: ['edit src/app.ts', 'pnpm test'],
            checks: ['pnpm test'],
            toolCount: 2,
            failedToolCount: 0,
            severity: 'info',
        });
    });

    it('marks failed tools and pi error text as errors', () => {
        const summary = buildReviewEvidence([
            tool('tool-1', {
                tool: {
                    name: 'bash',
                    state: 'error',
                    input: { command: 'pnpm typecheck' },
                    createdAt: 1,
                    startedAt: 1,
                    completedAt: 2,
                    description: 'typecheck failed',
                    result: { isError: true, error: 'TS error' },
                },
            }),
            { kind: 'agent-text', id: 'agent-1', localId: null, createdAt: 3, text: 'pi error: failed to run' },
        ]);

        expect(summary.severity).toBe('error');
        expect(summary.failedToolCount).toBe(1);
        expect(summary.errors).toEqual(['typecheck failed', 'TS error', 'pi error: failed to run']);
    });

    it('extracts recovery states for Review Evidence', () => {
        expect(buildReviewEvidence([
            { kind: 'agent-text', id: 'agent-1', localId: null, createdAt: 1, text: 'recovery state: history_gap then missing_local_history' },
        ])).toMatchObject({
            recoveryStates: ['history_gap', 'missing_local_history'],
            severity: 'warning',
        });
    });

    it('returns an empty summary when no review signal exists', () => {
        expect(buildReviewEvidence([])).toMatchObject({
            hasEvidence: false,
            lastUpdatedAt: null,
            toolCount: 0,
        });
    });
});
