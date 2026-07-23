# Lyntty Agent Instructions

## Project identity

Lyntty is a Happy-derived, Android-first, self-hosted mobile control product for local `pi` sessions. Treat Happy as the upstream foundation and prior implementation source, not as current product identity.

Current product rules:

- `pi` is the only supported agent/runtime in product scope.
- `lynttyd` is the local node daemon and only `lynttyd` connects to the `relay`.
- The Pi extension talks only to local `lynttyd`; it must never connect directly to the public relay.
- Android/release-style APK behavior is the primary client acceptance target. iOS is best-effort. Web/Tauri/Codium surfaces are legacy or development context unless the task explicitly says otherwise.
- Do not restore Happy/Claude/Codex/Gemini/OpenClaw product surfaces, app navigation, copy, or defaults unless the task is explicitly about legacy compatibility tests.
- Preserve the Happy mobile vibe where it supports the Lyntty product, but use Lyntty names, Pi-first semantics, and current docs/evidence as authority.

## Source-of-truth docs

Read only what the task needs, but anchor important work here:

1. `CONTEXT-MAP.md`
2. Relevant context doc, usually `docs/contexts/product/CONTEXT.md`
3. Relevant architecture/research docs, especially:
   - `docs/architecture/pi-shared-control.md`
   - `docs/research/pi-remote-control-models.md`
   - `docs/research/lyntty-session-discovery.md`
   - `docs/research/lyntty-pi-agent.md`
4. Latest matching evidence in `docs/evidence/`.

If `CONTEXT-MAP.md` references a missing older scaffold doc, proceed silently and use the closest current doc.

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
- `git push`, tag creation, release publishing, PR creation, PR merge, and force operations require explicit user approval.
- Do not add AI-agent co-authors such as `claude`, `codex`, `open-agent`, or `pi` unless the user explicitly asks.
- Every durable code/config/docs change should end with clear PR-ready state: changed files, verification, not-run items, evidence docs when required, and reviewer/manual test notes for Android, relay, daemon, or mobile behavior.

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

The Bun workspace contains only these four packages. Pi remote-control commands and the development app-log receiver live in `packages/lyntty-cli`; do not recreate removed agent, app-logs, or Codium workspaces.

## Release agent workflow

- Before a release-producing Compatibility or Preview candidate, promotion, GitHub Release, prerelease, rollback, or release-audit task, load `.agents/skills/release-flow/SKILL.md`. Pure Actions Artifact work, including the Android-only verification candidate and the normal 14-day Expo Dev artifact, is excluded: it is not a GitHub Release and does not use curated Release Notes.
- `.agents/skills/release-flow/SKILL.md` and `.agents/skills/release-notes/SKILL.md` are the canonical cross-agent sources. `CLAUDE.md` must remain a symlink to `AGENTS.md`; `.claude/skills/release-flow` and `.claude/skills/release-notes` must remain relative symlinks to their canonical `.agents/skills/` directories. Do not add copied rule bodies or `.pi` mirrors.
- Curated notes are user-invoked only through `/skill:release-notes <version> <CodeName> <emoji> <channel-or-tag>`. The exact version, CodeName, emoji, and channel or tag must come from the user, never inference.
- Loading either skill does not grant permission for a workflow dispatch, push, PR, tag, Release creation or edit, publication, rollback, or reaction. Every external operation still requires explicit current-task authorization and the repository Git rules above.

## Testing and verification

Use the narrowest reliable check first, then broaden when behavior crosses layers.

Common checks:

```bash
bun run ci:wire
bun run ci:cli
bun run ci:relay
bun run ci:app
bun run test:repo-hardening
bun run ci:audit
bun install --frozen-lockfile
bun pm untrusted
git diff --check
```

Run the complete local gate with `bun run ci:fast`. Bun is pinned by `.bun-version` and the root `packageManager`; project scripts and deliverables must not invoke Node, npm, pnpm, npx, or tsx.

Android/E2E notes:

- Use release-style APK validation for user-visible mobile behavior when practical.
- Non-production release-style APKs use package `dev.jczhang.lyntty.dev` and are validation artifacts, not production-signed releases.
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
