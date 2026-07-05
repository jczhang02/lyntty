# Lyntty App Agent Instructions

This package is the Expo/React Native mobile client. Android/release-style APK behavior is the primary acceptance target.

## Product surface

- Active navigation is Lyntty, Pi-first, mobile-only.
- `Sessions Home` lists relay-known sessions plus node-discovered Pi sessions.
- `Session Remote` is the main control surface for one Pi session.
- `Node Management`, pairing, server settings, and recovery support self-hosted operation.
- Do not restore Happy social/feed/friends/voice/SaaS/subscription/community UI.
- Do not expose user-facing `mirror`, `read-only`, `external_pi`, Claude, Codex, Gemini, ACP, or OpenClaw choices.
- Do not reintroduce `Review Evidence`, `Session Details`, or `Diagnostics` as main APK UI. Debug/runtime details belong in logs/evidence.

## Session semantics

- Treat `runtimeOwner` / `controlState` as the current control model.
- Normalize legacy `lifecycleState: "external_pi"` at read boundaries only.
- Pi-extension sessions are controllable via shared-control command delivery; they are not read-only mirrors.
- Missing/stale extension states must show honest queue/remediation states, not silent success.
- Historical Pi sessions should open immediately with latest-tail/progressive older history, not block on full import.
- Session rows and archive/recent views should use last communication/updated time, not creation time.

## Rendering rules

- Live Pi SDK events, Pi extension events, and Pi JSONL history replay should render with the same visible semantics.
- Preserve original computer-side Pi text. Do not reinterpret imported prose as local slash-command chips unless it is a local optimistic command.
- Thinking should be visible while running and compact/folded after completion.
- Tool calls/results should render as compact tool cards; raw serialized tool payloads must not appear as chat text.
- Completed or failed tools must not keep running timers.
- Historical tool ordering should prefer relay/server seq, then event timestamp/turn id, then Pi JSONL order.

## Mobile command scope

Supported mobile Pi slash/skill scope is intentionally narrow unless a task expands it:

- `/goal`
- `/context`
- `/skill:*`
- explicit shared-control commands already approved in `docs/architecture/pi-shared-control.md`

Unsupported slash commands need visible feedback and no retry loop. Do not pass arbitrary slash/raw/eval commands through the phone.

## Auth/server/reset behavior

- Auth invalidation must clear volatile sync/socket/session state, not only credentials.
- Server URL changes while authenticated should force logout/reconnect rather than leaving stale sockets.
- Production builds must reject HTTP relay URLs; non-production local testing may use cleartext.
- Non-production release-style APKs must disable Expo Updates to avoid stale OTA bundles.

## Android UX

- Avoid keyboard/composer jumps; Android composer should move with keyboard animation.
- Keep stable Maestro/testID selectors for onboarding, pairing, Sessions Home rows, Session Remote input/send, and critical controls.
- Small unlabeled controls need accessibility labels and must not appear outside their valid state.
- Release-style APK validation is required before claiming user-visible mobile fixes when practical.

## Tests

Preferred checks:

```bash
pnpm --filter ./packages/lyntty-app test
pnpm --filter ./packages/lyntty-app typecheck
```

Focused tests should cover pure helpers/reducers where possible before APK validation. For E2E, use `scripts/e2e/run-maestro.sh` and record artifacts under `docs/evidence/artifacts/...` with secrets redacted.
