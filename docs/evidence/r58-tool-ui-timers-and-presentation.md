# R58 Tool timers and tool-call UI presentation

Date: 2026-07-05

## Scope

- `lyntty-ptj` — completed tool cards could still show running timers.
- `lyntty-qsk` — unify tool-call UI style across compact cards, grouped work, and detail views.

Pi extension isolation: this pass changed only app presentation code. No Pi extension install, reload, local daemon control, or live Pi session was touched.

## Decisions

Confirmed by grill:

- Keep the existing Lyntty/Happy mobile visual vibe; do not redesign the Session Remote.
- Unify both the tool card shell and content presentation.
- Use typed templates by tool category instead of forcing every tool into one generic body:
  - terminal/bash
  - read/file
  - edit/write/patch
  - grep/find/search
  - web/fetch
  - task/agent
  - unknown
- Default to compact tool cards. Action-oriented tools such as pending permissions and `AskUserQuestion` stay visible enough to act on.
- Keep raw protocol tool names unchanged; normalize only UI display names/categories/icons.
- Do not change relay, database, session-protocol schemas, or Pi extension behavior unless app-side evidence proves it necessary.

## Changes

### Timer fix

Commit: `96b24c2d fix(app): freeze completed tool durations`

- `useGroupedMessages()` now derives display-only message rows where stale `running` tool calls in a finished turn become completed at the final answer timestamp.
- This applies even when tool grouping is disabled, covering persisted/historical rows that previously kept ticking.
- Added a disabled-grouping regression for completed-turn running tools.

### Tool-call presentation unification

- Added shared display helpers in `sources/utils/toolDisplay.ts`:
  - display-name normalization (`bash`/`CodexBash`/`GeminiBash` → `Bash`, etc.)
  - category mapping
  - typed summary extraction
  - fixed-duration formatting and state text
- `ToolView` now uses shared display names, categories, icons, summary text, and state text for compact cards.
- Non-action tools default to compact cards; action tools remain actionable:
  - `AskUserQuestion` content remains visible.
  - pending permission tools remain visible with permission footer.
  - web `CodexPatch` remains visible/actionable.
  - `file` attachments keep their image/file view and are not hidden in Pi sessions.
- `ToolFullView` now has a unified summary card before specialized/full content.
- `ToolHeader` now uses the same display names/categories/summaries as tool cards.
- Tool-group summaries reuse the same category mapping as individual tool cards, including lowercase Pi tools.

## Verification

Automated:

```bash
pnpm --filter ./packages/lyntty-app test -- sources/hooks/useGroupedMessages.test.ts
pnpm --filter ./packages/lyntty-app test -- sources/utils/toolDisplay.test.ts sources/hooks/useGroupedMessages.test.ts
pnpm --filter ./packages/lyntty-app test -- sources/utils/toolDisplay.test.ts sources/hooks/useGroupedMessages.test.ts components/tools/toolPayloadPolicy.test.ts
pnpm --filter ./packages/lyntty-app typecheck
git diff --check
```

Results:

- Full app Vitest suite passed during focused invocations: 72 files / 754 tests.
- App typecheck passed.
- `git diff --check` passed.

Review:

- Workflow/direct reviewer found and drove fixes for:
  - hidden `AskUserQuestion`/pending-permission tools under compact mode;
  - invisible web `CodexPatch`/permission action risk;
  - `ToolFullView` ignoring `knownTools.noStatus`;
  - `file` attachment hidden in Pi sessions because unknown Pi tools were marked minimal before checking specialized views.
- Final review: PASS, no must-fix blockers.

Release-style APK / visual evidence:

- Built release-style APK:

```bash
cd packages/lyntty-app/android
APP_ENV=preview EXPO_PUBLIC_LYNTTY_SERVER_URL=http://10.0.2.2:3005 \
  CCACHE_DISABLE=1 CMAKE_C_COMPILER_LAUNCHER= CMAKE_CXX_COMPILER_LAUNCHER= \
  ./gradlew :app:assembleRelease --no-daemon
```

- Output APK: `packages/lyntty-app/android/app/build/outputs/apk/release/app-release.apk`.
- Installed and launched on emulator `emulator-5554` as `dev.jczhang.lyntty.dev`.
- Launch artifacts:
  - `docs/evidence/artifacts/r58-tool-ui-unification/launch.png`
  - `docs/evidence/artifacts/r58-tool-ui-unification/launch.xml`
- Static browser preview used during grill/design confirmation:
  - `docs/evidence/artifacts/r58-tool-ui-unification/tool-ui-preview.html`

Limitations:

- The release-style APK launch smoke did not reach a live tool-heavy Session Remote because no isolated relay/node/session fixture was running at validation time. The UI implementation was therefore validated with automated render/helper behavior, release APK build/install/launch, and a static visual preview rather than a fresh tool-session APK screenshot.
- No physical-phone validation was run.

## Residual risk

- Very old persisted local app state can still contain unusual tool shapes that are not covered by current fixtures. Unknown Pi/Gemini payloads remain folded by policy rather than rendered raw.
- The next deeper improvement would be a dedicated in-app visual fixture or screenshot test for tool cards, but that is outside this pass.
