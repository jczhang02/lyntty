# R57 Current Pi live event sync

Date: 2026-07-05

## Problem

A computer-side ordinary `pi` prompt (`目前的 lyntty 图标是什么?`) appeared in the APK only after the assistant answer was already complete. Local Pi JSONL order was correct, but the APK received the prompt late.

## Diagnosis

Evidence from the current local Pi JSONL and daemon logs:

- Pi JSONL line 24457 at `2026-07-05T05:54:46.401Z`: user message `目前的 lyntty 图标是什么?`.
- Pi JSONL line 24458+ at `05:54:53Z`: assistant thinking/tool events.
- Pi JSONL line 24470 at `05:55:30Z`: final assistant answer.
- daemon log at local `13:55:37`: `[pi] Mirroring external Pi JSONL entries { entries: 6, envelopes: 17 }`.

Conclusion: the APK was seeing a JSONL fallback batch after the turn, not the live extension stream.

Code audit found the live Lyntty Pi extension did not forward Pi `input` events, so computer-typed user prompts could only appear through JSONL polling. The extension also did not forward assistant `message_end`, so final assistant text could be lost or delayed if `message_update` deltas were dropped before `agent_end`.

## Fix

Changed files:

- `packages/lyntty-cli/src/pi/piExtensionInstall.ts`
  - Forward non-extension Pi `input` events live to local `lynttyd`.
  - Forward assistant `message_end` as a live fallback for final text.
- `packages/lyntty-cli/src/pi/piExtensionEvent.ts`
  - Accept `message_end` as a mapped Pi agent-session event.
- `packages/lyntty-cli/src/pi/runPiSessionProtocol.ts`
  - Use assistant `message_end` to emit missing final text suffixes without duplicating already-flushed streamed text.
- `packages/lyntty-cli/src/pi/runPiExternalMirror.ts`
  - Mark live-delivered user text as known so JSONL fallback does not duplicate it.
  - Treat not-yet-created Pi JSONL files as empty during live-delivery dedupe.
- `packages/lyntty-cli/src/daemon/run.ts`
  - Convert extension `input` events to user session-protocol envelopes immediately.
  - Mark matching JSONL user entries delivered with a delayed retry.
  - Mark assistant JSONL entries delivered when `message_end`/completed live turns flush content.

## Verification

Automated:

- `pnpm --filter ./packages/lyntty-cli exec tsc --noEmit` — passed.
- Focused CLI tests passed: `piExtensionEvent.test.ts`, `runPiExternalMirror.test.ts`, `runPiSessionProtocol.test.ts` — 30 tests.
- Full `packages/lyntty-cli` test suite passed — 90 files / 778 tests.
- `pnpm --filter ./packages/lyntty-app typecheck` — passed.
- `pnpm --filter ./packages/lyntty-relay typecheck` — passed.
- `pnpm --filter ./packages/lyntty-wire test` — 2 files / 19 tests passed.
- `pnpm --filter ./packages/lyntty-agent test` — 9 files / 227 tests passed.
- Generated extension source installed and bundled successfully in a temporary HOME only.

Release-style APK / isolated E2E:

Artifact root: `docs/evidence/artifacts/r57-current-pi-live-sync/`.

- Built and installed a release-style APK with local relay URL `http://10.0.2.2:3006`.
- Used temporary `HOME` and `LYNTTY_HOME_DIR` under `/tmp`; no live global Pi extension was installed or reloaded.
- Started isolated relay on port `3006`, paired the APK to an isolated node, started isolated `lynttyd`, and installed the updated extension only into the temporary Pi agent directory.
- Started an ordinary computer-side `pi` TUI in tmux using the temporary HOME.
- Typed `Please reply exactly R57_LIVE_INPUT_FINAL_164528` in that ordinary Pi TUI.
- APK Session Remote showed the computer-origin user text in the current Pi session (`final-session.xml`) without a JSONL fallback mirror batch in daemon logs.
- Posted authenticated local extension `message_end` events through the same `/pi-extension/event` endpoint; APK showed final assistant text `R57_EXTENSION_FINAL_164835` (`final-message-end.xml`).
- Posted authenticated local extension thinking/tool events; APK showed `checking tool`, `bash`, and `echo R57_TOOL_OK` / `R57_TOOL_OK` (`tool-visible.xml`).

Limitations:

- The isolated temporary HOME had no model credentials, so the ordinary tmux Pi TUI could not produce a real model assistant answer. Assistant final/thinking/tool live rendering was validated by authenticated local extension endpoint events through the same `lynttyd -> relay -> APK` path, while the computer-origin input was validated from an actual ordinary Pi TUI.
- Existing live Pi sessions need manual `/reload` or restart after the user explicitly approves live extension installation/reload.

## Artifact hygiene

Pairing URLs and auth public-key hex values in R57 artifacts were redacted before commit.
