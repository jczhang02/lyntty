# R114 — Root README presentation refresh

Date: 2026-07-24

Branch: `docs/readme-refresh`

Bead: `lyntty-3ll`

## Result

The root `README.md` was rewritten as a public project entry point instead of a short internal index. It now uses a centered Lyntty identity, live repository badges, concise product features, an architecture diagram, a safe self-hosted quick start, platform scope, package ownership, and separated current/historical documentation links.

The final README is 9,119 bytes across 164 lines with SHA-256:

```text
e9a099549ce54848b50b0f644600f33b29d5662f367354f5773b07486828b332
```

## Reference and product filtering

The presentation reference was `tw93/Mole` `README.md` at commit `17683e1ac501b80456c37b23b2895398c1fe6380` (source SHA-256 `fd9c9f06aca1f36545903428d321fa1996c4ea575665f7c4c0a093e935735b1c`). Lyntty reused its scan-friendly hierarchy—centered identity, badges, feature summary, quick start, and explicit safety context—but did not copy Mole's macOS commands, product claims, community sections, or installation model.

The rewritten content remains bounded by current Lyntty authority:

- Android is the primary client and `pi` is the only product runtime.
- The ordinary path is `phone -> relay -> lynttyd -> local Pi extension -> pi`.
- The Pi extension stays local-only; operator `lyntty remote` is described separately.
- Pi JSONL remains canonical and one session has one `active runtime`.
- Stable installation uses one signed Compatibility Release set rather than independent latest files or an unverified network-to-shell command.
- The README does not claim a public Relay service, Play Store distribution, full end-to-end encryption, npm installation, Windows user-service support, or iOS release acceptance.

The current launcher icon is the only new hero visual referenced by the README. Historical screenshots were not promoted into the project entry point because they represent older point-in-time UI and version states.

## Verification

- `bun install --frozen-lockfile` initially failed while extracting the `expo-modules-core@55.0.25` tarball after installing 2,702 packages.
- `bun install --frozen-lockfile --force` then completed with 2,704 packages and no lockfile change.
- The first `bun run test:repo-hardening` run passed 52/53 tests and correctly rejected the merged documentation heading. Restoring distinct `## Current documentation` and `## Historical records` sections resolved the contract.
- Final `bun run test:repo-hardening`: 53 passed, 0 failed.
- `bun pm untrusted`: 0 untrusted dependencies with lifecycle scripts.
- A focused README link scan found 42 references, 22 unique local targets, and 0 missing local targets.
- GitHub's Markdown API accepted the document and preserved the centered header, IMPORTANT alert, Mermaid enrichment block, and app icon.
- The documentation site, latest Release, CI workflow, stars badge, Release badge, and CI badge each returned HTTP 200 during validation.
- `git diff --check`: passed.
- An independent read-only reviewer compared the README against Mole and current Lyntty product, architecture, development, release, and CLI authority: `PASS`.

## Not run and residual risk

- `bun run ci:fast`, APK, Maestro, emulator, physical-device, live Pi-extension, Relay deployment, and release workflows were not run because runtime/product code did not change.
- `docs:check` and `docs:build` were not run because the root README is not a Fumadocs source or site configuration file; GitHub rendering and direct link checks cover the changed surface.
- External URLs were checked at review time but remain dependent on GitHub, GitHub Pages, and Shields availability.
- Mermaid was accepted by GitHub's enrichment pipeline; no browser screenshot comparison was recorded.
