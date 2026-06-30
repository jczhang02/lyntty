# Lyntty Product Boundary Research

Date: 2026-06-30

Scope: Lyntty source in `/home/jc/dev/lyntty-lyntty-pi` after H0-H3 Pi migration experiments.

Purpose: map Lyntty's complete product/function boundary before deleting anything. Lyntty is based on Lyntty because Lyntty has the desired OSS mobile vibe: mobile-first remote control, light sync, local machine keeps running agents, phone supervises and sends intent. This document marks each major Lyntty surface as `keep`, `delete`, `rewrite`, or `unknown` for Lyntty.

## Summary

Lyntty has strong reusable foundations:

- Expo mobile shell with polished session list, session view, composer, settings, device restore, machine details, and visual assets.
- CLI/daemon that can register machines, spawn and track sessions, keep machine/session presence, and bridge mobile/server to local processes.
- Server relay with public-key auth, encrypted sessions/messages/machines, WebSocket updates, machine RPC, optimistic concurrency, and sequence numbers.
- Control-plane CLI (`lyntty-agent`) useful for smoke testing machine/session workflows.

Lyntty also has many product surfaces outside Lyntty:

- Web/browser client and Tauri/desktop assumptions.
- Multi-agent product UX: Claude, Codex, Gemini, OpenClaw, ACP.
- Lyntty SaaS branding and account/social/community/feed features.
- Voice/realtime assistant, RevenueCat/paywall, analytics/usage product, GitHub/vendor token integrations.
- Claude-specific runtime/protocol/fork/resume logic.

Main deletion rule: delete product surfaces first, then deep code. The sync/RPC/session foundation is cross-cutting; route-only deletion will break storage/realtime unless done by feature slice.

## Package map

| Package | Role | Lyntty classification | Notes |
|---|---|---|---|
| `packages/lyntty-app` | Expo mobile/web client | rewrite | Keep mobile vibe and core session UX; delete web/SaaS/social/voice/multi-agent product surfaces. |
| `packages/lyntty-cli` | CLI, daemon, agent runners | rewrite | Keep daemon/session/RPC/Pi path; remove Claude/Codex/Gemini/OpenClaw product runtimes from mainline. |
| `packages/lyntty-relay` | Sync backend | rewrite | Becomes Lyntty `relay`; keep auth/sessions/machines/messages/RPC/presence; delete social/voice/vendor/usage product. |
| `packages/lyntty-agent` | Remote control CLI | keep/rewrite | Useful smoke/control-plane tool; restrict agent support to `pi`. |
| `packages/lyntty-wire` | Shared wire schemas | keep/rewrite | Keep encrypted update schemas; resolve session protocol warning/drift before committing Lyntty protocol. |
| `packages/lyntty-app-logs` | App logs viewer | unknown | Useful during migration only if logs remain. |
| `packages/codium` | Dev/codium package | unknown/delete | Not Lyntty product scope unless proven needed. |

Root evidence: `/home/jc/dev/lyntty-lyntty-pi/package.json` workspaces.

## Product/UI boundary

Evidence roots:

- `packages/lyntty-app/sources/app/_layout.tsx`
- `packages/lyntty-app/sources/app/(app)/_layout.tsx`
- `packages/lyntty-app/sources/app/(app)/index.tsx`
- `packages/lyntty-app/sources/components/MainView.tsx`
- `packages/lyntty-app/sources/components/TabBar.tsx`
- `packages/lyntty-app/sources/-session/SessionView.tsx`
- `packages/lyntty-app/sources/components/AgentInput.tsx`
- `packages/lyntty-app/sources/app/(app)/new/index.tsx`
- `packages/lyntty-app/sources/app/(app)/machine/[id].tsx`
- `packages/lyntty-app/sources/components/SettingsView.tsx`

