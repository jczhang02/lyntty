# Lyntty Mobile Shell

Date: 2026-06-30

Status: R5 design baseline for Lyntty-based mobile shell.

## Goal

Preserve Lyntty's strong mobile feel while making the product Lyntty-only:

- mobile-only product scope.
- Android-first acceptance.
- `pi` as the only runtime.
- no terminal mirror, remote desktop, task board, agent dashboard, web client, or multi-agent product.

## Information architecture

### Main tabs

Lyntty mobile has two bottom tabs:

1. `Sessions Home`
2. `Settings`

Removed from active navigation:

- Inbox
- Friends
- Voice
- Usage
- Claude connect
- Web/SaaS/community surfaces

### Sessions Home

Purpose: start from session state, not agent/provider selection.

Content:

- active `pi` sessions.
- recently active sessions.
- discovered historical local sessions once R8 session discovery lands.
- per-session state: active, waiting, running, disconnected, stale, blocked, `history_gap`.
- node/repo/path summary.
- new session button.

Kept Lyntty assets/patterns:

- compact session cards.
- active session group.
- connection status in header.
- empty-state onboarding.
- mobile tab feel and brutalist icon style.

### Node Management

Purpose: inspect the machine/node running `lynttyd`.

Entry points:

- Settings machine list.
- Session detail/node link.
- future pairing flow.

Content:

- node online/offline/stale status.
- host/platform/path roots.
- CLI/runtime availability for `pi` only.
- diagnostics.
- stop/reconnect controls where safe.

### Session Remote

Purpose: control one `pi` session.

Content:

- structured feed, not terminal mirror.
- state header: node, path, runtime state, connection state.
- input semantics:
  - idle -> `prompt`.
  - running -> `followUp`.
  - explicit redirect -> `steer`.
  - stop/interrupt requires confirmation.
- feed cards:
  - progress.
  - tool/command.
  - log.
  - file change.
  - check/test.
  - error.
  - artifact metadata.
- low-level noise collapsed by default.

### Review Evidence

Purpose: review what `pi` did without becoming a PR manager.

Placement: mode/panel inside `Session Remote`.

Content:

- changed files.
- diff summary.
- checks/tests.
- command summary.
- errors.
- event timeline.
- artifact/preview anchors.
- recovery state.
- next actions: follow up, ask Pi to test/fix, open on computer, export evidence.

## Removed active mobile product surfaces

Current R4/R5 shell removes active navigation for:

- Inbox/social/friends.
- Voice assistant/settings.
- Usage/paywall product.
- Claude connect.
- multi-agent selector as product navigation.

Underlying code may still exist temporarily until later cleanup slices remove dead dependencies safely.

## Mobile vibe to preserve

Keep these Lyntty-derived strengths:

- fast mobile-first session list.
- tactile bottom tab navigation.
- compact cards.
- visually distinct brutalist icon language.
- connection-state awareness.
- lightweight onboarding.
- encrypted sync assumptions.

Do not preserve:

- Lyntty SaaS/community identity.
- multi-agent marketing.
- web/desktop as product scope.
- voice/paywall/usage product.

## Current implementation map

- `packages/lyntty-app/sources/components/MainView.tsx`: two-tab shell.
- `packages/lyntty-app/sources/components/TabBar.tsx`: `sessions` + `settings` only.
- `packages/lyntty-app/sources/components/SessionsListWrapper.tsx`: Sessions Home base.
- `packages/lyntty-app/sources/app/(app)/machine/[id].tsx`: Node Management base.
- `packages/lyntty-app/sources/-session/SessionView.tsx`: Session Remote base.
- `packages/lyntty-app/sources/components/SettingsView.tsx`: Settings base without non-Lyntty entries.

## Acceptance notes

R5 can close only when:

- Android build/check is run or an explicit not-run reason is recorded.
- main pages have evidence through smoke, screenshot, or static route/component proof.
- active navigation contains no terminal mirror, web client, task board, remote desktop, agent dashboard, or social/voice/paywall surface.
