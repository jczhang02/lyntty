# Lyntty -> Lyntty/Pi 调研记录

日期：2026-06-30

## 结论

Lyntty 可作为 Lyntty 的上游基础，但不是“改一个 agent id”即可完成。Lyntty 已有成熟的远程移动/网页控制骨架：Expo app、CLI daemon、本地 session process、server sync、machine presence、push/voice/worktree/fork 等。要完美支持 `pi agent`，关键工作在 Lyntty CLI/daemon/app 的 agent flavor 体系中新增 `pi`，并用 Pi SDK/extension 语义替换 Claude/Codex 假设。

当前 Lyntty repo 已完成 M0-M2 scaffold：协议、relay、`lynttyd`、Pi extension stub、Android shell、pairing/auth/node presence、native `/lyntty` registration smoke、headless Pi SDK capability probe。缺口集中在 M3+：真实 Pi runtime loop、事件映射、确认/权限、reconnect/history_gap、Review Evidence、notifications/previews。

## Lyntty 来源

- Upstream repo: `https://github.com/slopus/lyntty`
- Local research clone: `/tmp/lyntty-lyntty-research`
- Product: mobile + web client for Claude Code & Codex, E2E encrypted sync.
- Main packages:
  - `packages/lyntty-app` — Expo mobile/web client
  - `packages/lyntty-cli` — CLI wrapper + daemon + agent runners
  - `packages/lyntty-agent` — remote control CLI
  - `packages/lyntty-relay` — sync backend
  - `packages/lyntty-wire` — shared wire/protocol package

## Lyntty architecture evidence

Key docs/files:

- `/tmp/lyntty-lyntty-research/README.md`
- `/tmp/lyntty-lyntty-research/docs/cli-architecture.md`
- `/tmp/lyntty-lyntty-research/docs/protocol.md`
- `/tmp/lyntty-lyntty-research/packages/lyntty-cli/src/index.ts`
- `/tmp/lyntty-lyntty-research/packages/lyntty-cli/src/daemon/run.ts`
- `/tmp/lyntty-lyntty-research/packages/lyntty-cli/src/daemon/controlServer.ts`
- `/tmp/lyntty-lyntty-research/packages/lyntty-cli/src/modules/common/registerCommonHandlers.ts`
- `/tmp/lyntty-lyntty-research/packages/lyntty-cli/src/utils/createSessionMetadata.ts`
- `/tmp/lyntty-lyntty-research/packages/lyntty-cli/src/agent/core/AgentBackend.ts`
- `/tmp/lyntty-lyntty-research/packages/lyntty-app/sources/sync/agentDefaults.ts`
- `/tmp/lyntty-lyntty-research/packages/lyntty-app/sources/sync/persistence.ts`
- `/tmp/lyntty-lyntty-research/packages/lyntty-app/sources/components/modelModeOptions.ts`
- `/tmp/lyntty-lyntty-research/packages/lyntty-app/sources/app/(app)/new/index.tsx`
- `/tmp/lyntty-lyntty-research/packages/lyntty-app/sources/components/AgentInput.tsx`

Core mechanics:

- CLI command router supports `claude`, `codex`, `gemini`, `openclaw`, `acp`.
- Daemon owns local control server on `127.0.0.1`, session spawn, process tracking, machine presence.
- App asks daemon/server to spawn sessions with agent type.
- Server protocol is HTTP `/v1` + Socket.IO `/v1/updates`; persistent updates carry monotonic `seq`; most content is client-side encrypted opaque payload.
- App hard-codes agent flavors in several places: new session picker, draft persistence, agent defaults/settings, model/permission modes, input label/behavior.
- CLI hard-codes agent flavors in spawn schema, daemon spawn switch, metadata flavor, CLI availability detection, help text.

## Pi integration surfaces

Pi docs surfaces checked by subagent and spot-verified:

- `/opt/pi-coding-agent/README.md`
- `/opt/pi-coding-agent/docs/sdk.md`
- `/opt/pi-coding-agent/docs/extensions.md`
- `/opt/pi-coding-agent/docs/tui.md`
- `/opt/pi-coding-agent/docs/skills.md`
- `/opt/pi-coding-agent/docs/prompt-templates.md`

Must support:

1. SDK runtime
   - `createAgentSessionRuntime()`
   - `AgentSessionRuntime`
   - `runtime.newSession()/switchSession()/fork()/importFromJsonl()`
   - `session.subscribe()`
   - `prompt()/steer()/followUp()`
   - re-`bindExtensions()` after runtime/session replacement

2. Extensions
   - `pi.registerCommand()`
   - `pi.registerTool()`
   - `pi.registerShortcut()`
   - `pi.registerMessageRenderer()`
   - `ctx.ui.*` custom UI, status, overlay, notifications, editor components
   - `pi.getCommands()` for extension/template/skill command discovery

3. Slash commands
   - Extension commands: `/name`
   - Prompt templates: `/template`
   - Skills: `/skill:name`
   - Built-in interactive commands may not work through headless `prompt()`; Lyntty must mark local-only/computer-side commands.

4. TUI/native surface
   - Custom UI components with `render(width)`, `handleInput?`, `invalidate()`.
   - Overlay/custom editor could support native `/lyntty` control surface later.

## Current Lyntty state

Evidence:

- `docs/evidence/m0-m2.md`
- `packages/protocol/src/index.ts`
- `apps/relay/src/index.ts`
- `apps/lynttyd/src/index.ts`
- `packages/pi-extension/src/index.ts`
- `packages/client-core/src/index.ts`

