# R20 Deep Review and Multidimensional E2E

## Scope

User requested deep review plus high-intensity E2E validation across:

- Mobile first-run and account creation
- Relay self-host mode
- CLI/mobile terminal pairing
- `lynttyd` machine presence and machine RPC
- Sessions Home local Pi history discovery
- Historical Pi session open/content import
- Live mobile → relay → lynttyd/Pi → relay → mobile reply
- Reconnect/restart behavior
- Automated unit/type/regression coverage

## Review findings fixed

### 1. Full app test drift after Pi-only migration

Full app test run found stale Happy/Claude-era expectations:

- `findActiveWord.test.ts` and `applySuggestion.test.ts` had off-by-one expectations after replacing `:happy` with `:lyntty`.
- `modelModeOptions.test.ts` expected Claude defaults even though unknown/Claude flavors normalize to Pi in the Pi-only app.
- `messageMeta.test.ts` expected settings overrides for `claude`; Pi-only semantics require `pi`.

Fix:

- Updated tests to match current Lyntty Pi-only rules and string lengths.

### 2. Historical Pi open spawned with redacted cwd

E2E found that tapping `jc: pi sum calculation session` could import/show history, but live prompt reply stalled because app/daemon used a redacted directory (`~`) as a real working directory.

Observed bad logs before fix:

```text
Shell command executing... { cwd: '/home/jc/~/~', timeout: 5000 }
Shell command failed: { error: 'spawn /bin/sh ENOENT' }
```

Root causes:

- Synthetic Pi rows expose redacted cwd like `~`/`~/dev/lyntty` to the app.
- Daemon spawn path used that redacted cwd as the process cwd.
- After session discovery merged into the real relay session, `mergePiDiscoveredSessions()` overwrote the real encrypted `metadata.path` with the redacted discovery path.
- The app's git sync sent `session.metadata.path` to the session `bash` RPC, producing invalid cwd.

Fix:

- `packages/lyntty-cli/src/daemon/run.ts`
  - Added `choosePiSpawnDirectory()`.
  - For historical Pi spawns (`sessionId` present), daemon resolves the real local Pi cwd from local `SessionManager` discovery and uses that as process cwd.
  - Falls back to expanding `~` and `~/...` locally.
- `packages/lyntty-app/sources/sync/piDiscoveredSessions.ts`
  - Existing real relay sessions keep their real encrypted `metadata.path`; discovery metadata updates titles/history state without replacing real path.
- `packages/lyntty-app/sources/components/SessionsList.tsx`
  - Optimistic session rows expand redacted `~`/`~/...` to `homeDir` locally before navigation, preventing early git sync from using fake cwd.

Regression tests:

- `packages/lyntty-cli/src/daemon/piSpawnDirectory.test.ts`
- `packages/lyntty-app/sources/sync/piDiscoveredSessions.test.ts`

## Human-style APK E2E matrix

Environment:

- Emulator: `emulator-5554`
- App: Expo dev client, `dev.jczhang.lyntty.dev`
- Relay: `lyntty server --host 0.0.0.0 --port 3005 --reset --no-persist`
- App server URL: `http://192.168.100.21:3005`
- Node home: isolated `/tmp/lyntty-e2e-r20c-node`

Validated flows:

1. Fresh relay boot and `/v1/version` validation.
2. Fresh app launch through Expo Dev Client.
3. Fresh mobile account creation.
4. Android notification permission prompt.
5. CLI mobile auth URL generation.
6. Terminal deep-link pairing.
7. Pair Node accept flow.
8. Node authentication success and Machine ID creation.
9. `lynttyd` daemon startup and machine WebSocket presence.
10. Machine RPC `list-pi-sessions` returns local Pi history without disconnect; response size stayed around 339 KB.
11. Sessions Home shows Pi historical sessions as normal rows, including `jc: pi sum calculation session`.
12. Opening the historical row does not show deleted-session screen.
13. History import appears in Session Remote:
    - `Imported 12 historical Pi session events from 019f1ce6-aee1-72b5-8020-178c4c499320.`
    - old replies such as `R18_PONG` and `R19_OK`
14. cwd fix verified after fresh open:

```text
Resolved Pi session spawn directory from ~ to /home/jc
Shell command executing... { cwd: '/home/jc', timeout: 5000 }
```

15. Live message round-trip:
    - Phone sent `reply exactly R20C_PONG`
    - Pi runtime received prompt
    - Phone rendered Pi reply `R20C_PONG`
16. Daemon stop/start smoke:
    - Daemon stopped and restarted.
    - Machine re-registered and reconnected.
    - Session content remained visible.

Key artifacts:

- `docs/evidence/artifacts/r20-deep-e2e/26-r20c-history-home.png` — Sessions Home Pi history.
- `docs/evidence/artifacts/r20-deep-e2e/27-r20c-open-history.png` — history import visible, no deleted screen.
- `docs/evidence/artifacts/r20-deep-e2e/31-r20c-pong-final.png` — live Pi reply `R20C_PONG` visible on phone.
- `docs/evidence/artifacts/r20-deep-e2e/33-r20c-after-daemon-restart.png` — restart smoke state.

## Automated verification

Passed:

```bash
pnpm --filter ./packages/lyntty-cli test -- --run
# 82 files, 722 tests passed

pnpm --filter ./packages/lyntty-app test -- --run
# 62 files, 706 tests passed

pnpm --filter ./packages/lyntty-relay test -- --run
# 9 files, 72 tests passed

pnpm --filter ./packages/lyntty-wire test -- --run
# 2 files, 19 tests passed

pnpm --filter ./packages/lyntty-agent test -- --run
# 9 files, 227 tests passed

pnpm --filter ./packages/lyntty-relay run typecheck
pnpm --filter ./packages/lyntty-wire run typecheck
pnpm --filter ./packages/lyntty-agent run typecheck
```

Earlier baseline also passed full typechecks for CLI/app/relay/wire/agent.

## Remaining risks / follow-ups

- During daemon stop, the open Session Remote stayed visually `online` for the active session during the short observation window. Machine reconnect worked after daemon restart, but offline-status latency deserves a separate targeted issue if strict live offline UX is required.
- The selected Pi session's real cwd is `/home/jc`, which is not a git repo. Git status RPC now fails cleanly with `fatal: not a git repository`, not ENOENT. This is acceptable but noisy.
- Deep-link pairing is the proven path. Manual URL modal remains lower-confidence unless retested by real touch or improved with testIDs/accessibility labels.
- Dev-client E2E validated current JS bundle; release APK was not rebuilt in R20.
