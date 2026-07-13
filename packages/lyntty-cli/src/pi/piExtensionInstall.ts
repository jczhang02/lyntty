import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';

const LYNTTY_PI_EXTENSION_SOURCE = String.raw`import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const REQUEST_TIMEOUT_MS = 750;
const RETRY_DELAY_MS = 1_000;
const HEARTBEAT_MS = 60_000;
const COMMAND_POLL_MS = 1_000;
const MAX_QUEUED_SENDS = 1_000;
const bridgeLockedOff = process.env.LYNTTY_PI_EXTENSION_DISABLED === "1";
let enabled = !bridgeLockedOff;
let lastStatus = "not connected";
let draining = false;
let nextEventId = 1;
const extensionInstanceId = randomUUID();
type SessionSnapshot = ReturnType<typeof sessionSnapshot>;
type QueuedPayload = { session: SessionSnapshot; event: Record<string, unknown>; extensionInstanceId: string; eventId: number; timestamp: number; attempts?: number };
type PiCommandInfo = { name: string; description?: string; source: string; sourceInfo?: Record<string, unknown> };
type RemotePiCommand =
  | { type: "send_user_message"; text: string }
  | { type: "follow_up"; text: string }
  | { type: "steer"; text: string }
  | { type: "abort" }
  | { type: "compact"; instructions?: string }
  | { type: "reload" }
  | { type: "internal_shutdown" }
  | { type: "set_session_name"; name: string }
  | { type: "get_commands" }
  | { type: "invoke_pi_command"; commandLine: string; deliverAs?: "followUp" }
  | { type: "set_label"; entryId: string; label?: string };
type RemotePiCommandEnvelope = { seq: number; deliveryToken: string; localKey?: string; mobileContext?: boolean; command: RemotePiCommand };
type CommandAck = { seq: number; extensionInstanceId?: string; queueEpoch?: string; deliveryToken: string; status: "accepted_by_pi" | "failed"; error?: string; resultText?: string; commands?: PiCommandInfo[] };
type GoalState = { goalId: string; objective: string; status: string; tokenBudget: number | null; usage: { tokensUsed: number; activeSeconds: number }; createdAt: number; updatedAt: number };
const queuedPayloads: QueuedPayload[] = [];
const heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>();
const commandPollTimers = new Map<string, ReturnType<typeof setInterval>>();
const lastAckedCommandSeq = new Map<string, number>();
const commandQueueEpochs = new Map<string, string>();
const commandPollInFlight = new Set<string>();
const pendingCommandAcks = new Map<string, CommandAck[]>();
type PromptAcceptance = { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
const pendingPromptAcceptances = new Map<string, PromptAcceptance[]>();
type ExecutedCommandState = "executing" | "accepted_by_pi";
const executedCommandLedgers = new Map<string, Record<string, ExecutedCommandState>>();
let executingCommand = false;
let activePiSessionId: string | null = null;

function lynttyHome(): string {
  return process.env.LYNTTY_HOME_DIR || join(homedir(), ".lyntty");
}

function executedCommandLedgerPath(piSessionId: string): string {
  const fileName = createHash("sha256").update(piSessionId).digest("hex") + ".json";
  return join(lynttyHome(), "pi-extension-command-ledger", fileName);
}

async function loadExecutedCommandLedger(piSessionId: string): Promise<Record<string, ExecutedCommandState>> {
  const cached = executedCommandLedgers.get(piSessionId);
  if (cached) return cached;
  let ledger: Record<string, ExecutedCommandState> = {};
  try {
    const parsed = JSON.parse(await readFile(executedCommandLedgerPath(piSessionId), "utf8")) as { version?: unknown; outcomes?: unknown };
    if (parsed.version === 1 && parsed.outcomes && typeof parsed.outcomes === "object") {
      ledger = parsed.outcomes as Record<string, ExecutedCommandState>;
    }
  } catch {
    ledger = {};
  }
  executedCommandLedgers.set(piSessionId, ledger);
  return ledger;
}

async function getExecutedCommandState(piSessionId: string, localKey: string): Promise<ExecutedCommandState | null> {
  const ledger = await loadExecutedCommandLedger(piSessionId);
  const state = ledger[localKey];
  return state === "executing" || state === "accepted_by_pi" ? state : null;
}

async function fsyncPath(path: string): Promise<void> {
  try {
    const handle = await open(path, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Best-effort on filesystems/platforms that do not support directory fsync.
  }
}

async function persistExecutedCommandState(
  piSessionId: string,
  localKey: string,
  state: ExecutedCommandState | null,
): Promise<void> {
  const ledger = await loadExecutedCommandLedger(piSessionId);
  if (state) ledger[localKey] = state;
  else delete ledger[localKey];
  const directory = join(lynttyHome(), "pi-extension-command-ledger");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = executedCommandLedgerPath(piSessionId);
  const temporaryPath = path + "." + process.pid + "." + randomUUID() + ".tmp";
  await writeFile(temporaryPath, JSON.stringify({ version: 1, outcomes: ledger }), { encoding: "utf8", mode: 0o600 });
  await chmod(temporaryPath, 0o600).catch(() => undefined);
  await fsyncPath(temporaryPath);
  await rename(temporaryPath, path);
  await chmod(path, 0o600).catch(() => undefined);
  await fsyncPath(directory);
}

async function readDaemonPort(): Promise<number | null> {
  try {
    const content = await readFile(join(lynttyHome(), "daemon.state.json"), "utf8");
    const parsed = JSON.parse(content) as { httpPort?: unknown };
    return typeof parsed.httpPort === "number" ? parsed.httpPort : null;
  } catch {
    return null;
  }
}

async function readDaemonState(): Promise<{ httpPort: number; piExtensionToken?: string } | null> {
  try {
    const content = await readFile(join(lynttyHome(), "daemon.state.json"), "utf8");
    const parsed = JSON.parse(content) as { httpPort?: unknown; piExtensionToken?: unknown };
    if (typeof parsed.httpPort !== "number") return null;
    return {
      httpPort: parsed.httpPort,
      piExtensionToken: typeof parsed.piExtensionToken === "string" ? parsed.piExtensionToken : undefined,
    };
  } catch {
    return null;
  }
}

async function postJsonToDaemon<T>(path: string, body: unknown): Promise<{ ok: boolean; status: number; data?: T }> {
  const state = await readDaemonState();
  if (!state) {
    lastStatus = "lynttyd not running";
    return { ok: false, status: 0 };
  }

  try {
    const response = await fetch(` + "`http://127.0.0.1:${state.httpPort}${path}`" + `, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(state.piExtensionToken ? { "X-Lyntty-Extension-Token": state.piExtensionToken } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) as T : undefined;
    lastStatus = response.ok ? "connected" : ` + "`lynttyd rejected ${response.status}`" + `;
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    lastStatus = error instanceof Error ? error.message : "lynttyd unavailable";
    return { ok: false, status: 0 };
  }
}

async function postToDaemon(path: string, body: unknown): Promise<boolean> {
  const response = await postJsonToDaemon(path, body);
  return response.ok;
}

function sessionSnapshot(ctx: ExtensionContext) {
  return {
    piSessionId: ctx.sessionManager.getSessionId(),
    sessionFile: ctx.sessionManager.getSessionFile(),
    cwd: ctx.sessionManager.getCwd(),
    name: ctx.sessionManager.getSessionName(),
  };
}

function isStaleContextError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("This extension ctx is stale after session replacement or reload");
}

function stopHeartbeatBySessionId(sessionId: string): void {
  const timer = heartbeatTimers.get(sessionId);
  if (!timer) return;
  clearInterval(timer);
  heartbeatTimers.delete(sessionId);
}

function stopCommandPollingBySessionId(sessionId: string): void {
  const timer = commandPollTimers.get(sessionId);
  if (!timer) return;
  clearInterval(timer);
  commandPollTimers.delete(sessionId);
}

function stopSessionTimers(sessionId: string): void {
  stopHeartbeatBySessionId(sessionId);
  stopCommandPollingBySessionId(sessionId);
}

function stopOtherSessionTimers(sessionId: string): void {
  for (const existingSessionId of [...heartbeatTimers.keys()]) {
    if (existingSessionId !== sessionId) stopHeartbeatBySessionId(existingSessionId);
  }
  for (const existingSessionId of [...commandPollTimers.keys()]) {
    if (existingSessionId !== sessionId) stopCommandPollingBySessionId(existingSessionId);
  }
}

function handleContextError(sessionId: string | null | undefined, error: unknown): void {
  if (isStaleContextError(error)) {
    if (sessionId) stopSessionTimers(sessionId);
    if (sessionId === activePiSessionId) activePiSessionId = null;
    lastStatus = "Pi session context replaced; waiting for next session event";
    return;
  }
  lastStatus = error instanceof Error ? error.message : "Pi extension context failed";
}

function safeSessionSnapshot(ctx: ExtensionContext, staleSessionId?: string): SessionSnapshot | null {
  try {
    return sessionSnapshot(ctx);
  } catch (error) {
    handleContextError(staleSessionId, error);
    return null;
  }
}

function markActiveSession(session: SessionSnapshot): void {
  const sessionId = session.piSessionId;
  if (!sessionId) return;
  activePiSessionId = sessionId;
  stopOtherSessionTimers(sessionId);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function enqueuePayload(payload: QueuedPayload): void {
  if (queuedPayloads.length >= MAX_QUEUED_SENDS) {
    const removableIndex = queuedPayloads.findIndex((item) => item.event.type === "message_update");
    if (removableIndex >= 0) {
      queuedPayloads.splice(removableIndex, 1);
    } else {
      lastStatus = "lynttyd event queue full";
      return;
    }
  }
  queuedPayloads.push(payload);
}

function drainQueue(): void {
  if (draining) return;
  draining = true;
  void (async () => {
    try {
      while (queuedPayloads.length > 0) {
        const payload = queuedPayloads[0];
        const ok = await postToDaemon("/pi-extension/event", payload);
        if (!ok) {
          payload.attempts = (payload.attempts || 0) + 1;
          if (payload.attempts >= 5) {
            queuedPayloads.shift();
            lastStatus = "dropped event after repeated lynttyd failures";
            continue;
          }
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        queuedPayloads.shift();
      }
    } finally {
      draining = false;
      if (queuedPayloads.length > 0) {
        drainQueue();
      }
    }
  })();
}

function sendForSession(session: SessionSnapshot, event: Record<string, unknown>): void {
  if (!enabled) return;
  if (!session.piSessionId) return;
  enqueuePayload({
    session,
    event,
    extensionInstanceId,
    eventId: nextEventId++,
    timestamp: Date.now(),
  });
  drainQueue();
}

function send(ctx: ExtensionContext, event: Record<string, unknown>): void {
  const session = safeSessionSnapshot(ctx);
  if (!session?.piSessionId) return;
  markActiveSession(session);
  if (event.type !== "session_shutdown") {
    startHeartbeat(ctx);
  }
  sendForSession(session, event);
}

function startHeartbeat(ctx: ExtensionContext): void {
  const session = safeSessionSnapshot(ctx);
  if (!session?.piSessionId || heartbeatTimers.has(session.piSessionId)) return;
  const sessionId = session.piSessionId;
  markActiveSession(session);
  const timer = setInterval(() => {
    if (!enabled || activePiSessionId !== sessionId) {
      stopHeartbeatBySessionId(sessionId);
      return;
    }
    sendForSession(session, { type: "remote_heartbeat" });
  }, HEARTBEAT_MS);
  timer.unref?.();
  heartbeatTimers.set(sessionId, timer);
}

function stopHeartbeat(ctx: ExtensionContext): void {
  const session = safeSessionSnapshot(ctx);
  if (session?.piSessionId) stopHeartbeatBySessionId(session.piSessionId);
}

function mobileContextText(): string {
  return "Lyntty mobile context: the user is operating from Lyntty mobile. Prefer concise, phone-friendly replies when useful.";
}

async function injectMobileContext(pi: ExtensionAPI, envelope: RemotePiCommandEnvelope, deliverAs?: "followUp" | "steer"): Promise<void> {
  if (envelope.mobileContext === false) return;
  await pi.sendMessage({
    customType: "lyntty-mobile-context",
    content: mobileContextText(),
    display: false,
    details: {
      source: "mobile",
      localKey: envelope.localKey,
    },
  }, deliverAs ? { deliverAs } : undefined);
}

function stripFrontmatter(content: string): string {
  if (!content.startsWith("---")) return content;
  const nl = String.fromCharCode(10);
  const end = content.indexOf(nl + "---", 3);
  return end >= 0 ? content.slice(end + 4) : content;
}

function splitCommandLine(commandLine: string): { name: string; args: string } {
  const trimmed = commandLine.trim();
  const spaceIndex = trimmed.indexOf(" ");
  const rawName = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
  return {
    name: rawName.startsWith("/") ? rawName.slice(1) : rawName,
    args: spaceIndex === -1 ? "" : trimmed.slice(spaceIndex + 1).trim(),
  };
}

function currentGoal(ctx: ExtensionContext): GoalState | null {
  let goal: GoalState | null = null;
  for (const entry of ctx.sessionManager.getEntries() as Array<{ type?: string; customType?: string; data?: any }>) {
    if (entry.type !== "custom" || entry.customType !== "pi-codex-goal" || !entry.data || entry.data.version !== 1) continue;
    if (entry.data.kind === "clear") goal = null;
    if (entry.data.kind === "set" && entry.data.goal) goal = entry.data.goal;
    if (entry.data.kind === "usage" && goal?.goalId === entry.data.goalId) {
      goal = { ...goal, status: entry.data.status, usage: entry.data.usage, updatedAt: entry.data.updatedAt };
    }
  }
  return goal;
}

function formatGoal(goal: ReturnType<typeof currentGoal>): string {
  if (!goal) return "No active Pi goal.";
  const budget = goal.tokenBudget === null ? "none" : String(goal.tokenBudget);
  return "Pi goal (" + goal.status + ", budget " + budget + "): " + goal.objective;
}

function appendGoalEntry(pi: ExtensionAPI, goal: GoalState, kind: "set" | "clear"): void {
  const at = Math.floor(Date.now() / 1000);
  pi.appendEntry("pi-codex-goal", kind === "clear"
    ? { version: 1, kind: "clear", source: "command", clearedGoalId: goal.goalId, at }
    : { version: 1, kind: "set", source: "command", goal, at });
}

function handleGoalCommand(pi: ExtensionAPI, ctx: ExtensionContext, args: string): string {
  const trimmed = args.trim();
  const existing = currentGoal(ctx);
  if (!trimmed || trimmed === "status" || trimmed === "show") return formatGoal(existing);
  if (trimmed === "clear") {
    if (!existing) return "No active Pi goal.";
    appendGoalEntry(pi, existing, "clear");
    return "Pi goal cleared.";
  }
  if (trimmed === "pause" || trimmed === "resume") {
    if (!existing) return "No active Pi goal.";
    const next = { ...existing, status: trimmed === "pause" ? "paused" : "active", updatedAt: Math.floor(Date.now() / 1000) };
    appendGoalEntry(pi, next, "set");
    return "Pi goal " + next.status + ".";
  }
  const now = Math.floor(Date.now() / 1000);
  const next = {
    goalId: randomUUID(),
    objective: trimmed.slice(0, 8000),
    status: "active",
    tokenBudget: null,
    usage: { tokensUsed: 0, activeSeconds: 0 },
    createdAt: now,
    updatedAt: now,
  };
  appendGoalEntry(pi, next, "set");
  return "Pi goal set.";
}

function handleContextCommand(ctx: ExtensionContext): string {
  const usage = ctx.getContextUsage();
  if (!usage) return "Pi context usage unavailable.";
  return "Pi context usage:" + String.fromCharCode(10) + JSON.stringify(usage, null, 2);
}

async function expandSkillCommand(pi: ExtensionAPI, commandLine: string): Promise<string> {
  const { name, args } = splitCommandLine(commandLine);
  const skill = safePiCommands(pi).find((command) => command.name === name && command.source === "skill");
  const path = typeof skill?.sourceInfo?.path === "string" ? skill.sourceInfo.path : undefined;
  if (!skill || !path) throw new Error("Skill " + name + " is not available in this Pi session");
  const content = stripFrontmatter(await readFile(path, "utf8")).trim();
  const slashIndex = path.lastIndexOf("/");
  const baseDir = typeof skill.sourceInfo?.baseDir === "string" ? skill.sourceInfo.baseDir : slashIndex >= 0 ? path.slice(0, slashIndex) : path;
  const skillName = name.slice("skill:".length);
  const nl = String.fromCharCode(10);
  const block = '<skill name="' + skillName + '" location="' + path + '">' + nl + 'References are relative to ' + baseDir + '.' + nl + nl + content + nl + '</skill>';
  return args ? block + nl + nl + args : block;
}

function isSupportedPiCommand(command: { name?: unknown; source?: unknown }): boolean {
  if (typeof command.name !== "string") return false;
  if (command.source === "skill") return command.name.startsWith("skill:");
  return command.source === "extension" && (command.name === "goal" || command.name === "context");
}

function safePiCommands(pi: ExtensionAPI): PiCommandInfo[] {
  return pi.getCommands()
    .filter(isSupportedPiCommand)
    .map((command) => ({
      name: command.name,
      description: command.description,
      source: command.source,
      sourceInfo: command.sourceInfo as Record<string, unknown> | undefined,
    }));
}

function isSupportedPiCommandLine(pi: ExtensionAPI, commandLine: string): boolean {
  const trimmed = commandLine.trim();
  const spaceIndex = trimmed.indexOf(" ");
  const rawName = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
  const commandName = rawName.startsWith("/") ? rawName.slice(1) : rawName;
  if (!commandName) return false;
  return safePiCommands(pi).some((command) => command.name === commandName);
}

function settlePromptAcceptance(text: string, error?: Error): boolean {
  const pending = pendingPromptAcceptances.get(text);
  const acceptance = pending?.shift();
  if (!acceptance) return false;
  clearTimeout(acceptance.timer);
  if (pending && pending.length === 0) pendingPromptAcceptances.delete(text);
  if (error) acceptance.reject(error);
  else acceptance.resolve();
  return true;
}

function settleAnyPromptAcceptance(): boolean {
  const first = pendingPromptAcceptances.keys().next().value;
  return typeof first === "string" ? settlePromptAcceptance(first) : false;
}

function waitForPromptAcceptance(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      settlePromptAcceptance(text, new Error("Pi did not confirm prompt acceptance"));
    }, 5_000);
    timer.unref?.();
    pendingPromptAcceptances.set(text, [
      ...(pendingPromptAcceptances.get(text) ?? []),
      { resolve, reject, timer },
    ]);
  });
}

async function sendUserMessageAndWaitForAcceptance(
  pi: ExtensionAPI,
  text: string,
  deliverAs?: "steer" | "followUp",
): Promise<void> {
  const acceptance = waitForPromptAcceptance(text);
  try {
    if (deliverAs) pi.sendUserMessage(text, { deliverAs });
    else pi.sendUserMessage(text);
  } catch (error) {
    settlePromptAcceptance(text, error instanceof Error ? error : new Error(String(error)));
  }
  await acceptance;
}

async function executeRemoteCommand(pi: ExtensionAPI, ctx: ExtensionContext, envelope: RemotePiCommandEnvelope): Promise<Partial<CommandAck> | undefined> {
  const command = envelope.command;
  switch (command.type) {
    case "send_user_message":
      await injectMobileContext(pi, envelope);
      await sendUserMessageAndWaitForAcceptance(pi, command.text);
      return;
    case "follow_up":
      await injectMobileContext(pi, envelope, "followUp");
      await sendUserMessageAndWaitForAcceptance(pi, command.text, "followUp");
      return;
    case "steer":
      await injectMobileContext(pi, envelope, "steer");
      await sendUserMessageAndWaitForAcceptance(pi, command.text, "steer");
      return;
    case "abort":
      ctx.abort();
      return;
    case "compact":
      ctx.compact({ customInstructions: command.instructions });
      return;
    case "reload": {
      const maybeReload = (ctx as unknown as { reload?: () => Promise<void> }).reload;
      if (!maybeReload) throw new Error("reload is not available in this Pi context");
      const session = safeSessionSnapshot(ctx);
      if (session?.piSessionId) {
        stopSessionTimers(session.piSessionId);
        if (session.piSessionId === activePiSessionId) activePiSessionId = null;
      }
      await maybeReload.call(ctx);
      return;
    }
    case "internal_shutdown": {
      const maybeShutdown = (ctx as unknown as { shutdown?: () => Promise<void> | void }).shutdown;
      if (!maybeShutdown) throw new Error("shutdown is not available in this Pi context");
      const session = safeSessionSnapshot(ctx);
      if (session?.piSessionId) {
        stopSessionTimers(session.piSessionId);
        if (session.piSessionId === activePiSessionId) activePiSessionId = null;
      }
      setTimeout(() => {
        void Promise.resolve(maybeShutdown.call(ctx)).catch(() => undefined);
      }, 100);
      return;
    }
    case "set_session_name":
      pi.setSessionName(command.name);
      return;
    case "get_commands":
      return { commands: safePiCommands(pi) };
    case "invoke_pi_command": {
      if (!isSupportedPiCommandLine(pi, command.commandLine)) {
        throw new Error("Pi command is not allowed by Lyntty remote control");
      }
      const { name, args } = splitCommandLine(command.commandLine);
      if (name === "goal") {
        return { resultText: handleGoalCommand(pi, ctx, args) };
      }
      if (name === "context") {
        return { resultText: handleContextCommand(ctx) };
      }
      const expanded = await expandSkillCommand(pi, command.commandLine);
      await injectMobileContext(pi, envelope, command.deliverAs);
      if (command.deliverAs) {
        await sendUserMessageAndWaitForAcceptance(pi, expanded, command.deliverAs);
      } else {
        await sendUserMessageAndWaitForAcceptance(pi, expanded);
      }
      return { resultText: "Queued /" + name + "." };
    }
    case "set_label":
      pi.setLabel(command.entryId, command.label);
      return;
  }
}

async function sendCommandAck(session: SessionSnapshot, ack: CommandAck): Promise<boolean> {
  return postToDaemon("/pi-extension/command-ack", {
    session,
    ack: { ...ack, extensionInstanceId },
  });
}

async function flushPendingCommandAcks(session: SessionSnapshot): Promise<void> {
  const sessionId = session.piSessionId;
  const pending = pendingCommandAcks.get(sessionId);
  if (!pending || pending.length === 0) return;
  while (pending.length > 0) {
    const ok = await sendCommandAck(session, pending[0]);
    if (!ok) return;
    const ack = pending.shift()!;
    if (ack.status === "accepted_by_pi") {
      lastAckedCommandSeq.set(sessionId, Math.max(lastAckedCommandSeq.get(sessionId) || 0, ack.seq));
    }
  }
  pendingCommandAcks.delete(sessionId);
}

async function pollCommands(pi: ExtensionAPI, ctx: ExtensionContext, session: SessionSnapshot): Promise<void> {
  if (!enabled || executingCommand || activePiSessionId !== session.piSessionId) return;
  if (!session.piSessionId || commandPollInFlight.has(session.piSessionId)) return;
  commandPollInFlight.add(session.piSessionId);
  try {
  await flushPendingCommandAcks(session);
  if ((pendingCommandAcks.get(session.piSessionId)?.length ?? 0) > 0) return;

  const response = await postJsonToDaemon<{ status: "ok"; queueEpoch?: string; commands: RemotePiCommandEnvelope[] }>("/pi-extension/commands", {
    session,
    extensionInstanceId,
    afterSeq: lastAckedCommandSeq.get(session.piSessionId) || 0,
  });
  if (!response.ok || !response.data || response.data.status !== "ok") return;
  const queueEpoch = response.data.queueEpoch;
  if (queueEpoch && commandQueueEpochs.get(session.piSessionId) !== queueEpoch) {
    commandQueueEpochs.set(session.piSessionId, queueEpoch);
    lastAckedCommandSeq.set(session.piSessionId, 0);
    pendingCommandAcks.delete(session.piSessionId);
  }

  for (const envelope of response.data.commands) {
    const durableState = envelope.localKey
      ? await getExecutedCommandState(session.piSessionId, envelope.localKey)
      : null;
    if (durableState) {
      const ack: CommandAck = durableState === "accepted_by_pi"
        ? { seq: envelope.seq, queueEpoch, deliveryToken: envelope.deliveryToken, status: "accepted_by_pi" }
        : {
            seq: envelope.seq,
            queueEpoch,
            deliveryToken: envelope.deliveryToken,
            status: "failed",
            error: "Previous Pi command execution was interrupted; delivery outcome is uncertain. Retry as a new command.",
          };
      const ok = await sendCommandAck(session, ack);
      if (!ok) {
        pendingCommandAcks.set(session.piSessionId, [...(pendingCommandAcks.get(session.piSessionId) ?? []), ack]);
        return;
      }
      if (ack.status === "accepted_by_pi") {
        lastAckedCommandSeq.set(session.piSessionId, Math.max(lastAckedCommandSeq.get(session.piSessionId) || 0, envelope.seq));
      }
      continue;
    }

    const currentSession = safeSessionSnapshot(ctx, session.piSessionId);
    if (!currentSession?.piSessionId || currentSession.piSessionId !== session.piSessionId) {
      if (currentSession?.piSessionId) markActiveSession(currentSession);
      const ack: CommandAck = { seq: envelope.seq, queueEpoch, deliveryToken: envelope.deliveryToken, status: "failed", error: "Pi session context was replaced before command execution" };
      const ok = await sendCommandAck(session, ack);
      if (!ok) pendingCommandAcks.set(session.piSessionId, [...(pendingCommandAcks.get(session.piSessionId) ?? []), ack]);
      return;
    }

    executingCommand = true;
    let ack: CommandAck;
    let commandExecuted = false;
    try {
      if (envelope.localKey) {
        await persistExecutedCommandState(session.piSessionId, envelope.localKey, "executing");
      }
      const result = await executeRemoteCommand(pi, ctx, envelope);
      commandExecuted = true;
      if (envelope.localKey) {
        await persistExecutedCommandState(session.piSessionId, envelope.localKey, "accepted_by_pi");
      }
      ack = { seq: envelope.seq, queueEpoch, deliveryToken: envelope.deliveryToken, status: "accepted_by_pi", ...result };
    } catch (error) {
      if (isStaleContextError(error)) handleContextError(session.piSessionId, error);
      if (envelope.localKey && !commandExecuted) {
        await persistExecutedCommandState(session.piSessionId, envelope.localKey, null).catch(() => undefined);
      }
      const detail = error instanceof Error ? error.message : "Pi command failed";
      ack = {
        seq: envelope.seq,
        queueEpoch,
        deliveryToken: envelope.deliveryToken,
        status: "failed",
        error: commandExecuted ? "Pi accepted the command but its durable acknowledgement failed: " + detail : detail,
      };
    } finally {
      executingCommand = false;
    }

    const ok = await sendCommandAck(session, ack);
    if (ok) {
      if (ack.status === "accepted_by_pi") {
        lastAckedCommandSeq.set(session.piSessionId, Math.max(lastAckedCommandSeq.get(session.piSessionId) || 0, envelope.seq));
      }
    } else {
      pendingCommandAcks.set(session.piSessionId, [...(pendingCommandAcks.get(session.piSessionId) ?? []), ack]);
      return;
    }

    if (ack.status === "accepted_by_pi" && (envelope.command.type === "reload" || envelope.command.type === "internal_shutdown")) return;
  }
  } finally {
    commandPollInFlight.delete(session.piSessionId);
  }
}

function startCommandPolling(pi: ExtensionAPI, ctx: ExtensionContext): void {
  const session = safeSessionSnapshot(ctx);
  if (!session?.piSessionId || commandPollTimers.has(session.piSessionId)) return;
  const sessionId = session.piSessionId;
  markActiveSession(session);
  const timer = setInterval(() => {
    if (!enabled || activePiSessionId !== sessionId) {
      stopCommandPollingBySessionId(sessionId);
      return;
    }
    void pollCommands(pi, ctx, session).catch((error) => handleContextError(sessionId, error));
  }, COMMAND_POLL_MS);
  timer.unref?.();
  commandPollTimers.set(sessionId, timer);
  void pollCommands(pi, ctx, session).catch((error) => handleContextError(sessionId, error));
}

function stopCommandPolling(ctx: ExtensionContext): void {
  const session = safeSessionSnapshot(ctx);
  if (session?.piSessionId) stopCommandPollingBySessionId(session.piSessionId);
}

export default function lynttyRemoteExtension(pi: ExtensionAPI) {
  pi.registerCommand("remote", {
    description: "Show or toggle Lyntty remote sync",
    handler: async (args, ctx) => {
      const action = String(args || "").trim().toLowerCase();
      if (action === "off" || action === "disable") {
        enabled = false;
        stopHeartbeat(ctx);
        stopCommandPolling(ctx);
        ctx.ui.notify("Lyntty remote sync disabled for this Pi process", "info");
        return;
      }
      if (action === "on" || action === "enable") {
        if (bridgeLockedOff) {
          ctx.ui.notify("Lyntty remote bridge is owned by the managed runtime in this Pi process", "warning");
          return;
        }
        enabled = true;
        startCommandPolling(pi, ctx);
        send(ctx, { type: "command_list", commands: safePiCommands(pi) });
        send(ctx, { type: "session_start", reason: "remote-command" });
        ctx.ui.notify("Lyntty remote sync enabled", "info");
        return;
      }

      startHeartbeat(ctx);
      startCommandPolling(pi, ctx);
      const session = safeSessionSnapshot(ctx);
      if (!session?.piSessionId) {
        ctx.ui.notify(` + "`Lyntty remote: ${lastStatus}`" + `, "warning");
        return;
      }
      const ok = await postToDaemon("/pi-extension/status", { session });
      ctx.ui.notify(ok ? "Lyntty remote: connected" : ` + "`Lyntty remote: ${lastStatus}`" + `, ok ? "info" : "warning");
    },
  });

  pi.registerCommand("lyntty", {
    description: "Alias for /remote",
    handler: async (args, ctx) => {
      const action = String(args || "").trim().toLowerCase();
      if (action === "off" || action === "remote off") {
        enabled = false;
        stopHeartbeat(ctx);
        stopCommandPolling(ctx);
        ctx.ui.notify("Lyntty remote sync disabled for this Pi process", "info");
        return;
      }
      if (action === "on" || action === "remote on") {
        if (bridgeLockedOff) {
          ctx.ui.notify("Lyntty remote bridge is owned by the managed runtime in this Pi process", "warning");
          return;
        }
        enabled = true;
        startCommandPolling(pi, ctx);
        send(ctx, { type: "command_list", commands: safePiCommands(pi) });
        send(ctx, { type: "session_start", reason: "lyntty-command" });
        ctx.ui.notify("Lyntty remote sync enabled", "info");
        return;
      }
      startHeartbeat(ctx);
      startCommandPolling(pi, ctx);
      const session = safeSessionSnapshot(ctx);
      if (!session?.piSessionId) {
        ctx.ui.notify(` + "`Lyntty remote: ${lastStatus}`" + `, "warning");
        return;
      }
      const ok = await postToDaemon("/pi-extension/status", { session });
      ctx.ui.notify(ok ? "Lyntty remote: connected" : ` + "`Lyntty remote: ${lastStatus}`" + `, ok ? "info" : "warning");
    },
  });

  pi.on("session_start", async (event, ctx) => {
    startHeartbeat(ctx);
    startCommandPolling(pi, ctx);
    send(ctx, { type: "command_list", commands: safePiCommands(pi) });
    send(ctx, { type: "session_start", reason: event.reason });
  });

  pi.on("session_info_changed", async (event, ctx) => {
    send(ctx, { type: "session_info_changed", name: event.name });
  });

  pi.on("before_agent_start", async (event) => {
    if (!settlePromptAcceptance(event.prompt)) settleAnyPromptAcceptance();
  });

  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") {
      if (event.streamingBehavior) {
        setTimeout(() => {
          if (ctx.hasPendingMessages()) {
            settlePromptAcceptance(event.text);
          } else {
            settlePromptAcceptance(event.text, new Error("Pi did not queue the remote prompt"));
          }
        }, 0);
      }
      return;
    }
    if (typeof event.text !== "string" || event.text.trim().length === 0) return;
    send(ctx, {
      type: "input",
      text: event.text,
      source: event.source,
      streamingBehavior: event.streamingBehavior,
    });
  });

  pi.on("agent_start", async (_event, ctx) => {
    send(ctx, { type: "agent_start" });
  });

  pi.on("message_update", async (event, ctx) => {
    send(ctx, { type: "message_update", assistantMessageEvent: event.assistantMessageEvent });
  });

  pi.on("message_end", async (event, ctx) => {
    if (event.message?.role !== "assistant") return;
    send(ctx, { type: "message_end", message: event.message });
  });

  pi.on("tool_execution_start", async (event, ctx) => {
    send(ctx, { type: "tool_execution_start", toolCallId: event.toolCallId, toolName: event.toolName, args: event.args });
  });

  pi.on("tool_execution_update", async (event, ctx) => {
    send(ctx, { type: "tool_execution_update", toolCallId: event.toolCallId, toolName: event.toolName, args: event.args, partialResult: event.partialResult });
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    send(ctx, { type: "tool_execution_end", toolCallId: event.toolCallId, toolName: event.toolName, args: event.args, result: event.result, isError: event.isError });
  });

  pi.on("agent_end", async (_event, ctx) => {
    send(ctx, { type: "agent_end" });
  });

  pi.on("session_shutdown", async (event, ctx) => {
    send(ctx, { type: "session_shutdown", reason: event.reason });
    stopHeartbeat(ctx);
    stopCommandPolling(ctx);
  });
}
`;

export function lynttyPiExtensionPath(homeDir = os.homedir()): string {
  return join(homeDir, '.pi', 'agent', 'extensions', 'lyntty', 'index.ts');
}

export async function installLynttyPiExtension(homeDir = os.homedir()): Promise<{ path: string; changed: boolean }> {
  const path = lynttyPiExtensionPath(homeDir);
  await mkdir(join(homeDir, '.pi', 'agent', 'extensions', 'lyntty'), { recursive: true });

  let current: string | null = null;
  try {
    current = await readFile(path, 'utf8');
  } catch {
    current = null;
  }

  if (current === LYNTTY_PI_EXTENSION_SOURCE) {
    return { path, changed: false };
  }

  await writeFile(path, LYNTTY_PI_EXTENSION_SOURCE, 'utf8');
  return { path, changed: true };
}
