# Lyntty Fork Pi Plan

日期：2026-06-30

## 已压实决策

1. Codebase base: **Lyntty fork**.
2. Product spec: **Lyntty constraints win**.
3. Scope: **Pi-only UI, keep hidden agent-flavor seam**.

Why Pi-only: `docs/contexts/product/CONTEXT.md` and `docs/roadmap.md` define Lyntty as Android-first, pi-first. Product web client, multi-agent UX, terminal mirror, remote desktop, task board, PR manager, and SaaS are out of current scope.

## Architecture stance

Use Lyntty as implementation base, but keep Lyntty domain model:

- `pi` is only visible runtime.
- `lynttyd` remains node-local authority.
- `relay` routes/authenticates/caches but is not canonical history.
- canonical history remains local `pi` JSONL.
- one session has one `active runtime`.
- activation takeover requires explicit stop/wait/interrupt.
- reconnect must prove continuity or emit `history_gap`.
- `Review Evidence` stays inside `Session Remote`.

## Lyntty import strategy

Preferred local strategy:

1. Keep current repo docs, evidence, and issue context.
2. Import Lyntty monorepo source into a migration branch or sibling worktree, not overwrite current tree blindly.
3. Rename/re-scope packages after first green build.
4. Add `pi` flavor behind Lyntty's existing agent seam.
5. Hide/remove non-Pi UI surfaces only after Pi smoke passes.

Destructive replacement of current repo root is blocked until explicitly approved.

## Implementation slices

### H0 — Lyntty base boots locally

Goal: Lyntty source builds in Lyntty workspace branch with no Pi changes.

Actions:

- create migration branch/worktree.
- copy or merge Lyntty source.
- preserve these Lyntty docs:
  - `CONTEXT-MAP.md`
  - `docs/contexts/product/CONTEXT.md`
  - `docs/roadmap.md`
  - `docs/evidence/m0-m2.md`
  - `docs/research/lyntty-pi-agent.md`
  - this plan.
- run Lyntty install/build/test commands.
- record evidence and upstream commit SHA.

Exit evidence:

- package install works.
- app/cli/server packages typecheck or build.
- changed files recorded.

### H1 — Pi flavor exists but uses stub runtime

Goal: Lyntty app/CLI recognizes `pi`, spawns a stub session, and no visible non-Pi choice appears in app.

Likely Lyntty files:

- `packages/lyntty-cli/src/index.ts`
- `packages/lyntty-cli/src/daemon/run.ts`
- `packages/lyntty-cli/src/daemon/controlServer.ts`
- `packages/lyntty-cli/src/utils/createSessionMetadata.ts`
- `packages/lyntty-cli/src/modules/common/registerCommonHandlers.ts`
- `packages/lyntty-cli/src/utils/detectCLI.ts`
- `packages/lyntty-app/sources/sync/persistence.ts`
- `packages/lyntty-app/sources/sync/agentDefaults.ts`
- `packages/lyntty-app/sources/app/(app)/new/index.tsx`
- `packages/lyntty-app/sources/app/(app)/settings/agents.tsx`
- `packages/lyntty-app/sources/components/modelModeOptions.ts`
- `packages/lyntty-app/sources/components/AgentInput.tsx`

Exit evidence:

- `lyntty pi` or `lyntty pi` command exists.
- New Session creates Pi-flavored session.
- UI shows Pi-only route/labels.
- non-Pi agents hidden from product UX.

### H2 — Real Pi SDK runtime adapter

Goal: daemon can start/resume a real Pi runtime and send commands.

Required Pi surfaces:

- `createAgentSessionRuntime()`
- `runtime.newSession()` / `switchSession()` / `fork()` / `importFromJsonl()`
- `session.prompt()` for idle input
- `session.followUp()` for running next-turn context
- `session.steer()` for explicit redirect
- `session.subscribe()` for events
- re-`bindExtensions()` after replacement

Exit evidence:

- command path smoke: Android/web client -> relay/server -> daemon/`lynttyd` -> real Pi runtime.
- event path smoke: Pi runtime -> daemon/`lynttyd` -> relay/server -> client.
- native `/lyntty` session can be observed.
- no mock-only completion.

### H3 — Lyntty safety semantics

Goal: imported Lyntty base obeys Lyntty runtime/control invariants.

Actions:

- add activation lock and explicit takeover.
- add stop/wait/interrupt states.
- add node-local sequence allocation.
- add command idempotency.
- add reconnect/backfill.
- emit `history_gap` when continuity cannot be proven.
- redact command/log/error payloads before relay/client.
- mark local-only Pi extension commands.

Exit evidence:

- tests cover activation lock, takeover, duplicate/out-of-order events, relay cache loss, node-local recovery, redaction, local-only slash commands.

### H4 — Session Remote + Review Evidence

Goal: Lyntty app UX becomes Lyntty `Session Remote`.

Actions:

- build structured feed cards, not terminal mirror.
- implement idle/follow-up/redirect input semantics.
- show Pi confirmations near composer.
- add `Review Evidence` panel from structured events.
- exclude merge/push/PR approval/mobile editor.

Exit evidence:

- emulator/Maestro or explicit not-run reason.
- evidence reducer tests.
- Android build passes.

### H5 — Notifications/previews/hardening

Goal: daily-usable Android Pi control.

Actions:

- notifications for finished/failed/waiting/confirmation/node disconnect.
- static HTML preview.
- jailed read-only tokenized live preview.
- WebView-safe no native bridge.
- Maestro lyntty/failure/recovery/evidence flows.

## Grill blockers

### Q3 — migration shape

Recommended answer: **create migration branch/worktree and import Lyntty there; do not overwrite current repo root in-place**.

Reason: current repo has verified M0-M2 evidence, docs, and issue context. Direct overwrite risks losing traceability and makes rollback harder.

Options:

- `worktree branch` — safest for invasive import.
- `in-place replace` — fastest, but risky and needs explicit approval.
- `sibling repo` — good exploration, slower final integration.

## Immediate next command after Q3

If `worktree branch` approved:

```bash
git worktree add ../lyntty-lyntty-pi -b lyntty-pi-migration
rsync -a --delete --exclude .git /tmp/lyntty-lyntty-research/ ../lyntty-lyntty-pi/
```

Then restore/preserve Lyntty docs into the branch and run Lyntty build checks.
