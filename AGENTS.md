# Lyntty Agent Instructions

This file is the shared repository contract for every coding agent. `CLAUDE.md` must remain a symlink to this file so supported agents receive the same root rules.

## Instruction hierarchy

- This root `AGENTS.md` applies to the entire repository.
- Before editing under `packages/` or `docs/`, read the nearest nested `AGENTS.md`; it adds path-specific deltas to this root contract.
- A nested guide must not weaken root safety, permission, Git, product, release, or verification requirements. When guidance conflicts, stop and report the conflict instead of selecting the easier rule.
- Keep shared rules here and local implementation details in the nearest nested guide. Do not copy a frozen root policy into package guides.
- Public-fork exception: external fork contributors, including coding agents operating only in a contributor-owned fork, are exempt from maintainer-only Beads, mandatory worktrees, durable local-commit requirements, and owner OpenPGP/GPG signing. `CONTRIBUTING.md` governs that workflow. Product, safety, permission, isolation, secret-handling, and claim-verification rules still apply; the full maintainer policy resumes in a maintainer checkout or shared repository operation.

## Project identity

Lyntty is a Happy-derived, Android-first, self-hosted mobile control product for local `pi` sessions. Treat Happy as the upstream foundation and prior implementation source, not as current product identity.

Current product rules:

- `pi` is the only supported agent/runtime in product scope.
- `lynttyd` is the local node daemon and the only node-side session bridge that connects local Pi runtimes to the `relay`.
- The operator-facing `lyntty remote` command is a separate control-plane client that connects directly to the relay; it must not become a node runtime or bypass `lynttyd` for phone-to-Pi delivery.
- The Pi extension talks only to local `lynttyd`; it must never connect directly to the public relay.
- Android/release-style APK behavior is the primary client acceptance target. iOS is best-effort. Web/Tauri/Codium surfaces are legacy or development context unless the task explicitly says otherwise.
- Do not restore Happy/Claude/Codex/Gemini/OpenClaw product surfaces, app navigation, copy, or defaults unless the task is explicitly about legacy compatibility tests.
- Preserve the Happy mobile vibe where it supports the Lyntty product, but use Lyntty names, Pi-first semantics, and current normative sources as authority.

## Product decision filter

For a feature whose product fit is not obvious, answer these questions before expanding scope:

1. Does it directly improve Android control of local `pi` sessions or self-hosted Lyntty operation?
2. Does it preserve `phone -> relay -> lynttyd -> Pi extension -> pi`, with `lynttyd` as the only node-side session bridge and `lyntty remote` limited to an explicit operator control-plane client?
3. Does it preserve one `active runtime` per Pi session and keep Pi JSONL as canonical history?
4. Does it keep legacy, debug, service, and evidence surfaces out of the main APK unless the task explicitly targets developer tooling?
5. Can the behavior be verified in isolation through the relevant real Android, daemon, relay, or protocol path?

If any answer is unclear, narrow the proposal or ask for a product decision rather than silently broadening Lyntty.

## Normative sources

Read only what the task needs, using this order for current behavior and policy:

1. This root contract and the nearest nested `AGENTS.md`.
2. `CONTEXT-MAP.md` and the relevant current context, usually `docs/contexts/product/CONTEXT.md`.
3. Accepted architecture and runbooks, especially `docs/architecture/pi-shared-control.md` and the relevant files under `docs/release/`.
4. Current schemas, code, tests, workflows, and package scripts for implementation truth.


## Historical and evidentiary sources

- Files under `docs/research/` are historical background. They may describe removed workspaces, upstream agent flavors, or superseded milestones and must not override the current product or accepted architecture.
- Files under `docs/evidence/` prove what was observed at a point in time and at the recorded revision. Even the latest matching evidence does not become current product policy merely because it is recent.
- Use research and evidence to recover rationale, reproduction details, and prior verification. If either conflicts with normative sources or current code, report the drift instead of restoring the historical behavior.

