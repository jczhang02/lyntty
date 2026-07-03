# R48 current session missing tail text

Date: 2026-07-04
Beads: `lyntty-jod`
Screenshot: `/home/jc/Downloads/Screenshot_20260704_050249_Lyntty (dev).jpg`

## Symptom

Opening the current ordinary Pi session on Android showed earlier thinking/tool-call content and `pondering...`, but later assistant text was absent.

## Workflow review result

This is a code issue, not normal slow sync.

Four read-only review lanes inspected app sync/rendering, daemon/Pi producer, relay persistence, and local JSONL evidence.

Findings:

1. Local Pi JSONL already contained the missing later text. In the user-reported current session file:
   `/home/jc/.pi/agent/sessions/--home-jc-dev-lyntty--/2026-06-30T08-52-56-594Z_019f17bb-4492-73cd-b28f-61f993c92089.jsonl`
   later entries included the final assistant response beginning `已修复所有确认代码问题。` after the screen-visible tool calls.
2. Relay and app fetch paths were not the main culprit. Once a `SessionEnvelope` reaches relay v3, app initial/latest and forward sync can fetch it.
3. The fragile path was ordinary Pi live mirroring through the daemon:
   - `PiSessionProtocolMapper.appendText()` buffered `text_delta` / `thinking_delta` into `pendingText`.
   - Buffered text was only flushed before tool envelopes, on type switch, or at `agent_end`.
   - While Pi remained running/`pondering...`, the latest assistant text could stay in daemon memory and never reach relay/app.
   - If extension/restart/JSONL fallback timing intervened, the phone could keep showing the old visible prefix.

## Fix

Files:

- `packages/lyntty-cli/src/pi/runPiSessionProtocol.ts`
  - Added `hasPendingText()` and `flushPendingText()` so live paths can publish buffered text before turn end.
- `packages/lyntty-cli/src/daemon/run.ts`
  - Added a bounded live text flush timer (`750ms`) for ordinary Pi extension `message_update` events.
  - Timer flushes pending text through `sendSessionProtocolMessage()` + `sessionClient.flush()` without ending the turn.
  - Non-message events clear the pending timer and use normal mapper flushing.
- `packages/lyntty-cli/src/pi/runPiExternalMirror.ts`
  - Live-active JSONL fallback no longer marks current entries known before successful session-protocol delivery. This prevents extension/daemon timing gaps from permanently hiding a tail entry.
- `packages/lyntty-cli/src/pi/runPiSessionProtocol.test.ts`
  - Regression test proves text deltas can become visible before `agent_end` and the turn can continue.
- `packages/lyntty-cli/src/pi/runPiExternalMirror.test.ts`
  - Regression test proves active-runtime suppression does not consume JSONL fallback entries before they can recover.

## Verification

Automated:

```bash
pnpm --filter ./packages/lyntty-cli exec vitest run --project unit src/pi/runPiSessionProtocol.test.ts src/pi/runPiExternalMirror.test.ts src/pi/piExtensionEvent.test.ts
pnpm --filter ./packages/lyntty-cli test -- --run
pnpm --filter ./packages/lyntty-app typecheck
pnpm --filter ./packages/lyntty-relay typecheck
git diff --check
```

Results:

- Focused CLI tests: 2 files / 19 tests passed after final fallback hardening.
- Full CLI suite: 88 files / 764 tests passed.
- App typecheck passed.
- Relay typecheck passed.
- `git diff --check` passed.

E2E:

1. Reinstalled updated local CLI and extension:
   ```bash
   pnpm --filter ./packages/lyntty-cli run cli:install
   lyntty remote install
   ```
2. Maestro release-style/dev-package emulator setup:
   - `01_first_run.yml` passed.
   - `02_pair_node.yml` passed with a fresh temp node home.
3. Started a temp paired daemon:
   ```bash
   LYNTTY_HOME_DIR=/tmp/lyntty-r48-node LYNTTY_SERVER_URL=http://127.0.0.1:3005 lyntty daemon start
   ```
4. Ran ordinary direct Pi through the global extension:
   ```bash
   LYNTTY_HOME_DIR=/tmp/lyntty-r48-node pi -p --no-tools "Write exactly two sentences. First sentence: checking live sync. Second sentence exactly: R48_LIVE_TAIL_052848"
   ```
