# Lyntty delivery standardization

Status: active Bun-only migration

Current epic: `lyntty-6o0`

Historical baseline: `docs/evidence/r62-standardization-docs.md`

## Objective

Ship Lyntty as an Android-first, Pi-only, self-hosted product whose installation, tests, builds, release artifacts, and production runtimes do not require Node, npm, pnpm, npx, or tsx.

The supported components are independently versioned:

- Android App
- compiled `lyntty` CLI
- compiled `lynttyd`
- compiled Relay/container
- Wire capability contract
- signed Compatibility BOM tying compatible versions together

## Product and runtime invariants

- `pi` is the only supported agent/runtime.
- `lynttyd` is the computer-side authority and the only computer component that connects to Relay.
- The Pi extension talks only to local `lynttyd`.
- Phone control uses `phone -> relay -> lynttyd -> Pi extension -> pi.sendUserMessage()`.
- Pi JSONL is canonical history; Relay stores encrypted sync state, queues, metadata, attachments, and caches.
- One Pi session has one `active runtime`; takeover requires an explicit `wait`, `stop`, or `interrupt` choice.
- Missing/stale extension paths fail or queue with actionable remediation. They never silently drop input or start a duplicate runtime.
- Only sessions with explicit `flavor: 'pi'` can send, execute RPC, answer permissions, or control a runtime. Older provider/flavorless records are history-only.
- Android is the release acceptance target. iOS source compatibility is best effort and does not block release.

## Bun boundary

- Bun is pinned by `.bun-version` and `packageManager`.
- Active workspaces are only App, CLI, Relay, and Wire.
- Tests use native `bun:test`.
- Lifecycle scripts are allowed only through the root `trustedDependencies` list; `bun pm untrusted` must report zero.
- Bun-compatible `node:*` APIs are allowed. Project commands and shipped runtimes may not execute Node/npm/pnpm/npx/tsx.
- Formal CLI/daemon/Relay artifacts use `bun build --compile`; end users do not install Bun.
- Android may use Hermes, Gradle, JDK, Android SDK/NDK, Rust/C/C++, and other native toolchains.

## Current implemented foundation

- Four-workspace Bun lock/install boundary.
- Native Bun tests for App, CLI, Relay, and Wire.
- Android-native App with Web/Tauri/EAS/OTA and inherited social/voice/subscription/provider product surfaces removed.
- Relay API-only surface with static browser serving and unused SaaS/vendor routes removed.
- PGlite default plus explicit PostgreSQL provider/migration gate.
- Canonical `LYNTTY_MASTER_SECRET` with compatibility-only legacy fallback.
- Compiled Relay smoke covering help, all migrations, health serving, and graceful shutdown.
- Compiled CLI/`lynttyd` integration against an isolated compiled Relay, with temporary HOME/state/port and forbidden-runtime sentinels.
- Protected `main`; implementation remains on `refactor/bun-migration` until the complete compatibility/release gate is ready.

## Remaining delivery phases

### 1. Reproducible artifacts

- Produce release archives for supported CLI/daemon platforms.
- Produce runtime-free Relay binary/container.
- Produce release-style Android APK with production signing fail-closed.
- Generate checksums, SBOMs, provenance, and artifact manifests.

### 2. Installer, service, and updater lifecycle

- Install versioned CLI/daemon assets atomically.
- Register the native service without runtime fallbacks.
- Verify upgrade, rollback, uninstall, and interrupted-install recovery.
- Keep extension installation isolated and explicit; never overwrite the live global extension during tests.

### 3. Compatibility and release control

- Publish independent SemVer for App, CLI/daemon, Relay, and Wire.
- Negotiate Wire major/minor capabilities; reject incompatible majors and degrade safely when optional capabilities are missing.
- Sign a Compatibility BOM covering the current and previous two stable BOMs for at least 90 days.
- Keep `stable` and `preview` isolated. Ordinary `main` pushes do not publish stable artifacts or deploy production Relay.
- Require release PR checks and environment approval before tags/releases.

### 4. Final integration

- Rebuild and inspect a clean no-Node Android APK.
- Run critical Maestro shared-control, restart, ownership, and `history_gap` paths.
- Prove PGlite/PostgreSQL upgrade and rollback with preserved data.
- Run supported-platform artifact/service smoke tests.
- Obtain independent zero-P0/P1 review and merge through the protected PR.

macOS Developer ID/notarization, Windows Authenticode, production Android signing, and production Relay rollout are explicit external gates. Missing credentials block only the corresponding stable platform or production deployment; they are never replaced with unsigned artifacts presented as stable.

## Verification

From the repository root:

```bash
bun install --frozen-lockfile
bun pm untrusted
bun audit
bun run test:repo-hardening
bun run ci:wire
bun run ci:cli
bun run ci:daemon-integration
bun run ci:relay
bun run ci:app
git diff --check
```

Android and production-data checks must use temporary HOME, `LYNTTY_HOME_DIR`, extension directories, databases, ports, Gradle caches, and build outputs. Evidence records exact commands, artifact hashes, not-run items, and residual risk.
