import { randomUUID } from 'node:crypto';

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
import { PiSessionProtocolMapper } from './runPiSessionProtocol';

export interface RunPiOptions {
  credentials: Credentials;
  startedBy?: 'daemon' | 'terminal';
}

const LOCAL_ONLY_SLASH_COMMANDS = ['/model', '/settings', '/session', '/theme', '/help'];

async function createPiRuntime(cwd: string): Promise<AgentSessionRuntime> {
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

  return createAgentSessionRuntime(createRuntime, {
    cwd,
    agentDir: getAgentDir(),
    sessionManager: SessionManager.create(cwd),
  });
}

export async function runPi(opts: RunPiOptions): Promise<void> {
  const sessionTag = randomUUID();
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

  const piRuntime = await createPiRuntime(process.cwd());
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
  if (piRuntime.session.sessionFile) {
    metadata.name = piRuntime.session.sessionId;
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
  let unsubscribe = piRuntime.session.subscribe((event) => {
    if (event.type === 'agent_start') thinking = true;
    if (event.type === 'agent_end') {
      thinking = false;
      session.sendSessionEvent({ type: 'ready' });
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
      slashCommands: nextSlashCommands,
    }));
    unsubscribe = nextSession.subscribe((event) => {
      if (event.type === 'agent_start') thinking = true;
      if (event.type === 'agent_end') {
        thinking = false;
        session.sendSessionEvent({ type: 'ready' });
      }
      sendPiEnvelopes(piSessionProtocol.mapEvent(event));
    });
  });

  registerKillSessionHandler(session.rpcHandlerManager, async () => {
    await piRuntime.session.abort();
    shutdownRequested?.();
  });

  session.sendSessionEvent({ type: 'ready' });
  sendPiEnvelopes(piSessionProtocol.serviceMessage(
    `Pi SDK runtime connected: ${piRuntime.session.sessionId}. Remote slash commands: ${initialFeatureSummary.slashCommands.join(', ')}. Active tools: ${initialFeatureSummary.activeTools.join(', ')}`,
  ));

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
          sendPiEnvelopes(piSessionProtocol.serviceMessage(
            `${action.command} is ${action.reason === 'local_only' ? 'computer-side only' : 'not declared by pi runtime'}; not sent from Session Remote.`,
          ));
          session.sendSessionEvent({ type: 'ready' });
          return null;
      }
    })();

    run?.catch((error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      thinking = false;
      sendPiEnvelopes(piSessionProtocol.serviceMessage(`pi error: ${errorMessage}`));
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
      void piRuntime.dispose();
      session.sendSessionDeath();
      resolve();
    };
    shutdownRequested = shutdown;
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}
