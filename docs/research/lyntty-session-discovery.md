# Lyntty Historical Session Discovery Research

Date: 2026-06-30

Status: historical upstream-gap research. Its “cannot prove today” and “required changes” sections describe the pre-implementation snapshot, not the current repository.

Current implementation uses Pi `SessionManager.list/listAll`, canonical JSONL recovery, product discovery filtering, progressive history, and explicit `history_gap`. Read `AGENTS.md`, `docs/contexts/product/CONTEXT.md`, `docs/architecture/pi-shared-control.md`, and current CLI recovery code for present behavior. The original research remains below because its primitives and state model explain the implemented design.

Scope: imported source in `/home/jc/dev/lyntty-lyntty-pi`, Pi SDK docs/types, and local Pi session directory shape.

## Executive conclusion

Lyntty can list and resume sessions that are already known to Lyntty's server and have enough local encryption/provider metadata. Lyntty does **not** appear to provide a generic discovery mechanism for arbitrary historical local agent sessions created outside Lyntty.

For Lyntty, this is a product-critical gap. `Sessions Home` must show existing and historical `pi` sessions even if they were not created through Lyntty/Lyntty. Lyntty therefore needs a node-local Pi session discovery/import/register layer rather than relying on Lyntty's server session list.

## What Lyntty can discover today

### Server-known sessions

Lyntty relay exposes session listing for sessions persisted in Postgres:

- `packages/lyntty-relay/sources/app/api/routes/sessionRoutes.ts`
  - `GET /v1/sessions`: returns latest 150 sessions for the authenticated account, ordered by `updatedAt desc`.
  - `GET /v2/sessions/active`: returns active sessions within last 15 minutes.
  - `GET /v2/sessions`: cursor-based listing with `changedSince`.
  - `POST /v1/sessions`: create or load by `tag`.
- `packages/lyntty-relay/sources/app/api/routes/v3SessionRoutes.ts`
  - `GET /v3/sessions/:sessionId/messages`: forward/backward message paging by `seq`.
  - `POST /v3/sessions/:sessionId/messages`: batch send with `localId` idempotency.

This is good for sessions already registered with Lyntty. It is not discovery of local historical sessions.

### App session list

Lyntty app shows sessions loaded from sync storage, which is populated from server updates and API fetches:

- `packages/lyntty-app/sources/hooks/useVisibleSessionListViewData.ts`
- `packages/lyntty-app/sources/sync/storage.ts`
- `packages/lyntty-app/sources/components/SessionsList.tsx`
- `packages/lyntty-app/sources/components/SessionsListWrapper.tsx`

`useVisibleSessionListViewData()` only filters and groups already-loaded server/storage sessions. It does not scan local machine directories.

### Daemon-tracked sessions

Lyntty daemon tracks live child processes in memory and stores some finished sessions to disk:

- `packages/lyntty-cli/src/daemon/run.ts`
  - `pidToTrackedSession`: live process map.
  - `sessionIdToFinishedSession`: finished sessions retained for resume.
  - `readPersistedSessions()`: preloads persisted sessions on daemon restart.
  - `/session-started` webhook associates a local process PID with a Lyntty session id and encryption data.
- `packages/lyntty-cli/src/persistence.ts`
  - `PersistedSession` stores encryption key/variant, seq, metadata/agent state versions, metadata, savedAt.
  - `SESSION_MAX_AGE_MS = 14 days`.

This survives daemon restart for sessions that previously reported through Lyntty and had encryption data. It does not discover arbitrary pre-existing local sessions.

### CLI resume

Lyntty CLI resume can resolve Lyntty session ids from the server:

- `packages/lyntty-cli/src/resume/resolveLynttySession.ts`
  - reads `lyntty-agent` credentials.
  - fetches `${configuration.serverUrl}/v1/sessions`.
  - decrypts metadata using local lyntty-agent credentials.
  - resolves by Lyntty session id prefix.
- `packages/lyntty-cli/src/resume/handleResumeCommand.ts`
  - supports only metadata flavors resolved as `codex` or `claude`.
  - builds launch args for `codex --resume <thread>` or `claude --resume <session>`.
  - throws unsupported flavor for others.

