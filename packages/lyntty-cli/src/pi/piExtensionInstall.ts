import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';

const LYNTTY_PI_EXTENSION_SOURCE = String.raw`import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const REQUEST_TIMEOUT_MS = 750;
const RETRY_DELAY_MS = 1_000;
const MAX_QUEUED_SENDS = 1_000;
let enabled = true;
let lastStatus = "not connected";
let draining = false;
type QueuedPayload = { session: ReturnType<typeof sessionSnapshot>; event: Record<string, unknown>; timestamp: number; attempts?: number };
const queuedPayloads: QueuedPayload[] = [];

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

async function postToDaemon(path: string, body: unknown): Promise<boolean> {
  const port = await readDaemonPort();
  if (!port) {
    lastStatus = "lynttyd not running";
    return false;
  }

  try {
    const response = await fetch(` + "`http://127.0.0.1:${port}${path}`" + `, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    lastStatus = response.ok ? "connected" : ` + "`lynttyd rejected ${response.status}`" + `;
    return response.ok;
  } catch (error) {
    lastStatus = error instanceof Error ? error.message : "lynttyd unavailable";
    return false;
  }
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
  enqueuePayload({
    session,
    event,
    timestamp: Date.now(),
  });
  drainQueue();
}

export default function lynttyRemoteExtension(pi: ExtensionAPI) {
  pi.registerCommand("remote", {
    description: "Show or toggle Lyntty remote sync",
    handler: async (args, ctx) => {
      const action = String(args || "").trim().toLowerCase();
      if (action === "off" || action === "disable") {
        enabled = false;
        ctx.ui.notify("Lyntty remote sync disabled for this Pi process", "info");
        return;
      }
      if (action === "on" || action === "enable") {
        enabled = true;
        send(ctx, { type: "session_start", reason: "remote-command" });
        ctx.ui.notify("Lyntty remote sync enabled", "info");
        return;
      }

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
        ctx.ui.notify("Lyntty remote sync disabled for this Pi process", "info");
        return;
      }
      if (action === "on" || action === "remote on") {
        enabled = true;
        send(ctx, { type: "session_start", reason: "lyntty-command" });
        ctx.ui.notify("Lyntty remote sync enabled", "info");
        return;
      }
      const ok = await postToDaemon("/pi-extension/status", { session: sessionSnapshot(ctx) });
      ctx.ui.notify(ok ? "Lyntty remote: connected" : ` + "`Lyntty remote: ${lastStatus}`" + `, ok ? "info" : "warning");
    },
  });

  pi.on("session_start", async (event, ctx) => {
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
