# R59 User message numbered-list rendering

Date: 2026-07-06

## Scope

Beads: `lyntty-4gc` — computer-side Pi input reaches the APK quickly with the current extension, but user messages containing numbered lists render badly in Session Remote, showing marker-only/narrow bubbles such as `1.` / `2.`. User also approved a focused refactor of the user-message style after design research.

Screenshots from report:

- `/home/jc/Downloads/Screenshot_20260705_225734_Lyntty (dev).jpg`
- `/home/jc/Downloads/Screenshot_20260705_225606_Lyntty (dev).jpg`

Pi extension isolation: this pass changed app rendering only. No Pi extension install, reload, daemon control, or live Pi session mutation was performed.

## Research summary

Workflow research compared mobile chat/message patterns and inspected Lyntty render code. Chosen style:

- Short phone/user messages remain compact right-side soft bubbles.
- Long/multiline/Markdown user prompts become wider prompt cards.
- Computer-origin Pi input becomes a full-width `Computer Pi` prompt card.
- Slash-command chips are only for local phone optimistic commands or canonical command wrappers, not arbitrary computer-origin text.
- Numbered/bulleted list markers use a stable marker column and a shrinkable body column.

## Root cause

Two app-side issues combined:

1. `MessageView.tsx` treated any non-null `localId` as a local phone optimistic message. Session-protocol messages use deterministic relay local ids like `session:<envelope.id>`, so computer-origin Pi text could be parsed by the local slash-command renderer.
2. `MarkdownView.tsx` list rows used marker + body flex layout inside a shrink-wrapped right bubble. On Android, the bubble could shrink to the marker width and hide the list body, leaving only `1.` / `2.` visible.

## Fix

- Added `userMessagePresentation.ts` to classify user message display:
  - `session:*` local ids and `sentFrom: cli|computer|terminal|pi` are computer-origin.
  - computer-origin messages disable raw slash parsing and render as `computerPromptCard`.
  - short phone messages remain compact bubbles.
  - multiline/list/code/header/table/long user messages render as prompt cards.
- Changed `MessageView.tsx` to use the presentation helper:
  - no raw slash parsing for computer-origin `session:*` messages;
  - `Computer Pi` label for computer-origin input;
  - prompt-card style for block/multiline user messages.
- Narrowed `parseLocalCommandMessage.ts` raw slash behavior to whole-message slash commands only. Middle/trailing `/skill` text remains prose.
- Changed `MarkdownView.tsx` list rendering:
  - fixed-width marker columns;
  - right-aligned tabular numbered markers;
  - body text has `flexShrink: 1` and `minWidth: 0` inside a full-width row.

## Verification

Focused test command:

```bash
pnpm --filter ./packages/lyntty-app test -- sources/components/userMessagePresentation.test.ts sources/components/parseLocalCommandMessage.spec.ts sources/components/markdown/parseMarkdown.test.ts sources/components/markdown/parseMarkdownBlock.test.ts
```

Result: full app Vitest pass during the focused invocation, 73 files / 759 tests.

Full verification:

```bash
pnpm --filter ./packages/lyntty-app test
pnpm --filter ./packages/lyntty-app typecheck
git diff --check
```

Result:

- app Vitest: 73 files / 759 tests passed
- app typecheck: passed
- `git diff --check`: passed

Release-style APK build/install/launch:

```bash
cd packages/lyntty-app/android
APP_ENV=preview EXPO_PUBLIC_LYNTTY_SERVER_URL=http://10.0.2.2:3005 \
  CCACHE_DISABLE=1 CMAKE_C_COMPILER_LAUNCHER= CMAKE_CXX_COMPILER_LAUNCHER= \
  ./gradlew :app:assembleRelease --no-daemon
adb install -r packages/lyntty-app/android/app/build/outputs/apk/release/app-release.apk
adb shell monkey -p dev.jczhang.lyntty.dev -c android.intent.category.LAUNCHER 1
```

Artifacts:

- `docs/evidence/artifacts/r59-user-message-rendering/assemble-release.log`
- `docs/evidence/artifacts/r59-user-message-rendering/adb-install.log`
- `docs/evidence/artifacts/r59-user-message-rendering/adb-launch.log`
- `docs/evidence/artifacts/r59-user-message-rendering/apk-launch.png`
- `docs/evidence/artifacts/r59-user-message-rendering/apk-launch.xml`
- `docs/evidence/artifacts/r59-user-message-rendering/user-message-preview.html`

Artifact secret scan: checked artifacts for pairing URLs, auth headers, bearer tokens, encryption-key field names, and long hex secrets.

Result: no matches.

Review:

- Final reviewer PASS with no blockers.

## Limitations

- The APK validation here is build/install/launch plus static visual preview artifact. It did not drive a fresh isolated relay/session through Session Remote with an actual computer-origin numbered-list message because that would require a broader isolated live stack. Regression coverage is app-side and deterministic.
- No physical phone validation was run.

## Residual risk

- Existing persisted messages that were already normalized with unusual `displayText` may still need app reload/fetch to pick up the new presentation behavior.
- If future session-protocol producers use a different localId prefix than `session:`, they must also set `meta.sentFrom` for reliable origin classification.