## Vocabulary and UX constraints

Use exact terms when documenting or naming user-facing concepts:

- `pi`
- `lynttyd`
- `relay`
- `Sessions Home`
- `Node Management`
- `Session Remote`
- `active runtime`
- `activation lock`
- `history_gap`

Current UI constraints:

- Do not add `Review Evidence`, `Session Details`, or `Diagnostics` as main APK UI replacements. Runtime/debug/service details belong in logs, developer tooling, or evidence docs.
- Do not expose user-visible `mirror`, `read-only`, or `external_pi` concepts for ordinary computer-side Pi sessions. Normalize old metadata at read boundaries to `runtimeOwner` / `controlState` semantics.
- Phone sends to ordinary computer-running `pi` sessions must use shared control: `phone -> relay -> lynttyd -> Pi extension -> pi.sendUserMessage()`.
- Extension-missing/stale cases must queue or fail with explicit remediation such as `Waiting for Pi extension`; never silently drop input or silently start a duplicate runtime.

## Beads and evidence

Use Beads for Lyntty code/docs work that changes project state:

- Run `bd prime` when workflow guidance is needed.
- Check `bd ready --json` / `bd list --status in_progress --json` before picking work.
- Create or claim a Beads task before non-trivial code/doc changes.
- Add notes for decisions likely to matter after compaction.
- Close Beads only after tests/evidence are done.

Evidence expectations:

- Add or update `docs/evidence/rNN-*.md` for behavior fixes, E2E, security hardening, or user-visible changes.
- Evidence should list exact commands, artifacts, not-run reasons, and residual risk.
- Redact pairing URLs (`lyntty://terminal?...`), auth tokens, public-key blobs when used as auth material, encryption keys, request headers, and secrets from artifacts before commit.

## Git and repository hygiene

Use Type's stricter Git discipline, adapted for Lyntty's Beads/evidence workflow:

- Treat `main` as protected. Do not directly commit, push, force-push, or make durable agent edits on `main`; use a task branch or isolated worktree and merge by PR.
- If the current checkout is `main` and the user asks for code/docs changes, stop before editing and propose a branch/worktree unless the user explicitly authorizes the one-off policy/config edit.
- Before editing files for a task, check `pwd`, current branch, and `git status --short`. If running in an explicit worktree, also verify the worktree path matches the intended task. Mismatch means stop, do not edit.
- Manual project worktrees should live under repo-root `worktrees/<short-topic>/`. Do not create project worktrees in `worktree/` or outside this repository unless the tool creates an isolated temporary worktree itself.
- Worktrees must keep dependencies, build outputs, runtime state, and ports isolated. Do not share `node_modules`, native build outputs, Expo/Gradle artifacts, local daemon state, `LYNTTY_HOME_DIR`, or relay ports across worktrees.
- Stage only files that belong to the current Bead/task. Do not stage secrets, `.env*`, pairing URLs, auth material, local logs, temporary artifacts, or unrelated dirty files. Stage `.beads/` only when the Bead state change is part of this repository task.
- On non-`main` task branches/worktrees, create local commits for verified logical units unless the user says `不提交`, `暂停提交`, or `bypass commit`. Use small Conventional Commits with GPG signing; split 3+ file changes by logical unit when practical (`app`, `cli`, `relay`, `wire`, `docs`, `tests`, `assets`, `ci`).
- Before any local commit, inspect `pwd`, branch, `git status --short`, `git diff`, and `git log --oneline -10`. Verification failures or unverified behavior mean no commit; report the blocker instead.
- After a local commit for an active Bead, add a Bead note with the commit hash, verification commands, and residual risk.
- `git push`, tag creation or deletion, Release creation, edit, deletion or publication, PR creation, PR merge, and force operations require explicit user approval.
- Do not add AI-agent co-authors such as `claude`, `codex`, `open-agent`, or `pi` unless the user explicitly asks.
- Every durable code/config/docs change should end with clear PR-ready state: changed files, verification, not-run items, evidence docs when required, and reviewer/manual test notes for Android, relay, daemon, or mobile behavior.

