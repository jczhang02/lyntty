import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';

const LYNTTY_PI_EXTENSION_SOURCE = String.raw`import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const REQUEST_TIMEOUT_MS = 750;
const RETRY_DELAY_MS = 1_000;
const HEARTBEAT_MS = 60_000;
const COMMAND_POLL_MS = 1_000;
const MAX_QUEUED_SENDS = 1_000;
let enabled = true;
let lastStatus = "not connected";
let draining = false;
let nextEventId = 1;
type QueuedPayload = { session: ReturnType<typeof sessionSnapshot>; event: Record<string, unknown>; eventId: number; timestamp: number; attempts?: number };
type RemotePiCommand =
  | { type: "send_user_message"; text: string }
  | { type: "follow_up"; text: string }
  | { type: "steer"; text: string }
  | { type: "abort" }
  | { type: "compact"; instructions?: string }
  | { type: "reload" }
  | { type: "set_session_name"; name: string }
  | { type: "get_commands" }
  | { type: "set_label"; entryId: string; label?: string };
type RemotePiCommandEnvelope = { seq: number; deliveryToken: string; command: RemotePiCommand };
type CommandAck = { seq: number; deliveryToken: string; status: "accepted_by_pi" | "failed"; error?: string };
const queuedPayloads: QueuedPayload[] = [];
const heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>();
const commandPollTimers = new Map<string, ReturnType<typeof setInterval>>();
const lastAckedCommandSeq = new Map<string, number>();
const pendingCommandAcks = new Map<string, CommandAck[]>();
let executingCommand = false;

function lynttyHome(): string {
  return process.env.LYNTTY_HOME_DIR || join(homedir(), ".lyntty");
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

function send(ctx: ExtensionContext, event: Record<string, unknown>): void {
  if (!enabled) return;
  const session = sessionSnapshot(ctx);
  if (!session.piSessionId) return;
  if (event.type !== "session_shutdown") {
    startHeartbeat(ctx);
  }
  enqueuePayload({
    session,
    event,
    eventId: nextEventId++,
    timestamp: Date.now(),
  });
  drainQueue();
}

function startHeartbeat(ctx: ExtensionContext): void {
  const sessionId = ctx.sessionManager.getSessionId();
  if (!sessionId || heartbeatTimers.has(sessionId)) return;
  const timer = setInterval(() => {
    send(ctx, { type: "remote_heartbeat" });
  }, HEARTBEAT_MS);
  timer.unref?.();
  heartbeatTimers.set(sessionId, timer);
}

function stopHeartbeat(ctx: ExtensionContext): void {
  const sessionId = ctx.sessionManager.getSessionId();
  const timer = sessionId ? heartbeatTimers.get(sessionId) : undefined;
  if (!timer) return;
  clearInterval(timer);
  heartbeatTimers.delete(sessionId);
}

function lynttyLabel(text: string): string {
  return text.startsWith("[lyntty]") ? text : "[lyntty] " + text;
}

async function executeRemoteCommand(pi: ExtensionAPI, ctx: ExtensionContext, command: RemotePiCommand): Promise<void> {
  switch (command.type) {
    case "send_user_message":
      await pi.sendUserMessage(lynttyLabel(command.text));
      return;
    case "follow_up":
      await pi.sendUserMessage(lynttyLabel(command.text), { deliverAs: "followUp" });
      return;
    case "steer":
      await pi.sendUserMessage(lynttyLabel(command.text), { deliverAs: "steer" });
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
      await maybeReload.call(ctx);
      return;
    }
    case "set_session_name":
      pi.setSessionName(command.name);
      return;
    case "get_commands":
      // The command list is returned only as an ack side effect for now; lynttyd owns UI policy.
      pi.getCommands();
      return;
    case "set_label":
      pi.setLabel(command.entryId, command.label);
      return;
  }
}

async function sendCommandAck(session: ReturnType<typeof sessionSnapshot>, ack: CommandAck): Promise<boolean> {
  return postToDaemon("/pi-extension/command-ack", { session, ack });
}

async function flushPendingCommandAcks(session: ReturnType<typeof sessionSnapshot>): Promise<void> {
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

async function pollCommands(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
  if (!enabled || executingCommand) return;
  const session = sessionSnapshot(ctx);
  if (!session.piSessionId) return;
  await flushPendingCommandAcks(session);
  if ((pendingCommandAcks.get(session.piSessionId)?.length ?? 0) > 0) return;

  const response = await postJsonToDaemon<{ status: "ok"; commands: RemotePiCommandEnvelope[] }>("/pi-extension/commands", {
    session,
    afterSeq: lastAckedCommandSeq.get(session.piSessionId) || 0,
  });
  if (!response.ok || !response.data || response.data.status !== "ok") return;

  for (const envelope of response.data.commands) {
    executingCommand = true;
    let ack: CommandAck;
    try {
      await executeRemoteCommand(pi, ctx, envelope.command);
      ack = { seq: envelope.seq, deliveryToken: envelope.deliveryToken, status: "accepted_by_pi" };
    } catch (error) {
      ack = { seq: envelope.seq, deliveryToken: envelope.deliveryToken, status: "failed", error: error instanceof Error ? error.message : "Pi command failed" };
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
  }
}

function startCommandPolling(pi: ExtensionAPI, ctx: ExtensionContext): void {
  const sessionId = ctx.sessionManager.getSessionId();
  if (!sessionId || commandPollTimers.has(sessionId)) return;
  const timer = setInterval(() => {
    void pollCommands(pi, ctx);
  }, COMMAND_POLL_MS);
  timer.unref?.();
  commandPollTimers.set(sessionId, timer);
  void pollCommands(pi, ctx);
}

function stopCommandPolling(ctx: ExtensionContext): void {
  const sessionId = ctx.sessionManager.getSessionId();
  const timer = sessionId ? commandPollTimers.get(sessionId) : undefined;
  if (!timer) return;
  clearInterval(timer);
  commandPollTimers.delete(sessionId);
}

export default function lynttyRemoteExtension(pi: ExtensionAPI) {
  pi.registerCommand("remote", {
    description: "Show or toggle Lyntty remote sync",
    handler: async (args, ctx) => {
      const action = String(args || "").trim().toLowerCase();
      if (action === "off" || action === "disable") {
        enabled = false;
        stopCommandPolling(ctx);
        ctx.ui.notify("Lyntty remote sync disabled for this Pi process", "info");
        return;
      }
      if (action === "on" || action === "enable") {
        enabled = true;
        startCommandPolling(pi, ctx);
        send(ctx, { type: "session_start", reason: "remote-command" });
        ctx.ui.notify("Lyntty remote sync enabled", "info");
        return;
      }

      startHeartbeat(ctx);
      startCommandPolling(pi, ctx);
      const ok = await postToDaemon("/pi-extension/status", { session: sessionSnapshot(ctx) });
      ctx.ui.notify(ok ? "Lyntty remote: connected" : ` + "`Lyntty remote: ${lastStatus}`" + `, ok ? "info" : "warning");
    },
  });

  pi.registerCommand("lyntty", {
    description: "Alias for /remote",
    handler: async (args, ctx) => {
      const action = String(args || "").trim().toLowerCase();
      if (action === "off" || action === "remote off") {
        enabled = false;
        stopCommandPolling(ctx);
        ctx.ui.notify("Lyntty remote sync disabled for this Pi process", "info");
        return;
      }
      if (action === "on" || action === "remote on") {
        enabled = true;
        startCommandPolling(pi, ctx);
        send(ctx, { type: "session_start", reason: "lyntty-command" });
        ctx.ui.notify("Lyntty remote sync enabled", "info");
        return;
      }
      startHeartbeat(ctx);
      startCommandPolling(pi, ctx);
      const ok = await postToDaemon("/pi-extension/status", { session: sessionSnapshot(ctx) });
      ctx.ui.notify(ok ? "Lyntty remote: connected" : ` + "`Lyntty remote: ${lastStatus}`" + `, ok ? "info" : "warning");
    },
  });

  pi.on("session_start", async (event, ctx) => {
    startHeartbeat(ctx);
    startCommandPolling(pi, ctx);
    send(ctx, { type: "session_start", reason: event.reason });
  });

  pi.on("session_info_changed", async (event, ctx) => {
    send(ctx, { type: "session_info_changed", name: event.name });
  });

  pi.on("agent_start", async (_event, ctx) => {
    send(ctx, { type: "agent_start" });
  });

  pi.on("message_update", async (event, ctx) => {
    send(ctx, { type: "message_update", assistantMessageEvent: event.assistantMessageEvent });
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
