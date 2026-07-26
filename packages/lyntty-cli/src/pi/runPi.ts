import type { AgentSessionRuntime } from '@earendil-works/pi-coding-agent';
import {
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  SessionManager,
} from '@earendil-works/pi-coding-agent';

import { ApiClient } from '@/api/api';
import type { ApiSessionClient } from '@/api/apiSession';
import { encodeBase64 } from '@/api/encryption';
import { Credentials, persistPiCommandBoundary, persistPiCommandOutcome, readPersistedPiCommandBoundary, readPersistedPiCommandOutcomes, readSettings } from '@/persistence';
import { createSessionMetadata } from '@/utils/createSessionMetadata';
import { initialMachineMetadata } from '@/daemon/run';
import { notifyDaemonSessionStarted } from '@/daemon/controlClient';
import { registerKillSessionHandler } from '@/api/registerKillSessionHandler';
import { connectionState } from '@/utils/serverConnectionErrors';
import { logger } from '@/ui/logger';
import { PiCommandLedger, resolvePiRemoteAction } from './runPiControl';
import { bindPiSessionExtensions, getPiPluginFeatureSummary, listPiRemoteSlashCommands } from './runPiFeatures';
import { mapPiSessionHistoryPageToEnvelopes } from './runPiHistory';
import { reconcilePiHistoryEnvelopes } from './reconcilePiHistory';
import { PiSessionProtocolMapper } from './runPiSessionProtocol';
import { startPiExternalMirror } from './runPiExternalMirror';
import { createPiRuntimeRelayIdentity } from './piRuntimeRelayIdentity';
import { PiCompletionNotificationTracker, sendPiDoneNotification } from './piCompletionNotifications';
import { bindPiRemoteInput } from './piRemoteInput';
import { reconcilePiSessionDisplayName, resolvePiSessionDisplayName } from './piSessionDisplayName';

export interface RunPiOptions {
  credentials: Credentials;
  startedBy?: 'daemon' | 'terminal';
}

const LOCAL_ONLY_SLASH_COMMANDS = ['/model', '/settings', '/session', '/theme', '/help'];

const PI_HISTORY_PAGE_MESSAGE_LIMIT = 50;

function getPiSessionDisplayName(session: AgentSessionRuntime['session']): string {
  return resolvePiSessionDisplayName(session.sessionName);
}

async function createPiRuntime(cwd: string, piSessionId?: string): Promise<AgentSessionRuntime> {
  const createRuntime = async ({
    cwd: runtimeCwd,
    agentDir,
    sessionManager,
    sessionStartEvent,
  }: Parameters<typeof createAgentSessionRuntime>[0] extends (input: infer T) => unknown ? T : never) => {
    const services = await createAgentSessionServices({ cwd: runtimeCwd, agentDir });
    return {
      ...(await createAgentSessionFromServices({
        services,
        sessionManager,
        sessionStartEvent,
      })),
      services,
      diagnostics: services.diagnostics,
    };
  };

  let sessionManager = SessionManager.create(cwd);
  if (piSessionId) {
    const sessions = await SessionManager.listAll();
    const matched = sessions.find((entry) => entry.id === piSessionId);
    if (!matched) {
      logger.warn('[pi] Requested managed session was not found on this machine', { piSessionId });
      throw new Error('This Pi session was not found on this machine.');
    }
    sessionManager = SessionManager.open(matched.path, undefined, matched.cwd || cwd);
  }

  return createAgentSessionRuntime(createRuntime, {
    cwd,
    agentDir: getAgentDir(),
    sessionManager,
  });
}

