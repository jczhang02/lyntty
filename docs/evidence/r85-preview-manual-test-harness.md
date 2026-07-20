# R85 — Physical-phone Preview manual-test harness

Date: 2026-07-19

Branch: `feat/preview-manual-test`

Bead: `lyntty-tof`

## Result

**LOCAL IMPLEMENTATION PASS; PHYSICAL-PHONE CHECK PENDING.**

The repository now exposes one short manual path for a standalone Preview APK on a physical Android phone:

```bash
bun preview:test
bun preview:status
bun preview:logs
bun preview:stop
bun preview:reset
```

The harness uses a private LAN address, current source Relay and daemon, worktree-local PGlite/auth/log/state, and a new managed Pi session. It does not require Android Studio, an emulator, Metro, Maestro, or ADB. `stop` preserves pairing; `reset` safely stops a proven-owned process group before deleting only the worktree profile.

## Verified behavior

The public command suite covers:

- deterministic private-LAN selection and stable per-worktree port;
- absent/idempotent status, logs, stop, and reset;
- durable detached-supervisor ownership and whole-group fail-closed shutdown;
- refusal to signal an unrelated process group or replace an unrelated listener;
- cleanup of exactly marked Gradle/native build groups;
- bounded log tails with pairing URL, token, secret, and bearer redaction;
- content-addressed APK reuse and invalidation;
- exact reviewed APK allowlist enforcement before external import;
- V2 mobile data-key credentials (`encryption.publicKey/machineKey`);
- real source Relay/PGlite migration and health;
- real source daemon readiness through isolated credentials without installing the global Pi extension;
- managed-Pi launch environment preserving real `HOME` while isolating `LYNTTY_HOME_DIR` and the extension target;
- low-memory refusal before Gradle starts;
- stripping every inherited `EXPO_PUBLIC_*` value from native-build environments.

The default worktree profile then exercised the real noninteractive setup path:

```text
Preview APK imported: .../lyntty-preview-1.1.0-910003.apk
SHA-256: d0e0a335fa0db34b882fa2c71a89a65e416ecdd1ed21995719aba6a2be99da06
Preview test backend is running at http://<private-lan-ip>:58821
Status: running
Owned supervisor: yes
Relay health: healthy
Daemon: not started
Global Pi extension touched: no
```

The imported APK was accepted only after all of the following matched:

- reviewed `scripts/preview-apk-allowlist.json` SHA-256;
- source commit `4043171d3b6e89ef32a5a7a3c56d5c7b7ab9b40c`;
- unchanged current App/Wire build inputs;
- `.audit.txt` identity and SHA-256;
- embedded `assets/app.config` Preview environment and build commit;
- package `dev.jczhang.lyntty.preview`;
- version `1.1.0` / code `910003`;
- fixed Preview signer `ebd23c222b690e2be635fe3e52bd70b6fb86c5570ab279bc4e8c1f22ed90ef9c`;
- APK Signature Scheme v2, non-debuggable manifest, and standalone bundle.

Before and after the default profile lifecycle, file metadata for live `~/.lyntty/settings.json`, live `~/.lyntty/access.key`, and `~/.pi/agent/extensions/lyntty/index.ts` was unchanged. No Preview supervisor, Relay, daemon, Gradle, or native-build process remained after shutdown.

## Relay discovery compatibility correction

The first physical-phone setup exposed a real contract drift. The running current-source Relay was healthy at `GET /health`, but its root returned `Lyntty Relay API`; the installed `910003` Preview App still required the removed `Welcome to Lyntty Relay!` root marker and displayed `This does not look like a Lyntty relay.`

The minimized live repro was:

```text
GET /       -> 200 Lyntty Relay API
GET /health -> 200 {"status":"ok",...,"service":"lyntty-relay"}
App result  -> This does not look like a Lyntty relay.
```

The compatibility fix is bidirectional:

- current/future App builds probe `GET /health` and accept only exact `status: ok` plus `service: lyntty-relay` JSON;
- current Relay keeps the old root marker alongside its API identity so the already audited `910003` APK can complete server setup without a native rebuild.

The focused App regression went red on the missing probe, then passed 6 tests / 16 assertions. The real source Relay lifecycle test went red on the missing compatibility marker, then passed after the route correction. Full App passed 795 tests / 3,197 assertions; full Relay passed 119 tests / 332 assertions; Preview lifecycle passed 19 tests / 94 assertions. A post-fix phone retry requires restarting the source Relay and remains part of the physical-phone check below.

## Resource correction

An initial native build was stopped after excessive host memory use. A second run inside a 4 GiB memory cgroup reached the arm64 Skia/native stage and was killed by the cgroup OOM guard; systemd recorded a 5.3 GiB memory peak plus 2 GiB swap. No APK from either attempt is claimed.

The final implementation therefore optimizes the actual manual-test need:

1. reuse a content-matched private cache;
2. otherwise import only an exact reviewed current-source APK;
3. only then consider a native build;
4. refuse before Gradle when Linux `MemAvailable` is below 12 GiB;
5. stream logs directly to disk, use one worker/one arm64 ABI, and clean marked build groups on interruption.

The failed Gradle caches were removed after proving no matching processes remained. A later isolated rebuild attempt for the Relay-discovery correction passed the memory preflight but stopped during Kotlin dependency resolution when Maven Central terminated the TLS handshake. One retry reached JavaScript bundling before Bun exited with `EMFILE: too many open files, watch`; neither attempt left a Gradle/native process or produced a claimed APK. `preview:reset` now also removes an incomplete pre-state build profile under the external lifecycle lock; the 3.3 GiB failed profile was removed through that path. The backward-compatible Relay marker makes the rebuild unnecessary for the installed `910003` test path. The retained manual profile contains only the reviewed APK, local Relay state, logs, and private metadata.

## Verification commands

```bash
bun test scripts/preview.test.ts
bun run ci:dev
bun run ci:cli
bun run ci:fast
bun build scripts/preview.ts --target bun --outfile dist/test-state/preview-build.js
bun pm untrusted
git diff --check
```

Observed results: Wire 33; CLI 585; Relay 119; App 795 tests / 3,197 assertions; combined dev/Preview lifecycle 32 tests / 182 assertions. Independent requirements verification and post-fix code review both returned `APPROVE` with no P0/P1/P2 blocker.

## Not run and residual risk

- The user has not yet run the final interactive physical-phone steps against this branch: install/open, local Server URL confirmation, V2 QR approval, node/session visibility, message round trip, and App reopen.
- The real managed Pi TUI was not launched by automation because that would create a live Pi session and require provider credentials; only its isolated launch environment was exercised.
- The native-build fallback did not complete on this memory-constrained host. The current App/Wire source instead uses the exact reviewed `910003` APK.
- An imported APK may initially contain `relay.jczhang.cc` as its normal default. The harness now pauses before pairing and requires the operator to activate the displayed local URL before creating or using the test account. Test CLI/daemon traffic is always forced to the local Relay.
- LAN firewall/client-isolation policy may still prevent the phone from reaching the displayed private address. The harness reports the exact URL but does not modify host or router firewall state.
