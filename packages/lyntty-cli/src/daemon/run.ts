import fs from 'fs/promises';
import os from 'os';
import * as tmp from 'tmp';
import axios from 'axios';
import { randomUUID } from 'node:crypto';

import { ApiClient } from '@/api/api';
import { ApiSessionClient } from '@/api/apiSession';
import { TrackedSession, SessionEncryptionData } from './types';
import { MachineMetadata, DaemonState, Metadata } from '@/api/types';
import { SpawnSessionOptions, SpawnSessionResult } from '@/modules/common/registerCommonHandlers';
import { logger } from '@/ui/logger';
import { authAndSetupMachineIfNeeded } from '@/ui/auth';
import { configuration } from '@/configuration';
import { startCaffeinate, stopCaffeinate } from '@/utils/caffeinate';
import packageJson from '../../package.json';
import { getEnvironmentInfo } from '@/ui/doctor';
import { currentLynttyShellCommand, spawnLynttyCLI } from '@/utils/spawnLynttyCLI';
import { writeDaemonState, DaemonLocallyPersistedState, readDaemonState, acquireDaemonLock, releaseDaemonLock, readPersistedPiCommandBoundary, readPersistedPiCommandOutcomes, readPersistedPiHistoryWatermark, readPersistedSessions, persistPiCommandBoundary, persistPiCommandOutcome, persistPiHistoryWatermark, persistSession } from '@/persistence';
import type { PersistedSession } from '@/persistence';

import { cleanupDaemonState, isDaemonRunningCurrentlyInstalledLynttyVersion, stopDaemon } from './controlClient';
import { startDaemonControlServer } from './controlServer';
import { findBlockedSessionEnvironmentKeys } from './sessionEnvironment';
import { statSync } from 'fs';
import { join, resolve } from 'path';
import { embeddedBuildIdentity } from '@/distribution/embeddedBuild';
import { runtimeLayout } from '@/distribution/runtimeLayout';
import { createDaemonHeartbeatState } from './daemonState';
import { getTmuxUtilities, isTmuxAvailable, parseTmuxSessionIdentifier, formatTmuxSessionIdentifier } from '@/utils/tmux';
import { expandEnvironmentVariables } from '@/utils/expandEnvVars';
import { detectCLIAvailability } from '@/utils/detectCLI';
import { detectResumeSupport } from '@/resume/localRemoteAuth';
import { encodeBase64, decodeBase64, decrypt } from '@/api/encryption';
import { resolveActivePiSessionReuse, resolvePiActivationLock, shouldKeepWaitingForPiExtension } from './activationLock';
import { SessionManager, type SessionInfo } from '@earendil-works/pi-coding-agent';
import { discoverLocalPiSessions, discoverLocalPiSessionsPage, redactPiSessionForRelay, type PiSessionRecoveryRecord, type RegisteredPiSessionState } from '@/pi/runPiRecovery';
import { mapPiSessionHistoryPageToEnvelopes, mapPiSessionHistoryToEnvelopes } from '@/pi/runPiHistory';
import { readPiSessionEntries, startPiExternalMirror } from '@/pi/runPiExternalMirror';
import { resolvePiRelaySessionTag } from '@/pi/piRelaySessionTag';
import { PiSessionProtocolMapper } from '@/pi/runPiSessionProtocol';
import { createEnvelope, type SessionEnvelope } from 'lyntty-wire';
import { attachImagesToPiRemoteCommand, isLifecyclePiExtensionEvent, parseLynttyPiRemoteCommand, toPiAgentSessionEvent, type LynttyPiCommandInfo, type LynttyPiExtensionPayload, type LynttyPiRemoteCommand, type LynttyPiRemoteCommandAck, type LynttyPiRemoteCommandEnvelope } from '@/pi/piExtensionEvent';
import { consumePiCompletionNotificationDecision, PiCompletionNotificationTracker, sendPiDoneNotification } from '@/pi/piCompletionNotifications';
import { applyPiCommandFailure, isStalePiCommandAck, removeTerminalPiCommandPrefix, resolvePiCommandAdmission, selectNextQueuedPiCommand } from './piCommandQueue';
import { PiActivationLeaseRegistry } from './activationLeaseRegistry';
import { isExternalPiMirrorActive, resolveExternalPiActivationLease, resolveStalePiMirrorCleanup } from './externalPiActivation';
import { applyPiExtensionSequence } from './piExtensionSequence';
import { claimPiExtensionInstance, isPiExtensionCommandOwner } from './piExtensionOwnership';
import { bindPiRemoteInput, type PiRemoteImage } from '@/pi/piRemoteInput';
import { resolvePiSessionDisplayName } from '@/pi/piSessionDisplayName';

