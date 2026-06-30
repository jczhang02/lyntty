# Lyntty Roadmap (Lyntty-based)

Status: direction confirmed. Lyntty will be built from Lyntty because Lyntty is the OSS mobile-vibe product closest to the target: mobile remote control, lightweight sync, local agents keep running, phone supervises and sends intent.

This roadmap is implementation order, not a calendar plan. The immediate priority is not deletion or rewrite. First, explore Lyntty's full product and feature boundary, especially why Lyntty appears unable to discover historical sessions and what that means for Lyntty.

## Confirmed boundaries

- Codebase base: Lyntty.
- Final working tree: current repo `/home/jc/dev/lyntty`.
- Client scope: mobile only.
- Platform target: Android-first; iOS is best-effort and not an acceptance target.
- Runtime: only `pi`.
- Claude Code: remove product and runtime support.
- Other agents: Codex, Gemini, and OpenClaw are not product scope.
- Server: Lyntty relay becomes Lyntty `relay`; keep only pairing, presence, encrypted sync, WebSocket, and machine RPC required by Lyntty.
- Remove all non-Lyntty product surfaces: Lyntty SaaS, community/feed/social, voice, analytics, paid/usage product, browser client, and multi-agent UX.
- A generic provider seam may remain internally, but product has only one implementation: `pi`.

## Product vocabulary

Use these terms in docs, UI, and evidence:

- `pi`
- `lynttyd`
- `relay`
- `Sessions Home`
- `Node Management`
- `Session Remote`
- `Review Evidence`
- `active runtime`
- `activation lock`
- `history_gap`

Avoid defining the product as a terminal mirror, remote desktop, task board, agent dashboard, project manager, web client, or Lyntty SaaS.

## Roadmap principles

1. Explore Lyntty's full product/feature boundary before deleting.
2. Lyntty's mobile vibe is an asset; non-Lyntty product features are not.
3. Clean the current repo scaffold before removing unneeded Lyntty features.
4. Finish with deep `pi` support, including possible Pi features and plugins.
5. Historical session discovery is an upfront risk, not a late-stage detail.
6. Every phase leaves evidence: commands, results, not-run reasons, and risks.
7. Mock-only results cannot close real runtime milestones.
8. `relay` is not canonical history; node-local `pi` session/history is the recovery authority.
9. `Review Evidence` is inside `Session Remote`, not top-level navigation.

## R0 — Roadmap and Beads tracking

Goal: record the new Lyntty-based Lyntty sequence and persist multi-session work in Beads.

Scope:

- Document why Lyntty was selected: OSS mobile vibe and remote-control skeleton.
- Document the sequence: Explore Lyntty -> clean/delete -> perfect Pi support.
- Create Beads issues for the major phases so work survives compaction.
- Stop the old scaffold-first roadmap from driving implementation.

Exit criteria:

- This roadmap is accepted.
- Beads contains matching roadmap issues.
- Old M0-M2 scaffold is historical evidence, not final product code.

## R1 — Explore Lyntty full product and feature boundary

Goal: understand Lyntty's current product, features, and code boundary before deleting anything.

Scope:

- Product map: mobile app, web app, CLI, daemon, server, lyntty-agent, wire protocol.
- Feature map: session creation, machine pairing, presence, sync, RPC, artifacts, fork/resume, notifications, voice, community/feed, analytics, billing/usage, settings, agent defaults.
- UI map: mobile navigation, session screen, new session, machine screen, settings, connect flows, dev tools.
- Server map: auth/account, machine, session, message, artifact, KV, push, community/social, usage/analytics.
- Runtime map: Claude/Codex/Gemini/OpenClaw/ACP seams, process spawning, tmux, metadata, availability detection.
- Data boundary: what stays local, what enters relay/server, and what can be canonical recovery source.

Exit criteria:

- `docs/research/lyntty-product-boundary.md` exists.
- Every feature is marked keep / delete / rewrite / unknown.
- Lyntty mobile-vibe assets are identified.
- Deletion dependencies are known before code removal.

Non-goals: delete code; integrate Pi.

## R2 — Lyntty historical session discovery risk

Goal: verify whether Lyntty can discover historical sessions. If not, find why and design Lyntty's session discovery/recovery model.

