# R115 — Public project surface and CI trust hardening

Date: 2026-07-26

Branch: `docs/project-surface-hardening`

Bead: `lyntty-pf1`

Final implementation HEAD: `f125bd76097a2aa69d9086ae5082b60d2fb60b5f`

Final implementation tree: `ec1f901a4fdaa86ab5e10b79682fcc4ef3ed8275`

## Result

This work closes the public project-surface gaps found in the Mole/Lyntty comparison without importing Mole-specific product claims or release practices.

- Root SECURITY and CONTRIBUTING guides now have synchronized English and Chinese versions, public fork/branch/push/PR instructions, and a detail-free public fallback while GitHub Private Vulnerability Reporting is disabled.
- The Fumadocs site publishes an explicit 21-pair task-oriented source manifest. Evidence, research, internal Agent guidance, and `CONTEXT-MAP.md` remain outside the public site.
- The README uses a reviewed Preview-style emulator image with an explicit non-Stable/non-physical-device disclaimer. The image is leak-scanned and bound to SHA-256 `a4b9c068c988b69951f375e2eba0ddb1294d2e441209ca878d4515974a3e2725`.
- Required `Repo hygiene` now installs, audits, checks, and builds the independent docs graph on every pull request. The Pages build job has only `contents: read`; the checkout-free deploy job alone receives `pages: write` and OIDC permission. Docs installs use `--ignore-scripts`.
- Dependabot covers only the root Bun graph, `docs/.site`, and GitHub Actions. SHA-pinned CodeQL is non-required until an external run is triaged.
- Both Bun lockfiles audit clean. The root keeps the callable `minimatch@3.1.5` API through a one-line patch while modern minimatch keeps its named API. The docs Sharp override is accepted only for the tested static-export configuration.
- All 12 required context names still materialize. Only explicit current guides and regular raster assets added or modified under `docs/assets/` can short-circuit expensive package jobs.

## Docs-only classifier trust boundary

The first implementation was not accepted on tests alone. Independent adversarial reviews found and reproduced three bypass classes before final approval:

1. A pull request could modify the classifier that the workflow executed.
2. A base-sourced classifier could emit malformed or attacker-overwritten output that the wrapper accepted too loosely.
3. A pull-request `bunfig.toml` preload could run before the trusted classifier or byte validator and overwrite their private output.

The final wrappers in five `typecheck.yml` scopes and two `cli-smoke-test.yml` scopes now:

- extract `scripts/ci-changed-paths.ts` from the exact pull-request base SHA;
- keep the classifier, empty Bun config, and output under `.git`;
- invoke both classifier and validator with `--config=<trusted-empty-config> --no-env-file --no-install`;
- accept only exact ASCII `run_full=<true|false>\nreason=<allowed-reason>\n` bytes with consistent semantics;
- fail open for missing or invalid base identity, Git errors, empty diffs, deletion, rename, type/mode changes, symlinks, gitlinks, malformed UTF-8, BOM/NUL bytes, duplicate or extra fields, and every unlisted path.

A real temporary Git regression adds malicious `bunfig.toml`/preload code, modifies the classifier, and adds package code in one commit. The result remains `run_full=true` with `reason=full-path`.

## Public installation trust

The README and bilingual CLI release guides bind bootstrap instructions to the same immutable Stable Compatibility Release:

`compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1`

A read-only live Release check during final remediation confirmed that it remained published, non-draft, and non-prerelease. The documented bootstrap hashes matched the downloaded assets:

| Asset | SHA-256 |
| --- | --- |
| `install.sh` | `e6db6345bc2c0c22a180ff86d93df67486dbad9e694699ba74a8f4738272e85f` |
| `stable-release-trust-roots.json` | `def81e7ccffac1915c5b792674876f0c24fb4b8df648da0f3d39e75e117b0608` |
| `compatibility-bom.json` | `df231effa7b3047fb7acdd400cff49434494012b8e17767aee72f1d7049a8bca` |
| `compatibility-bom.sig.json` | `d74fb3508fad79c0705349788da12e1ba7e417953cf46d9e8afb4260b00bf43e` |

The four documented archive/manifest digest pairs also matched:

| Platform | Archive | `artifact-manifest.json` |
| --- | --- | --- |
| Linux x64 | `f665417d53d259da143a42589a7efc1374e61aeff6c26367a6974719c08d658f` | `9702e4f9c5220c549763fd796da747d92ad04d36d6af794dd1b75947b7822df9` |
| Linux arm64 | `29d6e6fc56eb0d7017c709bcc2de5fb48aaa97505c8eeec32aec72dca03a0091` | `d0e5f254356870e45d8ed032e42989532e3308e03395adc5b37bbc309b3ce751` |
| Darwin x64 | `bfdaf396ed1c26ed6275811221a406a00c7fc87e1be72c913afac23968f2658d` | `a6288f3839cbc59afe8aed63efa5ed1b4b50c28ef29e685b9ca8bcb1f3c13c05` |
| Darwin arm64 | `5b48ef1cd3cd830cb99b765bfe47159f185803a9d18eaa793aa6cd12db801731` | `d29eaa68f21f6c85c0c61b90302191ba1e46f90c6018f7f8f1f8060726b78443` |