Current implication: even if a Lyntty Pi session is listed by server, generic `lyntty resume <id>` does not support `pi` yet in `buildResumeLaunch()`.

### Remote daemon resume

Lyntty remote resume through daemon requires the session to be tracked or persisted locally:

- `packages/lyntty-cli/src/daemon/run.ts` `resumeSession()`:
  - `findTrackedSessionById(lynttySessionId)` checks live tracked sessions and persisted finished sessions.
  - if not found: `Session <id> is not tracked by this daemon. It may have been started before the daemon or on another machine.`
  - if no metadata: cannot resume.
  - if no encryption: `It was likely started before this feature was available.`
  - fetches fresh server metadata only after it already has local encryption data.
  - delegates to `buildResumeLaunch()`, which currently supports Claude/Codex only.

Current implication: daemon resume is not a historical session scanner. It is a reconnect/resume path for Lyntty-tracked sessions.

## What Lyntty cannot prove today

Based on inspected code, Lyntty does not prove these Lyntty requirements:

1. Discover a Pi session that exists only in local Pi session files and was never registered with Lyntty.
2. Discover a Lyntty/agent session created before daemon persistence/webhook support.
3. Resume a Pi-flavored Lyntty session via `lyntty resume <id>`.
4. Recover canonical history from node-local Pi JSONL after relay/server cache loss without a Lyntty-specific import/backfill layer.
5. Mark timeline continuity as broken with `history_gap` when local history cannot prove continuity.

## Pi local session discovery capability

Pi has the right primitive for Lyntty discovery.

Evidence:

- `/opt/pi-coding-agent/docs/sdk.md`
  - `AgentSession.sessionFile`
  - `AgentSession.sessionId`
  - `AgentSessionRuntime.switchSession()`
  - `AgentSessionRuntime.importFromJsonl()`
  - `SessionManager.create(process.cwd())`
- `node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.d.ts`
  - `SessionHeader` contains `id`, `timestamp`, `cwd`, `parentSession`.
  - `SessionInfo` contains `path`, `id`, `cwd`, `name`, `parentSessionPath`, `created`, `modified`, `messageCount`, `firstMessage`, `allMessagesText`.
  - `SessionManager.list(cwd, sessionDir?)` lists sessions for a directory.
  - `SessionManager.listAll(...)` lists sessions across all project directories.
  - `SessionManager.open(path, sessionDir?, cwdOverride?)` opens a specific session file.
  - `SessionManager.continueRecent(cwd, sessionDir?)` continues most recent session.
  - `SessionManager.importFromJsonl()` is exposed through runtime for importing external JSONL.

Local evidence from this machine:

- Agent dir resolves to `/home/jc/dev/dotfiles/pi/.pi/agent`.
- Pi session files exist under `/home/jc/dev/dotfiles/pi/.pi/agent/sessions/<encoded-cwd>/*.jsonl`.
- Some sessions also have side directories under the same session id prefix.

This means Lyntty can build discovery around Pi session files, not only Lyntty relay sessions.

## Lyntty session discovery model

### Authority split

- `pi` JSONL/session files: canonical local session history.
- `lynttyd`: node-local authority that scans, indexes, imports, and serves session summaries/backfill.
- `relay`: routes encrypted summaries/events and caches, but is not canonical history.
- mobile: displays discovered/registered/stale/gapped state; never assumes continuity without node proof.

### Session states

Lyntty should distinguish:

| State | Meaning |
|---|---|
| `discovered_local` | Found in Pi local sessions, not yet registered with relay. |
| `registered` | Has a relay session id and encrypted metadata. |
| `active_runtime` | Currently attached to a live Pi runtime lease. |
| `stale_local` | Local file exists but no active runtime/presence. |
| relay-only missing local history | Not a product-visible session; skip from Sessions Home and keep only dev-log/evidence trace. |
| relay import gap | Local Pi session remains visible; older history loads progressively from local JSONL when available. |
| `import_failed` | Local JSONL exists but cannot be parsed/imported safely. |

### Required metadata