Background: Lyntty appears unable to discover historical sessions. Lyntty must recover existing or previously run `pi` sessions, otherwise `Sessions Home`, reconnect, `history_gap`, and Review Evidence break.

Scope:

- Audit Lyntty session creation, resume, fork, metadata, server persistence, local daemon tracking, and machine reconnect.
- Confirm whether Lyntty only knows sessions created/registered through Lyntty.
- Confirm how session lists recover after daemon restart, machine reconnect, and server cache loss.
- Compare Pi local session JSONL / session manager / session directory.
- Design Lyntty discovery: scan local Pi sessions, import/register, dedupe, stale marking, history proof, `history_gap`.

Exit criteria:

- `docs/research/lyntty-session-discovery.md` exists.
- Clear conclusion: whether Lyntty natively discovers historical sessions.
- Lyntty session discovery design exists.
- Required session metadata fields are known before R3/R8.

Non-goals: complete discovery implementation.

## R3 — Clean current repo and import Lyntty base

Goal: make `/home/jc/dev/lyntty` the Lyntty-based monorepo, not the old scaffold or sibling prototype.

Scope:

- Stage preserved Lyntty decision assets, context, evidence, and Beads state.
- Delete old scaffold product code: current `apps/`, `packages/`, old Bun/TS scaffold config.
- Import the verified Lyntty-based worktree.
- Restore Lyntty docs/evidence.
- Keep git, beads, and agent context.

Exit criteria:

- Current repo has Lyntty monorepo package layout.
- Preserved docs/evidence are readable.
- Package install/typecheck baseline passes, or failures are recorded with clear blockers.
- Evidence is written under `docs/evidence/`.

Non-goals: remove every non-Lyntty Lyntty feature in one step.

## R4 — Delete non-Lyntty Lyntty product features

Goal: user-visible product becomes Lyntty mobile, not Lyntty.

Scope:

- Remove/replace Lyntty branding, Lyntty SaaS copy, and browser/web product narrative.
- Remove Claude Code connect flow, Claude icons, Claude copy, and Claude runtime product entry points.
- Remove Codex/Gemini/OpenClaw product entry points and multi-agent picker UX.
- Remove community/feed/social, voice, analytics, and paid/usage product entry points.
- Remove web/browser client product routes and deployment narrative.
- Rewrite server docs as `relay`.
- Keep low-level sync/RPC/daemon/session capabilities until dependency removal is safe.

Exit criteria:

- Product UI/docs mentions of `Lyntty`, `Claude Code`, `Codex`, `Gemini`, and `OpenClaw` exist only in archive/migration/vendor notes.
- Mobile navigation contains only Lyntty-scope pages.
- App/server/CLI typechecks remain runnable.

Non-goals: remove all deep dead code immediately; minimize schema.

## R5 — Lyntty mobile shell and product vibe

Goal: inherit Lyntty's strong mobile vibe while narrowing the product to Lyntty.

Scope:

- `Sessions Home`: Pi sessions, historical/active/disconnected state, recent activity.
- `Node Management`: node connection, health, permissions, diagnostics.
- `Session Remote`: structured feed, not terminal mirror.
- Mobile-first density, input feel, state clarity, low-noise feed.
- Remove web-first, SaaS-first, and multi-agent-first interaction assumptions.

Exit criteria:

- Mobile navigation information architecture is set.
- Android build passes.
- Smoke or screenshot evidence records main pages.
- No terminal passthrough, remote desktop, task board, or web-client product entry remains.

Non-goals: complete Pi runtime; complete Review Evidence.

## R6 — Pi-only runtime path

Goal: runtime mainline supports only `pi`.

Scope:

- Expose Lyntty/Pi CLI commands.
- Product daemon spawn path accepts only `pi`.
- Integrate Pi SDK runtime: `createAgentSessionRuntime()`, `prompt()`, `followUp()`, `steer()`, `abort()`, `subscribe()`.
- Remove or isolate Claude runner/protocol mapper/fork/resume/permission code.
- Keep generic seams only when they are invisible and simplify boundaries.
- Mark local-only slash commands and computer-side-only behavior.

Exit criteria:

- Real Pi SDK runtime creation smoke passes.
- Command path evidence exists: mobile/client intent -> relay -> daemon/`lynttyd` -> Pi runtime.
- Event path evidence exists: Pi runtime -> daemon/`lynttyd` -> relay -> mobile/client.
- Claude runtime cannot start through product paths.

