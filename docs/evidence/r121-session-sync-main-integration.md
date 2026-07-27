# R121 — Session-sync reliability integration with progressive retrieval

Date: 2026-07-27

Branch: `fix/session-sync-reliability`

Bead: `lyntty-90z`

Inputs:

- session-sync tip: `3c657f8197a89d0b84e9457593be2a96ee054275`;
- protected-main tip: `ab0f27fabcdc5e9d8b4b2c8da5e319d510505d3a`;
- signed integration commit: `6ba0d592f2cd5ab9886a024bb3ec336a40667265`.

## Purpose

Protected `main` advanced while R115/R116 session reliability work was isolated. Main added progressive Sessions Home retrieval, a persistent incremental Pi-session index, account-generation isolation, deletion tombstones, bounded requests, and Stable 1.2.1 release fixes. The reliability branch independently added durable outbox reconciliation, canonical name persistence, and two-coordinate Pi history coverage.

A one-sided conflict resolution would either remove the retrieval work or reintroduce stale history, duplicate turns, generic titles, unbounded metadata locks, and cursor regressions. The integration preserves both sets of invariants.

## Conflict resolution

Six content conflicts were resolved:

- root dependency policy retains both patched `brace-expansion@5.0.8` and `minimatch@3.1.5`, plus `valibot@1.4.2`;
- machine RPC schema tests retain stable Relay tags and progressive-index `refreshing` state;
- discovery identity resolution uses Relay id, stable tag, and `machineId + piSessionId`, while preserving newer Relay sequence state;
- App sync publishes Relay rows immediately, progressively merges Pi pages, and persists improved canonical names without blocking Sessions Home;
- CLI configuration retains the legacy on-disk `pi-history-watermark` directory as the append-checkpoint location and also retains `pi-session-index.json`;
- daemon startup and paging retain the incremental index, complete-entry branch coordinates, append checkpoints, authoritative progressive cursors, outbox-aware reconciliation, and serialized page commits.

## Integration hardening

Independent conflict review exposed four cross-branch races not visible in either side alone:

1. A deleted legacy Relay row known only by its stable Pi tag could reappear as a synthetic discovery row. Stable tags are now account-scoped tombstone identities, validated on persistence, promoted to full Pi identity when discovery resolves it, and retained across restart.
2. Canonical-name persistence could use a replacement account's mutable encryption object or drop later progressive pages while one update was in flight. Each job now captures an immutable runtime context, checks it around every encryption/ACK/retry boundary, and drains one coalesced newest pending snapshot.
3. A delayed Pi-history RPC could recreate a row deleted while the request was in flight. Page application now requires the session to remain present and uses the runtime context for stale-response catch-up.
4. Restricting discovery to an active machine would prune or strand cached offline snapshots. Discovery is suppressed only by explicit `piSessionDiscovery.available: false`; bounded RPC failure retains prior rows.

The App snapshot remains non-blocking: Relay rows render before Pi RPC completion, only a successful discovery EOF prunes stale machine records, and obsolete generations/pages are ignored.

## Test-first evidence

The red/green transcript is retained at `docs/evidence/artifacts/r121/tdd-red-green.log`. It records failures for stable-tag resurrection, malformed/non-deduplicated tag tombstones, delete updates that discarded the tag, and the initial i18n gate. Focused final integration tests passed:

```text
App focused sync integration                 60 pass, 0 fail
  generation/race subset                     10 pass, 0 fail
CLI index/history/reconciliation suite       125 pass, 0 fail
App and CLI typechecks                       pass
Independent merge verifier                  VERIFIED_NO_P0_P1_P2
```

## Full verification

The exact committed-tree transcript is retained at `docs/evidence/artifacts/r121/final-verification.log`.

```text
bun install --frozen-lockfile                pass; no lockfile change
bun pm untrusted                             0 untrusted dependencies
bun run ci:fast                              pass
  repository hardening                       85 pass, 0 fail
  dependency audit                           no vulnerabilities
  Wire                                       36 pass, 0 fail
  CLI                                        656 pass, 0 fail
  Relay                                      120 pass, 0 fail
  App                                        878 pass, 0 fail; bundle smoke pass
  isolated development lifecycle             36 pass, 0 fail
git diff --check                             pass
GPG signature                                Good signature
```

## Isolation and release boundary

- No live daemon/service restart, Pi extension reload, Relay deployment, JSONL write, append-checkpoint write, tmux control, APK installation, tag, Release, rollback, or production mutation occurred during integration.
- The active root checkout beneath the current Pi session was not updated. Integration stayed in `/home/jc/dev/lyntty/worktrees/session-sync-reliability`.
- Stable v1.2.2 preparation and publication are a subsequent protected-main Candidate/Promotion transaction. This evidence does not claim that v1.2.2 exists or that production Relay/CLI has been updated.
- Physical Android validation was not performed or claimed.
