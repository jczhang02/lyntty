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
import { Credentials, persistPiCommandBoundary, persistPiCommandOutcome, persistPiHistoryAppendCheckpoint, readPersistedPiCommandBoundary, readPersistedPiCommandOutcomes, readPersistedPiHistoryAppendCheckpoint, readSettings } from '@/persistence';
import { createSessionMetadata } from '@/utils/createSessionMetadata';
import { initialMachineMetadata } from '@/daemon/run';
import { notifyDaemonSessionStarted } from '@/daemon/controlClient';
import { registerKillSessionHandler } from '@/api/registerKillSessionHandler';
import { connectionState } from '@/utils/serverConnectionErrors';
import { logger } from '@/ui/logger';
import { PiCommandLedger, resolvePiRemoteAction } from './runPiControl';
import { bindPiSessionExtensions, getPiPluginFeatureSummary, listPiRemoteSlashCommands } from './runPiFeatures';
import { mapPiSessionHistoryPageToEnvelopes } from './runPiHistory';
import { planPiHistoryStartup, resolvePendingPiHistoryCoverage, selectPiHistoryPageRequest, shouldPauseManagedHistoryMirror, type PiProgressiveHistoryCoverage } from './piHistoryCoverage';
import { reconcilePiCanonicalHistory, reconcilePiHistoryEnvelopes } from './reconcilePiHistory';
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

  const startupHistoryEntries = piRuntime.session.sessionManager.getEntries();
  const startupHistoryPage = mapPiSessionHistoryPageToEnvelopes(
    startupHistoryEntries,
    { limit: PI_HISTORY_PAGE_MESSAGE_LIMIT },
  );
  const appendCheckpoint = readPersistedPiHistoryAppendCheckpoint(piRuntime.session.sessionId);
  const startupHistoryPlan = planPiHistoryStartup({
    entries: startupHistoryEntries,
    latestPage: startupHistoryPage,
    appendCheckpointEntryId: appendCheckpoint,
    relayHistoryCursor: response.metadata.piHistoryCursor,
    relayHistoryHasMore: response.metadata.piHistoryHasMore,
    // A newly created managed Relay session intentionally starts with
    // hasMore=true and no cursor. Existing sessions with messages must never
    // use that shape to hide a missing progressive cursor.
    allowUninitializedProgressiveHistory: response.seq === 0,
  });
  const progressiveHistoryCoverage: PiProgressiveHistoryCoverage = startupHistoryPlan.progressiveCoverage;
  let startupHistoryGapReason: string | null = startupHistoryPlan.appendCheckpointMissing
    ? 'persisted Pi history append checkpoint is missing from local JSONL'
    : startupHistoryPlan.progressiveCursorMissing
      ? 'persisted Pi progressive history cursor is missing from local JSONL'
      : null;
  let startupHistoryConfirmed = startupHistoryPlan.replayEnvelopes.length === 0;
  if (!startupHistoryConfirmed) {
    try {
      const reconciliation = await reconcilePiHistoryEnvelopes({
        envelopes: startupHistoryPlan.replayEnvelopes,
        client: session,
      });
      startupHistoryConfirmed = (
        reconciliation.conflicting.length === 0
        && reconciliation.missing.length === 0
        && reconciliation.outboxConflictLocalIds.length === 0
      );
      if (!startupHistoryConfirmed) {
        startupHistoryGapReason ??= 'relay contains divergent or unconfirmed canonical Pi history envelopes';
      }
    } catch (error) {
      startupHistoryGapReason ??= 'relay history inventory unavailable; canonical replay deferred';
      logger.warn('[pi] Managed history startup reconciliation deferred', {
        piSessionId: piRuntime.session.sessionId,
        error,
      });
    }
  }
  if (
    startupHistoryConfirmed
    && !startupHistoryGapReason
    && startupHistoryPlan.nextAppendCheckpointEntryId
  ) {
    persistPiHistoryAppendCheckpoint(
      piRuntime.session.sessionId,
      startupHistoryPlan.nextAppendCheckpointEntryId,
    );
  }

  const synchronizedMetadata = {
    ...metadata,
    controlState: startupHistoryGapReason ? 'history_gap' as const : metadata.controlState,
    piHasHistoryGap: startupHistoryGapReason ? true : metadata.piHasHistoryGap,
    piRecoveryReason: startupHistoryGapReason ?? metadata.piRecoveryReason,
    piHistoryCursor: progressiveHistoryCoverage.cursor,
    piHistoryHasMore: progressiveHistoryCoverage.hasMore,
    piHistoryTotalMessages: startupHistoryPage.totalMessages,
  };
  await notifyDaemonSessionStarted(response.id, synchronizedMetadata, {
      encryptionKey: encodeBase64(response.encryptionKey),
      encryptionVariant: response.encryptionVariant,
      seq: response.seq,
      metadataVersion: response.metadataVersion,
      agentStateVersion: response.agentStateVersion,
    });
  await session.updateMetadataAndAwait((currentMetadata) => ({
    ...currentMetadata,
    name: reconcilePiSessionDisplayName(currentMetadata.name, synchronizedMetadata.name),
    controlState: startupHistoryGapReason ? 'history_gap' : currentMetadata.controlState,
    piHasHistoryGap: startupHistoryGapReason ? true : currentMetadata.piHasHistoryGap,
    piRecoveryReason: startupHistoryGapReason ?? currentMetadata.piRecoveryReason,
    piHistoryCursor: progressiveHistoryCoverage.cursor,
    piHistoryHasMore: progressiveHistoryCoverage.hasMore,
    piHistoryTotalMessages: startupHistoryPage.totalMessages,
  }), { timeoutMs: 10_000 });

  let thinking = false;
  let piSessionProtocol = new PiSessionProtocolMapper();
  const sendPiEnvelopes = (envelopes: ReturnType<PiSessionProtocolMapper['mapEvent']>) => {
    for (const envelope of envelopes) {
      session.sendSessionProtocolMessage(envelope);
    }
  };
  type ManagedPiHistoryPageContext = {
    sessionManager: AgentSessionRuntime['session']['sessionManager'];
    coverage: PiProgressiveHistoryCoverage;
    pendingCoverage: PiProgressiveHistoryCoverage | null;
    chain: Promise<void>;
    accepting: boolean;
  };
  let managedHistoryPageContext: ManagedPiHistoryPageContext = {
    sessionManager: piRuntime.session.sessionManager,
    coverage: progressiveHistoryCoverage,
    pendingCoverage: null,
    chain: Promise.resolve(),
    accepting: true,
  };
  const commitProgressiveHistoryCoverage = async (
    context: ManagedPiHistoryPageContext,
    coverage: PiProgressiveHistoryCoverage,
    totalMessages?: number,
  ): Promise<void> => {
    context.pendingCoverage = coverage;
    try {
      await session.updateMetadataAndAwait((currentMetadata) => ({
        ...currentMetadata,
        piHistoryCursor: coverage.cursor,
        piHistoryHasMore: coverage.hasMore,
        piHistoryTotalMessages: totalMessages ?? currentMetadata.piHistoryTotalMessages,
      }), { timeoutMs: 10_000 });
    } catch (error) {
      const synchronizedMetadata = session.getMetadata();
      if (
        synchronizedMetadata?.piHistoryCursor !== coverage.cursor
        || synchronizedMetadata?.piHistoryHasMore !== coverage.hasMore
      ) {
        throw error;
      }
    }
    context.coverage = coverage;
    context.pendingCoverage = null;
  };
  const sendPiHistoryPage = (
    context: ManagedPiHistoryPageContext,
    requestedCursor?: string,
  ) => {
    if (!context.accepting) {
      const currentPage = mapPiSessionHistoryPageToEnvelopes(
        context.sessionManager.getEntries(),
        { limit: 1 },
      );
      return Promise.resolve({
        type: 'success' as const,
        sent: 0,
        nextCursor: context.coverage.cursor,
        hasMore: context.coverage.hasMore,
        totalMessages: currentPage.totalMessages,
      });
    }
    const request = context.chain.then(async () => {
    const currentEntries = context.sessionManager.getEntries();
    const synchronizedHistoryMetadata = session.getMetadata();
    const pendingResolution = resolvePendingPiHistoryCoverage({
      confirmed: context.coverage,
      pending: context.pendingCoverage,
      synchronized: synchronizedHistoryMetadata?.piHistoryHasMore === undefined
        ? undefined
        : {
            cursor: synchronizedHistoryMetadata.piHistoryCursor,
            hasMore: synchronizedHistoryMetadata.piHistoryHasMore,
          },
      requestedCursor,
    });
    context.coverage = pendingResolution.confirmed;
    context.pendingCoverage = pendingResolution.pending;
    if (context.pendingCoverage && pendingResolution.retryPendingCommit) {
      const pendingCoverage = context.pendingCoverage;
      await commitProgressiveHistoryCoverage(context, pendingCoverage);
      const currentPage = mapPiSessionHistoryPageToEnvelopes(currentEntries, { limit: 1 });
      return {
        type: 'success' as const,
        sent: 0,
        nextCursor: pendingCoverage.cursor,
        hasMore: pendingCoverage.hasMore,
        totalMessages: currentPage.totalMessages,
      };
    }
    const pageRequest = selectPiHistoryPageRequest(
      context.coverage,
      requestedCursor,
    );
    if (pageRequest.type === 'noop') {
      const currentPage = mapPiSessionHistoryPageToEnvelopes(currentEntries, { limit: 1 });
      return {
        type: 'success' as const,
        sent: 0,
        nextCursor: pageRequest.nextCursor,
        hasMore: pageRequest.hasMore,
        totalMessages: currentPage.totalMessages,
      };
    }
    const page = mapPiSessionHistoryPageToEnvelopes(
      currentEntries,
      { beforeEntryId: pageRequest.beforeEntryId, limit: PI_HISTORY_PAGE_MESSAGE_LIMIT },
    );
    const historyGap = page.historyGap;
    if (historyGap) {
      await session.updateMetadataAndAwait((currentMetadata) => ({
        ...currentMetadata,
        controlState: 'history_gap',
        piHasHistoryGap: true,
        piRecoveryReason: historyGap.reason,
        piHistoryCursor: context.coverage.cursor,
        piHistoryHasMore: context.coverage.hasMore,
      }), { timeoutMs: 10_000 });
      return {
        type: 'history_gap' as const,
        ...page.historyGap,
        nextCursor: context.coverage.cursor,
        hasMore: context.coverage.hasMore,
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
        piHistoryCursor: context.coverage.cursor,
        piHistoryHasMore: context.coverage.hasMore,
      }), { timeoutMs: 10_000 });
      return {
        type: 'history_gap' as const,
        code: 'history_gap' as const,
        missingCursor: reconciliation.conflicting[0]?.id
          ?? reconciliation.missing[0]?.id
          ?? reconciliation.outboxConflictLocalIds[0],
        reason,
        nextCursor: context.coverage.cursor,
        hasMore: context.coverage.hasMore,
        totalMessages: page.totalMessages,
      };
    }
    const nextProgressiveHistoryCoverage = {
      cursor: page.nextCursor,
      hasMore: page.hasMore,
    };
    await commitProgressiveHistoryCoverage(
      context,
      nextProgressiveHistoryCoverage,
      page.totalMessages,
    );
    return {
      type: 'success' as const,
      sent: reconciliation.sent,
      nextCursor: nextProgressiveHistoryCoverage.cursor,
      hasMore: nextProgressiveHistoryCoverage.hasMore,
      totalMessages: page.totalMessages,
    };
    });
    context.chain = request.then(() => undefined, () => undefined);
    return request;
  };
  const recordExternalHistoryGap = async (reason: string) => {
    await session.updateMetadataAndAwait((currentMetadata) => ({
      ...currentMetadata,
      controlState: 'history_gap',
      piHasHistoryGap: true,
      piRecoveryReason: reason,
    }), { timeoutMs: 10_000 });
  };
  let managedHistoryReconciliationPending = 0;
  let externalMirror = startPiExternalMirror({
    sessionFile: piRuntime.session.sessionManager.getSessionFile(),
    initialEntries: piRuntime.session.sessionManager.getEntries(),
    session: () => session,
    onHistoryGap: recordExternalHistoryGap,
    isManagedRuntimeActive: () => shouldPauseManagedHistoryMirror({
      thinking,
      streaming: piRuntime.session.isStreaming,
      pendingReconciliations: managedHistoryReconciliationPending,
    }),
  });
  const createManagedHistoryContext = (
    runtimeSession: AgentSessionRuntime['session'],
    mirror: ReturnType<typeof startPiExternalMirror>,
    boundedReplayStartEntryId: string | undefined,
    baselineEntryIds: Iterable<string>,
  ) => ({
    piSessionId: runtimeSession.sessionId,
    sessionManager: runtimeSession.sessionManager,
    mirror,
    boundedReplayStartEntryId,
    liveBaselineEntryIds: new Set(baselineEntryIds),
    liveRelayConfirmedEntryIds: new Set<string>(),
  });
  let managedHistoryContext = createManagedHistoryContext(
    piRuntime.session,
    externalMirror,
    startupHistoryPlan.boundedReplayStartEntryId,
    startupHistoryEntries.map((entry) => entry.id),
  );
  type ManagedHistoryContext = typeof managedHistoryContext;
  const reconcileManagedCanonicalHistory = async (context: ManagedHistoryContext): Promise<void> => {
    const entries = context.sessionManager.getEntries();
    const latestEntryId = entries.at(-1)?.id;
    if (!latestEntryId) {
      context.mirror?.markCurrentEntriesKnown();
      return;
    }
    try {
      await session.flushConfirmed();
      const liveDeliveredEntryIds = entries
        .filter((entry) => !context.liveBaselineEntryIds.has(entry.id))
        .map((entry) => entry.id);
      context.mirror?.markEntryIdsDelivered(liveDeliveredEntryIds);
      for (const entryId of liveDeliveredEntryIds) {
        context.liveRelayConfirmedEntryIds.add(entryId);
      }
      context.liveBaselineEntryIds = new Set(entries.map((entry) => entry.id));
      const currentAppendCheckpoint = readPersistedPiHistoryAppendCheckpoint(context.piSessionId);
      const appendCheckpointIndex = currentAppendCheckpoint
        ? entries.findIndex((entry) => entry.id === currentAppendCheckpoint)
        : -1;
      const appendCheckpointMissing = !!currentAppendCheckpoint && appendCheckpointIndex < 0;
      const reconciliation = await reconcilePiCanonicalHistory({
        entries,
        afterEntryId: appendCheckpointIndex >= 0 && currentAppendCheckpoint
          ? currentAppendCheckpoint
          : undefined,
        startAtEntryId: appendCheckpointIndex < 0
          ? context.boundedReplayStartEntryId
          : undefined,
        client: session,
        isEntryRelayConfirmed: (entryId) => (
          context.liveRelayConfirmedEntryIds.has(entryId)
          || context.mirror?.isEntryRelayConfirmed(entryId) === true
        ),
      });
      const hasCanonicalGap = appendCheckpointMissing
        || reconciliation.afterEntryMissing
        || reconciliation.startEntryMissing
        || reconciliation.conflicting.length > 0
        || reconciliation.missing.length > 0
        || reconciliation.outboxConflictLocalIds.length > 0;
      if (!appendCheckpointMissing && reconciliation.contiguousAppendCheckpointEntryId) {
        persistPiHistoryAppendCheckpoint(
          context.piSessionId,
          reconciliation.contiguousAppendCheckpointEntryId,
        );
      }
      if (hasCanonicalGap) {
        const reason = appendCheckpointMissing
          ? 'persisted Pi history append checkpoint is missing from local JSONL'
          : reconciliation.startEntryMissing
            ? 'bounded Pi history replay start is missing from local JSONL'
            : 'relay contains divergent or unconfirmed canonical Pi history envelopes';
        await recordExternalHistoryGap(reason);
        return;
      }
      context.mirror?.markCurrentEntriesKnown();
    } catch (error) {
      logger.warn('[pi] Managed canonical history remains pending; append checkpoint not advanced', {
        piSessionId: context.piSessionId,
        error,
      });
    }
  };
  let managedHistoryReconciliationChain: Promise<void> = Promise.resolve();
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
    managedHistoryReconciliationPending++;
    thinking = false;
    const historyContext = managedHistoryContext;
    const reconcileHistory = async () => {
      try {
        await reconcileManagedCanonicalHistory(historyContext);
      } finally {
        managedHistoryReconciliationPending--;
      }
    };
    managedHistoryReconciliationChain = managedHistoryReconciliationChain.then(
      reconcileHistory,
      reconcileHistory,
    );
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
    const previousPageContext = managedHistoryPageContext;
    previousPageContext.accepting = false;
    await previousPageContext.chain;
    await managedHistoryReconciliationChain;
    await externalMirror?.stop();

    const nextHistoryEntries = nextSession.sessionManager.getEntries();
    const nextHistoryPage = mapPiSessionHistoryPageToEnvelopes(
      nextHistoryEntries,
      { limit: PI_HISTORY_PAGE_MESSAGE_LIMIT },
    );
    const nextAppendCheckpoint = readPersistedPiHistoryAppendCheckpoint(nextSession.sessionId);
    const nextHistoryPlan = planPiHistoryStartup({
      entries: nextHistoryEntries,
      latestPage: nextHistoryPage,
      appendCheckpointEntryId: nextAppendCheckpoint,
    });
    let nextHistoryGapReason: string | null = nextHistoryPlan.appendCheckpointMissing
      ? 'persisted Pi history append checkpoint is missing from local JSONL'
      : null;
    let nextHistoryConfirmed = nextHistoryPlan.replayEnvelopes.length === 0;
    if (!nextHistoryConfirmed) {
      try {
        const reconciliation = await reconcilePiHistoryEnvelopes({
          envelopes: nextHistoryPlan.replayEnvelopes,
          client: session,
        });
        nextHistoryConfirmed = (
          reconciliation.conflicting.length === 0
          && reconciliation.missing.length === 0
          && reconciliation.outboxConflictLocalIds.length === 0
        );
        if (!nextHistoryConfirmed) {
          nextHistoryGapReason ??= 'relay contains divergent or unconfirmed canonical Pi history envelopes';
        }
      } catch (error) {
        nextHistoryGapReason ??= 'relay history inventory unavailable; canonical replay deferred';
        logger.warn('[pi] Rebound managed history reconciliation deferred', {
          piSessionId: nextSession.sessionId,
          error,
        });
      }
    }
    if (
      nextHistoryConfirmed
      && !nextHistoryGapReason
      && nextHistoryPlan.nextAppendCheckpointEntryId
    ) {
      persistPiHistoryAppendCheckpoint(
        nextSession.sessionId,
        nextHistoryPlan.nextAppendCheckpointEntryId,
      );
    }
    externalMirror = startPiExternalMirror({
      sessionFile: nextSession.sessionManager.getSessionFile(),
      initialEntries: nextSession.sessionManager.getEntries(),
      session: () => session,
      onHistoryGap: recordExternalHistoryGap,
      isManagedRuntimeActive: () => shouldPauseManagedHistoryMirror({
        thinking,
        streaming: nextSession.isStreaming,
        pendingReconciliations: managedHistoryReconciliationPending,
      }),
    });
    managedHistoryContext = createManagedHistoryContext(
      nextSession,
      externalMirror,
      nextHistoryPlan.boundedReplayStartEntryId,
      nextHistoryEntries.map((entry) => entry.id),
    );
    managedHistoryPageContext = {
      sessionManager: nextSession.sessionManager,
      coverage: nextHistoryPlan.progressiveCoverage,
      pendingCoverage: null,
      chain: Promise.resolve(),
      accepting: true,
    };
    piSessionProtocol = new PiSessionProtocolMapper();
    await bindPiSessionExtensions(piRuntime, {
      onShutdown: () => shutdownRequested?.(),
      onError: (error) => logger.debug('[pi] Extension error', error),
    });
    const nextSlashCommands = listPiRemoteSlashCommands(nextSession);
    await session.updateMetadataAndAwait((currentMetadata) => ({
      ...currentMetadata,
      piSessionId: nextSession.sessionId,
      name: getPiSessionDisplayName(nextSession),
      slashCommands: nextSlashCommands,
      controlState: nextHistoryGapReason ? 'history_gap' : 'ready',
      piHasHistoryGap: nextHistoryGapReason ? true : false,
      piRecoveryReason: nextHistoryGapReason ?? undefined,
      piHistoryCursor: managedHistoryPageContext.coverage.cursor,
      piHistoryHasMore: managedHistoryPageContext.coverage.hasMore,
      piHistoryTotalMessages: nextHistoryPage.totalMessages,
    }), { timeoutMs: 10_000 });
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
    const pageContext = managedHistoryPageContext;
    return sendPiHistoryPage(pageContext, beforeEntryId);
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
