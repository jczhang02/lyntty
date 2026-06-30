# R3 Evidence — Clean Current Repo and Import Lyntty Base

Date: 2026-06-30

## Scope

Roadmap phase R3 / Beads `lyntty-ekv.3`: make `/home/jc/dev/lyntty` the Lyntty-based monorepo, preserve Lyntty decision assets/evidence, remove old scaffold product code, and establish baseline install/typecheck evidence.

## Preservation staging

Created preservation backup before destructive import:

- `../lyntty-preserve-20260630T123153Z/current-tree/`
- `../lyntty-preserve-20260630T123153Z/git-status-before.txt`
- `../lyntty-preserve-20260630T123153Z/current-file-list.txt`
- `../lyntty-preserve-20260630T123153Z/lyntty-source-file-list.txt`

Manifest counts:

- current pre-import file list: 25,557 paths, excluding `.git`, `node_modules`, and `artifacts`.
- Lyntty source file list: 3,488 paths, excluding `.git` and `node_modules`.

A second safety snapshot was created after detecting git metadata damage:

- `../lyntty-git-reinit-snapshot-20260630T123536Z/tree/`

## Import source

Imported from:

- `../lyntty-lyntty-pi/`

That worktree was the previously verified Lyntty-based migration tree containing H0-H3 Pi-support experiments.

## Changed repository shape

Current root now has Lyntty monorepo layout:

- `packages/lyntty-app`
- `packages/lyntty-agent`
- `packages/lyntty-cli`
- `packages/lyntty-relay`
- `packages/lyntty-wire`
- `packages/lyntty-app-logs`
- `packages/codium`
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- Lyntty Docker/environment/scripts files

Removed old scaffold paths from the current product tree:

- `apps/`
- `packages/client-core/`
- `packages/pi-extension/`
- old Bun/TS scaffold files: `bun.lock`, `tsconfig.json`, `tsconfig.base.json`, `skills-lock.json`
- `docs/.site/`

Preserved/restored Lyntty decision assets include:

- `AGENTS.md`
- `CONTEXT-MAP.md`
- `docs/roadmap.md`
- `docs/roadmap.zh.md`
- `docs/research/lyntty-pi-agent.md`
- `docs/research/lyntty-product-boundary.md`
- `docs/research/lyntty-session-discovery.md`
- `docs/contexts/product/CONTEXT.md`
- `docs/contexts/product/CONTEXT.zh.md`
- `docs/evidence/m0-m2.md`
- `docs/evidence/m0-m2.zh.md`

## Commands run

Preservation staging:

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP="../lyntty-preserve-$STAMP"
mkdir -p "$BACKUP"
rsync -a \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'artifacts/' \
  ./ "$BACKUP/current-tree/"
git status --short > "$BACKUP/git-status-before.txt"
find . -path './.git' -prune -o -path './node_modules' -prune -o -path './artifacts' -prune -o -print | sort > "$BACKUP/current-file-list.txt"
find ../lyntty-lyntty-pi -path '../lyntty-lyntty-pi/.git' -prune -o -path '../lyntty-lyntty-pi/node_modules' -prune -o -print | sort > "$BACKUP/lyntty-source-file-list.txt"
```

Import and restore:

```bash
rm -rf node_modules
rsync -a --delete \
  --exclude '.git/' \
  --exclude '.beads/' \
  --exclude '.pi/' \
  --exclude '.agents/' \
  --exclude 'node_modules/' \
  ../lyntty-lyntty-pi/ ./
cp -f "$BACKUP/current-tree/AGENTS.md" ./AGENTS.md
cp -f "$BACKUP/current-tree/CONTEXT-MAP.md" ./CONTEXT-MAP.md
# restored selected docs/research/evidence files
```

Cleanup after residual old scaffold directories:

```bash
rm -rf apps packages/client-core packages/pi-extension docs/.site artifacts bun.lock tsconfig.json tsconfig.base.json skills-lock.json
```

Install and typecheck:

```bash
pnpm install --frozen-lockfile
pnpm --filter ./packages/lyntty-cli run typecheck
pnpm --filter ./packages/lyntty-agent run typecheck
pnpm --filter ./packages/lyntty-relay run typecheck
pnpm --filter ./packages/lyntty-app run typecheck
```

## Results

### Install

`pnpm install --frozen-lockfile` succeeded.

Notable warnings:

- pnpm ignored legacy root `pnpm.overrides` and `pnpm.onlyBuiltDependencies` fields.
- Build scripts were ignored for `@anthropic-ai/claude-code`, `@google/genai`, and `protobufjs`; pnpm suggested `pnpm approve-builds`.
- Postinstall ran Lyntty patches and generated Prisma client.

### Typecheck

All baseline typechecks passed:

- `packages/lyntty-cli`: `tsc --noEmit` passed.
- `packages/lyntty-agent`: `tsc --noEmit` passed.
- `packages/lyntty-relay`: `tsc --noEmit` passed.
- `packages/lyntty-app`: `tsc --noEmit` passed.

### Preserved docs readability

Spot-read after import:

- `docs/roadmap.md`
- `docs/research/lyntty-product-boundary.md`
- `docs/research/lyntty-session-discovery.md`

All were readable.

## Git metadata incident

During import, `.git` was overwritten by the sibling worktree gitfile because the rsync exclude protected `.git/` directories but not a `.git` file from the source worktree. This broke both current and sibling worktree git metadata.

Immediate mitigation:

1. Created safety snapshot: `../lyntty-git-reinit-snapshot-20260630T123536Z/tree/`.
2. Removed the bad `.git` file.
3. Ran `git init -b main` in the current repo to restore local git command functionality.

Current status after re-init:

- The current tree is a fresh git repository with all files untracked.
- Original git history metadata was not available in preservation staging because `.git` was intentionally excluded.
- Beads data under `.beads/` remains present and usable.

Risk:

- Original local git history/worktree metadata is lost from this filesystem state unless recovered externally. This must be handled before any remote push or PR workflow.
- Future destructive imports must exclude both `.git/` and `.git` exactly.

## Current git status shape

After re-init, `git status --short` shows 28 top-level untracked entries, including:

- `.beads/`
- `AGENTS.md`
- `CONTEXT-MAP.md`
- `docs/`
- `package.json`
- `packages/`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`

This is expected after git reinitialization and import, but needs a deliberate commit strategy later.

## Not run

- Android build not run in R3.
- Full test suite not run in R3.
- Product-surface deletion not performed in R3; it is R4.
- Original git history recovery from remote was not attempted.

## Risks / next work

1. R4 must delete non-Lyntty Lyntty product features.
2. Git history must be treated as damaged/reinitialized; do not push blindly.
3. Current repo still includes non-Lyntty Lyntty product surfaces by design after R3.
4. Web/voice/social/analytics/provider dependencies remain until R4+ cleanup.
5. The source sibling worktree `../lyntty-lyntty-pi` should be considered git-broken due the `.git` incident.