Implemented:

- Protocol contract v0.1.0.
- Node/session/runtime/event/command envelopes.
- Relay auth/pairing/node presence scaffold.
- `lynttyd` session registry, runtime heartbeat, activation lock, queue state, worktree policy.
- Pi extension `/lyntty` registration smoke path.
- Headless Pi SDK probe imports `@earendil-works/pi-coding-agent` and checks key exports.
- Client-core event reducer, input semantics, evidence skeleton.

Missing vs product goal:

- Real `pi` SDK runtime start/resume loop.
- Android -> relay -> `lynttyd` -> Pi runtime command path.
- Runtime -> `lynttyd` -> relay -> Android structured event path.
- Redaction implementation/tests.
- Pi confirmation/approval mapping.
- Slash command capability discovery and local-only marking.
- Reconnect/backfill/idempotency/history_gap.
- Review Evidence UI.
- Notifications/previews/security hardening.

## Fork strategy options

### Option A: Replace current Lyntty with Lyntty fork

Pros:
- Faster path to polished app/daemon/server.
- Inherits web/mobile, push, voice, session spawn, remote session UX.

Cons:
- Need migrate current Lyntty docs/protocol decisions into Lyntty code.
- Lyntty product is broad multi-agent + E2E server sync; Lyntty PRD is Android-first, pi-first, self-host trusted relay, canonical Pi JSONL.
- Risk of losing `lynttyd` as explicit node-local authority.

### Option B: Keep current Lyntty scaffold, cherry-pick Lyntty patterns/code

Pros:
- Preserves confirmed PRD and M0-M2 evidence.
- Keeps `lynttyd`/Pi-first architecture clean.

Cons:
- More work to reach Lyntty-level polish.
- Need implement app/daemon/server features already solved upstream.

### Option C: Lyntty fork as runtime/app base, rebrand/narrow into Lyntty

Recommended.

Use Lyntty as upstream codebase, but preserve Lyntty architecture decisions:

- Add `pi` as first-class flavor.
- Add `lynttyd`-like local authority inside Lyntty CLI daemon or as sibling daemon.
- Keep Pi JSONL canonical.
- Keep current Lyntty protocol semantics where they are stricter: activation lock, history_gap, Review Evidence, local-only Pi extension boundary.
- Remove or hide non-Pi agents if product wants pi-perfect scope.

## Concrete Lyntty edit map for `pi`

CLI/daemon:

- Add `pi` command route in `packages/lyntty-cli/src/index.ts`.
- Add `runPi` under `packages/lyntty-cli/src/pi/runPi.ts`.
- Extend agent/flavor types:
  - `packages/lyntty-cli/src/agent/core/AgentBackend.ts`
  - `packages/lyntty-cli/src/utils/createSessionMetadata.ts`
  - `packages/lyntty-cli/src/modules/common/registerCommonHandlers.ts`
- Extend daemon spawn switch and tmux command construction:
  - `packages/lyntty-cli/src/daemon/run.ts`
  - `packages/lyntty-cli/src/daemon/controlServer.ts`
- Extend CLI detection:
  - `packages/lyntty-cli/src/utils/detectCLI.ts`
- Add Pi runtime adapter using Pi SDK:
  - start/resume/fork/import JSONL
  - `prompt` for idle input
  - `followUp` for queued context
  - `steer` for redirect
  - stop/interrupt/cancel mapping
  - event subscription to Lyntty message/events

App:

- Add `pi` agent type:
  - `packages/lyntty-app/sources/sync/persistence.ts`
  - `packages/lyntty-app/sources/sync/agentDefaults.ts`
  - `packages/lyntty-app/sources/app/(app)/new/index.tsx`
  - `packages/lyntty-app/sources/app/(app)/settings/agents.tsx`
  - `packages/lyntty-app/sources/components/modelModeOptions.ts`
  - `packages/lyntty-app/sources/components/AgentInput.tsx`
- Add Pi icon/text/translations.
- Add Pi permission/model/thinking options based on actual Pi runtime capabilities, not copied Claude/Codex modes.
- Add local-only slash command/capability UI.

Server:

- Basic support likely needs no schema change if Pi state fits encrypted metadata/messages.
- Schema change only if Pi needs new durable sync primitives beyond session/message/artifact/machine/KV.

## Main risks

1. Pi SDK event model may not map 1:1 to Lyntty `AgentMessage`; needs adapter contract before UI polish.
2. Pi interactive slash commands differ from headless prompt semantics; must avoid pretending `/model` etc work remotely.
3. Pi extension commands execute locally and immediately; remote queued follow-up cannot safely execute arbitrary extension commands.
4. Current Lyntty stores relay/daemon state in memory; Lyntty has richer persistence/server, but canonical Pi JSONL must stay node-local.
5. Lyntty E2E model may conflict with Lyntty's trusted self-host relay/redaction model. Need deliberate security stance.
6. Multiple surfaces controlling one Pi runtime require explicit activation lock/takeover, not naive concurrent sends.

## Grill-me first decision

Question 1: final architecture choose which base?

Recommended answer: **Lyntty fork as base, Lyntty product constraints as spec**. Do not continue current scaffold as final app. Port confirmed Lyntty M0-M2 concepts into Lyntty fork, then build `pi` flavor and `lynttyd`/Pi runtime authority there.