5. Android UI opened the mirrored session `lyntty: live sync sentence formatting check` and displayed both:
   - `checking live sync.`
   - `R48_LIVE_TAIL_052848`
6. After fallback hardening, reinstalled/restarted the temp daemon and reran ordinary direct Pi:
   ```bash
   LYNTTY_HOME_DIR=/tmp/lyntty-r48-node pi -p --no-tools "Write exactly two sentences. First sentence: checking live sync again. Second sentence exactly: R48_LIVE_TAIL2_053755"
   ```
7. Android UI opened `lyntty: live sync session title formatting task` and displayed both:
   - `checking live sync again.`
   - `R48_LIVE_TAIL2_053755`
8. After final reviewer found assistant-entry fallback suppression risk, changed delivered marking so assistant JSONL entries are marked delivered only after a completed live turn. Reinstalled/restarted the temp daemon again and reran ordinary direct Pi:
   ```bash
   LYNTTY_HOME_DIR=/tmp/lyntty-r48-node pi -p --no-tools "Write exactly two sentences. First sentence: checking live sync final. Second sentence exactly: R48_LIVE_TAIL3_054738"
   ```
9. Android UI opened `lyntty: live sync sentence formatting check` and displayed both:
   - `checking live sync final.`
   - `R48_LIVE_TAIL3_054738`
10. After fixing the wrapper so `includeAssistantMessages` reaches the actual mirror, reinstalled/restarted the temp daemon and reran ordinary direct Pi:
   ```bash
   LYNTTY_HOME_DIR=/tmp/lyntty-r48-node pi -p --no-tools "Write exactly two sentences. First sentence: checking live sync last. Second sentence exactly: R48_LIVE_TAIL4_055205"
   ```
11. Android UI opened `lyntty: two sentence live sync check` and displayed both:
   - `checking live sync last.`
   - `R48_LIVE_TAIL4_055205`

Artifacts:

- `docs/evidence/artifacts/r48-current-session-tail/current-session-tail-visible.xml`
- `docs/evidence/artifacts/r48-current-session-tail/sessions-home-live-row.xml`
- `docs/evidence/artifacts/r48-current-session-tail/pi-print-output.log`
- `docs/evidence/artifacts/r48-current-session-tail/daemon.log`
- `docs/evidence/artifacts/r48-current-session-tail/token.txt`
- `docs/evidence/artifacts/r48-current-session-tail/current-session-tail-visible-after-fallback-fix.xml`
- `docs/evidence/artifacts/r48-current-session-tail/sessions-home-live-row-after-fallback-fix.xml`
- `docs/evidence/artifacts/r48-current-session-tail/pi-print-output-after-fallback-fix.log`
- `docs/evidence/artifacts/r48-current-session-tail/daemon-after-fallback-fix.log`
- `docs/evidence/artifacts/r48-current-session-tail/token-after-fallback-fix.txt`
- `docs/evidence/artifacts/r48-current-session-tail/current-session-tail-visible-final.xml`
- `docs/evidence/artifacts/r48-current-session-tail/sessions-home-live-row-final.xml`
- `docs/evidence/artifacts/r48-current-session-tail/pi-print-output-final.log`
- `docs/evidence/artifacts/r48-current-session-tail/daemon-final.log`
- `docs/evidence/artifacts/r48-current-session-tail/token-final.txt`
- `docs/evidence/artifacts/r48-current-session-tail/current-session-tail-visible-last.xml`
- `docs/evidence/artifacts/r48-current-session-tail/sessions-home-live-row-last.xml`
- `docs/evidence/artifacts/r48-current-session-tail/pi-print-output-last.log`
- `docs/evidence/artifacts/r48-current-session-tail/daemon-last.log`
- `docs/evidence/artifacts/r48-current-session-tail/token-last.txt`

Pairing URL artifacts were not copied.

## Residual risk

The current long Pi process must load the updated extension/daemon behavior to benefit from this fix. For an already-running Pi TUI, use `/reload` or restart `pi`; otherwise it may keep using the old extension event behavior.
