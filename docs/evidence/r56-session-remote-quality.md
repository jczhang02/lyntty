# R56 Session Remote quality pass

Date: 2026-07-05

## Scope

R56 covered the five unfinished Beads items:

- `lyntty-in7` — mobile support for selected Pi commands: `/goal`, `/context`, and `/skill:*`.
- `lyntty-6kg` — computer-side Pi text rendered as a two-dot/local-command bubble.
- `lyntty-bzv` — completed historical/live tool cards still showing running timers.
- `lyntty-ciu` — historical tool-call turn ordering in Session Remote.
- `lyntty-vd6` — Android keyboard/composer focus jank.

Pi extension work followed the isolation rule: implementation was first repaired in `../lyntty-in7-isolated`, generated extension source was installed only into temporary HOME paths for syntax validation, and no live global Pi extension was installed or reloaded by this pass.

## Changes

### Selected mobile Pi commands

Commits:

- `31ad45d3 feat(pi): support selected mobile commands`
- `e3f7b7b8 fix(app): hide expanded skill prompts`

What changed:

- Added strict `invoke_pi_command` support for `/goal`, `/context`, and `/skill:*` only.
- Extension command discovery now forwards filtered `pi.getCommands()` metadata for `/goal`, `/context`, and skill commands.
- `/goal` is handled locally via `pi-codex-goal` custom entries.
- `/context` returns a visible context-usage notice.
- `/skill:*` verifies `source === "skill"`, expands skill Markdown inside the extension, sends expanded content to Pi, and the app hides the expanded skill block behind the original command display.
- Unsupported slash commands return visible feedback and are not retried forever.

### Computer-origin Pi text

Commit: `b18afe25 fix(app): preserve computer pi message text`

What changed:

- Raw slash-command decoration is now gated to messages that carry a local optimistic `localId`.
- Computer-origin or relay-imported prose containing `/goal`, `/context`, or `/skill:*` is rendered as plain text rather than collapsed into command/goal chips.

### Tool timers and historical ordering

Commit: `2f4cd3a6 fix(app): stabilize tool timeline rendering`

What changed:

- App messages preserve relay `seq` as `serverSeq` and sort by `createdAt` then `serverSeq`, so same-timestamp historical session-protocol entries keep relay order.
- Collapsed completed work groups freeze still-running imported tool cards at the final-answer timestamp, preventing old completed tools from ticking forever.
- Existing Pi history mapper tests continue to prove multi-tool historical turns keep one shared turn open until all tool results arrive.

### Android composer focus

Commit: `8aa176d6 fix(app): smooth android composer focus`

What changed:

- Added Android-specific `AgentContentView.android.tsx` using `react-native-keyboard-controller` + Reanimated keyboard animation instead of JS `useKeyboardState()` padding.
- Enabled keyboard controller preloading.
- Explicitly set Android `softwareKeyboardLayoutMode: "resize"`.

## Verification

### Automated tests

- `pnpm --filter ./packages/lyntty-app test` — 69 files / 742 tests passed before the final skill-display fix; focused final run after the fix: 69 files / 743 tests passed.
- `pnpm --filter ./packages/lyntty-app typecheck` — passed.
- `pnpm --filter ./packages/lyntty-cli test` — 90 files / 772 tests passed.
- `pnpm --filter ./packages/lyntty-cli typecheck` — passed.
- `pnpm --filter ./packages/lyntty-relay typecheck` — passed.
- `pnpm --filter ./packages/lyntty-wire test` — 2 files / 19 tests passed.
- `pnpm --filter ./packages/lyntty-agent test` — 9 files / 227 tests passed.
- Generated Lyntty Pi extension source was installed into a temporary HOME and bundled with esbuild successfully.
- `git diff --check` — run before final commit.

### Release-style APK / emulator validation

Artifact root: `docs/evidence/artifacts/r56-session-remote-quality/`

- Built release-style APK with `APP_ENV=preview EXPO_PUBLIC_LYNTTY_SERVER_URL=http://10.0.2.2:3005`.
- Installed and launched `dev.jczhang.lyntty.dev` on emulator `emulator-5554`.
- Started isolated local relay/daemon with temporary `HOME` and `LYNTTY_HOME_DIR`.
- Maestro first-run account creation passed: `01_first_run/`.
- Maestro terminal pairing passed twice: `02_pair_node/` and `02_pair_node_second/`; pairing URLs in artifacts were redacted.
- Started an isolated ordinary `pi` TUI in tmux using temporary HOME and the temporary installed Lyntty extension.
- Phone Session Remote `/context` produced visible `Pi context usage` feedback (`context-command.xml`).
- Phone Session Remote `/goal` produced visible `No active Pi goal.` feedback (`goal-command.xml`).
- Phone Session Remote unsupported `/model` produced visible unsupported-command feedback (`unsupported-command.xml`).
- Phone Session Remote `/skill:frontend-design-review say R56_SKILL_OK_2 only` reached Pi and the release-style APK showed the skill command/args without raw `<skill>` markdown (`skill-command-fixed.xml`).
- Keyboard/composer focus was screen-recorded from hidden keyboard to focused input (`keyboard/focus-from-hidden.mp4`); UI dumps show the composer moving from bottom bounds `[63,1622][1017,1722]` to above-keyboard bounds `[63,813][1017,913]` with the input focused.

## Known limitations

- The APK validation used the emulator release-style APK, not a physical phone.
- The first skill validation before `e3f7b7b8` intentionally caught raw expanded skill text in the APK; the APK was rebuilt, reinstalled, and retested with `skill-command-fixed.xml` showing raw `<skill>`/`&lt;/skill&gt;` absent.
- No live global Pi extension was installed or reloaded. Existing live Pi sessions still need manual `/reload` or restart to pick up command-support changes after the user explicitly approves live extension update.