For each discovered Pi session, `lynttyd` should derive and persist:

- `piSessionId`
- `piSessionFile`
- `cwd`
- `createdAt`
- `modifiedAt`
- `messageCount`
- `firstMessage` summary or redacted preview
- `name` from Pi `session_info` if present
- `parentSessionPath` / fork lineage when present
- local `contentHash` or stronger history proof token
- `lastEntryId` / `lastSeq` equivalent if derivable
- Lyntty `sessionId` if registered to relay
- `runtimeId` and lease state if active
- `discoverySource`: `pi-session-manager-list`, `pi-session-manager-listAll`, `manual-import`, or `lyntty-session`

### Registration flow

1. `lynttyd` scans with `SessionManager.listAll()` or scoped `SessionManager.list(cwd)`.
2. For each local session file, compute stable fingerprint from path + Pi session id + header + file metadata + optional content hash.
3. Match existing Lyntty session registry by `piSessionFile` or `piSessionId` + `cwd`.
4. If no match, create `discovered_local` record in node-local registry.
5. Mobile `Sessions Home` shows discovered sessions only when a real local Pi session record or live runtime evidence exists.
6. On open/send, register or attach to relay session with encrypted metadata.
7. If relay session exists but node-local history is missing, skip it from product-visible discovery and log the diagnostic reason.

### Backfill flow

1. Mobile requests session history after `lastSeq`.
2. `relay` may return cached encrypted messages, but cannot prove canonical continuity.
3. `lynttyd` reads Pi local session entries and maps them to Lyntty structured events.
4. `lynttyd` signs/attests a continuity proof over local file/fingerprint/entry range if implemented.
5. If node-local range cannot cover requested gap, emit `history_gap` before continuing.

### Resume/attach flow

Lyntty resume should not be used as the primary Lyntty historical discovery model.

Lyntty should support:

- Open discovered Pi session with `SessionManager.open(piSessionFile)` through Pi SDK runtime.
- Continue recent session with `SessionManager.continueRecent(cwd)` only as an explicit action, not as session discovery.
- Import JSONL with `AgentSessionRuntime.importFromJsonl()` for manual/import flows.
- Create new session with `SessionManager.create(cwd)`.

For Lyntty-registered sessions, Lyntty can still use existing encrypted metadata, but local Pi file proof wins when history continuity is questioned.

## Required Lyntty changes for Pi/Lyntty

### Before cleanup/import

- Preserve server `Session` / `SessionMessage` semantics, but do not treat them as canonical history.
- Preserve v3 messages idempotency and paging ideas.
- Preserve daemon `/session-started` and local persisted session concepts as reference.

### Runtime changes

- Add Pi support to `lyntty resume` or replace it with `lyntty resume` over Pi session discovery.
- Stop relying on Claude/Codex provider IDs for resumability.
- Store Pi-specific metadata: `piSessionFile`, `piSessionId`, `cwd`, `lastKnownEntryId`, `historyProof`.
- Make daemon resume/open use Pi SDK `SessionManager.open()` and `AgentSessionRuntime.switchSession()`/`importFromJsonl()`.

### Product changes

- `Sessions Home` must include local discovered sessions, not only server sessions.
- Show product state labels: active, disconnected, discovered local, registered, stale local. Do not show `missing_local_history` or `history_gap` as session-list states.
- Give user actions: open, attach/register, import, hide/archive, reveal local file on computer.

## Answer to the user's concern

The concern is valid: Lyntty's existing session list is server-known-session discovery, not arbitrary local historical-session discovery. Lyntty also has daemon-local persisted sessions, but only for sessions that reported through Lyntty and only within the local persistence model. Pi gives better primitives for Lyntty through `SessionManager.list/listAll/open/importFromJsonl`; Lyntty must make those the foundation.

## R2 exit status

This document satisfies R2 research acceptance:

- Lyntty native historical session discovery conclusion is explicit.
- Lyntty session list/resume/daemon tracking paths are mapped to files.
- Pi local session discovery primitives are identified.
- Lyntty discovery/import/register/`history_gap` model is proposed.
- Required metadata fields for later phases are listed.