## GitHub operations

- Re-read the live issue or PR title, body, comments, state, labels, and author language immediately before a public reply, edit, label change, or closeout.
- Reply in the reporter's or author's language unless the user requests otherwise. Keep claims tied to verified repository and release state.
- A local commit is not shipped. Before saying a fix is available or closing an item as released, verify that the exact change is on protected `main` or on the confirmed release path.
- Issue or PR comments, edits, labels, closes, reopens, reviews, merges, and reactions require explicit current-task authorization. Read-only inspection does not grant mutation authority.
- Keep GitHub Issues and Beads linked when both represent the same work, but do not treat local Bead state as proof of public GitHub state.

## Pi extension and live environment safety

Do not modify or test Pi extension behavior against the user's live Pi environment by default.

Any work that can affect global extensions, current Pi sessions, `~/.pi/agent/extensions/`, local `lynttyd`, relay state, active daemon/session state, or the user's current tmux Pi pane must run in isolation first:

- temporary `HOME`
- temporary `LYNTTY_HOME_DIR`
- temporary Pi agent directory/extension install path
- isolated worktree when practical
- non-default local relay port when practical

Do not install, reload, or overwrite the live global Lyntty Pi extension until the user explicitly approves. After extension changes, prefer a new Pi session or user-triggered `/reload`; never force reload of the user's current session.

Never drive the user's current tmux/Pi panes with `tmux send-keys`, `tmux kill-pane`, `tmux kill-window`, `tmux kill-session`, `C-c`, `C-d`, `q`, `/quit`, `/exit`, or similar controls unless the user explicitly asks. TUI or exit-path reproductions must use a new uniquely named tmux session/window, temporary `HOME`, temporary `LYNTTY_HOME_DIR`, temporary Pi agent directory, non-default ports when relevant, and a PID/cwd/env check proving the target is isolated before sending keys or signals. If isolation cannot be proven, stop and ask.

Do not run `lynttyd`, Pi mirror, or Pi extension tests against live `~/.lyntty` or `~/.pi`. Set temporary state/log/session directories for tests that can write daemon state, session state, extension files, or logs.

## Runtime architecture rules

- Pi JSONL remains canonical history.
- Relay stores encrypted sync state, metadata, queues, and caches; it is not canonical Pi history.
- One `machineId + piSessionId` should map to one active Lyntty relay session.
- One Pi session can have only one `active runtime`; takeover must be explicit.
- Historical sessions should open quickly with latest-tail/progressive history loading; do not block Session Remote on full JSONL import.
- Session-protocol envelopes must preserve stable ids, turn ids for visible agent events, deterministic ordering, and relay `localId` idempotency.
- Live Pi SDK events and Pi JSONL replay should share display semantics: thinking, tool calls/results, final text, and errors must render consistently.

## Package map

- `packages/lyntty-app` — Expo/React Native mobile APK, session UI, sync reducers, local storage, Maestro selectors.
- `packages/lyntty-cli` — `lyntty` CLI, `lynttyd`, Pi SDK runtime adapter, Pi extension installer/source generation, local control server.
- `packages/lyntty-relay` — self-hosted relay API, socket/RPC routing, auth, PGlite/Prisma storage, encrypted sync.
- `packages/lyntty-wire` — shared session-protocol schemas and caps.

The Bun workspace contains only these four packages. Pi remote-control commands and the development app-log receiver live in `packages/lyntty-cli`; `lyntty remote` is the explicit operator control-plane client described above. Do not recreate removed agent, app-logs, or Codium workspaces.

Each package and `docs/` has a nested `AGENTS.md`. Read the nearest guide before editing that subtree; these guides contain local seams and claim gates rather than replacements for this root contract.

## Release agent workflow