| Surface | Current behavior | Lyntty classification | Dependency/risk |
|---|---|---|---|
| Root Expo shell/providers | Auth, sync restore, realtime, PostHog, notifications, command palette, Tauri/web shortcuts, tablet sidebar | rewrite | Highly coupled to auth/sync/realtime/storage/theme. Replace gradually. |
| Main tabs | Inbox, Sessions, Settings | rewrite | Sessions/settings useful; Inbox/social delete. |
| Sessions list | Active/recent sessions from sync storage | keep/rewrite | Core `Sessions Home`; depends on Lyntty session metadata schema. |
| Session view/chat | Chat/feed, tool rendering, composer, attachments, voice entry, goal bar, abort/actions | keep/rewrite | Core `Session Remote`; remove voice/multi-agent assumptions. |
| File/diff panels | Files changed, diffs, file viewer | keep | Valuable coding-agent mobile affordance; integrate into `Review Evidence`. |
| New session composer | Machine/path/worktree/agent/model/effort/permission selection; spawn via machine RPC | keep/rewrite | Core flow; agent/model/permission must become Pi/Lyntty semantics. |
| Machine detail | Machine status, stop daemon, recent sessions/paths, inline spawn | keep/rewrite | Becomes `Node Management`; ops endpoints need Lyntty semantics. |
| Terminal connect / restore | QR/manual device/account linking | rewrite | Keep if used for pairing; security-sensitive. |
| Settings basics | Profile/logo, connect terminal, support/paywall, services, machines, features, dev, about | rewrite | Remove brand/paywall/social/vendor; keep theme/language/node diagnostics. |
| Appearance/language/features | Theme, locale, experiments | keep/rewrite | Keep UX foundation; remove Lyntty experiment flags. |
| Dev screens | Logs/demos/purchases/QR/typography/colors | keep partial/delete | Keep logs/device/colors temporarily; delete purchases/social demos. |
| Artifacts UI | Artifact list/view/new/edit | unknown | Could support previews/artifacts; defer until R9/R10 decision. |
| Changelog/update banner | Local changelog and update banner | rewrite | Keep mechanism if useful; replace content/brand. |
| Friends/social/inbox/feed | Friend requests, user search, feed/inbox | delete | Non-Lyntty product; remove tab/routes/storage/API sync. |
| Voice assistant | ElevenLabs/LiveKit realtime voice, settings, status bar | delete | Non-Lyntty; heavy dependencies and paywall coupling. |
| Paywall/subscriptions | RevenueCat, pro entitlement, support/paywall UI | delete | Non-Lyntty unless future business decision changes. |
| Connected services | GitHub OAuth, Claude connect page, vendor token UI | delete/rewrite | Claude delete; GitHub only if needed for repo identity later. |
| Analytics | PostHog events across auth/sessions/messages/paywall/friends | rewrite/delete | Keep minimal self-host telemetry only if explicitly desired. |
| Web/Tauri/Desktop | Expo web, Tauri scripts, web forks, desktop/sidebar assumptions | delete as product; keep temporarily as build scaffolding if needed | Mobile-only target, but deleting platform forks may break build. |
| Visual assets | IBM Plex fonts, brutalist icons, gradients, animations | keep curated subset | Lyntty-branded logos/icons must be replaced; mobile vibe assets are valuable. |

Mobile-vibe assets to preserve initially:

- `packages/lyntty-app/sources/assets/fonts/IBMPlexSans-*`
- `packages/lyntty-app/sources/assets/fonts/IBMPlexMono-*`
- `packages/lyntty-app/sources/assets/fonts/BricolageGrotesque-Bold.ttf`
- `packages/lyntty-app/sources/assets/images/brutalist/*`
- `packages/lyntty-app/sources/assets/images/gradients/*`
- `packages/lyntty-app/sources/assets/animations/*.json`

## Server / relay boundary

Evidence roots:

- `packages/lyntty-relay/sources/main.ts`
- `packages/lyntty-relay/sources/app/api/api.ts`
- `packages/lyntty-relay/sources/app/api/socket.ts`
- `packages/lyntty-relay/sources/app/events/eventRouter.ts`
- `packages/lyntty-relay/sources/app/api/routes/*`
- `packages/lyntty-relay/prisma/schema.prisma`
- `docs/backend-architecture.md`
- `docs/protocol.md`
- `docs/encryption.md`

### Keep / rewrite as Lyntty relay

| Surface | Classification | Notes |
|---|---|---|
| Fastify API + Socket.IO shell | keep | Good relay base. Socket path `/v1/updates`; scopes user/session/machine. |
| Public-key auth + Bearer tokens | keep/rewrite | Useful passwordless identity; rename `HANDY_*`/Lyntty terms. |
| Account `seq` and update ordering | keep | Per-user monotonic update counter helps reconnect. |
| Sessions and messages | keep/rewrite | Core encrypted session sync. `SessionMessage.localId` gives idempotency. |
| v3 session messages | keep | Pagination/batch send/idempotency useful. Docs drift: not fully in `docs/api.md`. |
| Machines | keep/rewrite | Core daemon/node registry and presence. |
| WebSocket persistent updates | keep/rewrite | Keep durable updates; remove social/feed event types. |
| Ephemeral presence | keep subset | Keep `activity`, `machine-activity`, `machine-status`; delete/rewrite `usage`. |
| Machine RPC | keep/rewrite security | Core remote daemon call primitive; method namespace needs Lyntty authorization/scoping. |
| Transactions/sequence storage | keep | `inTx`, serializable retries, `afterTx`, sequence allocation useful. |
| Metrics/health | keep/rewrite labels | Useful ops surface. |

### Delete from Lyntty relay product

