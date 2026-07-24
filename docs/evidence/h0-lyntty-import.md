# H0 Lyntty Import Evidence

日期：2026-06-30

## Scope

Imported Lyntty upstream source into local migration worktree for Pi-first Lyntty migration.

## Branch / paths

- Main repo: `/home/jc/dev/lyntty`
- Migration worktree: `/home/jc/dev/lyntty-lyntty-pi`
- Migration branch: `lyntty-pi-migration`
- Lyntty upstream source: `/tmp/lyntty-lyntty-research`
- Lyntty upstream commit: `71c417e1922c311f25a7e08e99d5fe4e515aed3d`
- Lyntty base commit: `c5cc03b`

## Preserved Lyntty context

Copied into migration worktree:

- `CONTEXT-MAP.lyntty.md`
- `docs/contexts/product/CONTEXT.lyntty.md`
- `docs/roadmap.lyntty.md`
- `docs/evidence/m0-m2.lyntty.md`
- `docs/research/lyntty-pi-agent.md`
- `docs/architecture/lyntty-fork-pi-plan.md`
- `docs/research/lyntty-upstream-lock.json`

## Later disposition

On 2026-07-23, `CONTEXT-MAP.lyntty.md` and `docs/contexts/product/CONTEXT.lyntty.md` were removed after verification that each remained byte-for-byte identical to its canonical `CONTEXT-MAP.md` or `docs/contexts/product/CONTEXT.md` counterpart and had no independent consumer. This does not change the import observation above; it records the later deduplication. Unique migration records such as `docs/roadmap.lyntty.md` and `docs/evidence/m0-m2.lyntty.md` remain preserved.

## Commands run

```bash
git worktree add ../lyntty-lyntty-pi -b lyntty-pi-migration
rsync -a --delete --exclude .git /tmp/lyntty-lyntty-research/ ../lyntty-lyntty-pi/
pnpm install --frozen-lockfile
pnpm --filter ./packages/lyntty-cli run typecheck
pnpm --filter ./packages/lyntty-wire run typecheck
pnpm --filter ./packages/lyntty-relay run typecheck
pnpm --filter ./packages/lyntty-app run typecheck
```

## Results

- `pnpm install --frozen-lockfile`: passed.
  - Warning: package root uses legacy `pnpm` field; pnpm says it ignores `pnpm.overrides` and `pnpm.onlyBuiltDependencies` and wants those settings moved.
  - Warning: `@more-tech/react-native-libsodium` postinstall prints repeated `tar: Ignoring unknown extended header keyword 'LIBARCHIVE.xattr.com.apple.provenance'`.
- `packages/lyntty-cli` typecheck: passed.
- `packages/lyntty-wire` typecheck: passed.
- `packages/lyntty-relay` typecheck: passed.
- `packages/lyntty-app` typecheck: passed.

## Not run

- Full Lyntty build/test suite not run yet.
- Expo Android runtime not run yet.
- Server runtime/migrations not run yet.
- Real Pi runtime not integrated yet.

## Next slice

H1: add first-class `pi` flavor with stub runtime/metadata path, keep UI Pi-only, then verify typechecks again.
