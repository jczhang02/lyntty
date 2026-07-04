# Agent Instructions

## Agent skills

### Issue tracker

GitHub Issues are primary; Beads is used for multi-session work, dependencies, blockers, and compaction recovery. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-label triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context layout via root `CONTEXT-MAP.md`, with ADRs in `docs/adr/` and context-scoped ADRs where present. See `docs/agents/domain.md`.

## Pi extension changes

Do not modify or test Pi extension behavior against the user's live Pi environment by default. Any work that can affect global extensions, current Pi sessions, `~/.pi/agent/extensions/`, local `lynttyd`, relay state, or active daemon/session state must run in isolation first: use a temporary HOME, temporary `LYNTTY_HOME_DIR`, temporary Pi agent directory/extension install path, and/or an isolated worktree. Do not install, reload, or overwrite the live global Lyntty Pi extension until the user explicitly approves.
