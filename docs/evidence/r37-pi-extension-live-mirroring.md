# R37 Pi Extension Live Mirroring

Date: 2026-07-03

Task: `lyntty-jyi` — fix current Pi session live mirroring without requiring users to start sessions through `lyntty pi`.

## User decisions

- Default behavior: global Lyntty Pi extension auto-connects to local `lynttyd`.
- Scope: all ordinary `pi` sessions after extension installation.
- If `lynttyd` is absent: extension stays nonblocking and `/remote` reports status.
- Phone control: mirror by default; queued/takeover remains explicit, no silent takeover.
- Privacy: sync is default-on, with `/remote off` for the current Pi process.

## Root cause

The phone could only show messages already present in relay `/v3` session messages. Ordinary/current `pi` sessions write local Pi JSONL, but Lyntty only started external mirroring lazily from app `ensure-pi-session-mirror` when a discovered row was opened. Once a relay row existed, reopening the session did not guarantee a fresh mirror, and daemon restarts dropped in-memory mirror state.

## Implementation

Changed files:

- `packages/lyntty-cli/src/pi/piExtensionInstall.ts`
  - embeds and installs a global Pi extension at `~/.pi/agent/extensions/lyntty/index.ts`;
  - extension registers `/remote` and `/lyntty` commands;
  - extension auto-posts Pi session lifecycle/message/tool events to local `lynttyd` only;
  - extension serializes event POSTs through an in-process capped queue so streaming/tool events preserve order without unbounded growth when `lynttyd` is absent.
- `packages/lyntty-cli/src/pi/piExtensionEvent.ts`
  - validates/normalizes extension event shapes for the existing `PiSessionProtocolMapper`.
- `packages/lyntty-cli/src/daemon/controlServer.ts`
  - adds local-only `POST /pi-extension/status` and `POST /pi-extension/event` endpoints.
- `packages/lyntty-cli/src/daemon/run.ts`
  - bridges extension events through `ensurePiSessionMirror()` into deterministic relay sessions;
  - maps live extension events through the same `PiSessionProtocolMapper` used by Lyntty-managed Pi runtimes;
  - marks JSONL entries known while extension events are active to avoid fallback mirror duplicates;
  - queues very early extension events while daemon machine registration finishes.
- `packages/lyntty-cli/src/index.ts`
  - adds `lyntty remote install|status`;
  - installs the Pi extension before `lyntty daemon start` / `start-sync`.
- `packages/lyntty-cli/scripts/install-local.cjs`
  - local install now runs `lyntty remote install`.

## Verification

```bash
pnpm --filter ./packages/lyntty-cli run typecheck
```

Passed.

```bash
pnpm --filter ./packages/lyntty-cli test \
  src/pi/piExtensionEvent.test.ts \
  src/pi/runPiSessionProtocol.test.ts \
  src/pi/runPiExternalMirror.test.ts \
  src/daemon/controlServer.piExtension.test.ts
```

Passed: 4 files, 12 tests.

```bash
git diff --check
```

Passed.

```bash
tmp=$(mktemp -d)
HOME="$tmp" node packages/lyntty-cli/dist/index.mjs remote install
test -f "$tmp/.pi/agent/extensions/lyntty/index.ts"
grep -q '/pi-extension/event' "$tmp/.pi/agent/extensions/lyntty/index.ts"
rm -rf "$tmp"
```

Passed. Confirms built CLI can install the global Pi extension into the expected Pi auto-discovery path without touching the real home directory.

```bash
node packages/lyntty-cli/dist/index.mjs remote install
```

Passed. Installed the current extension to `/home/jc/.pi/agent/extensions/lyntty/index.ts`; existing running Pi processes need `/reload` or restart to load it.

## Additional live-smoke attempt

After commit, the stack was restarted against the local relay on `127.0.0.1:3005` and a normal `pi` process was run directly, not through `lyntty pi`:

```bash
node packages/lyntty-cli/dist/index.mjs daemon start
pi -p --no-tools --name "lyntty plugin live LYNTTY_PLUGIN_LIVE_175209" \
  "Reply exactly LYNTTY_PLUGIN_LIVE_175209"
```

The ordinary `pi` process replied with `LYNTTY_PLUGIN_LIVE_175209`. The restarted daemon log showed that the extension-created path reached relay session creation:

```text
Session created/loaded: cmr4r8ec400lfoven389y01wd (tag: pi:c8d4c0ec292091d2f105c61b2ecac3cb)
[SOCKET] [UPDATE] Decrypted message { role: 'session', contentType: 'unknown' }
```

This validates ordinary `pi` -> extension -> local `lynttyd` -> deterministic relay session creation at daemon level.

Fresh phone/APK completion is still blocked in this run:

- debug APK entered Expo Dev Launcher and then hit `Error loading app` / `Attempt to invoke interface method 'boolean java.util.Set.addAll(java.util.Collection)' on a null object reference` after attempting to load Metro;
- the release/debug installed app state was inconsistent during validation after reinstall, so the phone-visible assertion for `LYNTTY_PLUGIN_LIVE_175209` was not completed;
- terminal pairing succeeded once through the dev-client flow, but later runs were interrupted by Dev Launcher state.

## Remaining risk

- Phone/APK proof for ordinary `pi` -> extension -> `lynttyd` -> relay -> mobile live visibility is still pending.
- `/remote off` is process-local; durable global/project exclusion can be added later.
