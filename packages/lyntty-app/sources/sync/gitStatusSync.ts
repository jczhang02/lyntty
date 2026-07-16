/**
 * Git status synchronization module
 * Provides real-time git repository status tracking using remote bash commands
 */

import { InvalidateSync } from '@/utils/sync';
import { sessionBash } from './ops';
import { GitStatus } from './storageTypes';
import { storage } from './storage';
import { parseStatusSummary, getStatusCounts, isDirty } from './git-parsers/parseStatus';
import { parseStatusSummaryV2, getStatusCountsV2, isDirtyV2, getCurrentBranchV2, getTrackingInfoV2 } from './git-parsers/parseStatusV2';
import { parseCurrentBranch } from './git-parsers/parseBranch';
import { parseNumStat, mergeDiffSummaries } from './git-parsers/parseDiff';
import { canControlSession } from './sessionControlPolicy';


export class GitStatusSync {
    // Map project keys to sync instances
    private projectSyncMap = new Map<string, InvalidateSync>();
    // Map session IDs to project keys for cleanup
    private sessionToProjectKey = new Map<string, string>();
    // Debounce timers to coalesce rapid invalidations (e.g. new-message + update-session arriving together)
    private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

    /**
     * Get project key string for a session
     */
    private getProjectKeyForSession(sessionId: string): string | null {
        const session = storage.getState().sessions[sessionId];
        if (
            !session?.metadata?.machineId
            || !session.metadata.path
            || !canControlSession(session.metadata)
        ) {
            return null;
        }
        return `${session.metadata.machineId}:${session.metadata.path}`;
    }

    /**
     * Get or create git status sync for a session (creates project-based sync)
     */
    getSync(sessionId: string): InvalidateSync {
        const projectKey = this.getProjectKeyForSession(sessionId);
        if (!projectKey) {
            // Return a no-op sync if no valid project
            return new InvalidateSync(async () => {});
        }

        // Map session to project key
        this.sessionToProjectKey.set(sessionId, projectKey);

        let sync = this.projectSyncMap.get(projectKey);
        if (!sync) {
            sync = new InvalidateSync(() => this.fetchGitStatusForProject(projectKey));
            this.projectSyncMap.set(projectKey, sync);
        }
        return sync;
    }

    /**
     * Invalidate git status for a session (triggers refresh for the entire project).
     * Debounces rapid calls (e.g. new-message + update-session arriving together)
     * to avoid duplicate RPC round-trips.
     */
    invalidate(sessionId: string): void {
        const projectKey = this.sessionToProjectKey.get(sessionId);
        if (projectKey) {
            const existing = this.debounceTimers.get(projectKey);
            if (existing) clearTimeout(existing);

            this.debounceTimers.set(projectKey, setTimeout(() => {
                this.debounceTimers.delete(projectKey);
                const sync = this.projectSyncMap.get(projectKey);
                if (sync) {
                    sync.invalidate();
                }
            }, 300));
        }
    }

    /**
     * Stop git status sync for a session
     */
    stop(sessionId: string): void {
        const projectKey = this.sessionToProjectKey.get(sessionId);
        if (projectKey) {
            this.sessionToProjectKey.delete(sessionId);

            // Check if any other sessions are using this project
            const hasOtherSessions = Array.from(this.sessionToProjectKey.values()).includes(projectKey);

            // Only stop the project sync if no other sessions are using it
            if (!hasOtherSessions) {
                const timer = this.debounceTimers.get(projectKey);
                if (timer) {
                    clearTimeout(timer);
                    this.debounceTimers.delete(projectKey);
                }
                const sync = this.projectSyncMap.get(projectKey);
                if (sync) {
                    sync.stop();
                    this.projectSyncMap.delete(projectKey);
                }
            }
        }
    }

    /**
     * Clear git status for a session when it's deleted
     * Similar to stop() but also clears any stored git status
     */
    clearForSession(sessionId: string): void {
        const projectKey = this.sessionToProjectKey.get(sessionId);

        // First stop any active syncs
        this.stop(sessionId);

        // Only clear git status if no other sessions share this path
        if (projectKey) {
            const hasOtherSessions = Array.from(this.sessionToProjectKey.values()).includes(projectKey);
            if (!hasOtherSessions) {
                storage.getState().applyGitStatus(projectKey, null);
            }
        }
    }

    private getControllableSessionForProject(projectKey: string): { sessionId: string; path: string } | null {
        for (const [sessionId, candidateProjectKey] of this.sessionToProjectKey.entries()) {
            if (candidateProjectKey !== projectKey) continue;
            const candidate = storage.getState().sessions[sessionId];
            if (candidate?.metadata?.path && canControlSession(candidate.metadata)) {
                return { sessionId, path: candidate.metadata.path };
            }
        }
        return null;
    }

