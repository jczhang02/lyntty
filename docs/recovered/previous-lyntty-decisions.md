# Recovered Lyntty Decisions

Source: `/home/jc/.local/share/Trash/files/lyntty` recovered on 2026-06-22.

This file summarizes prior product, grill, design, ADR, and gate decisions from the deleted Lyntty repo. It is not a full restore of the deleted repo.

## Product Purpose

Lyntty is a single-user, self-hosted remote-control surface for pi agent sessions.

It is a supervisory control plane for real agent work, not a terminal mirror, chat app, task manager, generic dashboard, or phone IDE.

Core principle: session is core; control surfaces are entries.

The phone provides entry, supervision, approval, interruption, evidence review, and follow-up control. Real work runs in the active pi runtime on a paired node.

## Primary User

Primary user is JC and similar local developers who run pi on one or more trusted computers and want to supervise sessions from an Android phone.

Primary situations:

- check which node/session needs attention away from desk;
- continue, steer, approve, abort, or inspect running pi session;
- start bounded remote task on paired node;
- review evidence: status, commands, logs, diffs, tests, next-step prompts;
- recover from stale, offline, or revoked device states without exposing relay/token mechanics in daily UI.

## Brand / UX Direction

Brand personality: calm cockpit.

- controlled, reliable, precise;
- quiet confidence, not automation theater;
- dense enough for technical supervision, not crowded;
- human-readable states over protocol jargon;
- evidence-first: important claims need visible status or inspectable detail;
- one-hand Android ergonomics: stable primary actions, predictable drilldowns, no hidden critical controls.

## Anti-References

Do not make Lyntty feel like:

- terminal mirror;
- task manager/backlog board;
- pure chat app;
- permanent setup dashboard;
- flashy dashboard;
- multi-agent theater with avatars/personas/unsupported claims.

## Grill Decision: Home Hierarchy

Recommended primary model from prior grill prep:

1. Paired nodes / Node Management.
2. Attention-first Global Inbox.
3. Session Remote.
4. Review Evidence.
5. Settings / pairing recovery.

Rejected models:

- task workbench;
- pure chat + evidence drawer;
- debug console as product UI.

Reason:

- Node/computer is pairing object user cares about: ThinkPad, Mac Studio, lab desktop.
- Session/runtime is current protocol truth.
- Attention state determines whether phone interaction is useful.
- Task labels can be derived later from session name/goal.
- Chat/composer is a session action, not whole product.
- Connection details belong in onboarding/settings/recovery.

## Node Management Decision

Node Management is a stable page for paired computers.

It should show:

- node name;
- online/offline/stale state;
- last heartbeat;
- default root/workspace;
- trust/revocation state.

It must not show:

- per-session attention;
- active-session previews;
- waiting-input labels;
- diff/test evidence;
- next-step prompts.

Add node flow:

- explicit desktop pairing mode, e.g. run `lyntty pair`;
- scan QR or enter short pairing code;
- relay URL, owner token, and device binding hidden behind QR/manual recovery, not daily copy.

Layout constraint:

- Node Management must not become one long scroll that pushes Add Node off-screen.
- Header/context and add/recovery actions stay reachable.
- Paired-node collection uses bounded internal scroll.

## Global Inbox Decision

Global Inbox answers: do I need to do anything?

Priority:

1. needs-attention sessions;
2. running sessions;
3. node list/status;
4. new session and node-management actions.

Needs-attention examples:

- waiting input;
- failed test;
- command rejected;
- history gap;
- relay/node disconnected;
- local confirm needed.

## Session Remote Decision

Session Remote is main cockpit for one active session/runtime.

Recommended surface:

- repo + runtime state + relay chip;
- now strip: current action, elapsed time, last event;
- composer: next instruction primary, steer/follow-up secondary;
- abort/interrupt behind confirmation;
- evidence stack: diff, tests, commands, logs, events collapsed by default;
- recovery/action card inline when waiting/failed/history_gap.

## Review Evidence Decision

Result state gets review mode.

Review shows:

- changed files;
- test results;
- risks;
- diff/test/command/log/event detail;
- follow-up action;
- accept locally/open on laptop/export evidence.

No merge/push behavior unless future scope explicitly adds it.

## Runtime / Session Decisions

- Native pi session can be controlled after `/lyntty` enables remote control.
- Android-created/restored session uses `lynttyd` and pi SDK runtime.
- Same session cannot have two active runtimes.
- Multiple surfaces may control same active runtime.
- Use relay lease + runtime heartbeat + stale state + explicit takeover.
- Busy runtime requires explicit interrupt/stop/wait decision.
- UI language: “Activate here”, “Release runtime”, “Currently active on node X”; avoid “owner handoff”.

## Input Decisions

Pi-compatible composer:

- runtime idle: send normal prompt;
- runtime running: default send `steer`;
- explicit follow-up action/button/long-press for queued next-turn input;
- abort/interrupt where supported;
- command source visible in event feed.

Slash command strategy:

- probe runtime command capabilities where possible;
- mark local-only commands as requiring computer-side pi;
- unknown slash command may be sent raw to pi as fallback;
- remote-safe candidates: `/compact`, `/clear`, `/context`, `/usage`, `/exit`, `/recap`, `/name`.

