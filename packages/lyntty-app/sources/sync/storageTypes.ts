import { z } from "zod";

//
// Agent states
//

export const MetadataSchema = z.object({
    models: z.array(z.object({
        code: z.string(),
        value: z.string(),
        description: z.string().nullish(),
    })).optional(),
    currentModelCode: z.string().optional(),
    operatingModes: z.array(z.object({
        code: z.string(),
        value: z.string(),
        description: z.string().nullish(),
    })).optional(),
    currentOperatingModeCode: z.string().optional(),
    thoughtLevels: z.array(z.object({
        code: z.string(),
        value: z.string(),
        description: z.string().nullish(),
    })).optional(),
    currentThoughtLevelCode: z.string().optional(),
    path: z.string(),
    host: z.string(),
    version: z.string().optional(),
    name: z.string().optional(),
    os: z.string().optional(),
    summary: z.object({
        text: z.string(),
        updatedAt: z.number()
    }).optional(),
    machineId: z.string().optional(),
    piSessionId: z.string().optional(), // Pi JSONL session ID
    piHistoryCursor: z.string().optional(),
    piHistoryHasMore: z.boolean().optional(),
    piHistoryTotalMessages: z.number().optional(),
    piDiscoveryState: z.enum([
        'discovered_local',
        'registered',
        'active_runtime',
        'stale_local',
        'missing_local_history',
        'history_gap',
        'import_failed',
    ]).optional(),
    piMessageCount: z.number().optional(),
    piFirstMessage: z.string().optional(),
    piRecoveryReason: z.string().optional(),
    piHasHistoryGap: z.boolean().optional(),
    piSynthetic: z.boolean().optional(),
    tools: z.array(z.string()).optional(),
    slashCommands: z.array(z.string()).optional(),
    mcpServers: z.array(z.object({ name: z.string(), status: z.string() })).optional(),
    skills: z.array(z.string()).optional(),
    homeDir: z.string().optional(), // User's home directory on the machine
    lynttyHomeDir: z.string().optional(), // Lyntty configuration directory
    startedFromDaemon: z.boolean().optional(),
    hostPid: z.number().optional(), // Process ID of the session
    startedBy: z.enum(['daemon', 'terminal']).optional(),
    flavor: z.string().nullish(), // Session flavor/variant identifier
    lifecycleState: z.string().optional(),
    lifecycleStateSince: z.number().optional(),
    runtimeOwner: z.string().optional(),
    controlState: z.string().optional(),
    sharedControlEnabled: z.boolean().optional(),
    remoteCommandAcceptedLocalKeys: z.array(z.string()).optional(),
    remoteCommandFailedLocalKeys: z.array(z.string()).optional(),
    archivedBy: z.string().optional(),
    archiveReason: z.string().optional(),
});

export type Metadata = z.infer<typeof MetadataSchema>;

export const AgentStateSchema = z.object({
    controlledByUser: z.boolean().nullish(),
    requests: z.record(z.string(), z.object({
        tool: z.string(),
        arguments: z.any(),
        createdAt: z.number().nullish()
    })).nullish(),
    completedRequests: z.record(z.string(), z.object({
        tool: z.string(),
        arguments: z.any(),
        createdAt: z.number().nullish(),
        completedAt: z.number().nullish(),
        status: z.enum(['canceled', 'denied', 'approved']),
        reason: z.string().nullish(),
        mode: z.string().nullish(),
        allowedTools: z.array(z.string()).nullish(),
        decision: z.enum(['approved', 'approved_for_session', 'denied', 'abort']).nullish()
    })).nullish(),
});

export type AgentState = z.infer<typeof AgentStateSchema>;

export const TodoItemSchema = z.object({
    content: z.string(),
    status: z.enum(['pending', 'in_progress', 'completed']),
    priority: z.enum(['high', 'medium', 'low']).optional(),
    id: z.string().optional(),
});

export const TodoItemsSchema = z.array(TodoItemSchema);

export type TodoItem = z.infer<typeof TodoItemSchema>;

