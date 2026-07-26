# R116 — Progressive Pi history coverage across restarts

Date: 2026-07-26

Branch: `fix/session-sync-reliability`

Bead: `lyntty-b8w`

Base commit: `4fb97d048cc353591f629b0ea26013528c4d3998`

Verified implementation commit: `d2da0c579f46a4a81e8157fc4dc8fb9984d14df2` (`Good signature`)

## Review triage

A late review asserted that a 51-entry session loses `u1` because startup sends `u2…u51` and stores `u51` locally. That specific blocker was not valid: bounded latest-tail startup is intentional, and `piHistoryCursor: u2` with `piHistoryHasMore: true` keeps `u1` reachable through the next `pi-history-page` request.

The review did expose three real reliability gaps:

1. restart startup replaced an already-progressed Relay cursor with the latest-tail cursor;
2. an existing Relay session without a local checkpoint synchronously mapped and reconciled the full JSONL;
3. page RPCs accepted arbitrary cursors, so stale requests could skip or regress progressive coverage, while failures discarded the retry cursor in App state.

Successive independent reviews also found and closed managed-runtime outage replay, live/canonical duplication, rebind-generation races, lost metadata ACK lock starvation, abandoned-branch takeover, and oversized tool-boundary cases. The final targeted verifier reported `VERIFIED_NO_P0_P1_P2`.

## Corrected model

Pi history uses two independent coordinates:

- the local legacy-named `pi-history-watermark` file is an **append checkpoint** for forward JSONL replay;
- Relay metadata's `piHistoryCursor` / `piHistoryHasMore` is the authoritative **progressive lower bound** for older-page loading.

The append checkpoint does not prove that all earlier JSONL entries are already in Relay. For the 51-entry boundary, startup confirms `u2…u51`, stores append checkpoint `u51`, and stores progressive cursor `u2`; paging before `u2` then confirms `u1` and completes coverage.

## Implementation

- Added a pure startup planner, shared by ordinary mirrors and managed Pi runtimes, that:
  - imports only the bounded latest tail for new sessions and no-checkpoint upgrades;
  - replays only groups after a valid append checkpoint on restart;
  - preserves an existing Relay progressive cursor;
  - preserves completed `piHistoryHasMore: false` state independently of Relay message sequence;
  - permits cursor-free bootstrap only for a virgin managed session and treats missing existing cursors as `history_gap`;
  - detects missing append checkpoints and progressive cursors.
- Renamed internal persistence APIs and reconciliation result fields from “watermark” to “append checkpoint” while retaining the existing on-disk directory for upgrade compatibility.
- Ordinary `lynttyd` mirrors and managed Pi runtimes now accept only the authoritative page cursor. Stale or arbitrary cursor requests return an idempotent no-op with the current cursor.
- Managed-runtime startup and `agent_end` now use the same append-checkpoint recovery semantics as ordinary mirrors, including bounded outage replay. After live envelopes are confirmed, only the exact new JSONL entry IDs are treated as semantically delivered, preventing a second canonical copy of the same turn.
- Managed takeover and rebind use the complete JSONL entry sequence, rebuild per-session cursor/anchor/mirror/mapper state, and wait for old page/reconciliation chains before switching.
- Progressive cursor state advances only after envelope reconciliation and the Relay metadata update both succeed. Every metadata commit has a 10-second acknowledgement bound, so a lost ACK cannot monopolize the shared lock. A pending coverage transition absorbs a late successful Relay broadcast or safely recommits the same cursor without accepting unrelated stale input.
- `history_gap` responses and App metadata retain the last authoritative cursor instead of erasing the diagnosis and later-repair boundary.
- `agent_end` recovery uses an immutable startup-tail anchor—not the independently advancing progressive cursor—when no append checkpoint was established. Missing anchors fail closed instead of falling back to full replay.
- Delayed multi-client page responses cannot overwrite a newer App cursor or metadata version.
- Byte-budget trimming keeps an assistant tool-call entry and its dependent tool results on one reachable page boundary; it cannot emit an orphan `tool-call-end`.
- Updated `docs/architecture/pi-shared-control.md` and corrected R115 terminology.

## Regression coverage

Focused tests cover:

- exact 51-entry startup (`u2…u51`) followed by `u1` paging;
- restart replay of only `u52` while preserving cursor `u2`;
- completed history remaining complete across restart;
- missing progressive cursor and missing append checkpoint fail-closed behavior;
- bounded 500-entry no-checkpoint migration;
- preservation of an older Relay cursor during migration;
- stale/arbitrary page requests as no-ops and delayed multi-client responses as non-regressing;
- an explicitly virgin managed runtime bootstrapping its bounded latest tail while corrupted existing metadata fails closed;
- bounded reconciliation from an immutable startup-tail anchor when no append checkpoint exists;
- App preservation of the cursor in `history_gap` state;
- late metadata commit/ACK-loss adoption without cursor regression;
- managed live-entry delivery marks preventing duplicate canonical turns;
- abandoned-branch cursors remaining valid during managed takeover;
- oversized (over 100 text envelopes) assistant/tool boundaries remaining atomic.

The red/green transcript is retained at `docs/evidence/artifacts/r116/tdd-red-green.log`.

## Verification

Passed in `/home/jc/dev/lyntty/worktrees/session-sync-reliability`:

```text
bun install --frozen-lockfile          # pass; no changes
bun pm untrusted                       # 0 untrusted dependencies
bun run ci:fast                        # pass
  repo hardening                       # pass
  audit                                # No vulnerabilities found
  Wire                                 # 36 pass, 0 fail
  CLI                                  # 635 pass, 0 fail
  Relay                                # 120 pass, 0 fail
  App                                  # 829 pass, 0 fail; bundle smoke pass
  development lifecycle                # 36 pass, 0 fail
git diff --check                       # pass
git show --show-signature HEAD         # Good signature
```

The full committed-code transcript is retained at `docs/evidence/artifacts/r116/final-verification.log`; red/green excerpts are in `docs/evidence/artifacts/r116/tdd-red-green.log`; isolation and remote/live read-only checks are in `docs/evidence/artifacts/r116/isolation-and-remote-audit.log`. Focused final verification additionally passed 108 CLI history tests, 15 App history/session-operation tests, CLI/App typechecks, and the independent no-P0/P1/P2 audit.

## Isolation and residual risk

- No live daemon/service restart, Pi extension reload, live Relay mutation, live JSONL write, live checkpoint write, tmux control, deployment, push, PR, or merge was performed.
- Verification is local and isolated; live recovery of the originally diagnosed stale session remains approval-bound. The final read-only baseline still showed daemon PID `2891`, installed service PATH without `/opt/bin`, and append checkpoint `3c3f1042`.
- The on-disk directory remains named `pi-history-watermark` for backward compatibility even though its semantics are now documented and coded as an append checkpoint.
- `history_gap` remains an explicit fail-closed state rather than an automatic retry loop. The current App preserves the repair boundary but does not add a new in-place Retry control in this change; repair/restart remains the recovery path.
- Canonical page mapping still processes full JSONL context to preserve tool/turn identity. Retrieval-performance redesign remains tracked separately and is not claimed here.