| Surface | Evidence | Reason |
|---|---|---|
| Social/friends/feed/users search | `routes/userRoutes.ts`, `routes/feedRoutes.ts`, `app/feed/*`, `app/social/*`, `UserRelationship`, `UserFeedItem` | Non-Lyntty community product. |
| GitHub/vendor token integration | `routes/connectRoutes.ts`, `app/github/*`, `ServiceAccountToken`, `GithubUser`, `GithubOrganization` | Non-core relay; external service coupling. |
| Voice | `routes/voiceRoutes.ts`, `VoiceConversation` | Non-Lyntty product. |
| Usage analytics/product | `UsageReport`, socket `usageHandler.ts` | Product/billing surface; not relay core. |
| Dev logging route | `routes/devRoutes.ts` | Dev-only Lyntty surface. |
| Avatar/profile uploads | `UploadedFile`, storage image paths | Delete unless Lyntty needs profile/avatar. |

### Unknown / decide later

| Surface | Classification | Decision needed |
|---|---|---|
| Push tokens / push-event | unknown | Needed for R10 notifications; keep temporarily. |
| Artifacts | unknown | Useful for previews/evidence, but large sync surface. Decide near Review Evidence/Preview. |
| Attachments | unknown | Useful for image/file prompts; S3/MinIO dependency. |
| KV store | unknown/rewrite | Generic encrypted sync primitive; keys leak metadata. |
| AccessKey | unknown/likely keep | Needed if retaining E2EE per-session-per-machine grants. |

Server risks:

- Redis required for multi-process Socket.IO/RPC correctness.
- RPC authorization is mostly account-bound plus free-form method names; Lyntty needs namespace policy.
- Docs drift: `delete-machine`, `session-event`, v3 message routes, and attachment routes are implemented but not fully reflected in docs.
- E2EE is client-heavy; mobile/daemon must implement encryption exactly.
- Presence cache is in-memory with timeout behavior; multi-instance semantics need verification.
- `HANDY_MASTER_SECRET` and privacy-kit service names leak Lyntty/Handy naming.

## CLI / daemon / runtime boundary

Evidence roots:

- `packages/lyntty-cli/src/index.ts`
- `packages/lyntty-cli/src/daemon/run.ts`
- `packages/lyntty-cli/src/daemon/controlServer.ts`
- `packages/lyntty-cli/src/daemon/controlClient.ts`
- `packages/lyntty-cli/src/modules/common/registerCommonHandlers.ts`
- `packages/lyntty-cli/src/utils/createSessionMetadata.ts`
- `packages/lyntty-cli/src/utils/detectCLI.ts`
- `packages/lyntty-cli/src/pi/*`
- `packages/lyntty-cli/src/claude/*`
- `packages/lyntty-cli/src/codex/*`
- `packages/lyntty-cli/src/gemini/*`
- `packages/lyntty-cli/src/openclaw/*`
- `packages/lyntty-agent/src/*`
- `packages/lyntty-wire/src/*`
- `docs/cli-architecture.md`

### Keep / rewrite

| Surface | Classification | Notes |
|---|---|---|
| Daemon concept | keep/rewrite | Machine registration, session spawn/tracking, presence, RPC handler are core. Current `run.ts` is large and should become smaller modules. |
| Local control server | keep/rewrite | `127.0.0.1` IPC for list/spawn/stop/session-started. Add nonce/token if threat model requires. |
| Session tracking map + webhook | keep/rewrite | Needed for machine/node state; clarify persisted finished-session semantics. |
| Machine metadata | keep/rewrite | Host/platform/version/home/homeDir/cliAvailability/resumeSupport useful; rename Lyntty paths. |
| Spawn/session options | keep/rewrite | Keep directory/session/env concepts; restrict product agent to `pi`. |
| Pi runtime path | keep | `src/pi/runPi.ts`, `runPiControl.ts`, `runPiEvents.ts` are current Lyntty target. |
| Activation lock | keep | `src/daemon/activationLock.ts` matches Lyntty `active runtime` safety direction. |
| tmux support | unknown/keep concept | Useful observability, but command-string quoting risk. |
| `lyntty-agent` control CLI | keep/rewrite | Great smoke tool for machine/session/history/spawn/resume/send/wait; restrict agent list to `pi`. |
| `lyntty-wire` encrypted update schemas | keep/rewrite | Useful schema package. Resolve `sessionProtocol.ts` warning before blessing protocol. |

### Delete / isolate from product

| Surface | Classification | Notes |
|---|---|---|
| Default `lyntty` / `lyntty claude` path | delete | Claude Code not product/runtime support. |
| Claude runner/SDK/protocol/fork/permission | delete/reference only | Contains useful JSONL scan/backfill ideas but should not remain product runtime. |
| Codex runner/app-server path | delete/reference only | Non-Lyntty runtime. |
| Gemini/ACP/OpenClaw runtimes | delete/reference only | Non-Lyntty product unless later explicit decision. |
| Gemini model/project config in CLI router | delete | External product side effect. |
| `notify`, `server`, old Lyntty-specific commands | unknown/delete | Keep only if serving Lyntty relay/dev workflow. |
| Remote `bash`/`writeFile` RPC tools | rewrite/gate | Dangerous if exposed; needs Lyntty permission model. |

