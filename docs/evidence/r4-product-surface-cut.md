# R4 Evidence — Delete Non-Lyntty Lyntty Product Features

Date: 2026-06-30

## Scope

Roadmap phase R4 / Beads `lyntty-ekv.4`: remove high-visibility non-Lyntty product surfaces while preserving sync/RPC/session foundations and keeping baseline typechecks green.

This phase is a product-surface cut, not the final deep runtime/provider purge. Deep Claude/Codex/Gemini/OpenClaw runtime code is deferred to R6/R7 where Pi runtime and plugin support replace those paths safely.

## Product surfaces removed or narrowed

Mobile shell and routes:

- Main mobile tabs are `Sessions` and `Settings`; inbox/social tab is gone.
- Removed active Expo routes for:
  - inbox/social feed
  - friends/search/user profile
  - dev screens
  - voice settings and voice language
  - Claude connect
  - agent defaults settings
- Removed route registration from app stack for those screens.

Session UI:

- Removed voice status bar and microphone/realtime voice session path from `SessionView`.
- Removed provider-specific Claude/Codex IDs from session info.
- Session info labels Lyntty session ID and `pi` runtime instead of provider brands.
- Removed fork/duplicate actions from product UI until Pi semantics are redesigned.

Settings UI:

- Removed connected vendor services from account settings.
- Removed analytics toggle from account/features UI.
- Removed support/paywall/developer route entry points from settings.
- Feature settings now use Lyntty/Pi wording.

Server surface:

- API root banner is `Welcome to Lyntty Relay!`.
- Active route registration no longer includes `connectRoutes`, `devRoutes`, `voiceRoutes`, `userRoutes`, or `feedRoutes`.
- Relay core routes remain: auth, sessions, machines, artifacts, access keys, account, KV, version, v3 sessions, attachments, push, Socket.IO/RPC.

Docs:

- Rewrote top-level `README.md` as Lyntty.
- Rewrote `docs/README.md` as Lyntty docs index.
- Deleted active Lyntty product docs for deployment, API, backend architecture, CLI architecture, protocol, voice, analytics, competition, experimental, and plan materials.
- Kept roadmap/research/evidence docs where removed-product names appear as migration/research context.

Translations/copy:

- Default and locale translation resources were mechanically cleaned from Lyntty/vendor wording where active UI needs type-compatible keys.
- Legacy compatibility keys remain for unused/deferred code paths, with neutral Lyntty/audio/node wording.

## Changed paths summary

Major edited files:

- `README.md`
- `docs/README.md`
- `docs/evidence/r4-product-surface-cut.md`
- `packages/lyntty-app/sources/app/_layout.tsx`
- `packages/lyntty-app/sources/app/(app)/_layout.tsx`
- `packages/lyntty-app/sources/app/(app)/server.tsx`
- `packages/lyntty-app/sources/app/(app)/settings/account.tsx`
- `packages/lyntty-app/sources/app/(app)/settings/features.tsx`
- `packages/lyntty-app/sources/app/(app)/session/[id]/info.tsx`
- `packages/lyntty-app/sources/-session/SessionView.tsx`
- `packages/lyntty-app/sources/components/AgentInput.tsx`
- `packages/lyntty-app/sources/components/SettingsView.tsx`
- `packages/lyntty-app/sources/components/CommandPalette/CommandPaletteProvider.tsx`
- `packages/lyntty-app/sources/text/_default.ts`
- `packages/lyntty-app/sources/text/translations/*.ts`
- `packages/lyntty-relay/sources/app/api/api.ts`

Deleted active routes/components/docs include:

- `packages/lyntty-app/sources/app/(app)/friends/`
- `packages/lyntty-app/sources/app/(app)/user/`
- `packages/lyntty-app/sources/app/(app)/dev/`
- `packages/lyntty-app/sources/app/(app)/inbox/`
- `packages/lyntty-app/sources/app/(app)/settings/connect/`
- `packages/lyntty-app/sources/app/(app)/settings/voice.tsx`
- `packages/lyntty-app/sources/app/(app)/settings/voice/`
- `packages/lyntty-app/sources/app/(app)/settings/agents.tsx`
- `packages/lyntty-app/sources/components/InboxView.tsx`
- `packages/lyntty-app/sources/components/FeedItemCard.tsx`
- `packages/lyntty-app/sources/components/UserCard.tsx`
- imported Lyntty product docs outside Lyntty roadmap/research/evidence/context.

## Commands run

```bash
pnpm --filter ./packages/lyntty-app run typecheck
pnpm --filter ./packages/lyntty-cli run typecheck
pnpm --filter ./packages/lyntty-agent run typecheck
pnpm --filter ./packages/lyntty-relay run typecheck
pnpm --filter ./packages/lyntty-wire run typecheck
```

Focused product-surface grep audits were also run over:

- `README.md`
- `docs/`
- `packages/lyntty-app/sources/app`
- `packages/lyntty-app/sources/components`
- `packages/lyntty-relay/sources/app/api/api.ts`

## Results

All typechecks passed:

- `lyntty-app`: `tsc --noEmit` passed.
- `lyntty-cli`: `tsc --noEmit` passed.
- `lyntty-agent`: `tsc --noEmit` passed.
- `lyntty-relay`: `tsc --noEmit` passed.
- `lyntty-wire`: `tsc --noEmit` passed.

Product grep after cleanup:

- `README.md` only mentions Lyntty in the migration sentence explaining why Lyntty is the base.
- `docs/` mentions removed product names only in roadmap/research/evidence context.
- Active app routes no longer include friends/social/voice/Claude connect/agent defaults/dev screens.
- Server API registration no longer exposes social/feed/voice/connect/dev routes.

Remaining matches in app components are internal helper names, comments, tests, or deferred code paths, not active product navigation. They are left for R6/R7/R8 deep runtime/provider cleanup.

## Not run

- Android build not run.
- Full unit test suite not run.
- Physical device smoke not run.
- Deep dependency pruning not done.
- Prisma schema/model slimming not done.

## Risks / next work

1. Deep provider code still exists and must be removed or isolated in R6/R7.
2. Some internal helper names still include `Lyntty` (`useLynttyAction`, `LynttyError`) and should be renamed later.
3. Translation resources keep compatibility keys for deferred/unused code paths.
4. Web/Tauri/voice/social dependencies remain in packages until dependency pruning.
5. Git metadata remains reinitialized from R3; do not push blindly.

## CLI runtime guard slice

Additional R4/R6-overlap cleanup added a product guard in `packages/lyntty-cli/src/index.ts`:

- bare `lyntty` now defaults to the Pi runtime path.
- legacy runtime subcommands `claude`, `codex`, `gemini`, `acp`, and `openclaw` are rejected before dispatch.
- existing legacy branches remain in code for now so deeper deletion can be done safely in later slices, but product CLI entry no longer routes to them.

Verification:

```bash
pnpm --filter ./packages/lyntty-cli run typecheck
pnpm --filter ./packages/lyntty-cli run build
node packages/lyntty-cli/bin/lyntty.mjs codex
```

Results:

- CLI typecheck passed.
- CLI build passed with existing pkgroll warning about bin outside dist and empty chunks.
- `node packages/lyntty-cli/bin/lyntty.mjs codex` exited `1` and printed `Lyntty supports only pi. The 'codex' runtime is not supported.`
