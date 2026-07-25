# Contributing to Lyntty

[简体中文](./CONTRIBUTING.zh.md)

Lyntty accepts focused fixes and documentation improvements that preserve its Android-first, self-hosted, `pi`-only product boundary. Read [SECURITY.md](./SECURITY.md) before reporting a vulnerability.

## Choose a contribution

Check existing [GitHub issues](https://github.com/jczhang02/lyntty/issues) first. Use the bug or feature form for a new report. Changes should improve Android control of local `pi` sessions, self-hosted operation, or the safety and maintainability of those paths.

Do not add Claude, Codex, Gemini, OpenClaw, generic remote-desktop, or multi-user SaaS product surfaces. Current product and architecture sources are listed in [`CONTEXT-MAP.md`](./CONTEXT-MAP.md).

## Create a branch

External contributors can use the usual fork workflow:

```bash
git clone https://github.com/<your-account>/lyntty.git
cd lyntty
git remote add upstream https://github.com/jczhang02/lyntty.git
git switch -c fix/short-topic
```

Push the completed branch to your fork before opening a pull request:

```bash
git push -u origin fix/short-topic
```

A separate worktree is optional for external contributors. Maintainers and coding agents use `worktrees/<topic>/` because the repository contract requires isolation for their workflow. Read the root and nearest nested `AGENTS.md` when using a coding agent or working within the maintainer process.

Beads are optional for external contributors. Maintainers use them for work that spans sessions or needs durable handoff context.

## Set up the repository

Lyntty uses Bun only. The pinned version is recorded in `.bun-version` and the root `packageManager` field.

```bash
bun install --frozen-lockfile
bun pm untrusted
```

Use the isolated local lifecycle when the change needs a running `relay` and `lynttyd`:

```bash
bun dev:up
bun dev:verify
bun dev:down
```

Keep tests away from live `~/.lyntty`, `~/.pi`, and active Pi sessions. Follow the isolation rules in `AGENTS.md` for daemon, `relay`, Pi extension, APK, emulator, and tmux work.

## Make a focused change

- Follow current contexts, accepted architecture, runbooks, code, and tests. Research and evidence record earlier states and do not override current policy.
- Keep English and Simplified Chinese document pairs synchronized when the documentation rules require a pair.
- Add evidence under `docs/evidence/` for user-visible behavior, security hardening, E2E work, or release-sensitive changes.
- Keep credentials, complete pairing URLs, auth headers, encryption keys, signing material, private code, and private logs out of commits and issues.

Conventional Commits are preferred because pull requests are normally squash-merged. OpenPGP/GPG signing is optional on a contributor branch and is not required to open a pull request. Protected `main` and maintainer-authored durable commits follow the repository signing policy.

## Verify the change

Start with the narrowest affected check, then run the claim gate for the changed area. The default repository gate is:

```bash
bun run ci:fast
```

Documentation-site changes also require:

```bash
cd docs/.site
bun install --frozen-lockfile
bun run docs:check
bun run docs:build
```

`ci:fast` does not include docs-site checks, daemon integration, APK/Maestro validation, physical-device testing, deployed `relay` validation, or complete App/daemon/relay E2E. State every omitted check and its reason in the pull request.

## Open a pull request

- Link the GitHub issue when one exists. Maintainers should also link the Bead used for durable internal tracking.
- Explain the user-visible result, trust or compatibility impact, exact verification commands, and residual risk.
- Keep unrelated formatting and refactors out of the change.
- Push only to a branch or fork. Only maintainers publish Releases or change shared GitHub settings, and they do so under the repository authorization rules.
