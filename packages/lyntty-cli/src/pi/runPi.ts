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
import { Credentials, readSettings } from '@/persistence';
import { createSessionMetadata } from '@/utils/createSessionMetadata';
import { initialMachineMetadata } from '@/daemon/run';
import { notifyDaemonSessionStarted } from '@/daemon/controlClient';
import { registerKillSessionHandler } from '@/claude/registerKillSessionHandler';
import { setupOfflineReconnection } from '@/utils/setupOfflineReconnection';
import { connectionState } from '@/utils/serverConnectionErrors';
import { logger } from '@/ui/logger';
import { PiCommandLedger, resolvePiRemoteAction } from './runPiControl';
import { bindPiSessionExtensions, getPiPluginFeatureSummary, listPiRemoteSlashCommands } from './runPiFeatures';
import { mapPiSessionHistoryPageToEnvelopes } from './runPiHistory';
import { PiSessionProtocolMapper } from './runPiSessionProtocol';
import { startPiExternalMirror } from './runPiExternalMirror';
import { resolvePiRelaySessionTag } from './piRelaySessionTag';

export interface RunPiOptions {
  credentials: Credentials;
  startedBy?: 'daemon' | 'terminal';
}

const LOCAL_ONLY_SLASH_COMMANDS = ['/model', '/settings', '/session', '/theme', '/help'];

const PI_HISTORY_PAGE_MESSAGE_LIMIT = 50;

function getPiSessionDisplayName(session: AgentSessionRuntime['session']): string {
  return session.sessionName ?? session.sessionId;
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
      throw new Error(`Pi session ${piSessionId} was not found on this machine`);
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
  connectionState.setBackend('pi');

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
  const sessionTag = resolvePiRelaySessionTag(settings.machineId, requestedPiSessionId);
  const piRuntime = await createPiRuntime(process.cwd(), requestedPiSessionId);
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
    sandbox: settings.sandboxConfig,
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
  let session: ApiSessionClient;
  const { session: initialSession, reconnectionHandle } = setupOfflineReconnection({
    api,
    sessionTag,
    metadata,
    state,
    response,
    onSessionSwap: (newSession) => {
      session = newSession;
    },
  });
  session = initialSession;

  if (response) {
    await notifyDaemonSessionStarted(response.id, metadata, {
      encryptionKey: encodeBase64(response.encryptionKey),
      encryptionVariant: response.encryptionVariant,
      seq: response.seq,
      metadataVersion: response.metadataVersion,
      agentStateVersion: response.agentStateVersion,
    });
  }

  let thinking = false;
  const piSessionProtocol = new PiSessionProtocolMapper();
  const sendPiEnvelopes = (envelopes: ReturnType<PiSessionProtocolMapper['mapEvent']>) => {
    for (const envelope of envelopes) {
      session.sendSessionProtocolMessage(envelope);
    }
  };
  const sendPiHistoryPage = async (beforeEntryId?: string) => {
    const page = mapPiSessionHistoryPageToEnvelopes(
      piRuntime.session.sessionManager.getBranch(),
      { beforeEntryId, limit: PI_HISTORY_PAGE_MESSAGE_LIMIT },
    );
    for (const envelope of page.envelopes) {
      session.sendSessionProtocolMessage(envelope);
    }
    await session.flush();
    await session.updateMetadataAndAwait((currentMetadata) => ({
      ...currentMetadata,
      piHistoryCursor: page.nextCursor,
      piHistoryHasMore: page.hasMore,
      piHistoryTotalMessages: page.totalMessages,
    }));
    return {
      type: 'success' as const,
      sent: page.envelopes.length,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      totalMessages: page.totalMessages,
    };
  };
  const externalMirror = startPiExternalMirror({
    sessionFile: piRuntime.session.sessionManager.getSessionFile(),
    initialEntries: piRuntime.session.sessionManager.getEntries(),
    session: () => session,
    isManagedRuntimeActive: () => thinking || piRuntime.session.isStreaming,
  });

  let unsubscribe = piRuntime.session.subscribe((event) => {
    if (event.type === 'agent_start') thinking = true;
    if (event.type === 'agent_end') {
      thinking = false;
      externalMirror?.markCurrentEntriesKnown();
      session.sendSessionEvent({ type: 'ready' });
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
      if (event.type === 'agent_start') thinking = true;
      if (event.type === 'agent_end') {
        thinking = false;
        externalMirror?.markCurrentEntriesKnown();
        session.sendSessionEvent({ type: 'ready' });
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

  const commandLedger = new PiCommandLedger();

  session.onUserMessage((message) => {
    if (!commandLedger.claim(message.localKey)) {
      logger.debug('[pi] Dropping duplicate user command', { localKey: message.localKey });
      return;
    }

    const action = resolvePiRemoteAction({
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
          return piRuntime.session.prompt(action.text);
        case 'followUp':
          logger.debug('[pi] Forwarding follow-up to Pi SDK runtime', { length: action.text.length });
          return piRuntime.session.followUp(action.text);
        case 'steer':
          logger.debug('[pi] Forwarding redirect/steer to Pi SDK runtime', { length: action.text.length });
          return piRuntime.session.steer(action.text);
        case 'abort':
          logger.debug('[pi] Aborting Pi SDK runtime by user request');
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

    run?.catch((error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      thinking = false;
      logger.warn('[pi] Failed to handle Session Remote command', { errorMessage });
      session.sendSessionEvent({ type: 'ready' });
    });
  });

  const keepAlive = setInterval(() => {
    session.keepAlive(thinking || piRuntime.session.isStreaming, 'remote');
  }, 10_000);

  await new Promise<void>((resolve) => {
    const shutdown = () => {
      clearInterval(keepAlive);
      reconnectionHandle?.cancel();
      unsubscribe();
      externalMirror?.stop();
      void piRuntime.dispose();
      session.sendSessionDeath();
      resolve();
    };
    shutdownRequested = shutdown;
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}