export interface Session {
    id: string,
    seq: number,
    createdAt: number,
    updatedAt: number,
    active: boolean,
    activeAt: number,
    metadata: Metadata | null,
    metadataVersion: number,
    agentState: AgentState | null,
    agentStateVersion: number,
    thinking: boolean,
    thinkingAt: number,
    presence: "online" | number, // "online" when active, timestamp when last seen
    todos?: TodoItem[];
    draft?: string | null; // Local draft message, not synced to server
    permissionMode?: string | null; // Local permission mode key, not synced to server
    modelMode?: string | null; // Local model key, not synced to server
    effortLevel?: string | null; // Local effort level key, not synced to server
    // IMPORTANT: latestUsage is extracted from reducerState.latestUsage after message processing.
    // We store it directly on Session to ensure it's available immediately on load.
    // Do NOT store reducerState itself on Session - it's mutable and should only exist in SessionMessages.
    latestUsage?: {
        inputTokens: number;
        outputTokens: number;
        cacheCreation: number;
        cacheRead: number;
        contextSize: number;
        timestamp: number;
    } | null;
}

export interface DecryptedMessage {
    id: string,
    seq: number | null,
    localId: string | null,
    content: any,
    createdAt: number,
}

//
// Machine states
//

export const MachineMetadataSchema = z.object({
    host: z.string(),
    platform: z.string(),
    lynttyCliVersion: z.string(),
    lynttyHomeDir: z.string(), // Directory for Lyntty auth, settings, logs (usually .lyntty/ or .lyntty-dev/)
    homeDir: z.string(), // User's home directory (matches CLI field name)
    // Optional fields that may be added in future versions
    username: z.string().optional(),
    arch: z.string().optional(),
    displayName: z.string().optional(), // Custom display name for the machine
    // Daemon status fields
    daemonLastKnownStatus: z.enum(['running', 'shutting-down']).optional(),
    daemonLastKnownPid: z.number().optional(),
    shutdownRequestedAt: z.number().optional(),
    shutdownSource: z.enum(['lyntty-app', 'lyntty-cli', 'os-signal', 'unknown']).optional(),
    cliAvailability: z.object({
        pi: z.boolean(),
        detectedAt: z.number(),
        // Read-only compatibility for machine metadata written before Pi-only migration.
        claude: z.boolean().optional(),
        codex: z.boolean().optional(),
        gemini: z.boolean().optional(),
        openclaw: z.boolean().optional(),
    }).optional(),
    resumeSupport: z.object({
        rpcAvailable: z.boolean(),
        requiresSameMachine: z.boolean(),
        requiresRemoteAuth: z.boolean().optional(),
        remoteAuthenticated: z.boolean().optional(),
        // Read-only compatibility for older CLI metadata.
        requiresLynttyAgentAuth: z.boolean().optional(),
        lynttyAgentAuthenticated: z.boolean().optional(),
        detectedAt: z.number(),
    }).optional(),
});

export type MachineMetadata = z.infer<typeof MachineMetadataSchema>;

export type PiRecoveryState =
    | 'discovered_local'
    | 'registered'
    | 'active_runtime'
    | 'stale_local'
    | 'missing_local_history'
    | 'history_gap'
    | 'import_failed';

export interface PiMachineSessionRecord {
    state: PiRecoveryState;
    piSessionId: string;
    relaySessionId?: string;
    path?: string;
    cwd?: string;
    name?: string;
    createdAt?: number;
    modifiedAt?: number;
    registeredUpdatedAt?: number;
    firstMessage?: string;
    messageCount: number;
    needsRegistration: boolean;
    needsBackfill: boolean;
    hasHistoryGap: boolean;
    reason: string;
}

export interface Machine {
    id: string;
    seq: number;
    createdAt: number;
    updatedAt: number;
    active: boolean;
    activeAt: number;  // Changed from lastActiveAt to activeAt for consistency
    metadata: MachineMetadata | null;
    metadataVersion: number;
    daemonState: any | null;  // Dynamic daemon state (runtime info)
    daemonStateVersion: number;
}

//
// Git Status
//

export interface GitStatus {
    branch: string | null;
    isDirty: boolean;
    modifiedCount: number;
    untrackedCount: number;
    stagedCount: number;
    lastUpdatedAt: number;
    // Line change statistics - separated by staged vs unstaged
    stagedLinesAdded: number;
    stagedLinesRemoved: number;
    unstagedLinesAdded: number;
    unstagedLinesRemoved: number;
    // Computed totals
    linesAdded: number;      // stagedLinesAdded + unstagedLinesAdded
    linesRemoved: number;    // stagedLinesRemoved + unstagedLinesRemoved
    linesChanged: number;    // Total lines that were modified (added + removed)
    // Branch tracking information (from porcelain v2)
    upstreamBranch?: string | null; // Name of upstream branch
    aheadCount?: number; // Commits ahead of upstream
    behindCount?: number; // Commits behind upstream
    stashCount?: number; // Number of stash entries
}
