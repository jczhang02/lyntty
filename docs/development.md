# Isolated local development

Run development commands from the root of a Git worktree. Bun is the only JavaScript runtime used by project commands. On macOS, install the OS locking utility once with `brew install flock`; Linux distributions normally provide it with util-linux.

```bash
bun install --frozen-lockfile
bun dev:up
bun dev:check
bun dev:verify
bun dev:down
```

`dev:up` starts a source Relay and foreground `lynttyd`. It creates an isolated auth identity and uses only the current worktree's state:

```text
<worktree>/dist/dev/<worktree-hash>/
├── home/
├── lyntty/
├── relay/pglite/
├── logs/
├── evidence/
├── secrets/
└── state.json
```

It does not read or write live `~/.pi` or `~/.lyntty`. The worktree hash deterministically selects a candidate Relay/Metro port block. Allocation is serialized under Git's common directory and probes actual port availability, so two worktrees can start concurrently without sharing runtime state or ports.

## Commands

- `bun dev:up` — start or reuse the worktree's owned Relay and daemon.
- `bun dev:check` — verify state, Relay health, and every supervisor's PID ownership.
- `bun dev:verify` — additionally verify authenticated machine registration plus source CLI `daemon status`/`daemon list`; writes redacted reusable evidence to `dist/dev/<hash>/evidence/verify.json`.
- `bun dev:down` — stop only process groups whose PID, command, cwd, instance marker, and role all match the recorded worktree state.

Add `--json` to any command for machine-readable output.

If any live PID cannot be proven owned, `dev:down` refuses **all** signals. Inspect `bun dev:check --json`; do not delete or rewrite state until the process identity is understood. A dead recorded PID is treated as stale and is never signaled.

## Physical-phone Preview smoke

Use the manual Preview harness to test the current worktree with a standalone release-style APK on a physical Android phone. It starts an isolated local Relay on the computer's private LAN address and routes the test CLI/daemon only to that Relay; it does not require Metro, an emulator, Android Studio, or ADB.

```bash
bun preview:test
```

On the first run the command:

1. reuses a content-matched cached APK, imports an audited current-source `lyntty-preview-*.apk` from `~/Downloads`, or builds one when at least 12 GiB of memory is available;
2. starts the current source Relay on a stable worktree-local LAN port;
3. prints the APK path and Relay URL;
4. requires **Lyntty (preview)** 1.2 or newer to validate and save that Relay URL before account creation, then asks you to create the local test account and scan the terminal QR code;
5. starts the current source daemon directly, without installing the global Pi extension;
6. launches a new managed Pi session using the existing Pi model configuration.

The phone and computer must be on the same trusted LAN. If the default route is ambiguous, set the address explicitly before the first run:

```bash
LYNTTY_PREVIEW_LAN_IP=192.168.1.20 bun preview:test
```

Preview 1.2 and newer fail closed on first launch: credentials and sync remain disabled until **Connect to Relay** validates and saves the local URL through canonical `/health`. Older imported APKs may retain `relay.jczhang.cc` as their public default, so the harness still pauses before pairing and requires local-URL confirmation. The saved local override persists across Preview upgrades, so later runs reuse the account, node pairing, Relay database, APK, and port.

The manual check is intentionally short:

1. the node and new Pi Session appear on the phone;
2. a phone message reaches Pi;
3. the Pi reply appears on the phone;
4. reopening the App preserves the Session.

The backend remains available after managed Pi exits:

```bash
bun preview:status   # Relay health, daemon, APK identity, and owned supervisor
bun preview:logs     # bounded, redacted Relay/daemon log tails
bun preview:stop     # stop only the proven owned process group; preserve pairing
bun preview:reset    # safely stop, then remove only this worktree's manual profile
```

State is private and ignored under `dist/manual-preview/<worktree-hash>/`. `preview:stop` never deletes it. `preview:reset` removes the local Relay account and computer pairing, but cannot clear Android App data. **Clear Relay** in Preview settings removes the saved URL, clears old authentication state, and returns the App to mandatory setup.

APK reuse is fail-closed. An imported APK needs an exact SHA-256 entry in the reviewed `scripts/preview-apk-allowlist.json`, a matching `.audit.txt` sidecar and embedded build commit, exact current App/Wire inputs, Preview package/signature, and standalone bundle. Override discovery with `LYNTTY_PREVIEW_APK=/path/to/lyntty-preview.apk`; an unallowlisted APK is rejected. A native build removes inherited `EXPO_PUBLIC_*` values, uses one worker and `arm64-v8a`, and refuses before Gradle when memory is below the safety threshold.

The harness never changes live `~/.lyntty`, the global Pi extension, or a current Pi session. It intentionally keeps the real user `HOME` so the new managed Pi can use existing model/provider configuration; the only normal live Pi-side effect is a new session-history entry.

## Android emulator

Android is opt-in:

```bash
bun dev:up --android
```

Only this form starts worktree-local Metro and runs the development APK install with `--no-bundler`. The app receives `http://10.0.2.2:<relay-port>` and the isolated development credentials. Plain `bun dev:up` never starts Metro, Gradle, ADB, or an emulator. Stop the backend and Metro with `bun dev:down`.

The Android option targets a locally available Android emulator. It does not install production/preview identities or use permanent signing material.

## Short-lived Expo Dev APK artifact

Use the manual **Android Expo Dev APK** Actions workflow when a prebuilt development APK is more convenient than letting `bun dev:up --android` build one locally. The workflow accepts only exact protected `main` and uploads a 14-day Actions artifact named `android-expo-dev-<run-id>`; it creates no tag or GitHub Release. A GitHub rerun is rejected because it would reuse the run identity—start a new manual dispatch instead.

The downloaded `lyntty-expo-dev-<source-sha>-<version-code>.apk` has this fixed contract:

- package `dev.jczhang.lyntty.dev` and label **Lyntty (dev)**;
- Android Debug variant with `debuggable=true`;
- `arm64-v8a` and `x86_64` native libraries;
- no `assets/index.android.bundle`;
- Metro development-server port `8081`;
- the checked-in, intentionally public Expo-Dev-only signer.

Install and run it from a checkout of the artifact's exact source commit:

```bash
bun install --frozen-lockfile
adb install -r lyntty-expo-dev-<source-sha>-<version-code>.apk
adb reverse tcp:8081 tcp:8081
cd packages/lyntty-app
APP_ENV=development bunx expo start --dev-client --port 8081
```

Start or restart **Lyntty (dev)** after Metro reports that it is ready. Without Metro, the APK cannot load JavaScript and is expected to show an `Unable to load script` development error. If an older local APK used a different debug signer, uninstall only `dev.jczhang.lyntty.dev` and retry.

Here “Expo Dev APK” means the Debug variant of the checked-in Expo native project. It does not include the optional `expo-dev-client` package or Expo Dev Launcher; `--dev-client` selects the Expo CLI development-server mode used by this native Debug app.

Every artifact includes an APK checksum, APK/runtime audits, source provenance, a strict file manifest, and a usage README. It is deliberately separate from the standalone Version Preview APK: it never enters `compat-preview`, Compatibility BOM promotion, `latest`, the self-update path, or any Preview GitHub Release.

## Supported hosts and safety

The process-ownership guard supports Linux (`/proc`) and macOS (`ps` plus `lsof`) and fails clearly elsewhere. The commands never send keys or lifecycle controls to tmux/Pi panes. Development secrets, logs, databases, and evidence remain ignored under the worktree's `dist/` directory.
