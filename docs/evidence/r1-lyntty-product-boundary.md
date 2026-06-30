# R1 Lyntty Product Boundary Evidence

Date: 2026-06-30

## Scope

Roadmap phase R1: explore Lyntty's complete product/function boundary before deleting or importing into the current repository.

Beads issue: `lyntty-ekv.1`.

## Changed files

- `docs/research/lyntty-product-boundary.md`
- `docs/evidence/r1-lyntty-product-boundary.md`

## Sources inspected

Main repo/worktree:

- `/home/jc/dev/lyntty-lyntty-pi/package.json`
- `/home/jc/dev/lyntty-lyntty-pi/packages/lyntty-app/package.json`
- `/home/jc/dev/lyntty-lyntty-pi/packages/lyntty-app/sources/app/_layout.tsx`
- `/home/jc/dev/lyntty-lyntty-pi/packages/lyntty-app/sources/app/(app)/_layout.tsx`
- `/home/jc/dev/lyntty-lyntty-pi/packages/lyntty-app/sources/app/(app)/index.tsx`
- `/home/jc/dev/lyntty-lyntty-pi/packages/lyntty-app/sources/components/MainView.tsx`
- `/home/jc/dev/lyntty-lyntty-pi/packages/lyntty-app/sources/components/TabBar.tsx`
- `/home/jc/dev/lyntty-lyntty-pi/packages/lyntty-relay/prisma/schema.prisma`
- `/home/jc/dev/lyntty-lyntty-pi/packages/lyntty-relay/sources/app/api/routes/*`
- `/home/jc/dev/lyntty-lyntty-pi/packages/lyntty-cli/src/index.ts`
- `/home/jc/dev/lyntty-lyntty-pi/docs/backend-architecture.md`
- `/home/jc/dev/lyntty-lyntty-pi/docs/cli-architecture.md`
- `/home/jc/dev/lyntty-lyntty-pi/docs/protocol.md`
- `/home/jc/dev/lyntty-lyntty-pi/docs/encryption.md`

Subagent audits:

- UI/product surface audit over `packages/lyntty-app/sources`.
- Server/relay surface audit over `packages/lyntty-relay` and protocol docs.
- CLI/daemon/runtime audit over `packages/lyntty-cli`, `packages/lyntty-agent`, and `packages/lyntty-wire`.

## Commands run

```bash
bd update lyntty-ekv.1 --claim --json
bd show lyntty-ekv --json
bd ready --json
```

Repository/file inspection was done with `read`, `find`, and subagent read-only exploration.

## Results

- `docs/research/lyntty-product-boundary.md` created.
- Lyntty package map classified.
- App/product surfaces classified as keep/delete/rewrite/unknown.
- Server/relay surfaces classified as keep/delete/rewrite/unknown.
- CLI/daemon/runtime surfaces classified as keep/delete/rewrite/unknown.
- Mobile-vibe assets worth preserving identified.
- Deletion dependencies and risks documented.
- Historical session discovery recorded as R2 blocker.

## Not run

- No code deletion.
- No current-repo import.
- No typecheck/build. R1 was read-only research/documentation.
- No runtime smoke.

## Risks / next work

Next roadmap phase: R2, investigate Lyntty historical session discovery.

Open risks:

- Lyntty may only discover sessions created/registered through Lyntty.
- Session resume may require encrypted local state that arbitrary historical Pi sessions do not have.
- `lyntty-wire` session protocol comments conflict with actual code usage.
- Product features are cross-coupled through sync/storage; deletion must be feature-sliced.