- Before any release-flavored task, load `.agents/skills/release-flow/SKILL.md`. This includes Compatibility or Preview candidates, promotion, native-signing operational staging, GitHub Release creation, metadata edits, deletion, prerelease, rollback, and release audit. Pure Actions Artifact work, including the Android-only verification candidate and the normal 14-day Expo Dev artifact, is excluded: it is not a GitHub Release and does not use curated Release Notes.
- `.agents/skills/release-flow/SKILL.md` and `.agents/skills/release-notes/SKILL.md` are the canonical cross-agent sources. `CLAUDE.md` must remain a symlink to `AGENTS.md`; `.claude/skills/release-flow` and `.claude/skills/release-notes` must remain relative symlinks to their canonical `.agents/skills/` directories. Do not add copied rule bodies or `.pi` mirrors.
- Curated notes are user-invoked only through `/skill:release-notes <version> <CodeName> <emoji> <channel-or-tag>`. The exact version, CodeName, emoji, and channel or tag must come from the user, never inference.
- Loading either skill does not grant permission for a workflow dispatch, push, PR, tag creation or deletion, Release creation, edit, deletion or publication, rollback, or reaction. Every external operation still requires explicit current-task authorization for the exact object and operation, plus the repository Git rules above.

## Testing and verification

Use the narrowest reliable check first, then broaden when behavior crosses layers. The nearest nested `AGENTS.md` defines the targeted development checks and the minimum gate required for a claim in that subtree.

Common checks:

```bash
bun run ci:wire
bun run ci:cli
bun run ci:daemon-integration
bun run ci:relay
bun run ci:app
bun run test:repo-hardening
bun run ci:audit
bun install --frozen-lockfile
bun pm untrusted
git diff --check
```

`bun run ci:fast` is the default repository fast gate. It covers repository hardening, dependency audit, Wire, CLI, Relay, App, development-script checks, diff hygiene, and the isolated compiled Relay health/shutdown smoke included by `ci:relay`. It does not include `ci:daemon-integration`, `docs:check` or `docs:build`, an Android APK build, Maestro, physical-device validation, deployed Relay validation, or end-to-end App/daemon/Relay behavior. A passing `ci:fast` must not be used to claim those excluded paths.

Bun is pinned by `.bun-version` and the root `packageManager`; project scripts and deliverables must not invoke Node, npm, pnpm, npx, or tsx.

Android/E2E notes:

- Use release-style APK validation for user-visible mobile behavior when practical.
- Expo Dev and ordinary development builds use `dev.jczhang.lyntty.dev`; release-style Preview builds use `dev.jczhang.lyntty.preview`; production builds use `dev.jczhang.lyntty`. Development and Preview packages are validation/distribution artifacts, not production-signed releases.
- For local relay testing from Android emulator, use `http://10.0.2.2:<port>` and non-production cleartext support.
- Disable Expo Updates in non-production release-style builds to avoid stale OTA bundles.
- Maestro flows live under `e2e/maestro/`; avoid false positives by asserting target Session Remote state and distinct assistant tokens.
- Do not claim physical-phone validation unless it was actually run.

## Coding rules

- Keep changes surgical and aligned with existing patterns.
- Prefer TypeScript types and pure helper tests around tricky state transitions.
- Recoverable app/daemon/relay errors should log-and-continue or show user remediation, not crash/RedBox.
- Do not add broad abstractions, rewrites, or legacy cleanup unless the task explicitly asks.
- Follow the Git and repository hygiene section for branch, staging, commit, and PR boundaries.

## Legacy Happy/Claude guidance

Some directories and tests still contain Happy/Claude/Codex/Gemini/OpenClaw code inherited from upstream. For agents:

- Treat legacy code as compatibility or migration residue unless the current task targets it.
- Do not add new product dependencies on Claude/Codex/Gemini/OpenClaw.
- If a legacy test fails while unrelated to current work, document it honestly; do not silently delete coverage.
- When updating old Happy instructions, translate still-useful engineering guidance into Lyntty/Pi terms and remove product assumptions that conflict with current scope.