Non-goals: complete Review Evidence; complete reconnect.

## R7 — Pi features and plugins support

Goal: Lyntty does more than send prompts. It correctly represents Pi features, plugins, extension commands, and UI boundaries.

Scope:

- `pi.getCommands()` / extension commands / prompt templates / skills discovery.
- local-only command marking.
- unsupported/computer-side-only confirmation.
- Pi tools/events mapping: message, thinking, tool start/update/end, command/log/error, file change, checks, artifacts.
- Pi extension UI boundary: custom UI, status, overlay, notifications, message renderer, editor component.
- Mobile proxies safe remote control only. It does not execute arbitrary shell or emulate local TUI.

Exit criteria:

- Tests cover command discovery, local-only blocking, unsupported slash handling, and event mapping.
- UI shows which capabilities can run remotely and which require the computer.
- Plugin/skill capabilities are not mistaken for trusted remote commands by relay.

Non-goals: recreate Pi TUI; remotely execute arbitrary local UI plugins.

## R8 — `lynttyd`, historical recovery, and control safety semantics

Goal: Lyntty daemon/session layer satisfies Lyntty runtime invariants and historical session recovery.

Scope:

- `lynttyd` is node-local authority, either as a Lyntty layer inside Lyntty daemon or a clear sibling process.
- `active runtime` lease.
- `activation lock`.
- explicit takeover: wait / stop / interrupt.
- command idempotency.
- node-local event cache / sequence.
- historical Pi session discovery/import/register.
- reconnect/backfill.
- `history_gap`.
- redaction before relay/client.

Exit criteria:

- Tests cover activation lock, takeover, duplicate command, local-only slash blocking, redaction, historical session import, and relay cache loss.
- Two active runtimes cannot advance one session.
- Duplicate remote command does not submit twice to Pi.
- If continuity cannot be proven, Lyntty emits/displays `history_gap`.

Non-goals: final UI polish.

## R9 — `Review Evidence`

Goal: users can judge what Pi did, whether evidence is enough, and what to do next.

Scope:

- `Review Evidence` is a mode/panel inside `Session Remote`.
- It consumes structured events and recovery state.
- changed files.
- diff summary.
- test/check results.
- command summary + expandable detail.
- errors.
- event timeline.
- artifact metadata / preview anchors.
- recovery state.
- next actions: ask follow-up, ask Pi to add tests/fix, open on computer, export evidence.

Exit criteria:

- Evidence reducer tests pass.
- Android UI smoke or explicit not-run reason exists.
- No merge/push/PR approval.
- No standalone Review Evidence main navigation.

Non-goals: mobile code editor; PR manager.

## R10 — Notifications / Preview / Android hardening

Goal: make Lyntty a daily-usable mobile product.

Scope:

- Android notifications: finished, failed, waiting confirmation, node disconnect.
- static HTML preview.
- jailed/read-only/tokenized live preview.
- WebView with no native bridge.
- mobile polish: touch targets, state labels, reduced motion, stable test ids.
- Maestro flows: lyntty path, failure, recovery, evidence.

Exit criteria:

- Android build passes.
- Preview security tests cover realpath jail, token expiry, path traversal rejection, read-only enforcement, and no native bridge.
- Physical Android smoke or explicit not-run reason.
- Evidence docs are complete.

Non-goals: App Store release; iOS acceptance; unrestricted dev-server tunneling.

## Cross-phase gates

Before closing any phase, answer:

- Was Lyntty explored before deletion?
- Is it still mobile-only / Android-first / `pi`-only?
- Did it preserve the Lyntty mobile vibe worth inheriting?
- Were non-Lyntty product surfaces removed, or marked temporary implementation debt?
- Did it avoid terminal mirror, remote desktop, task board, agent dashboard, and web client behavior?
- Was historical session discovery/recovery risk validated?
- Is there real runtime evidence, not mock-only evidence?
- Are commands, results, not-run reasons, and risks recorded?

## Evidence template

Create one record under `docs/evidence/` per phase:

```md
# <phase> Evidence

Date:
Branch/commit:

## Scope

## Changed files

## Commands run

## Results

## Not run

## Risks / next work
```
