import { z } from 'zod';

import type { PiMachineSessionRecord } from './storageTypes';

const nonEmptyString = z.string().trim().min(1);
const rpcErrorSchema = z.object({
    type: z.literal('error'),
    errorMessage: nonEmptyString,
});

export const spawnSessionResultSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('success'),
        sessionId: nonEmptyString,
    }),
    z.object({
        type: z.literal('requestToApproveDirectoryCreation'),
        directory: nonEmptyString,
    }),
    rpcErrorSchema,
]);

const piRecoveryStateSchema = z.enum([
    'discovered_local',
    'registered',
    'active_runtime',
    'stale_local',
    'missing_local_history',
    'history_gap',
    'import_failed',
]);

const piMachineSessionRecordSchema: z.ZodType<PiMachineSessionRecord> = z.object({
    state: piRecoveryStateSchema,
    piSessionId: nonEmptyString,
    relaySessionId: nonEmptyString.optional(),
    path: z.string().optional(),
    cwd: z.string().optional(),
    name: z.string().optional(),
    createdAt: z.number().finite().optional(),
    modifiedAt: z.number().finite().optional(),
    registeredUpdatedAt: z.number().finite().optional(),
    firstMessage: z.string().optional(),
    messageCount: z.number().int().nonnegative(),
    summaryComplete: z.boolean().optional(),
    needsRegistration: z.boolean(),
    needsBackfill: z.boolean(),
    hasHistoryGap: z.boolean(),
    reason: z.string(),
});

export const listPiSessionsResultSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('success'),
        sessions: z.array(piMachineSessionRecordSchema),
        nextCursor: nonEmptyString.optional(),
        total: z.number().int().nonnegative().optional(),
        refreshing: z.boolean().optional(),
    }),
    rpcErrorSchema,
]);

export const ensurePiSessionMirrorResultSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('success'),
        sessionId: nonEmptyString,
        sent: z.number().int().nonnegative(),
    }),
    rpcErrorSchema,
]);

export const stopDaemonResultSchema = z.object({
    message: nonEmptyString,
});

export const worktreeCreateResultSchema = z.discriminatedUnion('success', [
    z.object({
        success: z.literal(true),
        worktreePath: nonEmptyString,
        branchName: nonEmptyString,
    }),
    z.object({
        success: z.literal(false),
        worktreePath: z.string(),
        branchName: z.string(),
        error: nonEmptyString,
    }),
]);

const worktreeInfoSchema = z.object({
    path: nonEmptyString,
    branch: nonEmptyString,
});

export const worktreeListResultSchema = z.discriminatedUnion('success', [
    z.object({ success: z.literal(true), worktrees: z.array(worktreeInfoSchema) }),
    z.object({ success: z.literal(false), error: nonEmptyString }),
]);

export const worktreeRemoveResultSchema = z.discriminatedUnion('success', [
    z.object({ success: z.literal(true) }),
    z.object({ success: z.literal(false), error: nonEmptyString }),
]);

export const worktreeStatusResultSchema = z.discriminatedUnion('success', [
    z.object({ success: z.literal(true), clean: z.boolean() }),
    z.object({ success: z.literal(false), clean: z.literal(false), error: nonEmptyString }),
]);

export function parseMachineRpcResult<T>(
    method: string,
    schema: z.ZodType<T>,
): (value: unknown) => T {
    return (value) => {
        const parsed = schema.safeParse(value);
        if (!parsed.success) {
            throw new Error(`Invalid machine RPC response for ${method}`);
        }
        return parsed.data;
    };
}
