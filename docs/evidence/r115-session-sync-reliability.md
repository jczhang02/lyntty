# R115 — Pi session sync and discovery reliability

Date: 2026-07-26

Branch: `fix/session-sync-reliability`

Beads: `lyntty-7ye`, `lyntty-50k`, `lyntty-ose`

Verified implementation commits:

- `a47165a88ee088b9d4caaf128f6f7329026b3235` — CLI/Relay history and discovery hardening;
- `029a4c1b10d3da7067cb10075565c653ea79b12b` — App merge and durable canonical-name persistence;
- `577b6e2c526b58a1d8d3fbd9ba3454752a77cd92` — dependency advisory remediation.

## Result

Two independent regressions were reproduced and fixed in an isolated worktree without touching the live daemon, Pi extension, Relay data, Pi JSONL, legacy on-disk history checkpoint, tmux panes, or active sessions.

1. Durable Pi history could stop while presence remained healthy. Randomized re-encryption retried a deterministic `session:<envelope.id>` Relay `localId` with different ciphertext, received HTTP 409, and left the outbox head permanently blocking later messages.
2. Sessions Home could show generic Pi names. The Linux user-service PATH omitted `/opt/bin`, executable detection was incorrectly used as a JSONL-discovery capability, and older Relay rows lacked the identity needed to merge and persist canonical local titles.

## History-sync fix

- AEAD nonces remain randomized. An in-process retry reuses the already encrypted outbox item instead of re-encrypting it.
- Restart reconciliation inventories and decrypts Relay messages, compares canonical logical digests, and binds status only to the exact `session:<envelope.id>` Relay `localId`.
- Relay acknowledgements are applied per item. Missing acknowledgements remain queued.
- A genuine localId/content collision remains a strict structured HTTP 409. The CLI quarantines the conflicting item, reports `history_gap`, and continues sending later items instead of creating head-of-line blocking.
- Canonical mapping now processes the complete JSONL sequence before selecting post-append-checkpoint or newly appended groups, preserving assistant/tool-result turn identity across slice boundaries.
- Each JSONL entry is capped once as a canonical envelope group. Full replay and history pagination therefore never reuse one localId for differently truncated content.
- The legacy-named local history file stores an append checkpoint: it advances only through continuously Relay-confirmed forward entries and is not proof that every older JSONL entry has already been imported. Older coverage is tracked independently by Relay metadata's progressive `piHistoryCursor`; conflicts or unconfirmed content fail closed with `history_gap`.

## Discovery and name fix

- Linux daemon service PATH now includes `/opt/bin`.
- Machine metadata advertises bundled `piSessionDiscovery` separately from executable launch availability. Older metadata is fail-open; only explicit `available: false` skips discovery.
- Relay `/v1/sessions` returns stable session tags, discovery records carry the matching Pi tag, and the App can merge legacy Relay rows that do not yet contain `piSessionId`.
- Real Relay rows are enriched with canonical local Pi titles and the improved encrypted metadata is persisted with optimistic version retries, preservation of concurrent unrelated metadata, bounded concurrency, per-row failure isolation, and a 10-second acknowledgement deadline.
- Synthetic rows are never persisted to Relay.
- Generic values (`Pi`, `Pi session`, `(no messages)`, and `no messages`, case-insensitive) are normalized at CLI and App read boundaries, so they cannot replace or persist over a useful Relay title.

## Dependency audit blocker

A fresh audit discovered two newly published transitive advisories while final verification was running:

- `GHSA-mh99-v99m-4gvg` in `brace-expansion <=5.0.7`;
- `GHSA-5qjj-4xww-7phc` in `valibot <=1.4.1`.

`valibot` is pinned to `1.4.2`. `brace-expansion` is pinned to `5.0.8`; a small Bun patch preserves the directly-callable CommonJS export required by minimatch 3 while retaining the fixed v5 named exports. The old and new call shapes were exercised before the final repository gate. The launcher-icon hardening test now has an explicit 30-second bound because hashing all 642 tracked PNG blobs takes approximately six seconds in this worktree and exceeded Bun's default five-second test timeout.