### Runtime and session risks

- `src/index.ts` is a monolithic router mixing product commands, config writes, and agent dispatch. Lyntty should move to a typed command registry.
- Daemon combines self-restart, lock, persisted sessions, remote RPC, tmux, and activation lock in one file.
- Remote tool surface (`bash`, `writeFile`) is powerful; Lyntty mobile must not become arbitrary shell passthrough.
- Resume support relies on encrypted local state and metadata; old sessions may fail without stored encryption keys.
- `lyntty-wire/src/sessionProtocol.ts` says “UNDER REVIEW” and “not used in production,” but Pi/Codex/OpenClaw paths use session envelopes. Lyntty must either bless a protocol or replace it with Pi-native envelopes.

## Historical session discovery risk

R1 finding: historical session discovery is a first-class risk.

Evidence hints:

- Server persists `Session` and `SessionMessage`, so Lyntty can list sessions known to server.
- Daemon tracks live children in memory and records some finished sessions on disk.
- CLI `lyntty resume <prefix>` resolves Lyntty session records and requires local auth/encryption state.
- Existing Claude/Codex paths have provider-specific resume/fork/backfill code, but Pi support is not equivalent yet.
- Lyntty likely knows sessions that were created/registered through Lyntty; whether it can discover arbitrary historical local sessions after daemon restart or outside-Lyntty execution remains unproven.

R2 must answer:

1. Can Lyntty discover sessions created outside Lyntty?
2. Can Lyntty recover session list after daemon restart without server being canonical history?
3. Which metadata/encryption fields are required to resume/decrypt old sessions?
4. How should Lyntty scan/import/register historical Pi sessions from local Pi session directories/JSONL?
5. When continuity cannot be proven, where does Lyntty emit `history_gap`?

## Keep / delete / rewrite / unknown index

### Keep

- Mobile visual vibe assets: curated fonts, brutalist icons, gradients, animations.
- Sessions list concept.
- Session view concept.
- File/diff panels concept.
- Machine/node detail concept.
- Fastify + Socket.IO relay shell.
- Public-key auth concept.
- Encrypted session/message/machine sync.
- WebSocket persistent updates and sequence ordering.
- Machine RPC concept.
- Daemon machine/session/spawn concept.
- Pi runtime path and event/control modules.
- Activation lock concept.
- `lyntty-agent` as smoke/control tool.

### Delete

- Lyntty SaaS/branding/product narrative.
- Browser/web client as product.
- Inbox/friends/social/feed/community.
- Voice/realtime assistant.
- RevenueCat/paywall/pro entitlement surfaces.
- Analytics/usage product surfaces unless a later explicit decision keeps minimal telemetry.
- Claude Code product and runtime support.
- Codex/Gemini/OpenClaw product and runtime support.
- GitHub/vendor token integrations unless later needed.

### Rewrite

- App shell/navigation into Lyntty mobile-only IA.
- Settings into Lyntty settings.
- New session composer into Pi session creation/import.
- Machine detail into `Node Management`.
- Server naming/schema docs into `relay`.
- CLI router into Lyntty command registry.
- Daemon into smaller Lyntty modules.
- Permission model for remote commands/tools.
- Session protocol around Pi events and `Review Evidence`.

### Unknown

- Push tokens: likely needed for notifications, decide R10.
- Artifacts: likely useful for preview/evidence, decide R9/R10.
- Attachments: decide when Pi image/file prompt support is scoped.
- KV store: useful generic sync, but metadata leak and product semantics unclear.
- Access keys: keep if E2EE multi-machine grant model remains.
- tmux: useful local observability, but security/quoting concerns.
- `lyntty-app-logs` and `codium`: keep only if proven useful.

## Recommended deletion order after R2/R3

1. Remove visible product navigation first: inbox/friends/social/feed/voice/paywall/web/SaaS/multi-agent routes.
2. Remove UI calls/hooks/storage readers for those routes.
3. Remove server routes/events/models for deleted product features.
4. Remove runtime commands and agent runners not used by Pi.
5. Remove dependencies after typecheck confirms no references.
6. Rename Lyntty/Handy package/config/env/docs once product behavior is stable.

## R1 exit status

This document satisfies the R1 research acceptance criteria:

- Feature surfaces are classified as keep/delete/rewrite/unknown.
- Lyntty mobile-vibe assets are identified.
- Deletion dependencies and risks are called out.
- Historical session discovery is flagged as R2 blocker before cleanup/import.