## Event / History Decisions

- Full event stream with collapse/filter UI.
- Preserve raw-ish events, but mobile defaults to collapsed summaries.
- Event categories include lifecycle, user input, assistant deltas, tools, approvals, model/thinking, slash commands, queue/capacity, activation lock, diff/artifact/preview, push, errors, reconnect, history gaps.
- Pi JSONL is canonical history.
- Relay stores metadata/cache/queue only, not canonical session history.
- `lynttyd` allocates monotonic per-session `seq`.
- Reconnect uses last seen `seq`; duplicates handled client-side.
- If continuity cannot be proven, emit `history_gap`.

## Auth / Security Decisions

- Owner token once, then persistent device token.
- Device token stored in encrypted Android storage.
- Device revocation supported from Android settings and CLI.
- Nodes use node tokens generated by CLI/config.
- TLS required in production.
- Basic redaction before events leave node: common API keys, secret env values, private key blocks, auth headers.
- No E2E encryption in v0.
- Phone is trusted self-host surface, not zero-trust boundary.

## Notification Decisions

Android v0 uses FCM.

Triggers:

- agent run finishes;
- runtime waits for input;
- remote-servable approval/request appears;
- native local-only confirmation blocks progress;
- runtime errors/fails;
- node disconnects/reconnects;
- queued session starts or blocks.

No Telegram/ntfy/Discord in v0. Web Push not v0 product target.

## Diff / Artifact / Preview Decisions

Android v0 should show:

- changed files;
- git diff summary and per-file diff;
- generated artifact links/previews;
- static HTML artifact preview;
- minimal live dev-server preview;
- image/text artifact preview;
- worktree cleanup state.

Constraints:

- preview is read-only;
- workspace jail with realpath checks;
- short-lived token URLs;
- relay proxies bytes but does not store files;
- Android WebView disables file/content access;
- no native bridge for prototypes.

## Worktree / Capacity Decisions

- New Android-created session in git repo defaults to worktree-if-git.
- Non-git fallback is same directory.
- Worktree path predictable, e.g. `.lyntty/worktrees/<session-slug>`.
- Never auto-delete dirty worktree.
- Node capacity configurable, default 3.
- If capacity full, new/restore request enters visible queue.

## Tech Stack Decisions From Old Repo

Backend/node:

- Bun runtime/package manager.
- Hono relay/API.
- WebSocket realtime.
- SQLite WAL + JSONL.
- Prepared/static SQL discipline.
- pi extension for native session control.
- pi SDK `AgentSessionRuntime` for headless sessions.

Android v0 product client:

- Kotlin + Jetpack Compose + Material 3.
- Lean multi-module app.
- OkHttp + Kotlinx Serialization.
- Room/DataStore as needed.
- Firebase Messaging.
- WebView preview.
- Maestro E2E.

v0.3 dogfood exception:

- Add bounded Expo + HeroUI Native Android dogfood client under `apps/client/`.
- Preserve Kotlin `apps/android/`; do not delete/rewrite it.
- Extract UI-free shared TS behavior to `packages/client-core/`.
- Web/PWA is not v0.3 acceptance.

## ADR 0001 Summary

Accepted v0.3 decision:

- `apps/client/` is v0.3 dogfood control client, not product web/PWA client.
- `packages/client-core/` must not depend on React Native, Expo SecureStore, or HeroUI Native.
- Expo app owns SecureStore, platform URLs, React Native WebSocket behavior.
- Canonical history stays in Pi JSONL on node.
- Native pi extension remains local-only: extension -> local `lynttyd`; only `lynttyd` connects to relay.
- One active runtime per session via activation lock/relay lease.
- No extra lyntty risk gate; native pi confirmations remain computer-side when pi requires them.
- Public access is preview tunnel, not production deployment.
- Tunnel URL alone is never auth.
- Final evidence must prove Kotlin app preserved and physical phone status recorded.

## Old Milestone Status

Old deleted repo had substantial implementation and docs:

- v0.1 real-alpha completed as unreleased technical gate.
- v0.2 dogfood-local completed.
- v0.3 HeroUI Native dogfood gate passed for emulator/public-preview/native-smoke scope on 2026-06-09.
- Physical phone not run because no physical Android device was attached.
- Old git state: branch `main` was 16 commits ahead of old `origin/main`, with many uncommitted v0.3 files.

Important old evidence:

- `bun run check` passed.
- Expo debug APK built.
- Maestro emulator smoke and dogfood flows passed.
- Native `/lyntty` real-task smoke edited fixture and ran Bun test.
- Public tunnel preview smoke passed with auth/binding required and debug route blocked.

## Current PRD Conflict Notes

Current fresh PRD says web/PWA + Android APK and broad multi-agent control. Old decisions are narrower:

- v0 is Android-first, not product PWA/web.
- debug web is developer tooling only.
- pi-first runtime is primary; adapters for Codex/OpenCode are future extension points.
- product should avoid multi-agent theater.

Need explicit decision: keep current broader PRD as new direction, or use recovered old decisions to constrain v0 and revise issue #1.
