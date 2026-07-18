/**
 * Session Metadata Factory
 *
 * Creates session state and metadata for a managed Pi session.
 * This follows DRY principles by providing a single implementation for all backends.
 *
 * @module createSessionMetadata
 */

import os from 'node:os';
import type { AgentState, Metadata } from '@/api/types';
import { configuration } from '@/configuration';
import { runtimeLayout } from '@/distribution/runtimeLayout';
import packageJson from '../../package.json';

/**
 * Runtime flavor identifier for session metadata.
 */
export type BackendFlavor = 'pi';

/**
 * Options for creating session metadata.
 */
export interface CreateSessionMetadataOptions {
    /** Runtime flavor. */
    flavor: BackendFlavor;
    /** Machine ID for server identification */
    machineId: string;
    /** How the session was started */
    startedBy?: 'daemon' | 'terminal';
}

/**
 * Result containing both state and metadata for session creation.
 */
export interface SessionMetadataResult {
    /** Agent state for session */
    state: AgentState;
    /** Session metadata */
    metadata: Metadata;
}

/**
 * Creates session state and metadata for backend agents.
 *
 * This utility keeps metadata consistent across managed Pi sessions.
 *
 * @param opts - Options specifying flavor, machineId, and startedBy
 * @returns Object containing state and metadata for session creation
 *
 * @example
 * ```typescript
 * const { state, metadata } = createSessionMetadata({
 *     flavor: 'pi',
 *     machineId: settings.machineId,
 *     startedBy: opts.startedBy
 * });
 *
 * const response = await api.getOrCreateSession({ tag: sessionTag, metadata, state });
 * ```
 */
export function createSessionMetadata(opts: CreateSessionMetadataOptions): SessionMetadataResult {
    const layout = runtimeLayout();
    const state: AgentState = {
        controlledByUser: false,
    };

    const metadata: Metadata = {
        path: process.cwd(),
        host: os.hostname(),
        version: packageJson.version,
        os: os.platform(),
        machineId: opts.machineId,
        homeDir: os.homedir(),
        lynttyHomeDir: configuration.lynttyHomeDir,
        lynttyLibDir: layout.libraryDir,
        lynttyToolsDir: layout.toolsDir,
        startedFromDaemon: opts.startedBy === 'daemon',
        hostPid: process.pid,
        startedBy: opts.startedBy || 'terminal',
        lifecycleState: 'running',
        lifecycleStateSince: Date.now(),
        flavor: opts.flavor,
    };

    return { state, metadata };
}
