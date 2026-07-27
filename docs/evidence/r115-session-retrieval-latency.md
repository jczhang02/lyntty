# R115 — Progressive Sessions Home retrieval

Date: 2026-07-26
Bead: `lyntty-v2l`
Branch: `fix/session-retrieval-latency`

## Result

Sessions Home no longer waits for a complete Pi JSONL scan before publishing session rows.

The cold path now has two independent progressive boundaries:

1. the App completes one bounded relay attempt and publishes relay rows;
2. `lynttyd` publishes a bounded newest Pi tail, then completes and persists the full index in the background.

Pi JSONL remains canonical. The daemon index contains only local summary data, is rebuildable, uses atomic `0600` persistence, and is not sent to the relay.

## Root cause

The original daemon discovery path called `SessionManager.listAll()` for every cache miss. The App then awaited every Pi page before marking Sessions Home ready. On the diagnostic machine:

- 452 Pi JSONL files occupied 1,349,203,621 logical bytes;
- `SessionManager.listAll()` took about 4.4–4.9 seconds;
- a controlled 1.339 GB scan took 5.537 seconds;
- a cache miss opened roughly 452 JSONL files and took 5.294 seconds;
- even a process-local cache hit still took 3.181 seconds in the measured path;
- relay `/v1/sessions` work itself was about 1–4 ms.

The delay was therefore local full-history discovery plus App-side all-pages gating, not relay database latency.

## Implemented behavior

### `lynttyd`

- Versioned persisted summary index with parser generation `2`.
- Size/mtime/ctime fingerprint plus bounded head hash.
- Persisted parsed byte offset and append-only continuation; truncation, replacement, bad continuity, corrupt data, or parser-version drift rebuilds the affected file.
- A 256 KiB prefix for each of the newest 32 files is sufficient to publish the first tail; complete parsing continues with concurrency `2`.
- Prefix summaries are explicitly non-authoritative: their message count is a lower bound and cannot create `history_gap` until the corresponding file is fully indexed.
- A complete-but-cached count that trails the relay ledger is also non-authoritative until `lynttyd` revalidates that exact file fingerprint; active runtimes never infer a gap from the discovery count race.
- At most 1 MiB of one JSON line is retained, so a single huge message/tool payload does not require buffering the full line.
- Cooperative event-loop yields during parsing.
- Stale-while-revalidate and single-flight refresh.
- Atomic private persistence and in-memory availability when persistence fails.
- Immutable discovery generation plus a per-daemon-runtime nonce in cursors; a later page from another index generation or daemon process is rejected.
- Exact session open waits for the full refresh only when the requested id is absent from the current tail or its file fingerprint changed.

### App

- Relay rows publish after one 5-second-bounded request; the timeout remains active through response-body decoding.
- Pi pages merge immediately instead of waiting for all machines/pages.
- A failed/warming machine retains its previous rows; only a successful EOF prunes missing rows.
- Machine RPC and Pi history-page RPC use a 15-second Socket.IO acknowledgement timeout; account reset also aborts the caller-side history wait.
- Retry state is per failed machine, exponential, and finite. App/socket/machine lifecycle events advance an explicit full-refresh epoch, so an older in-flight retry cannot omit a newly listed machine or overwrite the reset retry state.
- First socket connect is not treated as reconnect; AppState active heartbeats do not duplicate refreshes.
- Machine-list HTTP is single-flight, body-bounded, generation/account guarded, and accepts a validated empty list as authoritative. Socket create/update/delete activity that arrives during the request is merged instead of rolled back.
- Relay mutations with a newer sequence are not overwritten by an older discovery generation.
- Relay updates, settings sync, message/history reads, decryption, send/outbox completion, and synthetic-outbox migration are bound to the active account generation; reset aborts outstanding settings/message reads and stale completions cannot mutate the replacement runtime.
- Discovery-origin `history_gap` is provisional and can be cleared by a verified complete refresh; an authoritative `pi-history-page` gap remains sticky.
- Every session deletion is hidden in memory immediately so an old relay snapshot cannot recreate it. If Pi identity arrives after the delete, the hidden row is promoted to a bounded, server-and-account-scoped local tombstone so later pages and App restarts cannot recreate a synthetic row on the deleting device.

## Controlled performance evidence

Synthetic corpus used for final measurements:

- 452 JSONL files;
- 1,240,394,694 logical bytes;
- 1,401 message records in each generated session.

| Path | Observation |
| --- | ---: |
| Cold first tail | 32 rows in 51.2 ms |
| Bytes read before first tail | 10,485,760 |
| Complete background index | 2,240.1 ms |
| Warm restore | 452 rows in 5.5 ms, zero JSONL bytes read |
| One appended file refresh | 10.8 ms, 65,699 bytes read |
| Persisted index | 452 entries, version 2, mode `0600` |

The full scan remains real work, but it occurs after the first tail and does not gate Sessions Home.

Raw metrics: [`artifacts/r115-session-retrieval-latency/performance-metrics.json`](artifacts/r115-session-retrieval-latency/performance-metrics.json).

## Release-style Android validation

Environment:

- package `dev.jczhang.lyntty.dev`;
- release-style APK installed on `emulator-5554`;
- local isolated relay on port `49616`;
- isolated `HOME`, Pi agent directory, and `LYNTTY_HOME_DIR`;
- APK SHA-256 `01aa6de6cf6c110a57f95d01cebbb9f9e7aa5cca9ea7531adea3a49869098a05`.

Cold run with no daemon index:

- first Pi RPC response was observed 1,602 ms after App sync initialization;
- a Sessions Home row was captured 1,886 ms after App sync initialization while the index was still warming;
- the first encrypted discovery response was 17,188 bytes (the 32-row newest tail);
- full immutable pagination completed through seven responses (two warming responses plus five complete pages);
- one initial `/v1/sessions` request occurred in the run;
- full progressive delivery was observed 5,149 ms after App sync initialization;
- opening the resulting historical row reached Session Remote and rendered canonical history with honest `History only` remediation;
- after all review fixes, the source-identical APK was rebuilt, reinstalled, and opened the Sessions route without a native crash; the isolated discovery runtime had already been stopped, so this final APK launch was not a repeat of the cold progressive timing run.

Artifacts:

- [`first-sessions-snapshot.png`](artifacts/r115-session-retrieval-latency/first-sessions-snapshot.png)
- [`full-progressive-snapshot.png`](artifacts/r115-session-retrieval-latency/full-progressive-snapshot.png)
- [`session-remote-smoke.png`](artifacts/r115-session-retrieval-latency/session-remote-smoke.png)
- [`runtime-observations.txt`](artifacts/r115-session-retrieval-latency/runtime-observations.txt)
- [`apk-sha256.txt`](artifacts/r115-session-retrieval-latency/apk-sha256.txt)

## Verification commands

Independent read-only review exercised the stale-index, account-reset, retry-epoch, machine-snapshot, deletion, RPC-bound, and legacy-extension races. After the resulting fixes, the final reviewer reported no P0/P1 blocker.

Focused iteration:

```bash
cd packages/lyntty-cli
bun run typecheck
bun test src/pi/piSessionIndex.test.ts src/pi/runPiRecovery.test.ts src/daemon/piSpawnDirectory.test.ts

cd ../lyntty-app
bun run typecheck
bun test --preload ./sources/bunTestSetup.ts \
  sources/sync/boundedJsonRequest.test.ts \
  sources/sync/machineRpcSchemas.test.ts \
  sources/sync/machineSnapshotMerge.test.ts \
  sources/sync/piSessionDiscoveryFetch.test.ts \
  sources/sync/piSessionListSnapshot.test.ts \
  sources/sync/piSessionRefreshPolicy.test.ts \
  sources/sync/piSessionTombstones.test.ts \
  sources/sync/piDiscoveredSessions.test.ts \
  sources/sync/piHistoryPage.test.ts \
  sources/auth/authInvalidation.test.ts
# Mock-heavy suites run in separate Bun processes.
bun test --preload ./sources/bunTestSetup.ts sources/sync/apiSocketRpc.test.ts
bun test --preload ./sources/bunTestSetup.ts sources/sync/syncUpdateGeneration.test.ts
```

Final package claim gates:

```bash
bun run ci:cli                # pass: 606 tests, 0 failures
bun run ci:app                # pass: 863 tests / 3,381 assertions / 98 files
bun run ci:daemon-integration # pass: compiled CLI/lynttyd/relay integration
git diff --check              # pass
```

Additional repository checks:

```bash
bun run ci:wire   # pass: 36 tests
bun run ci:relay  # pass, including compiled relay smoke
bun run ci:dev    # pass: 36 tests
bun test --timeout 20000 \
  scripts/workflow-hardening.test.mjs \
  scripts/evidence-redaction.test.mjs \
  scripts/relay-oci-sbom.test.ts \
  scripts/release-agent-rules.test.mjs \
  scripts/agent-guidance.test.mjs \
  scripts/docs-currentness.test.mjs # pass: 53 tests

cd docs/.site
bun install --frozen-lockfile
bun run docs:check # pass
```

APK build:

```bash
cd packages/lyntty-app/android
CCACHE_DIR=/tmp/lyntty-v2l-ccache \
APP_ENV=development \
EXPO_PUBLIC_SERVER_URL=http://10.0.2.2:49616 \
EXPO_PUBLIC_LYNTTY_SERVER_URL=http://10.0.2.2:49616 \
./gradlew app:assembleRelease --no-daemon --max-workers=1
adb -s emulator-5554 install -r app/build/outputs/apk/release/app-release.apk
```

Secrets and pairing material were supplied only through the isolated environment and are not present in committed artifacts.

## Not run and residual risk

- The first final APK rebuild attempt failed because the global `/home/jc/.cache/ccache` directory was root-owned. The successful source-identical rebuild used task-specific `CCACHE_DIR=/tmp/lyntty-v2l-ccache`; no global permissions were changed.
- `bun run ci:fast` was not green as one aggregate command. Its default 5-second per-test timeout expired while the existing launcher-branding hardening test sequentially inspected 642 tracked PNG blobs; the same hardening set passed 53/53 with an explicit 20-second test timeout. This task did not weaken that unrelated policy test.
- `bun run ci:audit` reports two advisories already present at base `2d33abc`: `brace-expansion` (high, transitive through Pi/Expo/tooling) and `valibot` (moderate, through Prisma). No dependency update was bundled into this behavior fix.
- No physical-phone validation was performed.
- No production relay was changed or exercised.
- The user's live Pi extension, `~/.pi`, `~/.lyntty`, and active Pi session were not touched.
- Final validation opened historical Session Remote; it did not force-load an extension or send a shared-control message. Existing shared-control, `history_gap`, outbox, and daemon integration gates cover those unchanged paths.
- Deletion tombstones are durable on the deleting App installation and isolated by relay URL plus account id; they are not synchronized as cross-device relay policy.
- The 1,602 ms Pi-page number is a condition-poll upper bound at the daemon response boundary. The 1,886 ms screenshot proves a rendered Sessions Home row, but does not separately timestamp React reconciliation of the first local Pi page.
- Those cold timing observations predate the final account/race/history-gap hardening. The bounded-tail and progressive retrieval architecture did not change, but the source-identical final APK was only rebuilt, installed, and route-smoked; it was not cold-retimed after the isolated runtime had been shut down.
