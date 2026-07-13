# R75 Three-round hardening

Date: 2026-07-13

Goal: `19c76cd7-efde-436f-97f0-392563151751`

Beads epic: `lyntty-8z4`

## Round 1 — security boundaries

Status: complete after an implementation pass, an independent blocking review, blocker fixes, and a clean follow-up review.

### Changes

- Protected every `lynttyd` local HTTP endpoint in the `onRequest` phase with the daemon control token.
- Updated control clients and the retained agent integration helper to send the token.
- Rejected case-insensitive process-loader and command-resolution environment variables, including `NODE_OPTIONS`, `PATH`, `PATHEXT`, `COMSPEC`, and reserved `LYNTTY_*` keys.
- Restricted Lyntty state/log directories to `0700` and credentials, daemon state/lock, and session encryption ledger files to `0600` where POSIX permissions are available.
- Redacted the daemon control token from doctor output.
- Made Android release and relay deploy main-only and full-SHA-bound; moved production jobs behind named GitHub environments; separated relay PR image builds from main publishing.
- Migrated pnpm overrides/build allowlisting to `pnpm-workspace.yaml`, upgraded vulnerable runtime dependencies, and added a high/critical production audit gate.
- Redacted six tracked pairing URLs, removed 18 auth/pairing screenshots that could expose auth material, and added byte-level evidence scanning with deceptive-suffix and sensitive-image guards.
- Excluded `.env*` files from Docker build context except explicit `.env.example` files.

### Verification

```text
HOME=<temporary> LYNTTY_HOME_DIR=<temporary> pnpm ci:fast
```

Result:

- repository hardening: 6/6 passed;
- production audit: 0 critical, 0 high; 27 moderate and 6 low remain;
- wire: 19 tests passed;
- CLI: typecheck passed, 798 tests passed;
- relay: typecheck/build passed, 101 tests passed;
- app: typecheck/i18n/config checks passed, 795 tests passed;
- agent: typecheck passed, 227 tests passed;
- `git diff --check`: passed.

Independent follow-up review result: no remaining P0/P1 blocker in Round 1.

### Not run / residual risk

- No production Android release, relay image publish, SSH deploy, npm publish, or push was performed.
- GitHub currently has no configured `production-android` or `production-relay` environment protection rules. The workflows enforce `main == origin/main` in code, but required reviewers and deployment-branch rules still need repository-owner configuration.
- The remaining moderate/low advisories were not treated as proven runtime vulnerabilities; they remain visible through `pnpm audit`.
- Existing historical short relay image tags are no longer accepted by the deploy workflow; a new full-SHA image is required before the next deploy/rollback exercise.

## Round 2 — runtime reliability

Status: complete after repeated implementation, adversarial review, blocker fixes, full suites, and an independent final review.

### Changes

- Added epoch-scoped Pi command queues with urgent-command ordering, bounded retries, terminal failure states, queue-full feedback, stable relay receive cursors, and fsynced per-session outcome ledgers.
- Made prompt acceptance the durable success boundary; stale ACKs and stale/concurrent extension instances are fenced.
- Added keyed activation leases, explicit wait/stop/interrupt takeover behavior, process-exit waiting, stale-mirror cleanup, and managed-runtime bridge lockout.
- Closed mirror session clients permanently on teardown and prevented reconnect timers from resurrecting old RPC owners.
- Derived relay identity from the real Pi session id and propagated explicit `history_gap` states through daemon RPC, durable metadata, Sessions Home, and Session Remote.
- Added fsynced canonical JSONL watermarks, acknowledged replay, relay-envelope inventory, and backward-compatible deterministic protocol local ids. Restart now imports only unconfirmed entries and closes extension-sequence gaps before advancing the watermark.

### Verification

- CLI: 101 files / 834 tests; typecheck and build passed.
- App runtime integration during this round was covered by the final App suite below.
- Real isolated daemon restart: a phone command was persisted at relay while `lynttyd` was stopped, delivered after restart, accepted exactly once by Pi, and rendered back in the APK.
- Reload ownership: a new extension instance reset its event sequence, remained the sole command consumer, and delivered one prompt/one response.
- Independent final Round 2 review: no remaining P0/P1 blocker after the permanent-close fix.

## Round 3 — mobile reliability and Maestro E2E

Status: complete after implementation, release-style APK validation, multidimensional Maestro runs, and independent final review.

### Changes

- Persisted encrypted relay outbox records and synthetic-session sends in MMKV; v1 rows migrate using real `pi-local:` identities, late canonical sessions reconcile after every snapshot, and synthetic-to-normal cutover persists ciphertext before network delivery.
- Kept composer text until a send is durably queued, blocked duplicate taps, and reported missing session/encryption failures.
- Prevented discovered computer-side Pi sessions from falling through to duplicate managed-runtime spawn when mirror attachment fails.
- Preserved visible extension-waiting and history-gap remediation; ordered backward relay pages oldest-first before the stateful turn reducer and serialized live update processing.
- Restored a non-production release-style APK path (`dev.jczhang.lyntty.dev`) with a fixed preview-only signer; production release still requires separate production signing and Firebase inputs.
- Upgraded `react-native-worklets` to the Reanimated-compatible 0.10 line.

### APK and Maestro evidence

Environment was isolated with a temporary `HOME`, temporary `LYNTTY_HOME_DIR`, a uniquely named tmux Pi session, local relay on port 3005, and Android API 35 AVD `lyntty_v03_api35`. No live `~/.pi`, `~/.lyntty`, production relay, or production signing key was modified.

Release-style artifact:

- package: `dev.jczhang.lyntty.dev`;
- version: `1.0.0` (`versionCode=1`);
- target SDK: 36;
- APK SHA-256, signer fingerprint, size, package metadata, and complete build log recorded under `docs/evidence/artifacts/r75-maestro-final2/`;
- preview manifest verified `bool/lyntty_uses_cleartext = true`; production remains false.

Passed Maestro dimensions:

1. first-run account creation;
2. encrypted node pairing via deep link;
3. historical Pi session open plus live phone-to-Pi reply;
4. app stop/relaunch and session recovery;
5. phone command persisted at the target session message endpoint while daemon was stopped, then replayed once after daemon restart (`pane_occurrences=1`, because the fragmented prompt does not contain the exact assistant token);
6. interactive Pi `/reload` on the validated isolated pane produced `eventReason: reload`, a new extension owner claim, and exactly one post-reload remote execution;
7. explicit `history_gap` rendering after an unknown cursor.

Artifacts: `docs/evidence/artifacts/r75-maestro-final2/` (JUnit for all seven dimensions, raw orchestration checkpoints, reload ownership window, APK build/signer metadata, and cleanup record; temporary pairing material was deleted).

### Final verification

- App: 87 files / 808 tests; typecheck passed.
- CLI: 101 files / 834 tests; typecheck/build passed.
- Wire: 19 tests; build passed.
- Relay: 101 tests; typecheck passed; production audit: 0 high / 0 critical (27 moderate, 6 low).
- Workflow hardening: 3/3 passed.
- Release APK assembly: passed.
- `git diff --check`: passed.
- Independent final release-blocker review: **APPROVE**, no P0/P1 remaining.

### Not run / residual risk

- No physical-phone or iOS run was performed; Android API 35 release-style emulator is the acceptance evidence.
- No production signing, publish, deploy, npm publish, push, or PR operation was performed.
- GitHub environment reviewer/branch policies remain an external repository-configuration requirement from Round 1.