    /**
     * Fetch git status using a currently registered controllable Pi session.
     * Re-resolve before every RPC so unmounting one shared-path view cannot
     * leave the rest of the refresh bound to a stale session.
     */
    private async fetchGitStatusForProject(projectKey: string): Promise<void> {
        let lastSessionId: string | undefined;
        const runCommand = async (command: string, timeout: number) => {
            const target = this.getControllableSessionForProject(projectKey);
            if (!target) return null;
            lastSessionId = target.sessionId;
            return sessionBash(target.sessionId, {
                command,
                cwd: target.path,
                timeout,
            });
        };

        try {
            const gitCheckResult = await runCommand('git rev-parse --is-inside-work-tree', 5000);
            if (!gitCheckResult) return;

            if (!gitCheckResult.success || gitCheckResult.exitCode !== 0) {
                // Not a git repository, clear any existing status
                storage.getState().applyGitStatus(projectKey, null);
                return;
            }

            // Get git status in porcelain v2 format (includes branch info)
            // --untracked-files=all ensures we get individual files, not directories
            const statusResult = await runCommand(
                'git -c core.quotepath=false status --porcelain=v2 --branch --show-stash --untracked-files=all',
                10000,
            );
            if (!statusResult) return;

            if (!statusResult.success) {
                console.error('Failed to get git status:', statusResult.error);
                return;
            }

            // Get git diff statistics for unstaged changes
            const diffStatResult = await runCommand(
                'git -c core.quotepath=false diff --numstat',
                10000,
            );
            if (!diffStatResult) return;

            // Get git diff statistics for staged changes
            const stagedDiffStatResult = await runCommand(
                'git -c core.quotepath=false diff --cached --numstat',
                10000,
            );
            if (!stagedDiffStatResult) return;

            // Parse the git status output with diff statistics
            const gitStatus = this.parseGitStatusV2(
                statusResult.stdout,
                diffStatResult.success ? diffStatResult.stdout : '',
                stagedDiffStatResult.success ? stagedDiffStatResult.stdout : ''
            );

            // Apply to storage keyed by path
            storage.getState().applyGitStatus(projectKey, gitStatus);

        } catch (error) {
            console.error('Error fetching git status for session', lastSessionId ?? projectKey, ':', error);
            // Don't apply error state, just skip this update
        }
    }

    /**
     * Parse git status porcelain v2 output into structured data
     */
    private parseGitStatusV2(
        porcelainV2Output: string,
        diffStatOutput: string = '',
        stagedDiffStatOutput: string = ''
    ): GitStatus {
        // Parse status using v2 parser
        const statusSummary = parseStatusSummaryV2(porcelainV2Output);
        const counts = getStatusCountsV2(statusSummary);
        const repoIsDirty = isDirtyV2(statusSummary);
        const branchName = getCurrentBranchV2(statusSummary);
        const trackingInfo = getTrackingInfoV2(statusSummary);

        // Parse diff statistics
        const unstagedDiff = parseNumStat(diffStatOutput);
        const stagedDiff = parseNumStat(stagedDiffStatOutput);
        const { stagedAdded, stagedRemoved, unstagedAdded, unstagedRemoved } = mergeDiffSummaries(stagedDiff, unstagedDiff);

        // Calculate totals
        const linesAdded = stagedAdded + unstagedAdded;
        const linesRemoved = stagedRemoved + unstagedRemoved;
        const linesChanged = linesAdded + linesRemoved;

        return {
            branch: branchName,
            isDirty: repoIsDirty,
            modifiedCount: counts.modified,
            untrackedCount: counts.untracked,
            stagedCount: counts.staged,
            stagedLinesAdded: stagedAdded,
            stagedLinesRemoved: stagedRemoved,
            unstagedLinesAdded: unstagedAdded,
            unstagedLinesRemoved: unstagedRemoved,
            linesAdded,
            linesRemoved,
            linesChanged,
            lastUpdatedAt: Date.now(),
            // V2-specific fields
            upstreamBranch: statusSummary.branch.upstream || null,
            aheadCount: trackingInfo?.ahead,
            behindCount: trackingInfo?.behind,
            stashCount: statusSummary.stashCount
        };
    }

    /**
     * Parse git status porcelain output into structured data using simple-git parsers
     * (Legacy v1 fallback method - kept for compatibility)
     */
    private parseGitStatus(
        branchName: string | null,
        porcelainOutput: string,
        diffStatOutput: string = '',
        stagedDiffStatOutput: string = ''
    ): GitStatus {
        // Parse status using simple-git parser
        const statusSummary = parseStatusSummary(porcelainOutput);
        const counts = getStatusCounts(statusSummary);
        const repoIsDirty = isDirty(statusSummary);

        // Parse diff statistics
        const unstagedDiff = parseNumStat(diffStatOutput);
        const stagedDiff = parseNumStat(stagedDiffStatOutput);
        const { stagedAdded, stagedRemoved, unstagedAdded, unstagedRemoved } = mergeDiffSummaries(stagedDiff, unstagedDiff);

        // Calculate totals
        const linesAdded = stagedAdded + unstagedAdded;
        const linesRemoved = stagedRemoved + unstagedRemoved;
        const linesChanged = linesAdded + linesRemoved;

        return {
            branch: branchName || null,
            isDirty: repoIsDirty,
            modifiedCount: counts.modified,
            untrackedCount: counts.untracked,
            stagedCount: counts.staged,
            stagedLinesAdded: stagedAdded,
            stagedLinesRemoved: stagedRemoved,
            unstagedLinesAdded: unstagedAdded,
            unstagedLinesRemoved: unstagedRemoved,
            linesAdded,
            linesRemoved,
            linesChanged,
            lastUpdatedAt: Date.now()
        };
    }

}

// Global singleton instance
export const gitStatusSync = new GitStatusSync();