No network response is piped to a shell, and no independent `latest` file or placeholder hash is used as a trust root.

## Final verification

Raw local logs are not tracked. The final clean validation directory was `/tmp/lyntty-pf1-final-v3.hyMi1W`, bound to implementation HEAD `f125bd76097a2aa69d9086ae5082b60d2fb60b5f`.

```text
bun install --frozen-lockfile
bun pm untrusted
bun run ci:fast
PASS
  repository hardening: 82 pass, 0 fail
  root bun audit: No vulnerabilities found
  Wire: 36 pass, 0 fail
  CLI: 585 pass, 0 fail
  Relay: 119 pass, 0 fail
  App: 819 pass, 3295 assertions across 90 files
  development scripts: 36 pass, 0 fail

bun run ci:daemon-integration
PASS: compiled CLI/lynttyd daemon integration
```

A fresh `git archive` of the same HEAD provided the docs build input; it did not reuse the worktree's `node_modules`:

```text
cd docs/.site
bun install --frozen-lockfile --ignore-scripts
bun pm untrusted
bun audit
bun run docs:check
bun run docs:build
PASS
  373 packages installed with lifecycle scripts disabled
  0 untrusted dependencies with scripts
  No vulnerabilities found
  42 manifest-owned sources prepared
  44 static routes generated
  42 localized HTML and 42 raw Markdown pages validated
```

Additional checks:

- 20 GitHub YAML files parsed successfully with Ruby Psych.
- `git diff --check` passed and the worktree was clean.
- All 10 implementation commits reported `Good signature` from OpenPGP key `BABC6A51B0F43016329922DE1F863CBFD6EDCA6B`.
- Independent verification of requirements returned `PASS`.
- The final classifier runtime review returned `PASS` after malicious preload, dotenv, and auto-install probes.
- A later Pages review found over-broad build permissions; the build/deploy split, `--ignore-scripts`, and strict ordered-step regression closed that finding, and focused re-review returned `PASS`.

`actionlint` was not installed locally. YAML parsing and repository workflow contracts passed, but this record does not claim an `actionlint` run.

## Commits

- `fde473a69dd815134463987d451cb67f75c8155a` — public security and contribution paths
- `f13a414fadab81673d09564f69a6fb1aae44ae51` — bilingual task-oriented docs site
- `adf1312554118f18977cb7c26d20d52479c11f2c` — truthful visual and FAQ
- `28030c1569949bc6ca949f941b2b0a86d9ac623c` — required docs PR gate
- `dc990c470edd6616958d7a5f5ae5a27a3440743f` — dependency maintenance baseline
- `3f9f448a1bc7cf9f013fc65c3fd4a73f85046574` — docs-only short-circuit
- `1fd4882f5281d900b5233e648802c0627575007d` — base classifier/output trust
- `9dfbe588785fa3a61d2ee0c0a40abc0b360bbf2a` — public trust remediation
- `97a0dfd6350adb31c6337c169d270bfe8c3c9938` — isolated classifier runtime
- `f125bd76097a2aa69d9086ae5082b60d2fb60b5f` — isolated Pages deployment permissions

## Unapplied GitHub settings manifest

`docs/evidence/artifacts/r115-project-surface-hardening/github-settings-manifest.json` records the read-only GitHub state observed at `2026-07-25T21:11:42Z` and exact request/rollback bodies. It is explicitly marked `not-applied` and requires separate authorization for each selected change ID.

The proposed changes set a bounded About description, the existing docs URL as homepage, an eight-topic discovery set, and `has_wiki=false`; they can also enable PVR, vulnerability alerts, and Dependabot security-update pull requests. The manifest keeps Pages domain/build mode, the signed linear 12-context main ruleset, merge methods, Issues/Projects/Discussions state, secret-scanning state, and all Releases/tags/assets unchanged.

No command in that manifest was executed.

## Not run and residual risk

- No push, pull request, merge, workflow dispatch, release mutation, or GitHub setting mutation occurred.
- Real pull-request Actions, Dependabot, CodeQL, and Pages deployment have not run for this branch. CodeQL remains deliberately non-required until external results are reviewed.
- GitHub Private Vulnerability Reporting was still disabled at the read-only check. SECURITY therefore keeps the detail-free public contact fallback. No public security mailbox exists.
- APK, Maestro, physical-device acceptance, live Pi-extension installation, production Relay deployment, Stable end-to-end behavior, and complete Session Remote behavior were not run; this work did not change product runtime code.
- `--ignore-scripts` blocks docs install lifecycle scripts, but the pinned docs packages still execute during the static build. Minimal job permissions, frozen locks, both audits, and a checkout-free deploy job reduce rather than eliminate dependency compromise risk.
- Sharp `0.35.3` remains outside Next `16.2.11`'s declared `^0.34.5` range. The acceptance is limited to the verified static export with unoptimized images.
- Context-name branch protection cannot distinguish a trusted workflow from a pull request that changes that workflow. Such workflow changes still require human review and the existing signed, linear main ruleset.
- The GitHub settings manifest is an unapplied proposal, not mutation evidence. This record does not claim that PVR, About, topics, homepage, Wiki, vulnerability alerts, Dependabot security updates, or any other repository setting was changed.