/** Shell-escape a string for safe interpolation into tmux commands. */
function shellescape(s: string): string {
    return "'" + s.replace(/'/g, "'\\''") + "'";
}

// Prepare initial metadata
// Suffix host with `-dev` for the LYNTTY_VARIANT=dev variant so the dev daemon
// is visually distinct from the stable one in the machine list (they otherwise
// share the same hostname and look identical).
const hostSuffix = process.env.LYNTTY_VARIANT === 'dev' ? '-dev' : '';

function expandHomeDirectory(directory: string, homeDir = os.homedir()): string {
  if (directory === '~') {
    return homeDir;
  }
  if (directory.startsWith('~/')) {
    return join(homeDir, directory.slice(2));
  }
  return directory;
}

export function choosePiSpawnDirectory(
  directory: string,
  sessionId: string | undefined,
  records: PiSessionRecoveryRecord[],
  homeDir = os.homedir(),
): string {
  if (sessionId) {
    const matched = records.find((record) => record.piSessionId === sessionId);
    if (matched?.cwd) {
      return matched.cwd;
    }
  }
  return expandHomeDirectory(directory, homeDir);
}

function firstSessionMessageText(entries: ReturnType<typeof readPiSessionEntries>): string | undefined {
  for (const entry of entries) {
    if (entry.type !== 'message') continue;
    const message = entry.message as { content?: unknown } | undefined;
    if (typeof message?.content === 'string') {
      return message.content;
    }
    if (Array.isArray(message?.content)) {
      const text = message.content
        .map((part) => part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : '')
        .filter(Boolean)
        .join('\n');
      if (text) return text;
    }
  }
  return undefined;
}

async function readPiSessionInfoFromFile(sessionId: string, sessionFile?: string): Promise<SessionInfo | undefined> {
  if (!sessionFile) return undefined;
  try {
    const content = await fs.readFile(sessionFile, 'utf8');
    const header = JSON.parse(content.split('\n').find((line) => line.trim().length > 0) ?? '{}') as { type?: string; id?: string; cwd?: string; timestamp?: string };
    if (header.type !== 'session' || header.id !== sessionId) {
      return undefined;
    }
    const stat = await fs.stat(sessionFile);
    const entries = readPiSessionEntries(sessionFile);
    const sessionInfoEntries = entries
      .filter((entry) => entry.type === 'session_info')
      .map((entry) => entry as { name?: unknown });
    const name = [...sessionInfoEntries].reverse().find((entry) => typeof entry.name === 'string')?.name as string | undefined;
    return {
      path: sessionFile,
      id: sessionId,
      cwd: header.cwd ?? os.homedir(),
      created: header.timestamp ? new Date(header.timestamp) : stat.birthtime,
      modified: stat.mtime,
      messageCount: entries.filter((entry) => entry.type === 'message').length,
      firstMessage: firstSessionMessageText(entries) ?? '',
      allMessagesText: '',
      name,
    } satisfies SessionInfo;
  } catch (error) {
    logger.debug(`[DAEMON RUN] Failed exact Pi session file lookup for ${sessionFile}: ${error instanceof Error ? error.message : error}`);
    return undefined;
  }
}

async function findPiSessionNearDirectory(sessionId: string, directory?: string, sessionFile?: string): Promise<SessionInfo | undefined> {
  const exact = await readPiSessionInfoFromFile(sessionId, sessionFile);
  if (exact) {
    return exact;
  }
  const expandedDirectory = directory ? expandHomeDirectory(directory) : undefined;
  if (expandedDirectory) {
    try {
      const cwdSessions = await SessionManager.list(expandedDirectory);
      const matched = cwdSessions.find((session) => session.id === sessionId);
      if (matched) {
        return matched;
      }
    } catch (error) {
      logger.debug(`[DAEMON RUN] Failed scoped Pi session lookup for ${expandedDirectory}: ${error instanceof Error ? error.message : error}`);
    }
  }

  const machineSessions = await SessionManager.listAll();
  return machineSessions.find((session) => session.id === sessionId);
}

const distributionLayout = runtimeLayout();

export const initialMachineMetadata: MachineMetadata = {
  host: os.hostname() + hostSuffix,
  platform: os.platform(),
  lynttyCliVersion: packageJson.version,
  homeDir: os.homedir(),
  lynttyHomeDir: configuration.lynttyHomeDir,
  lynttyLibDir: distributionLayout.libraryDir,
  cliAvailability: detectCLIAvailability(),
  resumeSupport: { ...detectResumeSupport(), rpcAvailable: true },
};

const PI_ASSISTANT_JSONL_DELIVERY_GRACE_MS = 30_000;

type PiExtensionDeliveryMirror = {
  markCurrentEntriesDeliveredSince: (cutoffTimeMs: number, options?: { includeAssistantMessages?: boolean }) => void;
  markUserTextDeliveredSince: (text: string, cutoffTimeMs: number) => void;
  markAssistantTextDeliveredSince: (text: string, cutoffTimeMs: number, untilTimeMs?: number) => void;
  capAssistantTextDeliveryWindow: (untilTimeMs: number) => void;
  deliveredAssistantTextInTurn: string;
  pendingTextFlushTimer: ReturnType<typeof setTimeout> | null;
  sessionClient: Pick<ApiSessionClient, 'sendSessionProtocolMessage' | 'flush'>;
  mapper: Pick<PiSessionProtocolMapper, 'flushPendingText'>;
};

export const hasDeliveredContentEnvelope = (envelopes: readonly SessionEnvelope[]): boolean => envelopes.some((envelope) => {
  return envelope.ev.t === 'text' || envelope.ev.t === 'tool-call-start' || envelope.ev.t === 'tool-call-end';
});

function appendDeliveredAssistantText(mirror: Pick<PiExtensionDeliveryMirror, 'deliveredAssistantTextInTurn'>, envelopes: readonly SessionEnvelope[]): boolean {
  const previousText = mirror.deliveredAssistantTextInTurn;
  for (const envelope of envelopes) {
    if (envelope.role === 'agent' && envelope.ev.t === 'text' && !envelope.ev.thinking) {
      mirror.deliveredAssistantTextInTurn += envelope.ev.text;
    }
  }
  return mirror.deliveredAssistantTextInTurn !== previousText;
}

export function clearPendingPiLiveTextFlush(mirror: Pick<PiExtensionDeliveryMirror, 'pendingTextFlushTimer'>): void {
  if (!mirror.pendingTextFlushTimer) return;
  clearTimeout(mirror.pendingTextFlushTimer);
  mirror.pendingTextFlushTimer = null;
}

export function markPiExtensionDelivered(mirror: Pick<PiExtensionDeliveryMirror, 'markCurrentEntriesDeliveredSince'>, cutoffTimeMs: number, options: { includeAssistantMessages?: boolean } = {}): void {
  try {
    mirror.markCurrentEntriesDeliveredSince(cutoffTimeMs, options);
  } catch (error) {
    logger.debug('[pi] Failed to mark Pi extension-delivered entries', error);
  }
  setTimeout(() => {
    try {
      mirror.markCurrentEntriesDeliveredSince(cutoffTimeMs, options);
    } catch (error) {
      logger.debug('[pi] Failed delayed Pi extension-delivered mark', error);
    }
  }, 2_500).unref?.();
}

export function markPiExtensionUserInputDelivered(mirror: Pick<PiExtensionDeliveryMirror, 'markUserTextDeliveredSince'>, text: string, cutoffTimeMs: number): void {
  try {
    mirror.markUserTextDeliveredSince(text, cutoffTimeMs);
  } catch (error) {
    logger.debug('[pi] Failed to mark Pi extension-delivered user input', error);
  }
  setTimeout(() => {
    try {
      mirror.markUserTextDeliveredSince(text, cutoffTimeMs);
    } catch (error) {
      logger.debug('[pi] Failed delayed Pi extension-delivered user input mark', error);
    }
  }, 2_500).unref?.();
}

export function markPiExtensionAssistantTextDelivered(mirror: Pick<PiExtensionDeliveryMirror, 'markAssistantTextDeliveredSince'>, text: string, cutoffTimeMs: number, untilTimeMs?: number): void {
  const normalizedText = text.trim();
  if (!normalizedText) return;
  const mark = (): void => {
    if (untilTimeMs === undefined) {
      mirror.markAssistantTextDeliveredSince(normalizedText, cutoffTimeMs);
      return;
    }
    mirror.markAssistantTextDeliveredSince(normalizedText, cutoffTimeMs, untilTimeMs);
  };
  try {
    mark();
  } catch (error) {
    logger.debug('[pi] Failed to mark Pi extension-delivered assistant text', error);
  }
  setTimeout(() => {
    try {
      mark();
    } catch (error) {
      logger.debug('[pi] Failed delayed Pi extension-delivered assistant text mark', error);
    }
  }, 2_500).unref?.();
}

function capPiExtensionAssistantTextDeliveryWindow(mirror: Pick<PiExtensionDeliveryMirror, 'capAssistantTextDeliveryWindow'>, untilTimeMs: number): void {
  try {
    mirror.capAssistantTextDeliveryWindow(untilTimeMs);
  } catch (error) {
    logger.debug('[pi] Failed to cap Pi extension-delivered assistant text window', error);
  }
}

export async function flushPendingPiLiveText(mirror: PiExtensionDeliveryMirror, cutoffTimeMs: number): Promise<void> {
  clearPendingPiLiveTextFlush(mirror);
  const envelopes = mirror.mapper.flushPendingText();
  if (envelopes.length === 0) return;
  const deliveredAssistantTextChanged = appendDeliveredAssistantText(mirror, envelopes);
  for (const envelope of envelopes) {
    mirror.sessionClient.sendSessionProtocolMessage(envelope);
  }
  await mirror.sessionClient.flush();
  markPiExtensionDelivered(mirror, cutoffTimeMs);
  if (deliveredAssistantTextChanged) {
    markPiExtensionAssistantTextDelivered(mirror, mirror.deliveredAssistantTextInTurn, cutoffTimeMs);
  }
}

export async function startDaemon(): Promise<void> {
  // We don't have cleanup function at the time of server construction
  // Control flow is:
  // 1. Create promise that will resolve when shutdown is requested
  // 2. Setup signal handlers to resolve this promise with the source of the shutdown
  // 3. Once our setup is complete - if all goes well - we await this promise
  // 4. When it resolves we can cleanup and exit
  //
  // In case the setup malfunctions - our signal handlers will not properly
  // shut down. We will force exit the process with code 1.
  let requestShutdown: (source: 'lyntty-app' | 'lyntty-cli' | 'os-signal' | 'exception', errorMessage?: string) => void;
  let resolvesWhenShutdownRequested = new Promise<({ source: 'lyntty-app' | 'lyntty-cli' | 'os-signal' | 'exception', errorMessage?: string })>((resolve) => {
    requestShutdown = (source, errorMessage) => {
      logger.debug(`[DAEMON RUN] Requesting shutdown (source: ${source}, errorMessage: ${errorMessage})`);

      // Fallback - in case startup malfunctions - we will force exit the process with code 1
      setTimeout(async () => {
        logger.debug('[DAEMON RUN] Startup malfunctioned, forcing exit with code 1');

        // Give time for logs to be flushed
        await new Promise(resolve => setTimeout(resolve, 100))

        process.exit(1);
      }, 1_000);

      // Start graceful shutdown
      resolve({ source, errorMessage });
    };
  });

  // Setup signal handlers
  process.on('SIGINT', () => {
    logger.debug('[DAEMON RUN] Received SIGINT');
    requestShutdown('os-signal');
  });

  process.on('SIGTERM', () => {
    logger.debug('[DAEMON RUN] Received SIGTERM');
    requestShutdown('os-signal');
  });

  process.on('uncaughtException', (error) => {
    logger.debug(`[DAEMON RUN] FATAL: Uncaught exception: ${error.message}`);
    logger.debug(`[DAEMON RUN] Stack trace: ${error.stack}`);
    requestShutdown('exception', error.message);
  });

  process.on('unhandledRejection', (reason, promise) => {
    const error = reason instanceof Error ? reason : new Error(`Unhandled promise rejection: ${reason}`);
    logger.debug(`[DAEMON RUN] FATAL: Unhandled promise rejection: ${error.message}`);
    logger.debug(`[DAEMON RUN] Rejected promise:`, promise);
    logger.debug(`[DAEMON RUN] Stack trace: ${error.stack}`);
    requestShutdown('exception', error.message);
  });

  process.on('exit', (code) => {
    logger.debug(`[DAEMON RUN] Process exiting with code: ${code}`);
  });

  process.on('beforeExit', (code) => {
    logger.debug(`[DAEMON RUN] Process about to exit with code: ${code}`);
  });

  logger.debug('[DAEMON RUN] Starting daemon process...');
  logger.debugLargeJson('[DAEMON RUN] Environment', getEnvironmentInfo());

  // Check if already running
  // Check if running daemon version matches current CLI version
  const runningDaemonVersionMatches = await isDaemonRunningCurrentlyInstalledLynttyVersion();
  if (!runningDaemonVersionMatches) {
    // TODO: This hand-rolled self-restart path is awkward to reason about and awkward to test.
    // We should probably migrate this daemon to native system service management
    // (launchd/systemd), so startup/start-at-login and upgrades
    // are owned by the OS instead of by the daemon trying to replace itself in-process.
    logger.debug('[DAEMON RUN] Daemon version mismatch detected, restarting daemon with current CLI version');
    await stopDaemon();
  } else {
    logger.debug('[DAEMON RUN] Daemon version matches, keeping existing daemon');
    console.log('Daemon already running with matching version');
    process.exit(0);
  }

  // Acquire exclusive lock (proves daemon is running)
  const daemonLockHandle = await acquireDaemonLock(5, 200);
  if (!daemonLockHandle) {
    logger.debug('[DAEMON RUN] Daemon lock file already held, another daemon is running');
    process.exit(0);
  }

  // At this point we should be safe to startup the daemon:
  // 1. Not have a stale daemon state
  // 2. Should not have another daemon process running

  try {
    // Start caffeinate
    const caffeinateStarted = startCaffeinate();
    if (caffeinateStarted) {
      logger.debug('[DAEMON RUN] Sleep prevention enabled');
    }

    // Ensure auth and machine registration BEFORE anything else
    const { credentials, machineId } = await authAndSetupMachineIfNeeded();
    logger.debug('[DAEMON RUN] Auth and machine setup complete');

    // Setup state - key by PID
    const pidToTrackedSession = new Map<number, TrackedSession>();

    // Retain session data after process exits so resume can still find it.
    // Pre-populate from disk so sessions survive daemon restarts.
    const sessionIdToFinishedSession = new Map<string, TrackedSession>();
    const persisted = readPersistedSessions();
    for (const [id, s] of Object.entries(persisted)) {
      sessionIdToFinishedSession.set(id, {
        startedBy: 'persisted',
        lynttySessionId: id,
        lynttySessionMetadataFromLocalWebhook: s.metadata,
        encryption: {
          encryptionKey: decodeBase64(s.encryptionKey),
          encryptionVariant: s.encryptionVariant,
          seq: s.seq,
          metadataVersion: s.metadataVersion,
          agentStateVersion: s.agentStateVersion,
        },
        pid: 0,
      });
    }
    if (Object.keys(persisted).length > 0) {
      logger.debug(`[DAEMON RUN] Loaded ${Object.keys(persisted).length} persisted sessions from disk`);
    }

    // Session spawning awaiter system
    const pidToAwaiter = new Map<number, (session: TrackedSession) => void>();

    // Helper functions
    const getCurrentChildren = () => Array.from(pidToTrackedSession.values());
    const piActivationLeases = new PiActivationLeaseRegistry();
    type ExternalPiActivationResolution =
      | { type: 'none' | 'released' }
      | { type: 'reuse'; sessionId: string }
      | { type: 'blocked'; errorMessage: string };
    let resolveExternalPiActivation = async (_options: SpawnSessionOptions): Promise<ExternalPiActivationResolution> => ({ type: 'none' });

    const isProcessRunning = (pid: number): boolean => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        return !!error && typeof error === 'object' && (error as NodeJS.ErrnoException).code === 'EPERM';
      }
    };

    const waitForProcessExit = async (pid: number, timeoutMs = 12_000): Promise<boolean> => {
      const deadline = Date.now() + timeoutMs;
      while (isProcessRunning(pid) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return !isProcessRunning(pid);
    };

    const stopTrackedSessionByPid = (pid: number): boolean => {
      const session = pidToTrackedSession.get(pid);
      if (!session) return false;

      if (session.startedBy === 'daemon' && session.childProcess) {
        try {
          session.childProcess.kill('SIGTERM');
          logger.debug(`[DAEMON RUN] Sent SIGTERM to daemon-spawned session PID ${pid}`);
        } catch (error) {
          logger.debug(`[DAEMON RUN] Failed to kill daemon-spawned session PID ${pid}:`, error);
        }
      } else {
        try {
          process.kill(pid, 'SIGTERM');
          logger.debug(`[DAEMON RUN] Sent SIGTERM to session PID ${pid}`);
        } catch (error) {
          logger.debug(`[DAEMON RUN] Failed to kill session PID ${pid}:`, error);
        }
      }

      return true;
    };

    // Handle webhook from lyntty session reporting itself
    const onLynttySessionWebhook = (sessionId: string, sessionMetadata: Metadata, encryption?: SessionEncryptionData) => {
      logger.debugLargeJson(`[DAEMON RUN] Session reported`, sessionMetadata);

      const pid = sessionMetadata.hostPid;
      if (!pid) {
        logger.debug(`[DAEMON RUN] Session webhook missing hostPid for sessionId: ${sessionId}`);
        return;
      }

      logger.debug(`[DAEMON RUN] Session webhook: ${sessionId}, PID: ${pid}, started by: ${sessionMetadata.startedBy || 'unknown'}, hasEncryption: ${!!encryption}`);
      logger.debug(`[DAEMON RUN] Current tracked sessions before webhook: ${Array.from(pidToTrackedSession.keys()).join(', ')}`);

      // Persist encryption data to disk so it survives daemon restarts
      if (encryption) {
        persistSession(sessionId, {
          encryptionKey: encodeBase64(encryption.encryptionKey),
          encryptionVariant: encryption.encryptionVariant,
          seq: encryption.seq,
          metadataVersion: encryption.metadataVersion,
          agentStateVersion: encryption.agentStateVersion,
          metadata: sessionMetadata,
          savedAt: Date.now(),
        });
      }

      // Check if we already have this PID (daemon-spawned)
      const existingSession = pidToTrackedSession.get(pid);

      if (existingSession && existingSession.startedBy === 'daemon') {
        // Update daemon-spawned session with reported data
        existingSession.lynttySessionId = sessionId;
        existingSession.lynttySessionMetadataFromLocalWebhook = sessionMetadata;
        existingSession.encryption = encryption;
        logger.debug(`[DAEMON RUN] Updated daemon-spawned session ${sessionId} with metadata`);

        // Resolve any awaiter for this PID
        const awaiter = pidToAwaiter.get(pid);
        if (awaiter) {
          pidToAwaiter.delete(pid);
          awaiter(existingSession);
          logger.debug(`[DAEMON RUN] Resolved session awaiter for PID ${pid}`);
        }
      } else if (!existingSession) {
        // New session started externally
        const trackedSession: TrackedSession = {
          startedBy: 'lyntty directly - likely by user from terminal',
          lynttySessionId: sessionId,
          lynttySessionMetadataFromLocalWebhook: sessionMetadata,
          encryption,
          pid
        };
        pidToTrackedSession.set(pid, {
          ...trackedSession,
          directory: sessionMetadata.path,
          agent: sessionMetadata.flavor === 'pi' ? 'pi' : undefined,
        });
        logger.debug(`[DAEMON RUN] Registered externally-started session ${sessionId}`);
      }
    };

    // Spawn a new session (sessionId reserved for future --resume functionality)
    const spawnSession = async (options: SpawnSessionOptions): Promise<SpawnSessionResult> => {
      logger.debugLargeJson('[DAEMON RUN] Spawning session', options);

      let { directory, sessionId, approvedNewDirectoryCreation = true } = options;
      if (options.agent && options.agent !== 'pi') {
        return { type: 'error', errorMessage: 'lynttyd only supports spawning Pi runtimes.' };
      }
      if (options.machineId && options.machineId !== machineId) {
        return { type: 'error', errorMessage: 'Spawn request machineId does not match this lynttyd node.' };
      }
      const targetMachineId = machineId;
      if (sessionId) {
        const localPiSession = await findPiSessionNearDirectory(sessionId, directory);
        const resolvedDirectory = localPiSession?.cwd ?? expandHomeDirectory(directory);
        if (resolvedDirectory !== directory) {
          logger.debug(`[DAEMON RUN] Resolved Pi session spawn directory from ${directory} to ${resolvedDirectory}`);
          directory = resolvedDirectory;
        }
      } else {
        directory = expandHomeDirectory(directory);
      }
      directory = resolve(directory);
      const spawnOptions = { ...options, directory, machineId: targetMachineId, agent: 'pi' as const };
      const activeMatchingPiSession = resolveActivePiSessionReuse(sessionId, getCurrentChildren(), targetMachineId);
      if (activeMatchingPiSession?.lynttySessionId && !options.takeoverChoice) {
        logger.debug(`[DAEMON RUN] Reusing active Pi runtime ${activeMatchingPiSession.lynttySessionId} for Pi session ${sessionId}`);
        return {
          type: 'success',
          sessionId: activeMatchingPiSession.lynttySessionId,
        };
      }
      let directoryCreated = false;

      try {
        await fs.access(directory);
        logger.debug(`[DAEMON RUN] Directory exists: ${directory}`);
      } catch (error) {
        logger.debug(`[DAEMON RUN] Directory doesn't exist, creating: ${directory}`);

        // Check if directory creation is approved
        if (!approvedNewDirectoryCreation) {
          logger.debug(`[DAEMON RUN] Directory creation not approved for: ${directory}`);
          return {
            type: 'requestToApproveDirectoryCreation',
            directory
          };
        }

        try {
          await fs.mkdir(directory, { recursive: true });
          logger.debug(`[DAEMON RUN] Successfully created directory: ${directory}`);
          directoryCreated = true;
        } catch (mkdirError: any) {
          let errorMessage = `Unable to create directory at '${directory}'. `;

          // Provide more helpful error messages based on the error code
          if (mkdirError.code === 'EACCES') {
            errorMessage += `Permission denied. You don't have write access to create a folder at this location. Try using a different path or check your permissions.`;
          } else if (mkdirError.code === 'ENOTDIR') {
            errorMessage += `A file already exists at this path or in the parent path. Cannot create a directory here. Please choose a different location.`;
          } else if (mkdirError.code === 'ENOSPC') {
            errorMessage += `No space left on device. Your disk is full. Please free up some space and try again.`;
          } else if (mkdirError.code === 'EROFS') {
            errorMessage += `The file system is read-only. Cannot create directories here. Please choose a writable location.`;
          } else {
            errorMessage += `System error: ${mkdirError.message || mkdirError}. Please verify the path is valid and you have the necessary permissions.`;
          }

          logger.debug(`[DAEMON RUN] Directory creation failed: ${errorMessage}`);
          return {
            type: 'error',
            errorMessage
          };
        }
      }

      const activationLeaseKey = `${targetMachineId}:${sessionId ?? `cwd:${directory}`}`;
      return piActivationLeases.run(activationLeaseKey, async () => {
        try {
        if (shouldKeepWaitingForPiExtension(sessionId, options.takeoverChoice)) {
          return {
            type: 'error',
            errorMessage: 'Waiting for Pi extension. No replacement runtime was started.',
          };
        }
        const externalActivation = await resolveExternalPiActivation(spawnOptions);
        if (externalActivation.type === 'reuse') {
          logger.debug(`[DAEMON RUN] Reusing extension-backed Pi runtime ${externalActivation.sessionId} for Pi session ${sessionId}`);
          return { type: 'success', sessionId: externalActivation.sessionId };
        }
        if (externalActivation.type === 'blocked') {
          return { type: 'error', errorMessage: externalActivation.errorMessage };
        }

        const activeAfterLease = resolveActivePiSessionReuse(sessionId, getCurrentChildren(), targetMachineId);
        if (activeAfterLease?.lynttySessionId && !options.takeoverChoice) {
          return { type: 'success', sessionId: activeAfterLease.lynttySessionId };
        }
        if (sessionId && hasRecentPiExtensionSignal(targetMachineId, sessionId)) {
          return {
            type: 'error',
            errorMessage: 'Waiting for Pi extension to finish reconnecting; no duplicate runtime was started.',
          };
        }
        if (sessionId && !options.takeoverChoice) {
          return {
            type: 'error',
            errorMessage: 'Waiting for Pi extension. Retry when the computer Pi session is active, or choose an explicit takeover.',
          };
        }
        const activationLock = resolvePiActivationLock(spawnOptions, getCurrentChildren());
        if (activationLock.type === 'blocked') {
          logger.debug(`[DAEMON RUN] Pi activation lock blocked spawn: ${activationLock.errorMessage}`);
          return {
            type: 'error',
            errorMessage: activationLock.errorMessage,
          };
        }
        if (activationLock.type === 'wait') {
          logger.debug(`[DAEMON RUN] Waiting for active Pi runtime PID ${activationLock.activePid} to release its lease`);
          if (!await waitForProcessExit(activationLock.activePid)) {
            return {
              type: 'error',
              errorMessage: `Timed out waiting for active Pi runtime PID ${activationLock.activePid} to exit; no replacement was started.`,
            };
          }
          pidToTrackedSession.delete(activationLock.activePid);
        }
        if (activationLock.type === 'takeover') {
          logger.debug(`[DAEMON RUN] Pi activation lock takeover requested (${activationLock.choice}) for PID ${activationLock.activePid}`);
          stopTrackedSessionByPid(activationLock.activePid);
          if (!await waitForProcessExit(activationLock.activePid)) {
            return {
              type: 'error',
              errorMessage: `Timed out waiting for active Pi runtime PID ${activationLock.activePid} to exit; no replacement was started.`,
            };
          }
          pidToTrackedSession.delete(activationLock.activePid);
        }

        // Build environment variables for the managed Pi session.
        const blockedEnvironmentKeys = findBlockedSessionEnvironmentKeys(options.environmentVariables);
        if (blockedEnvironmentKeys.length > 0) {
          return {
            type: 'error',
            errorMessage: `Session environment contains reserved or unsafe variables: ${blockedEnvironmentKeys.join(', ')}`,
          };
        }

        let extraEnv: Record<string, string> = {
          ...(options.environmentVariables ?? {}),
          // Managed SDK runtime owns relay command delivery; disable the global
          // ordinary-TUI extension in that child to prevent double consumption.
          LYNTTY_PI_EXTENSION_DISABLED: '1',
        };
        if (options.sessionId) {
          extraEnv.LYNTTY_PI_SESSION_ID = options.sessionId;
        }
        logger.debug(`[DAEMON RUN] Environment variable keys (before expansion) (${Object.keys(extraEnv).length}): ${Object.keys(extraEnv).join(', ')}`);

        // Expand ${VAR} references from daemon's process.env
        // This ensures variable substitution works in both tmux and non-tmux modes
        // Example: ANTHROPIC_AUTH_TOKEN="${Z_AI_AUTH_TOKEN}" → ANTHROPIC_AUTH_TOKEN="sk-real-key"
        extraEnv = expandEnvironmentVariables(extraEnv, process.env);
        logger.debug(`[DAEMON RUN] After variable expansion: ${Object.keys(extraEnv).join(', ')}`);

        // Fail fast if any passed-through environment variable still contains an
        // unresolved ${VAR} reference after expansion.
        const unresolvedEnvEntries = Object.entries(extraEnv).flatMap(([key, value]) => {
          if (typeof value !== 'string' || !value.includes('${')) {
            return [];
          }

          const unresolvedMatch = value.match(/\$\{([^}]+)\}/);
          if (!unresolvedMatch) {
            return [];
          }

          const expression = unresolvedMatch[1];
          const defaultSeparatorIndex = expression.indexOf(':-');
          const missingVar = defaultSeparatorIndex === -1
            ? expression
            : expression.slice(0, defaultSeparatorIndex);

          return [`${key} references \${${missingVar}} which is not defined`];
        });

        if (unresolvedEnvEntries.length > 0) {
          const errorMessage = `Session environment is invalid - environment variables not found in daemon: ${unresolvedEnvEntries.join('; ')}. ` +
            `Ensure these variables are set in the daemon's environment before starting sessions.`;
          logger.warn(`[DAEMON RUN] ${errorMessage}`);
          return {
            type: 'error',
            errorMessage
          };
        }

        // Check if tmux is available and should be used
        const tmuxAvailable = await isTmuxAvailable();
        let useTmux = tmuxAvailable;

        // Get tmux session name from environment variables (now set by profile system)
        // Empty string means "use current/most recent session" (tmux default behavior)
        let tmuxSessionName: string | undefined = extraEnv.TMUX_SESSION_NAME;

        // If tmux is not available or session name is explicitly undefined, fall back to regular spawning
        // Note: Empty string is valid (means use current/most recent tmux session)
        if (!tmuxAvailable || tmuxSessionName === undefined) {
          useTmux = false;
          if (tmuxSessionName !== undefined) {
            logger.debug(`[DAEMON RUN] tmux session name specified but tmux not available, falling back to regular spawning`);
          }
        }

        if (useTmux && tmuxSessionName !== undefined) {
          // Try to spawn in tmux session
          const sessionDesc = tmuxSessionName || 'current/most recent session';
          logger.debug(`[DAEMON RUN] Attempting to spawn session in tmux: ${sessionDesc}`);

          const tmux = getTmuxUtilities(tmuxSessionName);

          // Construct a runtime-free command for release binaries. Source
          // development still resolves through Bun's generated dist entrypoint.
          const agent = 'pi';
          const fullCommand = currentLynttyShellCommand([agent, '--started-by', 'daemon']);

          // Spawn in tmux with environment variables
          // IMPORTANT: Pass complete environment (process.env + extraEnv) because:
          // 1. tmux sessions need daemon's expanded auth variables (e.g., ANTHROPIC_AUTH_TOKEN)
          // 2. Regular spawn uses env: { ...process.env, ...extraEnv }
          // 3. tmux needs explicit environment via -e flags to ensure all variables are available
          const windowName = `lyntty-${Date.now()}-${agent}`;
          const tmuxEnv: Record<string, string> = {};

          // Add all daemon environment variables (filtering out undefined)
          for (const [key, value] of Object.entries(process.env)) {
            if (value !== undefined) {
              tmuxEnv[key] = value;
            }
          }

          // Add extra environment variables (these should already be filtered)
          Object.assign(tmuxEnv, extraEnv);

          if (sessionId && hasRecentPiExtensionSignal(targetMachineId, sessionId)) {
            return { type: 'error', errorMessage: 'Pi extension reconnected before takeover spawn; no duplicate runtime was started.' };
          }
          const tmuxResult = await tmux.spawnInTmux([fullCommand], {
            sessionName: tmuxSessionName,
            windowName: windowName,
            cwd: directory
          }, tmuxEnv);  // Pass complete environment for tmux session

          if (tmuxResult.success) {
            logger.debug(`[DAEMON RUN] Successfully spawned in tmux session: ${tmuxResult.sessionId}, PID: ${tmuxResult.pid}`);

            // Validate we got a PID from tmux
            if (!tmuxResult.pid) {
              throw new Error('Tmux window created but no PID returned');
            }

            // Create a tracked session for tmux windows - now we have the real PID!
            const trackedSession: TrackedSession = {
              startedBy: 'daemon',
              pid: tmuxResult.pid, // Real PID from tmux -P flag
              tmuxSessionId: tmuxResult.sessionId,
              directory,
              agent: 'pi',
              directoryCreated,
              message: directoryCreated
                ? `The path '${directory}' did not exist. We created a new folder and spawned a new session in tmux session '${tmuxSessionName}'. Use 'tmux attach -t ${tmuxSessionName}' to view the session.`
                : `Spawned new session in tmux session '${tmuxSessionName}'. Use 'tmux attach -t ${tmuxSessionName}' to view the session.`
            };

            // Add to tracking map so webhook can find it later
            pidToTrackedSession.set(tmuxResult.pid, trackedSession);

            // Wait for webhook to populate session with lynttySessionId (exact same as regular flow)
            logger.debug(`[DAEMON RUN] Waiting for session webhook for PID ${tmuxResult.pid} (tmux)`);

            return new Promise((resolve) => {
              // Set timeout for webhook (same as regular flow)
              const timeout = setTimeout(() => {
                pidToAwaiter.delete(tmuxResult.pid!);
                logger.debug(`[DAEMON RUN] Session webhook timeout for PID ${tmuxResult.pid} (tmux)`);
                resolve({
                  type: 'error',
                  errorMessage: `Session webhook timeout for PID ${tmuxResult.pid} (tmux)`
                });
              }, 15_000); // Same timeout as regular sessions

              // Register awaiter for tmux session (exact same as regular flow)
              pidToAwaiter.set(tmuxResult.pid!, (completedSession) => {
                clearTimeout(timeout);
                logger.debug(`[DAEMON RUN] Session ${completedSession.lynttySessionId} fully spawned with webhook (tmux)`);
                resolve({
                  type: 'success',
                  sessionId: completedSession.lynttySessionId!
                });
              });
            });
          } else {
            logger.debug(`[DAEMON RUN] Failed to spawn in tmux: ${tmuxResult.error}, falling back to regular spawning`);
            useTmux = false;
          }
        }

        // Regular process spawning (fallback or if tmux not available)
        if (!useTmux) {
          logger.debug(`[DAEMON RUN] Using regular process spawning`);

          const agentCommand = 'pi';
          const args = [
            agentCommand,
            '--started-by', 'daemon'
          ];


          if (sessionId && hasRecentPiExtensionSignal(targetMachineId, sessionId)) {
            return { type: 'error', errorMessage: 'Pi extension reconnected before takeover spawn; no duplicate runtime was started.' };
          }
          return spawnTrackedLynttyProcess({
            args,
            cwd: directory,
            env: {
              ...process.env,
              ...extraEnv
            },
            directoryCreated,
            message: directoryCreated ? `The path '${directory}' did not exist. We created a new folder and spawned a new session there.` : undefined,
          });
        }

        // This should never be reached, but TypeScript requires a return statement
        return {
          type: 'error',
          errorMessage: 'Unexpected error in session spawning'
        };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.debug('[DAEMON RUN] Failed to spawn session:', error);
          return {
            type: 'error',
            errorMessage: `Failed to spawn session: ${errorMessage}`
          };
        }
      });
    };

    const spawnTrackedLynttyProcess = ({
      args,
      cwd,
      env,
      directoryCreated = false,
      message,
    }: {
      args: string[];
      cwd: string;
      env: NodeJS.ProcessEnv;
      directoryCreated?: boolean;
      message?: string;
    }): Promise<SpawnSessionResult> => {
      const lynttyProcess = spawnLynttyCLI(args, {
        cwd,
        detached: true,
        stdio: 'ignore',
        env,
      });

      if (!lynttyProcess.pid) {
        logger.debug('[DAEMON RUN] Failed to spawn process - no PID returned');
        return Promise.resolve({
          type: 'error',
          errorMessage: 'Failed to spawn Lyntty process - no PID returned'
        });
      }

      logger.debug(`[DAEMON RUN] Spawned process with PID ${lynttyProcess.pid}`);

      const trackedSession: TrackedSession = {
        startedBy: 'daemon',
        pid: lynttyProcess.pid,
        childProcess: lynttyProcess,
        directory: cwd,
        agent: 'pi',
        directoryCreated,
        message,
      };

      pidToTrackedSession.set(lynttyProcess.pid, trackedSession);

      lynttyProcess.on('exit', (code, signal) => {
        logger.debug(`[DAEMON RUN] Child PID ${lynttyProcess.pid} exited with code ${code}, signal ${signal}`);
        if (lynttyProcess.pid) {
          onChildExited(lynttyProcess.pid);
        }
      });

      lynttyProcess.on('error', (error) => {
        logger.debug(`[DAEMON RUN] Child process error:`, error);
        if (lynttyProcess.pid) {
          onChildExited(lynttyProcess.pid);
        }
      });

      logger.debug(`[DAEMON RUN] Waiting for session webhook for PID ${lynttyProcess.pid}`);

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          pidToAwaiter.delete(lynttyProcess.pid!);
          logger.debug(`[DAEMON RUN] Session webhook timeout for PID ${lynttyProcess.pid}`);
          resolve({
            type: 'error',
            errorMessage: `Session webhook timeout for PID ${lynttyProcess.pid}`
          });
        }, 15_000);

        pidToAwaiter.set(lynttyProcess.pid!, (completedSession) => {
          clearTimeout(timeout);
          logger.debug(`[DAEMON RUN] Session ${completedSession.lynttySessionId} fully spawned with webhook`);
          resolve({
            type: 'success',
            sessionId: completedSession.lynttySessionId!
          });
        });
      });
    };

    const findTrackedSessionById = (lynttySessionId: string): TrackedSession | undefined => {
      for (const session of pidToTrackedSession.values()) {
        if (session.lynttySessionId === lynttySessionId) return session;
      }
      return sessionIdToFinishedSession.get(lynttySessionId);
    };

    const piDiscoveryCache = new Map<string, { expiresAt: number; sessions: SessionInfo[] }>();
    const PI_DISCOVERY_CACHE_TTL_MS = 10_000;

    const listCachedPiSessionInfos = async (options?: { cwd?: string; scope?: 'cwd' | 'machine' }): Promise<SessionInfo[]> => {
      const scope = options?.scope ?? 'machine';
      const cacheKey = `${scope}:${options?.cwd ?? ''}`;
      const nowMs = Date.now();
      const cached = piDiscoveryCache.get(cacheKey);
      if (cached && cached.expiresAt > nowMs) {
        return cached.sessions;
      }

      const sessions = scope === 'machine' || !options?.cwd
        ? await SessionManager.listAll()
        : await SessionManager.list(options.cwd);
      piDiscoveryCache.set(cacheKey, { expiresAt: nowMs + PI_DISCOVERY_CACHE_TTL_MS, sessions });
      return sessions;
    };

    type ExternalPiMirrorState = {
      sessionId: string;
      piSessionId: string;
      stop: () => void | Promise<void>;
      markCurrentEntriesKnown: () => void;
      markCurrentEntriesDelivered: () => void;
      markCurrentEntriesDeliveredSince: (cutoffTimeMs: number, options?: { includeAssistantMessages?: boolean }) => void;
      markUserTextDeliveredSince: (text: string, cutoffTimeMs: number) => void;
      markAssistantTextDeliveredSince: (text: string, cutoffTimeMs: number, untilTimeMs?: number) => void;
      capAssistantTextDeliveryWindow: (untilTimeMs: number) => void;
      extensionCoveredSince: number | null;
      deliveredAssistantTextInTurn: string;
      sessionClient: ApiSessionClient;
      mapper: PiSessionProtocolMapper;
      lastExtensionSeenAt: number;
      activeExtensionInstanceId: string | null;
      legacyExtensionNoticeSent: boolean;
      keepAliveInterval: ReturnType<typeof setInterval> | null;
      pendingTextFlushTimer: ReturnType<typeof setTimeout> | null;
      lastExtensionInstanceId: string | null;
      lastExtensionEventId: number | null;
      extensionHasSeqGap: boolean;
      isStreaming: boolean;
      canSendCompletionPush: boolean;
      completionNotifications: PiCompletionNotificationTracker;
      commandQueueEpoch: string;
      nextCommandSeq: number;
      commands: Array<{
        seq: number;
        localKey: string;
        command: LynttyPiRemoteCommand;
        status: 'queued' | 'accepted_by_pi' | 'failed';
        deliveryToken: string;
        failureCount: number;
        mobileContext: boolean;
        sentFrom?: string;
        error?: string;
      }>;
      seenCommandLocalKeys: Set<string>;
      failedCommandLocalKeys: Set<string>;
      recentAcceptedRemoteCommands: Array<{
        localKey: string;
        text: string;
        acceptedAt: number;
        sentFrom?: string;
        commandType: LynttyPiRemoteCommand['type'];
        matched?: boolean;
      }>;
    };

    let onPiExtensionEventHandler: ((payload: LynttyPiExtensionPayload) => Promise<{ status: 'ok'; sessionId?: string } | { status: 'error'; error: string }>) | null = null;
    let pollPiExtensionCommandsHandler: ((session: LynttyPiExtensionPayload['session'], afterSeq: number, extensionInstanceId?: string) => Promise<{ status: 'ok'; queueEpoch?: string; commands: LynttyPiRemoteCommandEnvelope[] } | { status: 'error'; error: string }>) | null = null;
    let onPiExtensionCommandAckHandler: ((session: LynttyPiExtensionPayload['session'], ack: LynttyPiRemoteCommandAck) => Promise<{ status: 'ok' } | { status: 'error'; error: string }>) | null = null;

    const externalPiMirrors = new Map<string, ExternalPiMirrorState>();
    const recentPiExtensionSignals = new Map<string, number>();
    const EXTERNAL_PI_MIRROR_ACTIVE_WINDOW_MS = 1000 * 60 * 2;
    const PI_LIVE_TEXT_FLUSH_DELAY_MS = 750;
    const MAX_REMOTE_PI_COMMANDS = 200;
    const MAX_REMOTE_PI_COMMAND_FAILURES = 3;

    const findExternalPiMirror = (session: { piSessionId: string }): ExternalPiMirrorState | undefined => {
      return externalPiMirrors.get(`${machine.id}:${session.piSessionId}`);
    };

    const hasRecentPiExtensionSignal = (machineKey: string, piSessionId: string): boolean => {
      const signaledAt = recentPiExtensionSignals.get(`${machineKey}:${piSessionId}`) ?? 0;
      return Date.now() - signaledAt <= EXTERNAL_PI_MIRROR_ACTIVE_WINDOW_MS;
    };

    const sendRemoteCommandNotice = (mirror: ExternalPiMirrorState, text: string): void => {
      mirror.sessionClient.sendSessionProtocolMessage(createEnvelope('agent', {
        t: 'text',
        text,
      }, { turn: 'pi-system', time: Date.now() }));
      void mirror.sessionClient.flush().catch((error) => {
        logger.debug('[pi] Failed to send remote Pi command notice', error);
      });
    };

    const remoteCommandRejectionText = (text: string): string => {
      const firstToken = text.trim().split(/\s+/, 1)[0] || 'command';
      return text.trim().startsWith('/')
        ? `Unsupported Pi command ${firstToken}. Lyntty currently supports /goal, /context, and /skill:* from mobile.`
        : 'Pi command was not delivered because the message is empty or exceeds the supported size.';
    };

    const commandUserText = (command: LynttyPiRemoteCommand): string | null => {
      switch (command.type) {
        case 'send_user_message':
        case 'follow_up':
        case 'steer':
          return command.text.trim();
        case 'invoke_pi_command':
          return command.commandLine.trim().startsWith('/skill:') ? command.commandLine.trim() : null;
        default:
          return null;
      }
    };

    const commandMatchesPiEcho = (command: ExternalPiMirrorState['recentAcceptedRemoteCommands'][number], text: string, eventTime: number): boolean => {
      if (command.matched || eventTime < command.acceptedAt - 5_000 || eventTime > command.acceptedAt + 120_000) {
        return false;
      }
      const normalized = text.trim();
      if (!normalized) return false;
      if (normalized === command.text || normalized === `[lyntty] ${command.text}`) {
        return true;
      }
      if (command.commandType === 'invoke_pi_command' && command.text.startsWith('/skill:')) {
        return /^<skill\s+name="[^"]+"\s+location="[^"]*">/.test(normalized);
      }
      return false;
    };

    const remoteMetaForPiEcho = (mirror: ExternalPiMirrorState, envelope: { role: string; ev: { t: string; text?: unknown }; time: number }): Record<string, unknown> | undefined => {
      if (envelope.role !== 'user' || envelope.ev.t !== 'text' || typeof envelope.ev.text !== 'string') {
        return undefined;
      }
      const match = mirror.recentAcceptedRemoteCommands.find((command) => commandMatchesPiEcho(command, envelope.ev.text as string, envelope.time));
      if (!match) {
        return undefined;
      }
      match.matched = true;
      return {
        sentFrom: match.sentFrom ?? 'lyntty-mobile',
        remoteCommandLocalKey: match.localKey,
        remoteCommandState: 'accepted_by_pi',
        displayText: match.text,
      };
    };

    const markRemotePiCommandFailed = (
      mirror: ExternalPiMirrorState,
      localKey: string,
      reason: string,
      requireDurable = false,
    ): void => {
      try {
        persistPiCommandOutcome(mirror.piSessionId, localKey, 'failed');
      } catch (error) {
        if (requireDurable) throw error;
        logger.warn('[pi] Failed to persist terminal Pi command failure', { sessionId: mirror.sessionId, localKey, error });
      }
      mirror.failedCommandLocalKeys.add(localKey);
      const failedKeys = [...mirror.failedCommandLocalKeys].slice(-500);
      mirror.sessionClient.updateMetadata((currentMetadata) => ({
        ...currentMetadata,
        sharedControlEnabled: true,
        remoteCommandFailedLocalKeys: failedKeys,
      }));
      sendRemoteCommandNotice(mirror, reason);
    };

    const queueRemotePiCommand = (
      mirror: ExternalPiMirrorState,
      message: { localKey?: string; content: { text: string }; meta?: { sentFrom?: string; sendMobileContextToPi?: boolean } },
      images: PiRemoteImage[],
    ): void => {
      const localKey = message.localKey ?? `remote:${mirror.nextCommandSeq}`;
      const admission = resolvePiCommandAdmission({
        queuedCount: mirror.commands.length,
        maxQueuedCount: MAX_REMOTE_PI_COMMANDS,
        duplicate: mirror.seenCommandLocalKeys.has(localKey)
          || mirror.failedCommandLocalKeys.has(localKey)
          || mirror.commands.some((entry) => entry.localKey === localKey),
      });
      if (admission === 'duplicate') return;
      if (admission === 'full') {
        logger.warn('[pi] Rejecting remote Pi command because the extension delivery queue is full', { sessionId: mirror.sessionId, localKey });
        markRemotePiCommandFailed(mirror, localKey, 'Pi command queue is full. Message was not delivered; retry after the queued commands finish.');
        return;
      }
      const parsedCommand = parseLynttyPiRemoteCommand(message.content.text, {
        isStreaming: mirror.isStreaming,
        hasImages: images.length > 0,
      });
      if (!parsedCommand) {
        logger.debug('[pi] Rejected unsupported remote Pi command', { sessionId: mirror.sessionId, localKey });
        markRemotePiCommandFailed(mirror, localKey, remoteCommandRejectionText(message.content.text));
        return;
      }
      const command = attachImagesToPiRemoteCommand(parsedCommand, images);
      if (command.type === 'abort') {
        mirror.completionNotifications.suppressCurrentTurn();
      }
      mirror.commands.push({
        seq: mirror.nextCommandSeq++,
        localKey,
        command,
        status: 'queued',
        deliveryToken: randomUUID(),
        failureCount: 0,
        mobileContext: message.meta?.sendMobileContextToPi !== false,
        sentFrom: message.meta?.sentFrom,
      });
      logger.debug('[pi] Queued remote Pi command for extension delivery', { sessionId: mirror.sessionId, localKey, type: command.type });
    };

    const queueInternalPiCommand = (mirror: ExternalPiMirrorState, command: LynttyPiRemoteCommand, localKey: string): boolean => {
      if (mirror.seenCommandLocalKeys.has(localKey) || mirror.failedCommandLocalKeys.has(localKey) || mirror.commands.some((entry) => entry.localKey === localKey)) return false;
      if (mirror.commands.length >= MAX_REMOTE_PI_COMMANDS) {
        logger.debug('[pi] Dropping internal remote Pi command because the extension delivery queue is full', { sessionId: mirror.sessionId, localKey });
        return false;
      }
      if (command.type === 'abort' || command.type === 'internal_shutdown') {
        mirror.completionNotifications.suppressCurrentTurn();
      }
      mirror.commands.push({
        seq: mirror.nextCommandSeq++,
        localKey,
        command,
        status: 'queued',
        deliveryToken: randomUUID(),
        failureCount: 0,
        mobileContext: false,
        sentFrom: 'lyntty-app',
      });
      return true;
    };

    const waitForRemotePiCommandAccepted = async (mirror: ExternalPiMirrorState, localKey: string, timeoutMs = 8_000): Promise<boolean> => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeoutMs) {
        if (mirror.seenCommandLocalKeys.has(localKey)) return true;
        const command = mirror.commands.find((entry) => entry.localKey === localKey);
        if (command?.status === 'accepted_by_pi') return true;
        if (command?.status === 'failed' || mirror.failedCommandLocalKeys.has(localKey)) return false;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return mirror.seenCommandLocalKeys.has(localKey);
    };

    const applyPiCommandMetadata = (mirror: ExternalPiMirrorState, commands: LynttyPiCommandInfo[]): void => {
      const supported = commands.filter((command) => {
        return (command.source === 'extension' && (command.name === 'goal' || command.name === 'context'))
          || (command.source === 'skill' && command.name.startsWith('skill:'));
      });
      const slashCommands = supported
        .filter((command) => command.source === 'extension')
        .map((command) => command.name);
      const skills = supported
        .filter((command) => command.source === 'skill')
        .map((command) => command.name);
      mirror.sessionClient.updateMetadata((currentMetadata) => ({
        ...currentMetadata,
        slashCommands,
        skills,
      }));
    };

    pollPiExtensionCommandsHandler = async (session, afterSeq, extensionInstanceId) => {
      const mirror = findExternalPiMirror(session);
      if (!mirror) {
        return { status: 'ok' as const, commands: [] };
      }
      if (!isPiExtensionCommandOwner(mirror, extensionInstanceId)) {
        return { status: 'ok' as const, queueEpoch: mirror.commandQueueEpoch, commands: [] };
      }
      // afterSeq is a compatibility hint only. Urgent commands may overtake FIFO,
      // so filtering by a high-water mark would permanently hide older commands.
      const next = selectNextQueuedPiCommand(mirror.commands);
      if (!next) {
        return { status: 'ok' as const, queueEpoch: mirror.commandQueueEpoch, commands: [] };
      }
      if (next.seq <= afterSeq) {
        logger.debug('[pi] Delivering queued command below extension high-water mark', { sessionId: mirror.sessionId, seq: next.seq, afterSeq });
      }
      return { status: 'ok' as const, queueEpoch: mirror.commandQueueEpoch, commands: [{
        seq: next.seq,
        deliveryToken: next.deliveryToken,
        localKey: next.localKey,
        mobileContext: next.mobileContext,
        command: next.command,
      }] };
    };

    onPiExtensionCommandAckHandler = async (session, ack) => {
      const mirror = findExternalPiMirror(session);
      if (!mirror) {
        // A delayed ack from a pre-restart queue is harmless and must not wedge
        // the extension's pending-ack loop.
        return { status: 'ok' as const };
      }
      if (!isPiExtensionCommandOwner(mirror, ack.extensionInstanceId)) {
        return { status: 'ok' as const };
      }
      const command = mirror.commands.find((entry) => entry.seq === ack.seq);
      if (!command || command.status !== 'queued') {
        return { status: 'ok' as const };
      }
      if (isStalePiCommandAck({
        commandQueueEpoch: mirror.commandQueueEpoch,
        ackQueueEpoch: ack.queueEpoch,
        commandDeliveryToken: command.deliveryToken,
        ackDeliveryToken: ack.deliveryToken,
      })) {
        return { status: 'ok' as const };
      }
      command.error = ack.error;
      if (ack.status === 'accepted_by_pi') {
        persistPiCommandOutcome(mirror.piSessionId, command.localKey, 'accepted_by_pi');
        command.status = 'accepted_by_pi';
        if (command.command.type === 'abort' || command.command.type === 'internal_shutdown') {
          mirror.completionNotifications.suppressCurrentTurn();
        }
        if (ack.resultText) {
          sendRemoteCommandNotice(mirror, ack.resultText);
        }
        mirror.sessionClient.keepAlive(true, 'remote');
        mirror.seenCommandLocalKeys.add(command.localKey);
        const acceptedText = commandUserText(command.command);
        if (acceptedText) {
          mirror.recentAcceptedRemoteCommands.push({
            localKey: command.localKey,
            text: acceptedText,
            acceptedAt: Date.now(),
            sentFrom: command.sentFrom,
            commandType: command.command.type,
          });
          mirror.recentAcceptedRemoteCommands = mirror.recentAcceptedRemoteCommands.slice(-100);
        }
        if (command.command.type === 'get_commands' && ack.commands) {
          applyPiCommandMetadata(mirror, ack.commands);
        }
        const acceptedKeys = [...mirror.seenCommandLocalKeys].slice(-500);
        mirror.sessionClient.updateMetadata((currentMetadata) => ({
          ...currentMetadata,
          sharedControlEnabled: true,
          remoteCommandAcceptedLocalKeys: acceptedKeys,
        }));
      } else if (ack.status === 'failed') {
        const terminal = command.command.type === 'invoke_pi_command'
          || applyPiCommandFailure(command, MAX_REMOTE_PI_COMMAND_FAILURES) === 'failed';
        if (terminal) {
          const detail = ack.error ? `: ${ack.error}` : '.';
          markRemotePiCommandFailed(
            mirror,
            command.localKey,
            `Pi command failed after ${command.failureCount || 1} attempt(s)${detail}`,
            true,
          );
          command.status = 'failed';
        } else {
          command.deliveryToken = randomUUID();
          logger.debug('[pi] Remote Pi command failed in extension and remains queued for bounded retry', {
            sessionId: mirror.sessionId,
            seq: command.seq,
            failureCount: command.failureCount,
          });
        }
      }
      removeTerminalPiCommandPrefix(mirror.commands);
      return { status: 'ok' as const };
    };

    const waitForExternalPiMirrorStopped = async (mirrorKey: string, timeoutMs = 12_000): Promise<boolean> => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeoutMs) {
        if (!externalPiMirrors.has(mirrorKey)) return true;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return !externalPiMirrors.has(mirrorKey);
    };

    resolveExternalPiActivation = async (options) => {
      if (!options.sessionId) return { type: 'none' };
      const mirrorKey = `${options.machineId ?? machine.id}:${options.sessionId}`;
      const mirror = externalPiMirrors.get(mirrorKey);
      if (!mirror) return { type: 'none' };
      if (!isExternalPiMirrorActive({
        lastExtensionSeenAt: mirror.lastExtensionSeenAt,
        now: Date.now(),
        activeWindowMs: EXTERNAL_PI_MIRROR_ACTIVE_WINDOW_MS,
      })) {
        const staleSeenAt = mirror.lastExtensionSeenAt;
        externalPiMirrors.delete(mirrorKey);
        mirror.sessionClient.sendSessionDeath();
        await mirror.sessionClient.flush().catch((error) => {
          logger.debug('[pi] Failed to mark stale Pi extension mirror offline', error);
        });
        await mirror.stop();
        const replacement = externalPiMirrors.get(mirrorKey);
        return resolveStalePiMirrorCleanup({
          staleSeenAt,
          recentSignalAt: recentPiExtensionSignals.get(mirrorKey) ?? 0,
          replacementSessionId: replacement?.sessionId,
          now: Date.now(),
          activeWindowMs: EXTERNAL_PI_MIRROR_ACTIVE_WINDOW_MS,
        });
      }

      const localKey = `activation-takeover:${randomUUID()}`;
      return resolveExternalPiActivationLease({
        relaySessionId: mirror.sessionId,
        takeoverChoice: options.takeoverChoice,
        queueShutdown: () => queueInternalPiCommand(mirror, { type: 'internal_shutdown' }, localKey),
        waitForAccepted: () => waitForRemotePiCommandAccepted(mirror, localKey),
        waitForStopped: () => waitForExternalPiMirrorStopped(mirrorKey),
      });
    };

    const getRegisteredPiSessions = (): RegisteredPiSessionState[] => {
      const trackedRegistrations = [...pidToTrackedSession.values(), ...sessionIdToFinishedSession.values()].flatMap((tracked) => {
        const metadata = tracked.lynttySessionMetadataFromLocalWebhook;
        if (!metadata?.piSessionId) {
          return [];
        }

        return [{
          piSessionId: metadata.piSessionId,
          relaySessionId: tracked.lynttySessionId,
          importedMessageCount: metadata.piHistoryTotalMessages ?? metadata.piMessageCount ?? 0,
          relayAvailable: !!tracked.lynttySessionId,
          updatedAt: tracked.lynttySessionId ? new Date() : undefined,
        }];
      });

      const mirrorRegistrations: RegisteredPiSessionState[] = [];
      for (const [key, mirror] of externalPiMirrors.entries()) {
        const piSessionId = key.slice(key.indexOf(':') + 1);
        if (!piSessionId) continue;
        const metadata = mirror.sessionClient.getMetadata() as Metadata | null;
        mirrorRegistrations.push({
          piSessionId,
          relaySessionId: mirror.sessionId,
          importedMessageCount: metadata?.piHistoryTotalMessages ?? metadata?.piMessageCount ?? 0,
          relayAvailable: true,
          updatedAt: new Date(Math.max(mirror.lastExtensionSeenAt || 0, Date.now() - EXTERNAL_PI_MIRROR_ACTIVE_WINDOW_MS)),
        });
      }

      return [...trackedRegistrations, ...mirrorRegistrations];
    };

    const listPiSessions = async (options?: { cwd?: string; scope?: 'cwd' | 'machine'; limit?: number; cursor?: string }) => {
      const activePiSessionIds = getCurrentChildren()
        .map((tracked) => tracked.lynttySessionMetadataFromLocalWebhook?.piSessionId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
      const nowMs = Date.now();
      for (const [key, mirror] of externalPiMirrors.entries()) {
        if (nowMs - mirror.lastExtensionSeenAt > EXTERNAL_PI_MIRROR_ACTIVE_WINDOW_MS) continue;
        const piSessionId = key.slice(key.indexOf(':') + 1);
        if (piSessionId) activePiSessionIds.push(piSessionId);
      }

      const page = await discoverLocalPiSessionsPage({
        cwd: options?.cwd,
        scope: options?.scope ?? 'machine',
        registeredSessions: getRegisteredPiSessions(),
        activePiSessionIds,
        limit: options?.limit,
        cursor: options?.cursor,
        listSessions: () => listCachedPiSessionInfos(options),
      });

      return {
        sessions: page.records
          .map((record) => redactPiSessionForRelay(record))
          .sort((a, b) => Number(b.state === 'active_runtime') - Number(a.state === 'active_runtime')),
        nextCursor: page.nextCursor,
        total: page.total,
      };
    };

    const resumeSession = async (lynttySessionId: string): Promise<SpawnSessionResult> => {
      const tracked = findTrackedSessionById(lynttySessionId);
      if (!tracked) {
        return { type: 'error', errorMessage: `Session ${lynttySessionId} is not tracked by this daemon or belongs to another machine.` };
      }
      const metadata = tracked.lynttySessionMetadataFromLocalWebhook;
      if (!metadata || metadata.flavor !== 'pi' || !metadata.piSessionId) {
        return { type: 'error', errorMessage: `Session ${lynttySessionId} is not a resumable Pi session.` };
      }

      // Re-enter the same activation lease and extension-owner checks as a normal
      // Pi spawn. Without an explicit takeover this can only reuse an active
      // runtime; it must never start a duplicate SDK runtime behind a Pi TUI.
      return spawnSession({
        directory: metadata.path || tracked.directory || process.cwd(),
        sessionId: metadata.piSessionId,
        machineId,
        agent: 'pi',
        approvedNewDirectoryCreation: false,
      });
    };

    // Stop a session by sessionId or PID fallback
    const stopSession = (sessionId: string): boolean => {
      logger.debug(`[DAEMON RUN] Attempting to stop session ${sessionId}`);

      // Try to find by sessionId first
      for (const [pid, session] of pidToTrackedSession.entries()) {
        if (session.lynttySessionId === sessionId ||
          (sessionId.startsWith('PID-') && pid === parseInt(sessionId.replace('PID-', '')))) {

          if (session.startedBy === 'daemon' && session.childProcess) {
            try {
              session.childProcess.kill('SIGTERM');
              logger.debug(`[DAEMON RUN] Sent SIGTERM to daemon-spawned session ${sessionId}`);
            } catch (error) {
              logger.debug(`[DAEMON RUN] Failed to kill session ${sessionId}:`, error);
            }
          } else {
            // For externally started sessions, try to kill by PID
            try {
              process.kill(pid, 'SIGTERM');
              logger.debug(`[DAEMON RUN] Sent SIGTERM to external session PID ${pid}`);
            } catch (error) {
              logger.debug(`[DAEMON RUN] Failed to kill external session PID ${pid}:`, error);
            }
          }

          pidToTrackedSession.delete(pid);
          logger.debug(`[DAEMON RUN] Removed session ${sessionId} from tracking`);
          return true;
        }
      }

      logger.debug(`[DAEMON RUN] Session ${sessionId} not found`);
      return false;
    };

    // Handle child process exit — preserve session data for resume
    const onChildExited = (pid: number) => {
      const session = pidToTrackedSession.get(pid);
      if (session?.lynttySessionId && session.encryption) {
        sessionIdToFinishedSession.set(session.lynttySessionId, session);
        logger.debug(`[DAEMON RUN] Process PID ${pid} exited, preserved session ${session.lynttySessionId} for resume`);
      } else {
        logger.debug(`[DAEMON RUN] Removing exited process PID ${pid} from tracking`);
      }
      pidToTrackedSession.delete(pid);
    };

    const pendingPiExtensionEvents: LynttyPiExtensionPayload[] = [];
    const MAX_PENDING_PI_EXTENSION_EVENTS = 1_000;
    const piExtensionEventChains = new Map<string, Promise<unknown>>();
    const piExtensionToken = randomUUID();

    const enqueuePiExtensionSessionTask = <T>(key: string, run: () => Promise<T>): Promise<T> => {
      const previous = piExtensionEventChains.get(key) ?? Promise.resolve();
      const task = previous.catch(() => undefined).then(run);
      const tail = task.catch(() => undefined);
      piExtensionEventChains.set(key, tail);
      void tail.then(() => {
        if (piExtensionEventChains.get(key) === tail) piExtensionEventChains.delete(key);
      });
      return task;
    };

    const enqueuePiExtensionEvent = (payload: LynttyPiExtensionPayload): Promise<{ status: 'ok'; sessionId?: string } | { status: 'error'; error: string }> => {
      const key = `${machineId}:${payload.session.piSessionId}`;
      return enqueuePiExtensionSessionTask(key, async () => {
        if (!onPiExtensionEventHandler) {
          return { status: 'error' as const, error: 'Pi extension event handler is not ready' };
        }
        return onPiExtensionEventHandler(payload);
      });
    };

    // Start control server
    const { port: controlPort, stop: stopControlServer } = await startDaemonControlServer({
      getChildren: getCurrentChildren,
      stopSession,
      spawnSession,
      requestShutdown: () => requestShutdown('lyntty-cli'),
      onLynttySessionWebhook,
      onPiExtensionEvent: async (payload) => {
        if (payload.extensionInstanceId) {
          recentPiExtensionSignals.set(`${machineId}:${payload.session.piSessionId}`, Date.now());
        }
        if (onPiExtensionEventHandler) {
          return enqueuePiExtensionEvent(payload);
        }
        if (pendingPiExtensionEvents.length >= MAX_PENDING_PI_EXTENSION_EVENTS) {
          return { status: 'error' as const, error: 'Pi extension event queue is full; retry later' };
        }
        pendingPiExtensionEvents.push(payload);
        return { status: 'ok' as const };
      },
      pollPiExtensionCommands: async (session, afterSeq, extensionInstanceId) => {
        if (!pollPiExtensionCommandsHandler) {
          return { status: 'ok' as const, commands: [] };
        }
        return pollPiExtensionCommandsHandler(session, afterSeq, extensionInstanceId);
      },
      onPiExtensionCommandAck: async (session, ack) => {
        if (!onPiExtensionCommandAckHandler) {
          return { status: 'ok' as const };
        }
        return onPiExtensionCommandAckHandler(session, ack);
      },
      piExtensionToken,
    });

    // Capture the bundled CLI's mtime at startup so the heartbeat can detect
    // when an installed development bundle is replaced on disk.
    // We previously compared disk `package.json.version` to our bundled version,
    // but that produced infinite restart loops (#1107) when the manifest version
    // diverged from the bundled version (e.g. `lyntty-coder@0.13.1` deprecation
    // stub bumped package.json without rebuilding dist). File mtime is a more
    // reliable signal: it only changes when the bundle is actually replaced.
    const bundlePath = join(distributionLayout.libraryDir, 'dist', 'index.mjs');
    let initialBundleMtimeMs = 0;
    if (!distributionLayout.compiled) {
      try {
        initialBundleMtimeMs = statSync(bundlePath).mtimeMs;
      } catch {
        // dist/index.mjs not present (e.g. dev mode via Bun) — skip upgrade detection.
        logger.debug(`[DAEMON RUN] Bundle at ${bundlePath} not found; self-restart on upgrade disabled`);
      }
    }

    // Prepare initial daemon state
    const initialDaemonState: DaemonState = {
      status: 'offline',
      pid: process.pid,
      httpPort: controlPort,
      startedAt: Date.now()
    };

    // Create API client
    const api = await ApiClient.create(credentials);

    // Get or create machine
    const machine = await api.getOrCreateMachine({
      machineId,
      metadata: initialMachineMetadata,
      daemonState: initialDaemonState
    });
    logger.debug(`[DAEMON RUN] Machine registered: ${machine.id}`);

    // Publish readiness only after relay machine registration and all callbacks
    // that depend on `machine` can run safely.
    const releaseId = embeddedBuildIdentity().releaseId;
    const fileState: DaemonLocallyPersistedState = {
      pid: process.pid,
      httpPort: controlPort,
      piExtensionToken,
      startTime: new Date().toLocaleString(),
      startedWithCliVersion: packageJson.version,
      ...(releaseId ? { startedWithReleaseId: releaseId } : {}),
      daemonLogPath: logger.logFilePath,
    };
    writeDaemonState(fileState);
    logger.debug('[DAEMON RUN] Daemon state written');

    const ensurePiSessionMirror = async (options: { piSessionId: string; directory?: string; machineId?: string; sessionFile?: string; extensionInstanceId?: string }): Promise<{ type: 'success'; sessionId: string; sent: number } | { type: 'error'; errorMessage: string }> => {
      const piSessionId = options.piSessionId;
      const extensionConnected = !!options.extensionInstanceId;
      const mirrorKey = `${options.machineId ?? machine.id}:${piSessionId}`;
      return piActivationLeases.run(mirrorKey, async () => {
      const existing = externalPiMirrors.get(mirrorKey);
      if (existing) {
        return { type: 'success' as const, sessionId: existing.sessionId, sent: 0 };
      }

      const local = await findPiSessionNearDirectory(piSessionId, options.directory, options.sessionFile);
      if (!local && !options.sessionFile) {
        logger.warn('[pi] Requested session was not found on this node', { piSessionId });
        return { type: 'error' as const, errorMessage: 'This Pi session was not found on this node.' };
      }

      const sessionFile = local?.path ?? options.sessionFile;
      const entries = local ? readPiSessionEntries(local.path) : [];
      const page = mapPiSessionHistoryPageToEnvelopes(entries, { limit: 50 });
      const sessionTag = resolvePiRelaySessionTag(machine.id, piSessionId);
      const metadata: Metadata = {
        path: local?.cwd || options.directory || os.homedir(),
        host: initialMachineMetadata.host,
        version: packageJson.version,
        os: os.platform(),
        machineId: machine.id,
        homeDir: os.homedir(),
        lynttyHomeDir: configuration.lynttyHomeDir,
        lynttyLibDir: distributionLayout.libraryDir,
        lynttyToolsDir: distributionLayout.toolsDir,
        startedFromDaemon: true,
        hostPid: process.pid,
        startedBy: 'daemon',
        lifecycleState: extensionConnected ? 'running' : 'waiting_extension',
        lifecycleStateSince: Date.now(),
        runtimeOwner: extensionConnected ? 'pi-extension' : 'none',
        controlState: extensionConnected ? 'ready' : 'waiting_extension',
        sharedControlEnabled: true,
        flavor: 'pi',
        piSessionId,
        name: resolvePiSessionDisplayName(local?.name, local?.firstMessage),
        piMessageCount: local?.messageCount ?? 0,
        piFirstMessage: local?.firstMessage,
        piHistoryCursor: page.nextCursor,
        piHistoryHasMore: page.hasMore,
        piHistoryTotalMessages: page.totalMessages,
      };
      const response = await api.getOrCreateSession({
        tag: sessionTag,
        metadata,
        state: { controlledByUser: false },
      });
      if (!response) {
        return { type: 'error' as const, errorMessage: 'Failed to create or load relay session for Pi mirror' };
      }

      const sessionClient = new ApiSessionClient(credentials.token, response);
      let commandBoundary = readPersistedPiCommandBoundary(piSessionId);
      if (commandBoundary === null) {
        // First hardening upgrade is fail-closed: historical relay commands
        // predate the durable outcome ledger and must never execute again.
        commandBoundary = response.seq;
        persistPiCommandBoundary(piSessionId, commandBoundary);
      }
      sessionClient.skipMessagesThrough(commandBoundary);
      // Resume canonical JSONL replay from the last durably imported entry.
      // This avoids duplicate tails while recovering entries written during a
      // daemon outage, when extension event retries may have been exhausted.
      const historyWatermark = readPersistedPiHistoryWatermark(piSessionId);
      let startupHistoryGapReason: string | null = null;
      let startupHistoryEnvelopes = response.seq === 0
        ? page.envelopes
        : historyWatermark
          ? []
          // First upgrade from a daemon without durable watermarks: prefer a
          // one-time idempotent canonical replay over permanently skipping an
          // unknown outage window.
          : mapPiSessionHistoryToEnvelopes(entries);
      if (response.seq > 0 && historyWatermark) {
        const watermarkIndex = entries.findIndex((entry) => entry.id === historyWatermark);
        if (watermarkIndex >= 0) {
          startupHistoryEnvelopes = mapPiSessionHistoryToEnvelopes(entries.slice(watermarkIndex + 1));
        } else {
          startupHistoryEnvelopes = mapPiSessionHistoryToEnvelopes(entries);
          startupHistoryGapReason = 'persisted Pi history watermark is missing from local JSONL';
        }
      }
      let startupHistoryInventoryConfirmed = true;
      if (startupHistoryEnvelopes.length > 0) {
        try {
          await sessionClient.syncExistingSessionProtocolEnvelopeIds();
          const coveredThrough = historyWatermark
            ? null
            : sessionClient.getSessionProtocolCoveredThrough();
          if (!historyWatermark && coveredThrough !== null && response.seq > 0) {
            startupHistoryGapReason = 'legacy relay coverage has no exact canonical JSONL watermark';
          }
          startupHistoryEnvelopes = startupHistoryEnvelopes.filter((envelope) => (
            (coveredThrough === null || envelope.time > coveredThrough)
            && !sessionClient.hasSessionProtocolEnvelope(envelope.id)
          ));
        } catch (error) {
          startupHistoryInventoryConfirmed = false;
          startupHistoryGapReason = 'relay history inventory unavailable; canonical replay deferred';
          logger.warn('[pi] Could not inventory relay history; canonical replay deferred', { piSessionId, error });
        }
      }
      if (startupHistoryInventoryConfirmed) {
        for (const envelope of startupHistoryEnvelopes) {
          sessionClient.sendSessionProtocolMessage(envelope);
        }
      }
      let startupHistoryConfirmed = startupHistoryInventoryConfirmed && startupHistoryEnvelopes.length === 0;
      if (startupHistoryInventoryConfirmed && !startupHistoryConfirmed) {
        try {
          await sessionClient.flushConfirmed();
          startupHistoryConfirmed = true;
        } catch (error) {
          startupHistoryGapReason ??= 'canonical Pi history replay is awaiting relay acknowledgement';
          logger.warn('[pi] Canonical history replay remains pending; watermark not advanced', { piSessionId, error });
        }
      }
      const latestHistoryEntryId = entries.at(-1)?.id;
      if (startupHistoryConfirmed && !startupHistoryGapReason && latestHistoryEntryId) {
        persistPiHistoryWatermark(piSessionId, latestHistoryEntryId);
      }
      await sessionClient.updateMetadataAndAwait((currentMetadata) => ({
        ...currentMetadata,
        lifecycleState: extensionConnected ? 'running' : 'waiting_extension',
        lifecycleStateSince: Date.now(),
        runtimeOwner: extensionConnected ? 'pi-extension' : 'none',
        controlState: startupHistoryGapReason
          ? 'history_gap'
          : extensionConnected ? 'ready' : 'waiting_extension',
        piHasHistoryGap: startupHistoryGapReason ? true : currentMetadata.piHasHistoryGap,
        piRecoveryReason: startupHistoryGapReason ?? currentMetadata.piRecoveryReason,
        piHistoryCursor: page.nextCursor,
        piHistoryHasMore: page.hasMore,
        piHistoryTotalMessages: page.totalMessages,
      }));

      let piHistoryPageChain: Promise<void> = Promise.resolve();
      sessionClient.rpcHandlerManager.registerHandler('pi-history-page', (params: unknown) => {
        const request = piHistoryPageChain.then(async () => {
        if (!sessionFile) {
          return {
            type: 'success' as const,
            sent: 0,
            nextCursor: undefined,
            hasMore: false,
            totalMessages: 0,
          };
        }
        const record = params && typeof params === 'object' && !Array.isArray(params)
          ? params as Record<string, unknown>
          : {};
        const beforeEntryId = typeof record.beforeEntryId === 'string' ? record.beforeEntryId : undefined;
        const currentEntries = readPiSessionEntries(sessionFile);
        const nextPage = mapPiSessionHistoryPageToEnvelopes(currentEntries, { beforeEntryId, limit: 50 });
        const historyGap = nextPage.historyGap;
        if (historyGap) {
          await sessionClient.updateMetadataAndAwait((currentMetadata) => ({
            ...currentMetadata,
            controlState: 'history_gap',
            piHasHistoryGap: true,
            piRecoveryReason: historyGap.reason,
            piHistoryHasMore: false,
          }));
          return {
            type: 'history_gap' as const,
            ...nextPage.historyGap,
            hasMore: false,
            totalMessages: nextPage.totalMessages,
          };
        }
        // Settle any prior page attempt before inventorying ids. A retry may
        // otherwise advance its cursor while the prior ciphertext is pending.
        await sessionClient.flushConfirmed();
        await sessionClient.syncExistingSessionProtocolEnvelopeIds();
        const unsentEnvelopes = nextPage.envelopes.filter(
          (envelope) => !sessionClient.hasSessionProtocolEnvelope(envelope.id),
        );
        for (const envelope of unsentEnvelopes) {
          sessionClient.sendSessionProtocolMessage(envelope);
        }
        if (unsentEnvelopes.length > 0) await sessionClient.flushConfirmed();
        await sessionClient.updateMetadataAndAwait((currentMetadata) => ({
          ...currentMetadata,
          piHistoryCursor: nextPage.nextCursor,
          piHistoryHasMore: nextPage.hasMore,
          piHistoryTotalMessages: nextPage.totalMessages,
        }));
        return {
          type: 'success' as const,
          sent: unsentEnvelopes.length,
          nextCursor: nextPage.nextCursor,
          hasMore: nextPage.hasMore,
          totalMessages: nextPage.totalMessages,
        };
        });
        piHistoryPageChain = request.then(() => undefined, () => undefined);
        return request;
      });

      let mirrorState: ExternalPiMirrorState | null = null;
      const mirror = startPiExternalMirror({
        sessionFile,
        initialEntries: entries,
        session: () => sessionClient,
        metaForEnvelope: (envelope) => remoteMetaForPiEcho(mirrorState!, envelope),
        isManagedRuntimeActive: () => !!resolveActivePiSessionReuse(piSessionId, getCurrentChildren(), machine.id)
          || (!!mirrorState && Date.now() - mirrorState.lastExtensionSeenAt < 5_000),
      });
      if (mirror) {
        const persistedCommandOutcomes = readPersistedPiCommandOutcomes(piSessionId);
        const keepAliveInterval = setInterval(() => {
          const state = externalPiMirrors.get(mirrorKey);
          if (!state || Date.now() - state.lastExtensionSeenAt > EXTERNAL_PI_MIRROR_ACTIVE_WINDOW_MS) {
            return;
          }
          state.sessionClient.keepAlive(false, 'remote');
        }, 30_000);
        keepAliveInterval.unref?.();
        mirrorState = {
          sessionId: response.id,
          piSessionId,
          stop: async () => {
            clearInterval(keepAliveInterval);
            if (mirrorState?.pendingTextFlushTimer) {
              clearTimeout(mirrorState.pendingTextFlushTimer);
              mirrorState.pendingTextFlushTimer = null;
            }
            await mirror.stop();
            await sessionClient.close();
          },
          markCurrentEntriesKnown: mirror.markCurrentEntriesKnown,
          markCurrentEntriesDelivered: mirror.markCurrentEntriesDelivered,
          markCurrentEntriesDeliveredSince: mirror.markCurrentEntriesDeliveredSince,
          markUserTextDeliveredSince: mirror.markUserTextDeliveredSince,
          markAssistantTextDeliveredSince: mirror.markAssistantTextDeliveredSince,
          capAssistantTextDeliveryWindow: mirror.capAssistantTextDeliveryWindow,
          extensionCoveredSince: null,
          deliveredAssistantTextInTurn: '',
          sessionClient,
          mapper: new PiSessionProtocolMapper(),
          lastExtensionSeenAt: extensionConnected ? Date.now() : 0,
          activeExtensionInstanceId: null,
          legacyExtensionNoticeSent: false,
          keepAliveInterval,
          pendingTextFlushTimer: null,
          lastExtensionInstanceId: null,
          lastExtensionEventId: null,
          // Startup inventory/replay uncertainty uses the same sticky recovery
          // path as an extension sequence gap. The next agent_end must inventory
          // and replay canonical JSONL before advancing the durable watermark.
          extensionHasSeqGap: startupHistoryGapReason !== null,
          isStreaming: false,
          canSendCompletionPush: Boolean(sessionFile),
          completionNotifications: new PiCompletionNotificationTracker(),
          commandQueueEpoch: randomUUID(),
          nextCommandSeq: 1,
          commands: [],
          seenCommandLocalKeys: new Set([
            ...persistedCommandOutcomes.acceptedLocalKeys,
            ...(response.metadata.remoteCommandAcceptedLocalKeys ?? []),
          ]),
          failedCommandLocalKeys: new Set([
            ...persistedCommandOutcomes.failedLocalKeys,
            ...persistedCommandOutcomes.uncertainLocalKeys,
            ...(response.metadata.remoteCommandFailedLocalKeys ?? []),
          ]),
          recentAcceptedRemoteCommands: [],
        };
        externalPiMirrors.set(mirrorKey, mirrorState);
        bindPiRemoteInput(sessionClient, ({ message, images }) => {
          queueRemotePiCommand(mirrorState!, message, images);
        }, (error) => {
          logger.warn('[pi] Failed to prepare terminal Pi attachments', {
            sessionId: response.id,
            errorMessage: error instanceof Error ? error.message : String(error),
          });
        }, ({ message, reason }) => {
          const localKey = message.localKey ?? `rejected:${randomUUID()}`;
          markRemotePiCommandFailed(mirrorState!, localKey, reason);
        });
        sessionClient.rpcHandlerManager.registerHandler('killSession', async () => {
          const state = mirrorState;
          if (!state || Date.now() - state.lastExtensionSeenAt > EXTERNAL_PI_MIRROR_ACTIVE_WINDOW_MS) {
            return {
              success: false,
              message: 'Pi extension is not currently connected for this session',
            };
          }
          const localKey = `archive-shutdown:${Date.now()}:${randomUUID()}`;
          const queued = queueInternalPiCommand(state, { type: 'internal_shutdown' }, localKey);
          if (!queued) {
            return {
              success: false,
              message: 'Unable to queue Pi shutdown command',
            };
          }
          const accepted = await waitForRemotePiCommandAccepted(state, localKey);
          if (!accepted) {
            return { success: false, message: 'Timed out waiting for Pi extension to accept the stop command' };
          }
          const stopped = await waitForExternalPiMirrorStopped(mirrorKey);
          return stopped
            ? { success: true, message: 'Pi session stopped' }
            : { success: false, message: 'Pi accepted the stop command but did not shut down. Try again or reload the Pi extension.' };
        });
      }

      return { type: 'success' as const, sessionId: response.id, sent: page.envelopes.length };
      });
    };

    const clearPendingTextFlush = clearPendingPiLiveTextFlush;
    const markExtensionDelivered = markPiExtensionDelivered;
    const flushPendingLiveText = flushPendingPiLiveText;
    const markUserInputDelivered = markPiExtensionUserInputDelivered;
    const markAssistantTextDelivered = markPiExtensionAssistantTextDelivered;
    const capAssistantTextDeliveryWindow = capPiExtensionAssistantTextDeliveryWindow;

    const schedulePendingLiveTextFlush = (mirrorKey: string, mirror: ExternalPiMirrorState, cutoffTimeMs: number): void => {
      clearPendingTextFlush(mirror);
      mirror.pendingTextFlushTimer = setTimeout(() => {
        void enqueuePiExtensionSessionTask(mirrorKey, async () => {
          const current = externalPiMirrors.get(mirrorKey);
          if (current !== mirror || !current.mapper.hasPendingText()) return;
          await flushPendingLiveText(current, cutoffTimeMs);
        }).catch((error) => {
          logger.debug('[pi] Failed to flush pending live Pi text', error);
        });
      }, PI_LIVE_TEXT_FLUSH_DELAY_MS);
      mirror.pendingTextFlushTimer.unref?.();
    };

    const sendPiExtensionCompletionPushIfNeeded = (mirror: ExternalPiMirrorState, piSessionId: string): void => {
      const hasActiveManagedRuntime = !!resolveActivePiSessionReuse(piSessionId, getCurrentChildren(), machine.id);
      if (!consumePiCompletionNotificationDecision(mirror.completionNotifications, {
        canNotify: mirror.canSendCompletionPush,
        hasActiveManagedRuntime,
      })) {
        return;
      }
      try {
        sendPiDoneNotification(api.push(), mirror.sessionClient);
      } catch (pushError) {
        logger.debug('[pi] Failed to send extension completion push', pushError);
      }
    };

    onPiExtensionEventHandler = async (payload) => {
      const { session, event } = payload;
      const mirrorKey = `${machine.id}:${session.piSessionId}`;
      const existingMirror = externalPiMirrors.get(mirrorKey);
      const result = existingMirror
        ? { type: 'success' as const, sessionId: existingMirror.sessionId, sent: 0 }
        : await ensurePiSessionMirror({
            piSessionId: session.piSessionId,
            directory: session.cwd,
            machineId: machine.id,
            sessionFile: session.sessionFile,
            extensionInstanceId: payload.extensionInstanceId,
          });
      if (result.type === 'error') {
        return { status: 'error' as const, error: result.errorMessage };
      }

      const mirror = externalPiMirrors.get(mirrorKey);
      if (!mirror) {
        return { status: 'ok' as const, sessionId: result.sessionId };
      }

      const now = Date.now();
      const ownership = claimPiExtensionInstance(
        mirror,
        payload.extensionInstanceId,
        now,
        EXTERNAL_PI_MIRROR_ACTIVE_WINDOW_MS,
        event.type === 'session_start' && event.reason === 'reload',
      );
      logger.debug('[pi] Received Pi extension event', {
        piSessionId: session.piSessionId,
        eventType: event.type,
        eventReason: event.type === 'session_start' && 'reason' in event ? event.reason : undefined,
        eventId: payload.eventId,
        extensionInstanceId: payload.extensionInstanceId,
        activeExtensionInstanceId: mirror.activeExtensionInstanceId,
        ownership,
      });
      if (ownership === 'missing_instance_id') {
        mirror.sessionClient.updateMetadata((currentMetadata) => ({
          ...currentMetadata,
          runtimeOwner: 'none',
          controlState: 'waiting_extension',
        }));
        if (!mirror.legacyExtensionNoticeSent) {
          mirror.legacyExtensionNoticeSent = true;
          sendRemoteCommandNotice(mirror, 'Waiting for Pi extension update. Run /reload in Pi, then retry the message.');
        }
        return { status: 'ok' as const, sessionId: result.sessionId };
      }
      if (ownership === 'rejected') {
        return { status: 'ok' as const, sessionId: result.sessionId };
      }
      mirror.lastExtensionSeenAt = now;
      if (ownership === 'claimed') {
        mirror.sessionClient.updateMetadata((currentMetadata) => ({
          ...currentMetadata,
          lifecycleState: 'running',
          lifecycleStateSince: now,
          runtimeOwner: 'pi-extension',
          controlState: 'ready',
          sharedControlEnabled: true,
        }));
      }
      if (!applyPiExtensionSequence(mirror, payload)) {
        return { status: 'ok' as const, sessionId: result.sessionId };
      }
      const eventId = typeof payload.eventId === 'number' && Number.isFinite(payload.eventId)
        ? payload.eventId
        : null;

      const eventTime = typeof payload.timestamp === 'number' ? payload.timestamp : Date.now();
      if (event.type === 'session_shutdown') {
        clearPendingTextFlush(mirror);
        mirror.isStreaming = false;
        mirror.completionNotifications.reset();
        mirror.sessionClient.sendSessionDeath();
        await mirror.sessionClient.flush();
        externalPiMirrors.delete(mirrorKey);
        recentPiExtensionSignals.delete(mirrorKey);
        await mirror.stop();
        return { status: 'ok' as const, sessionId: result.sessionId };
      }

      if (event.type === 'agent_start') {
        capAssistantTextDeliveryWindow(mirror, eventTime);
        mirror.deliveredAssistantTextInTurn = '';
        mirror.isStreaming = true;
        mirror.completionNotifications.markAgentStart();
      } else if (event.type === 'agent_end') {
        mirror.isStreaming = false;
      }
      const isThinking = event.type === 'agent_start'
        || event.type === 'message_update'
        || event.type === 'tool_execution_start'
        || event.type === 'tool_execution_update';
      mirror.sessionClient.keepAlive(isThinking, 'remote');
      if (mirror.extensionCoveredSince === null || event.type === 'session_start') {
        mirror.extensionCoveredSince = eventTime;
      }
      const deliveredCutoff = mirror.extensionCoveredSince ?? eventTime;

      if (event.type === 'command_list' && Array.isArray(event.commands)) {
        applyPiCommandMetadata(mirror, event.commands as LynttyPiCommandInfo[]);
      }

      if (event.type === 'session_start' || event.type === 'session_info_changed') {
        mirror.sessionClient.updateMetadata((currentMetadata) => ({
          ...currentMetadata,
          lifecycleState: 'running',
          lifecycleStateSince: Date.now(),
          runtimeOwner: 'pi-extension',
          controlState: 'ready',
          sharedControlEnabled: true,
          name: session.name ?? currentMetadata.name,
          path: session.cwd ?? currentMetadata.path,
          piSessionId: session.piSessionId,
        }));
      }

      if (event.type === 'input') {
        const text = typeof event.text === 'string' ? event.text.trim() : '';
        const source = typeof event.source === 'string' ? event.source : undefined;
        if (text && source !== 'extension') {
          mirror.sessionClient.sendSessionProtocolMessage(createEnvelope('user', { t: 'text', text }, {
            id: `pi-live-input-${session.piSessionId}-${eventId ?? eventTime}`,
            time: eventTime,
          }));
          await mirror.sessionClient.flush();
          markUserInputDelivered(mirror, text, eventTime - 1_000);
        }
        return { status: 'ok' as const, sessionId: result.sessionId };
      }

      if (isLifecyclePiExtensionEvent(event)) {
        return { status: 'ok' as const, sessionId: result.sessionId };
      }

      const agentEvent = toPiAgentSessionEvent(event);
      if (!agentEvent) {
        return { status: 'ok' as const, sessionId: result.sessionId };
      }

      const envelopes = mirror.mapper.mapEvent(agentEvent);
      logger.debug('[pi] Mapped Pi extension event', {
        piSessionId: session.piSessionId,
        eventType: agentEvent.type,
        envelopeCount: envelopes.length,
        envelopeTypes: envelopes.map((envelope) => `${envelope.role}:${envelope.ev.t}`),
      });
      if (agentEvent.type !== 'message_update') {
        clearPendingTextFlush(mirror);
      }
      const deliveredAssistantTextBefore = mirror.deliveredAssistantTextInTurn;
      for (const envelope of envelopes) {
        if (envelope.role === 'agent' && envelope.ev.t === 'text' && !envelope.ev.thinking) {
          mirror.deliveredAssistantTextInTurn += envelope.ev.text;
        }
        mirror.sessionClient.sendSessionProtocolMessage(envelope);
      }
      const deliveredAssistantTextChanged = mirror.deliveredAssistantTextInTurn !== deliveredAssistantTextBefore;
      if (envelopes.length > 0) {
        await mirror.sessionClient.flush();
      }
      if (agentEvent.type === 'agent_end') {
        const hadExtensionSeqGap = mirror.extensionHasSeqGap;
        if (hasDeliveredContentEnvelope(envelopes)) {
          markExtensionDelivered(mirror, deliveredCutoff, { includeAssistantMessages: !hadExtensionSeqGap });
        }
        const assistantDeliveryUntil = eventTime + PI_ASSISTANT_JSONL_DELIVERY_GRACE_MS;
        capAssistantTextDeliveryWindow(mirror, assistantDeliveryUntil);
        // Even if extension event ids have a gap, this exact assistant text was
        // already flushed to relay from live events. Mark only exact text so the
        // JSONL fallback can still recover a longer/different final message.
        markAssistantTextDelivered(mirror, mirror.deliveredAssistantTextInTurn, deliveredCutoff, assistantDeliveryUntil);
        mirror.deliveredAssistantTextInTurn = '';
        if (session.sessionFile) {
          const canonicalEntries = readPiSessionEntries(session.sessionFile);
          const latestEntryId = canonicalEntries.at(-1)?.id;
          if (latestEntryId) {
            try {
              // First prove all contiguous live envelopes reached the relay.
              await mirror.sessionClient.flushConfirmed();
              if (hadExtensionSeqGap) {
                const watermark = readPersistedPiHistoryWatermark(session.piSessionId);
                const watermarkIndex = watermark
                  ? canonicalEntries.findIndex((entry) => entry.id === watermark)
                  : -1;
                const recoveryEntries = watermarkIndex >= 0
                  ? canonicalEntries.slice(watermarkIndex + 1)
                  : canonicalEntries;
                await mirror.sessionClient.syncExistingSessionProtocolEnvelopeIds();
                const recoveryEnvelopes = mapPiSessionHistoryToEnvelopes(recoveryEntries).filter(
                  (envelope) => !mirror.sessionClient.hasSessionProtocolEnvelope(envelope.id),
                );
                for (const envelope of recoveryEnvelopes) {
                  mirror.sessionClient.sendSessionProtocolMessage(envelope);
                }
                if (recoveryEnvelopes.length > 0) await mirror.sessionClient.flushConfirmed();
              }
              persistPiHistoryWatermark(session.piSessionId, latestEntryId);
              if (eventId !== null) {
                mirror.extensionHasSeqGap = false;
                mirror.extensionCoveredSince = eventTime;
              }
            } catch (error) {
              logger.warn('[pi] Live canonical history remains pending; watermark not advanced', {
                piSessionId: session.piSessionId,
                hadExtensionSeqGap,
                error,
              });
            }
          }
        }
        sendPiExtensionCompletionPushIfNeeded(mirror, session.piSessionId);
      } else {
        if (deliveredAssistantTextChanged) {
          markAssistantTextDelivered(mirror, mirror.deliveredAssistantTextInTurn, deliveredCutoff);
        }
        if (hasDeliveredContentEnvelope(envelopes)) {
          markExtensionDelivered(mirror, deliveredCutoff, { includeAssistantMessages: false });
        }
      }
      if (mirror.mapper.hasPendingText()) {
        schedulePendingLiveTextFlush(mirrorKey, mirror, deliveredCutoff);
      }
      return { status: 'ok' as const, sessionId: result.sessionId };
    };

    for (const payload of pendingPiExtensionEvents.splice(0)) {
      void enqueuePiExtensionEvent(payload).catch((error) => {
        logger.debug('[pi] Failed to process queued Pi extension event', error);
      });
    }

    // Create realtime machine session
    const apiMachine = api.machineSyncClient(machine);

    // Set RPC handlers
    apiMachine.setRPCHandlers({
      spawnSession,
      resumeSession,
      listPiSessions,
      ensurePiSessionMirror,
      stopSession,
      requestShutdown: () => requestShutdown('lyntty-app')
    });

    // Connect to server
    apiMachine.connect();

    // Every 60 seconds:
    // 1. Prune stale sessions
    // 2. Check if daemon needs update
    // 3. If outdated, restart with latest version
    // 4. Write heartbeat
    const heartbeatIntervalMs = parseInt(process.env.LYNTTY_DAEMON_HEARTBEAT_INTERVAL || '60000');
    let heartbeatRunning = false
    const restartOnStaleVersionAndHeartbeat = setInterval(async () => {
      if (heartbeatRunning) {
        return;
      }
      heartbeatRunning = true;

      if (process.env.DEBUG) {
        logger.debug(`[DAEMON RUN] Health check started at ${new Date().toLocaleString()}`);
      }

      // Prune stale sessions
      for (const [pid, _] of pidToTrackedSession.entries()) {
        try {
          // Check if process is still alive (signal 0 doesn't kill, just checks)
          process.kill(pid, 0);
        } catch (error) {
          // Process is dead, remove from tracking
          logger.debug(`[DAEMON RUN] Removing stale session with PID ${pid} (process no longer exists)`);
          pidToTrackedSession.delete(pid);
        }
      }

      // Check if the daemon needs a development restart by detecting whether
      // `dist/index.mjs` was replaced on disk since startup.
      // Skip if we never captured an initial mtime (dev mode).
      let bundleReplaced = false;
      if (initialBundleMtimeMs > 0) {
        try {
          const currentMtimeMs = statSync(bundlePath).mtimeMs;
          bundleReplaced = currentMtimeMs !== initialBundleMtimeMs;
        } catch {
          // File temporarily missing (e.g. mid-install) — retry on next heartbeat.
        }
      }
      if (bundleReplaced) {
        // TODO: We probably do not want to keep this in-process self-restart logic long-term.
        // A native service manager would make startup and upgrades much simpler: the CLI would
        // ask the OS to start the latest daemon instead of hand-rolling respawn/kill behavior here.
        logger.debug('[DAEMON RUN] Daemon bundle replaced on disk, handing off to new daemon');

        clearInterval(restartOnStaleVersionAndHeartbeat);

        // Release ownership BEFORE spawning the new daemon. Otherwise the spawned
        // `lyntty daemon start` reads our still-present daemon.state.json, sees
        // isDaemonRunningCurrentlyInstalledLynttyVersion() === true, and exits —
        // leaving nothing running once we also exit.
        await Promise.all([...externalPiMirrors.values()].map((mirror) => mirror.stop()));
        externalPiMirrors.clear();
        apiMachine.shutdown();
        await stopControlServer();
        await cleanupDaemonState();
        await releaseDaemonLock(daemonLockHandle);
        await stopCaffeinate();

        try {
          spawnLynttyCLI(['daemon', 'start'], {
            detached: true,
            stdio: 'ignore'
          });
        } catch (error) {
          logger.debug('[DAEMON RUN] Failed to spawn new daemon, this is quite likely to happen during integration tests as we are cleaning out dist/ directory', error);
        }

        process.exit(0);
      }

      // Before wrecklessly overriting the daemon state file, we should check if we are the ones who own it
      // Race condition is possible, but thats okay for the time being :D
      const daemonState = await readDaemonState();
      if (daemonState && daemonState.pid !== process.pid) {
        logger.debug('[DAEMON RUN] Somehow a different daemon was started without killing us. We should kill ourselves.')
        requestShutdown('exception', 'A different daemon was started without killing us. We should kill ourselves.')
      }

      // Heartbeat
      try {
        const updatedState = createDaemonHeartbeatState({
          initialState: fileState,
          pid: process.pid,
          httpPort: controlPort,
          piExtensionToken,
          cliVersion: packageJson.version,
          heartbeat: new Date().toLocaleString(),
        });
        writeDaemonState(updatedState);
        if (process.env.DEBUG) {
          logger.debug(`[DAEMON RUN] Health check completed at ${updatedState.lastHeartbeat}`);
        }
      } catch (error) {
        logger.debug('[DAEMON RUN] Failed to write heartbeat', error);
      }

      heartbeatRunning = false;
    }, heartbeatIntervalMs); // Every 60 seconds in production

    // Setup signal handlers
    const cleanupAndShutdown = async (source: 'lyntty-app' | 'lyntty-cli' | 'os-signal' | 'exception', errorMessage?: string) => {
      logger.debug(`[DAEMON RUN] Starting proper cleanup (source: ${source}, errorMessage: ${errorMessage})...`);

      // Clear health check interval
      if (restartOnStaleVersionAndHeartbeat) {
        clearInterval(restartOnStaleVersionAndHeartbeat);
        logger.debug('[DAEMON RUN] Health check interval cleared');
      }

      // Update daemon state before shutting down
      await apiMachine.updateDaemonState((state: DaemonState | null) => ({
        ...state,
        status: 'shutting-down',
        shutdownRequestedAt: Date.now(),
        shutdownSource: source
      }));

      // Give time for metadata update to send
      await new Promise(resolve => setTimeout(resolve, 100));
      await api.markMachineOffline(machine.id);

      await Promise.all([...externalPiMirrors.values()].map((mirror) => mirror.stop()));
      externalPiMirrors.clear();
      apiMachine.shutdown();
      await stopControlServer();
      await cleanupDaemonState();
      await stopCaffeinate();
      await releaseDaemonLock(daemonLockHandle);

      logger.debug('[DAEMON RUN] Cleanup completed, exiting process');
      process.exit(0);
    };

    logger.debug('[DAEMON RUN] Daemon started successfully, waiting for shutdown request');

    // Wait for shutdown request
    const shutdownRequest = await resolvesWhenShutdownRequested;
    await cleanupAndShutdown(shutdownRequest.source, shutdownRequest.errorMessage);
  } catch (error) {
    logger.debug('[DAEMON RUN][FATAL] Failed somewhere unexpectedly - exiting with code 1', error);
    process.exit(1);
  }
}