export async function runPi(opts: RunPiOptions): Promise<void> {
  // The managed SDK runtime is the sole relay command owner in this process.
  // Keep the globally installed ordinary-TUI bridge disabled, including reloads.
  process.env.LYNTTY_PI_EXTENSION_DISABLED = '1';

  const api = await ApiClient.create(opts.credentials);
  const settings = await readSettings();
  if (!settings?.machineId) {
    throw new Error('No machine ID found in settings');
  }

  await api.getOrCreateMachine({
    machineId: settings.machineId,
    metadata: initialMachineMetadata,
  });

  const requestedPiSessionId = process.env.LYNTTY_PI_SESSION_ID;
  const { piRuntime, sessionTag } = await createPiRuntimeRelayIdentity({
    machineId: settings.machineId,
    cwd: process.cwd(),
    requestedPiSessionId,
    createRuntime: createPiRuntime,
  });
  let shutdownRequested: (() => void) | null = null;
  await bindPiSessionExtensions(piRuntime, {
    onShutdown: () => shutdownRequested?.(),
    onError: (error) => logger.debug('[pi] Extension error', error),
  });
  const initialFeatureSummary = getPiPluginFeatureSummary(piRuntime.session);

  const { state, metadata } = createSessionMetadata({
    flavor: 'pi',
    machineId: settings.machineId,
    startedBy: opts.startedBy,
  });
  metadata.models = [{ code: 'default', value: piRuntime.session.model?.name ?? 'pi default', description: null }];
  metadata.currentModelCode = 'default';
  metadata.operatingModes = [{ code: 'default', value: 'default', description: null }];
  metadata.currentOperatingModeCode = 'default';
  metadata.thoughtLevels = [
    { code: 'minimal', value: 'minimal', description: null },
    { code: 'low', value: 'low', description: null },
    { code: 'medium', value: 'medium', description: null },
    { code: 'high', value: 'high', description: null },
    { code: 'xhigh', value: 'xhigh', description: null },
  ];
  metadata.currentThoughtLevelCode = piRuntime.session.thinkingLevel;
  metadata.slashCommands = initialFeatureSummary.slashCommands;
  metadata.piSessionId = piRuntime.session.sessionId;
  metadata.name = getPiSessionDisplayName(piRuntime.session);
  if (requestedPiSessionId) {
    metadata.piHistoryHasMore = true;
  }

  const response = await api.getOrCreateSession({ tag: sessionTag, metadata, state });
  if (!response) {
    await piRuntime.dispose();
    throw new Error('Unable to connect to relay; managed Pi runtime was not started');
  }
  const session: ApiSessionClient = api.sessionSyncClient(response);
  let commandBoundary = readPersistedPiCommandBoundary(piRuntime.session.sessionId);
  if (commandBoundary === null) {
    commandBoundary = response.seq;
    persistPiCommandBoundary(piRuntime.session.sessionId, commandBoundary);
  }
  session.skipMessagesThrough(commandBoundary);

  await notifyDaemonSessionStarted(response.id, metadata, {
      encryptionKey: encodeBase64(response.encryptionKey),
      encryptionVariant: response.encryptionVariant,
      seq: response.seq,
      metadataVersion: response.metadataVersion,
      agentStateVersion: response.agentStateVersion,
    });
  await session.updateMetadataAndAwait((currentMetadata) => ({
    ...currentMetadata,
    name: reconcilePiSessionDisplayName(currentMetadata.name, metadata.name),
  }));

  let thinking = false;
  const piSessionProtocol = new PiSessionProtocolMapper();
  const sendPiEnvelopes = (envelopes: ReturnType<PiSessionProtocolMapper['mapEvent']>) => {
    for (const envelope of envelopes) {
      session.sendSessionProtocolMessage(envelope);
    }
  };
  let piHistoryPageChain: Promise<void> = Promise.resolve();
  const sendPiHistoryPage = (beforeEntryId?: string) => {
    const request = piHistoryPageChain.then(async () => {
    const page = mapPiSessionHistoryPageToEnvelopes(
      piRuntime.session.sessionManager.getBranch(),
      { beforeEntryId, limit: PI_HISTORY_PAGE_MESSAGE_LIMIT },
    );
    const historyGap = page.historyGap;
    if (historyGap) {
      await session.updateMetadataAndAwait((currentMetadata) => ({
        ...currentMetadata,
        controlState: 'history_gap',
        piHasHistoryGap: true,
        piRecoveryReason: historyGap.reason,
        piHistoryHasMore: false,
      }));
      return {
        type: 'history_gap' as const,
        ...page.historyGap,
        hasMore: false,
        totalMessages: page.totalMessages,
      };
    }
    const reconciliation = await reconcilePiHistoryEnvelopes({
      envelopes: page.envelopes,
      client: session,
    });
    if (
      reconciliation.conflicting.length > 0
      || reconciliation.missing.length > 0
      || reconciliation.outboxConflictLocalIds.length > 0
    ) {
      const reason = 'relay contains divergent or unconfirmed canonical Pi history envelopes';
      await session.updateMetadataAndAwait((currentMetadata) => ({
        ...currentMetadata,
        controlState: 'history_gap',
        piHasHistoryGap: true,
        piRecoveryReason: reason,
        piHistoryHasMore: false,
      }));
      return {
        type: 'history_gap' as const,
        code: 'history_gap' as const,
        missingCursor: reconciliation.conflicting[0]?.id
          ?? reconciliation.missing[0]?.id
          ?? reconciliation.outboxConflictLocalIds[0],
        reason,
        hasMore: false,
        totalMessages: page.totalMessages,
      };
    }
    await session.updateMetadataAndAwait((currentMetadata) => ({
      ...currentMetadata,
      piHistoryCursor: page.nextCursor,
      piHistoryHasMore: page.hasMore,
      piHistoryTotalMessages: page.totalMessages,
    }));
    return {
      type: 'success' as const,
      sent: reconciliation.sent,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      totalMessages: page.totalMessages,
    };
    });
    piHistoryPageChain = request.then(() => undefined, () => undefined);
    return request;
  };
  const recordExternalHistoryGap = async (reason: string) => {
    await session.updateMetadataAndAwait((currentMetadata) => ({
      ...currentMetadata,
      controlState: 'history_gap',
      piHasHistoryGap: true,
      piRecoveryReason: reason,
    }));
  };
  let externalMirror = startPiExternalMirror({
    sessionFile: piRuntime.session.sessionManager.getSessionFile(),
    initialEntries: piRuntime.session.sessionManager.getEntries(),
    session: () => session,
    onHistoryGap: recordExternalHistoryGap,
    isManagedRuntimeActive: () => thinking || piRuntime.session.isStreaming,
  });
  const completionNotifications = new PiCompletionNotificationTracker();
  const sendCompletionPush = () => {
    try {
      sendPiDoneNotification(api.push(), session);
    } catch (pushError) {
      logger.debug('[pi] Failed to send completion push', pushError);
    }
  };
  const handleAgentStart = () => {
    thinking = true;
    completionNotifications.markAgentStart();
  };
  const handleAgentEnd = () => {
    thinking = false;
    externalMirror?.markCurrentEntriesKnown();
    session.sendSessionEvent({ type: 'ready' });
    if (completionNotifications.consumeAgentEnd()) {
      sendCompletionPush();
    }
  };

  let unsubscribe = piRuntime.session.subscribe((event) => {
    if (event.type === 'agent_start') handleAgentStart();
    if (event.type === 'agent_end') {
      handleAgentEnd();
    }
    if (event.type === 'session_info_changed') {
      session.updateMetadata((currentMetadata) => ({
        ...currentMetadata,
        piSessionId: piRuntime.session.sessionId,
        name: getPiSessionDisplayName(piRuntime.session),
      }));
    }

    sendPiEnvelopes(piSessionProtocol.mapEvent(event));
  });

  piRuntime.setRebindSession(async (nextSession) => {
    unsubscribe();
    completionNotifications.reset();
    await externalMirror?.stop();
    externalMirror = startPiExternalMirror({
      sessionFile: nextSession.sessionManager.getSessionFile(),
      initialEntries: nextSession.sessionManager.getEntries(),
      session: () => session,
      onHistoryGap: recordExternalHistoryGap,
      isManagedRuntimeActive: () => thinking || nextSession.isStreaming,
    });
    await bindPiSessionExtensions(piRuntime, {
      onShutdown: () => shutdownRequested?.(),
      onError: (error) => logger.debug('[pi] Extension error', error),
    });
    const nextSlashCommands = listPiRemoteSlashCommands(nextSession);
    session.updateMetadata((currentMetadata) => ({
      ...currentMetadata,
      piSessionId: nextSession.sessionId,
      name: getPiSessionDisplayName(nextSession),
      slashCommands: nextSlashCommands,
    }));
    unsubscribe = nextSession.subscribe((event) => {
      if (event.type === 'agent_start') handleAgentStart();
      if (event.type === 'agent_end') {
        handleAgentEnd();
      }
      if (event.type === 'session_info_changed') {
        session.updateMetadata((currentMetadata) => ({
          ...currentMetadata,
          piSessionId: nextSession.sessionId,
          name: getPiSessionDisplayName(nextSession),
        }));
      }
      sendPiEnvelopes(piSessionProtocol.mapEvent(event));
    });
  });

  registerKillSessionHandler(session.rpcHandlerManager, async () => {
    completionNotifications.suppressCurrentTurn();
    await piRuntime.session.abort();
    shutdownRequested?.();
  });

  session.rpcHandlerManager.registerHandler('pi-history-page', async (params: unknown) => {
    const record = params && typeof params === 'object' && !Array.isArray(params)
      ? params as Record<string, unknown>
      : {};
    const beforeEntryId = typeof record.beforeEntryId === 'string' ? record.beforeEntryId : undefined;
    return sendPiHistoryPage(beforeEntryId);
  });

  session.sendSessionEvent({ type: 'ready' });

  const persistedCommandOutcomes = readPersistedPiCommandOutcomes(piRuntime.session.sessionId);
  const sessionMetadata = session.getMetadata();
  const acceptedCommandKeys = new Set([
    ...persistedCommandOutcomes.acceptedLocalKeys,
    ...(sessionMetadata?.remoteCommandAcceptedLocalKeys ?? []),
  ]);
  const failedCommandKeys = new Set([
    ...persistedCommandOutcomes.failedLocalKeys,
    ...persistedCommandOutcomes.uncertainLocalKeys,
    ...(sessionMetadata?.remoteCommandFailedLocalKeys ?? []),
  ]);
  for (const localKey of persistedCommandOutcomes.uncertainLocalKeys) {
    persistPiCommandOutcome(piRuntime.session.sessionId, localKey, 'failed');
  }
  const commandLedger = new PiCommandLedger([
    ...acceptedCommandKeys,
    ...failedCommandKeys,
  ]);
  const updateCommandOutcomeMetadata = (): void => {
    session.updateMetadata((currentMetadata) => ({
      ...currentMetadata,
      remoteCommandAcceptedLocalKeys: [...acceptedCommandKeys].slice(-500),
      remoteCommandFailedLocalKeys: [...failedCommandKeys].slice(-500),
    }));
  };
  updateCommandOutcomeMetadata();

  const rejectPiRemoteInput = (message: { localKey?: string }, reason: string): void => {
    if (message.localKey) {
      try {
        persistPiCommandOutcome(piRuntime.session.sessionId, message.localKey, 'failed');
      } catch (error) {
        logger.warn('[pi] Failed to persist rejected Session Remote input', { localKey: message.localKey, error });
      }
      failedCommandKeys.add(message.localKey);
      acceptedCommandKeys.delete(message.localKey);
      updateCommandOutcomeMetadata();
    }
    logger.warn('[pi] Rejected Session Remote input before Pi delivery', { reason });
    session.sendSessionEvent({ type: 'ready' });
  };

  bindPiRemoteInput(session, ({ message, images }) => {
    if (!commandLedger.claim(message.localKey)) {
      logger.debug('[pi] Dropping duplicate user command', { localKey: message.localKey });
      return;
    }

    if (message.localKey) {
      try {
        persistPiCommandOutcome(piRuntime.session.sessionId, message.localKey, 'executing');
      } catch (error) {
        failedCommandKeys.add(message.localKey);
        updateCommandOutcomeMetadata();
        logger.warn('[pi] Refusing remote command because its durable ledger is unavailable', { localKey: message.localKey, error });
        return;
      }
    }

    let acceptedByPi = false;
    const markAcceptedByPi = (): void => {
      if (acceptedByPi || !message.localKey) return;
      persistPiCommandOutcome(piRuntime.session.sessionId, message.localKey, 'accepted_by_pi');
      acceptedCommandKeys.add(message.localKey);
      failedCommandKeys.delete(message.localKey);
      acceptedByPi = true;
      updateCommandOutcomeMetadata();
    };

    const action = images.length > 0 && !message.content.text.trim()
      ? piRuntime.session.isStreaming
        ? { kind: 'followUp' as const, text: '' }
        : { kind: 'prompt' as const, text: '' }
      : resolvePiRemoteAction({
          text: message.content.text,
          isStreaming: piRuntime.session.isStreaming,
          supportedSlashCommands: listPiRemoteSlashCommands(piRuntime.session),
          localOnlySlashCommands: LOCAL_ONLY_SLASH_COMMANDS,
        });

    const run = (() => {
      switch (action.kind) {
        case 'empty':
          return null;
        case 'prompt':
          logger.debug('[pi] Forwarding prompt to Pi SDK runtime', { length: action.text.length });
          return piRuntime.session.prompt(action.text, {
            images,
            source: 'rpc',
            preflightResult: (accepted) => {
              if (accepted) markAcceptedByPi();
            },
          });
        case 'followUp':
          logger.debug('[pi] Forwarding follow-up to Pi SDK runtime', { length: action.text.length });
          return piRuntime.session.followUp(action.text, images);
        case 'steer':
          logger.debug('[pi] Forwarding redirect/steer to Pi SDK runtime', { length: action.text.length });
          return piRuntime.session.steer(action.text, images);
        case 'abort':
          logger.debug('[pi] Aborting Pi SDK runtime by user request');
          completionNotifications.suppressCurrentTurn();
          return piRuntime.session.abort().then(() => {
            thinking = false;
            sendPiEnvelopes(piSessionProtocol.endTurn('cancelled'));
            session.sendSessionEvent({ type: 'ready' });
          });
        case 'localOnlySlash':
          logger.warn('[pi] Rejected Session Remote slash command', {
            command: action.command,
            reason: action.reason,
          });
          session.sendSessionEvent({ type: 'ready' });
          return null;
      }
    })();

    if (!run) {
      if (message.localKey) {
        persistPiCommandOutcome(piRuntime.session.sessionId, message.localKey, 'failed');
        failedCommandKeys.add(message.localKey);
        updateCommandOutcomeMetadata();
      }
      return;
    }

    void run.then(() => {
      // follow-up, steer, abort, and immediate extension commands resolve at
      // their acceptance boundary; prompt uses preflightResult above.
      markAcceptedByPi();
    }).catch((error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      thinking = false;
      if (message.localKey && !acceptedByPi) {
        try {
          persistPiCommandOutcome(piRuntime.session.sessionId, message.localKey, 'failed');
        } catch (persistError) {
          logger.warn('[pi] Failed to persist remote command failure', { localKey: message.localKey, persistError });
        }
        failedCommandKeys.add(message.localKey);
        updateCommandOutcomeMetadata();
      }
      logger.warn('[pi] Failed to handle Session Remote command', { errorMessage });
      session.sendSessionEvent({ type: 'ready' });
    });
  }, (error) => {
    logger.warn('[pi] Failed to prepare Session Remote attachments', {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }, ({ message, reason }) => {
    rejectPiRemoteInput(message, reason);
  });

  const keepAlive = setInterval(() => {
    session.keepAlive(thinking || piRuntime.session.isStreaming, 'remote');
  }, 10_000);

  await new Promise<void>((resolve) => {
    const shutdown = () => {
      clearInterval(keepAlive);
      unsubscribe();
      void externalMirror?.stop();
      void piRuntime.dispose();
      session.sendSessionDeath();
      resolve();
    };
    shutdownRequested = shutdown;
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}
