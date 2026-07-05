# R60 current Pi live mirror duplicate reply

Date: 2026-07-06

## Scope

Beads: `lyntty-jtr` — user reported `/home/jc/Downloads/Screenshot_20260706_002643_Lyntty (dev).jpg`, where the same assistant reply appeared twice in Session Remote and the second copy appeared after a short delay.

Pi extension safety: no live Pi extension install/reload, no current daemon mutation, and no live Pi session testing in this fix. Verification used deterministic CLI tests with temp JSONL files.

## Root cause

Introduced by R48 commit `7acea047 fix(pi): flush live mirrored text tails`.

The bug required this sequence:

1. Ordinary `pi` extension sends live `message_update` text deltas.
2. `lynttyd` buffers them in `PiSessionProtocolMapper` and flushes pending text after debounce through `flushPendingLiveText()`.
3. The app displays that live text.
4. Pi later writes the same assistant text to JSONL.
5. `agent_end` may emit only `turn-end` because text was already flushed.
6. Existing delivered marking only suppressed assistant JSONL entries when `includeAssistantMessages: true`, but the debounce flush path called delivered marking without assistant inclusion.
7. JSONL fallback sees the same assistant entry after the quiet window and sends it again as `pi-history-*`, producing the delayed duplicate.

Relevant code before fix:

- `packages/lyntty-cli/src/daemon/run.ts` live text debounce flush and `agent_end` delivered marking.
- `packages/lyntty-cli/src/pi/runPiExternalMirror.ts` assistant entry suppression required `includeAssistantMessages: true`.

## Fix

- Added `PiExternalMirror.markAssistantTextDeliveredSince(text, cutoffTimeMs)` to suppress only matching assistant JSONL entries already delivered through the live extension path.
- Threaded that method through `startPiExternalMirror()` and daemon mirror state.
- Accumulated non-thinking assistant text envelopes sent by the live extension mapper during a turn.
- On `agent_end`, when no extension sequence gap is present, mark matching assistant JSONL text delivered, with delayed retry to cover JSONL write timing.
- Preserved fallback recovery:
  - different assistant text is not suppressed;
  - sequence gaps skip exact assistant suppression;
  - failed/missing live delivery still allows JSONL fallback.

## TDD seam

Confirmed seams before writing tests:

1. `PiExternalMirror` public seam for JSONL fallback suppression.
2. daemon Pi-extension event seam behavior represented by the public mirror wrapper and delivered-marking path.

Red test first:

```text
src/pi/runPiExternalMirror.test.ts: Property 'markAssistantTextDeliveredSince' does not exist on type 'PiExternalMirror'.
```

Then implementation made it green.

## Verification

Focused/full CLI test command:

```bash
pnpm --filter ./packages/lyntty-cli test -- src/pi/runPiExternalMirror.test.ts src/pi/runPiSessionProtocol.test.ts
```

Result: `90` files / `779` tests passed. The package script builds first with `tsc --noEmit` and `pkgroll`.

Review:

- Reviewer PASS. Confirmed exact-text assistant suppression, fallback preservation on different text and sequence gaps, wrapper coverage, and no live environment operations.

Additional checks:

```bash
git diff --check
```

Result: passed.

## Artifacts

No APK artifact was produced for this fix because the bug source is daemon/JSONL fallback duplication and Pi extension live-environment changes were intentionally avoided. The screenshot remains the user-provided artifact path above.

## Residual risk

- Exact text matching deliberately avoids suppressing unrelated fallback entries. If Pi JSONL normalizes assistant text differently from live deltas, duplicate suppression may miss; fallback safety is preferred over dropping unseen assistant output.
- Already-running Pi sessions need the updated daemon code to be running for this fix; no live extension reload is required by this patch.
