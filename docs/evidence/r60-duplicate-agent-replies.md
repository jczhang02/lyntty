# R60 Duplicate agent replies in Session Remote

Date: 2026-07-06

## Scope

- Beads `lyntty-sp7`: fix duplicate agent replies in mobile Session Remote.
- Duplicate shape covered here: Pi extension live assistant text is delivered first, then Pi JSONL fallback imports the same assistant final text for the same turn.

## Changes

- `lynttyd` Pi JSONL fallback now tracks exact assistant text already delivered from live Pi extension events.
- On `agent_end`, the daemon marks exact live assistant text as delivered even when extension event ids had a sequence gap.
- The JSONL mirror suppresses late assistant JSONL entries whose text and timestamp match recently delivered live assistant text.
- App message grouping adds a defensive same-turn duplicate-agent-text suppressor:
  - exact text after whitespace normalization,
  - agent-text only,
  - not thinking messages,
  - same turn only,
  - within a five-minute window.
- Identical replies in different turns remain visible.

## Verification

### Automated

- `pnpm --filter ./packages/lyntty-app test -- useGroupedMessages.test.ts`
  - Passed: 79 files / 783 tests.
- `pnpm --filter ./packages/lyntty-cli test -- runPiExternalMirror.test.ts`
  - Passed: 90 files / 780 tests.
- `pnpm --filter ./packages/lyntty-app typecheck`
  - Passed.
- `pnpm --filter ./packages/lyntty-cli typecheck`
  - Passed.
- `git diff --check`
  - Passed before evidence write; rerun in final audit.

### Release-style APK / emulator

- Built non-production release-style APK for isolated relay port `3006`:
  - `EXPO_PUBLIC_LYNTTY_SERVER_URL=http://10.0.2.2:3006 CCACHE_DISABLE=1 CMAKE_C_COMPILER_LAUNCHER= CMAKE_CXX_COMPILER_LAUNCHER= ./gradlew :app:assembleRelease --no-daemon`
  - Result: `BUILD SUCCESSFUL`.
- Started isolated relay with temporary `LYNTTY_HOME_DIR` on `127.0.0.1:3006`.
- Installed release APK package `dev.jczhang.lyntty.dev` to `emulator-5554`.
- Maestro first-run account creation passed.
- Maestro terminal pairing passed.
- Injected synthetic encrypted session-protocol envelopes through normal `ApiSessionClient` path:
  - session title: `R60 duplicate reply test final`
  - user text: `Show duplicate reply only once`
  - duplicate agent text sent twice in one turn: `R60_DUPLICATE_REPLY_VISIBLE_ONCE`
  - final injection command exited `0`.
- Android UI dump after opening Session Remote showed:
  - `R60_DUPLICATE_REPLY_VISIBLE_ONCE`: `1` text node / `1` raw count
  - `Show duplicate reply only once`: `1`
  - `lyntty-session-input`: `1`

Artifacts: `docs/evidence/artifacts/r60-duplicate-agent-replies/`.

### Artifact redaction

- Pairing URL, QR-code block, and relay public-key auth blobs were redacted before commit.
- No live global Pi extension was installed/reloaded.

## Not run / limitations

- Physical phone validation was not run.
- Real live Pi extension duplicate reproduction was not run against the user's live Pi environment; release APK validation used an isolated relay plus synthetic same-shape encrypted session-protocol messages.
- The old failed injection logs are retained as artifacts for traceability; final injection log shows the successful `0` exit.

## Residual risk

- Daemon-side suppression is exact-text based. If live text and JSONL text differ by formatting, the app-side same-turn normalized-text guard still hides exact normalized duplicates, but materially different text remains visible.
- App-side suppressor could hide an intentionally repeated identical assistant text within one turn; identical text in separate turns is covered and remains visible.