## Verification

Durable artifacts:

- `docs/evidence/artifacts/r115/final-verification.log` — complete frozen install, trust audit, `ci:fast`, diff check, and four GPG signature outputs against commit `31e1c51`;
- `docs/evidence/artifacts/r115/tdd-red-green.log` — retained red/green failure and success excerpts for the final canonical-mapping and generic-title regressions;
- `docs/evidence/artifacts/r115/isolation-and-remote-audit.log` — worktree/branch, no merge commits, no remote branch, no PR, and read-only live baseline comparison.

Passed in `/home/jc/dev/lyntty/worktrees/session-sync-reliability`:

```text
bun install --frozen-lockfile
bun pm untrusted                         # 0 untrusted dependencies
bun run ci:audit                         # No vulnerabilities found
bun run ci:fast                          # pass
bun test --timeout 30000 scripts/workflow-hardening.test.mjs
                                         # 30 pass, 0 fail
packages/lyntty-app/node_modules/.bin/eslint --version
                                         # v9.39.5
bun -e "const m = require('./node_modules/.bun/minimatch@3.1.5/node_modules/minimatch'); console.log(m.braceExpand('a{b,c}d').join(','))"
                                         # abd,acd
(cd packages/lyntty-cli && bun test src/api/apiSession.test.ts src/pi/runPiHistory.test.ts src/pi/reconcilePiHistory.test.ts src/pi/runPiExternalMirror.test.ts src/pi/piSessionDisplayName.test.ts src/pi/runPiRecovery.test.ts)
                                         # pass
(cd packages/lyntty-app && bun test sources/sync/piDiscoveredSessions.test.ts sources/sync/piSessionNamePersistence.test.ts sources/sync/machineMetadata.test.ts sources/sync/machineRpcSchemas.test.ts)
                                         # pass
(cd packages/lyntty-relay && bun test sources/app/api/routes/v3SessionRoutes.test.ts)
                                         # 12 pass, 0 fail
git diff --check                         # pass
```

Two independent final reviews found no remaining P0/P1/P2 sync blocker. A targeted follow-up verifier confirmed that the generic-title P2 was resolved and introduced no new P0/P1/P2 issue. The regression transcript records failing assertions before each final fix and green focused suites afterwards.

### Release-style Android artifact

The first default build attempt reached native compilation but failed because the shared ccache directory was not writable. It did not indicate a source failure. The successful rerun used worktree-local HOME/Gradle state and disabled ccache against the Preview identity:

```text
HOME=<worktree>/dist/test-state/android-home \
GRADLE_USER_HOME=<worktree>/dist/test-state/gradle-home \
CCACHE_DISABLE=1 \
CCACHE_TEMPDIR=<worktree>/dist/test-state/ccache-tmp \
APP_ENV=preview ./gradlew :app:assembleRelease --no-daemon
BUILD SUCCESSFUL
```

Artifact:

```text
packages/lyntty-app/android/app/build/outputs/apk/release/app-release.apk
size: 198359373 bytes
sha256: 0e5a140e1932288802252049a45d5d7e0f493825fe9b20dd80c376adbe460acd
package: dev.jczhang.lyntty.preview
label: Lyntty (preview)
version: 1.2.0 (1)
```

## Not run and residual risk

- The APK was not installed and Maestro was not run because the connected emulator already contains Preview state; this evidence does not claim device interaction or physical-phone validation.
- No live daemon restart, systemd reinstall, Pi extension reload, live Relay repair, live watermark update, or production deployment was performed. A final read-only audit still found daemon PID `2891`, the original service PATH without `/opt/bin`, and watermark entry `3c3f1042`. Those actions still require explicit approval.
- Live recovery of the diagnosed stale session remains unverified until the user authorizes deployment and reconciliation.
- Low residual hardening opportunities remain: reject unstructured non-Lyntty HTTP 409 responses before quarantine; reject malformed timestamp-less JSONL records instead of using a runtime timestamp; add a cold-start App integration test for name persistence; and bound the separate machine-RPC discovery call client-side.
