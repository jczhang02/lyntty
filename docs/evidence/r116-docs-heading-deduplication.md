# R116 — Docs page heading deduplication

Date: 2026-07-26

Branch: `fix/docs-heading-dedup`

Bead: `lyntty-2b4`

Base: `fd05b11c80a216fa2d0fc589d870bd1fce049a48`

Implementation commit: `d94b1dfe357f127bd5591e9afb8b9815ea32ae91`

## Result

The generated Fumadocs pages now render one document title instead of repeating the manifest title and the source Markdown H1. Source documents are unchanged. All 42 raw Markdown pages retain their original H1, and `llms-full.txt` contains one generated title per ordered page body.

The static export now fails closed when:

- a published source does not begin with a non-empty H1;
- a localized HTML page renders other than one H1;
- a raw Markdown H1 differs from its exact source H1; or
- `llms-full.txt` differs byte-for-byte from the ordered page bodies.

## Production reproduction

PR #53 merged as `46598fc39d7a5bf2c7facad17e841c2fd71cf1a2`. Pages deployment `5607784310` completed successfully for that SHA, but browser inspection of the deployed site showed the visual defect:

- the desktop home page displayed `Lyntty Docs` twice;
- the mobile English page displayed `Getting started` twice;
- the mobile Chinese page displayed `开始使用` twice.

A pre-fix static build reproduced the mechanism deterministically: all 42 manifest-owned HTML pages contained two rendered H1 elements. After adding the exact regression gate but before changing generation, this command failed as intended:

```text
cd docs/.site
bun run docs:build

Static docs validation failed: expected one rendered H1 on index.html, found 2
```

The cause was the generation boundary. `prepare-fumadocs-pages.mjs` copied each source file's leading H1 into MDX while both route components also rendered `DocsTitle` from manifest frontmatter.

Temporary pre-fix browser captures were not committed. Their SHA-256 values were:

| View | SHA-256 |
| --- | --- |
| Desktop home | `55290ccff7b2dfea297f6b5b628e754dd485b9fb2c5138318defcd7e3d6747d1` |
| Mobile English getting started | `4f8c7e8279d0f994ced8d605a431fd26f557e56dd779f3c8d4a3e8dcd4e40661` |
| Mobile Chinese getting started | `9bc8a7dc939c23edcc06db236ea1b35696e040f5cacd26346ad3505a2a8fff2d` |

## Fix

- `splitLeadingMarkdownH1()` owns the leading-H1 boundary and handles BOM, CRLF, EOF, tab, Unicode-space, and indented-body behavior explicitly.
- Site preparation removes only the source H1 before MDX compilation and stores its exact text as generated metadata.
- Raw Markdown generation restores the exact source H1 without trimming body indentation.
- `llms-full.txt` uses the heading-free body, eliminating its previous adjacent duplicate headings.
- Static validation checks the generated HTML, raw Markdown/source mapping, complete `llms-full.txt`, route links, anchors, base path, and 404 output in one build.

Independent review found H1 cross-line matching, body `trimStart()`, raw-title comparison, and `llms-full.txt` ordering edge cases. Two remediation rounds closed every finding; final review returned `PASS` with no blocker.

## Local verification

The final checks ran after synchronizing to `origin/main` at `fd05b11c80a216fa2d0fc589d870bd1fce049a48`.

```text
bun test scripts/docs-site-contract.test.mjs
13 pass, 0 fail

bun run test:repo-hardening
84 pass, 0 fail

cd docs/.site
bun audit --audit-level=high
bun run docs:check
bun run docs:build
No vulnerabilities found
42 sources prepared
44 static routes generated
42 localized HTML and 42 raw Markdown pages validated

cd ../..
bun audit --audit-level=high
bun run ci:fast
No vulnerabilities found
Wire: 36 pass, 0 fail
CLI: 606 pass, 0 fail
Relay: 119 pass, 0 fail
App: 863 pass, 3381 assertions across 98 files
development scripts: 36 pass, 0 fail
```

Additional checks:

- every one of the 42 published content pages renders one H1;
- all 42 raw Markdown H1 values exactly match their source H1;
- `llms-full.txt` byte-matches the ordered expected page bodies;
- `git diff --check` passed;
- implementation commit `d94b1dfe357f127bd5591e9afb8b9815ea32ae91` has a Good OpenPGP signature from key `BABC6A51B0F43016329922DE1F863CBFD6EDCA6B`.

The fixed export was served only on loopback and rendered with isolated headless Chrome profiles at desktop `1440x1000` and mobile `390x844`. The captures show one title and retain the expected navigation, locale link, typography, and content flow:

| View | SHA-256 |
| --- | --- |
| Desktop home | `bdc691467835afc14098d1597405029eaea965fdcfe353f3c6a05b48df43ac1c` |
| Mobile English getting started | `b7319f0750f1c4234b6f348da6e436bd26894c9c456952ee849a695daac63771` |
| Mobile Chinese getting started | `aa76bf11f765d1e99c9386e36525c4549bf9a7d940fb7b1a87355b161f6c8d6b` |

The captures and raw logs remain temporary local artifacts and contain no account, pairing, relay, or session data.

## Installation and retry notes

The first root `bun install --frozen-lockfile --ignore-scripts` attempt hit one transient npm tarball extraction failure for `expo-modules-core`; one bounded retry succeeded. A first `ci:fast` then failed because lifecycle scripts had intentionally been disabled and the generated Prisma client was absent. Running the repository's trusted `bun install --frozen-lockfile` postinstall generated the client; the complete final `ci:fast` passed. These were setup failures, not product or docs test failures.

## External validation

PR [#59](https://github.com/jczhang02/lyntty/pull/59) ran against head `080f3ab2097db89b0933deaff027be451f92757c`. All 15 reported checks passed, including the 12 required contexts, Relay image verification, the CodeQL workflow, and code-scanning check `89770648079`.

| Workflow | Run | Result |
| --- | --- | --- |
| Relay image verification | `30193409761` | success |
| CLI Artifact Smoke Test | `30193409772` | success |
| Lyntty CI | `30193409773` | success |
| CodeQL baseline | `30193409775` | success |

The PR was squash-merged as `6e13f73029cb1385415f0b5b649dee3290ce0a4f` at `2026-07-26T07:56:14Z`. GitHub reports a valid verified signature, and the merge tree `f144e93a10c7a7b99ecfd72ff63c29a89a9ce99a` exactly matches the reviewed PR head tree.

Post-merge runs also passed:

| Workflow | Run | Result |
| --- | --- | --- |
| Lyntty CI | `30193688194` | success |
| Deploy docs | `30193688200` | success |
| CodeQL baseline | `30193688201` | success |

Pages deployment `5608408027` published exact main SHA `6e13f73029cb1385415f0b5b649dee3290ce0a4f` to the unchanged URL <https://jczhang02.github.io/lyntty/>. A complete live read verified:

- 42/42 HTML routes returned 200, rendered one expected H1, and retained the expected language, canonical URL, and `/lyntty/` base path;
- 42/42 raw Markdown pages, `llms.txt`, and `llms-full.txt` byte-matched the validated local export;
- the custom unknown route returned 404 with the expected bilingual content and `noindex`;
- desktop home and mobile English/Chinese browser captures visibly showed one page title with intact navigation and typography.

| Live view | SHA-256 |
| --- | --- |
| Desktop home | `2926cf957ef71c9fbe9b1d5269a27f915e6f50af3dd63a4e54b9900859c83be9` |
| Mobile English getting started | `b7319f0750f1c4234b6f348da6e436bd26894c9c456952ee849a695daac63771` |
| Mobile Chinese getting started | `aa76bf11f765d1e99c9386e36525c4549bf9a7d940fb7b1a87355b161f6c8d6b` |

The final live verifier resumed with bounded per-URL retries after one transient GitHub Pages connection timeout. The completed pass covered every route and artifact above.

No GitHub setting, Pages domain, Release, tag, asset, or required-context configuration was changed.

## Not run and residual risk

- APK, Maestro, physical-device, live Pi-extension, `lynttyd`, Relay deployment, Stable end-to-end, and Session Remote checks were not rerun; this change affects only static docs generation and validation.
- The H1 count uses a bounded static HTML scanner rather than a complete browser DOM parser. It excludes comments and `script`, `style`, and `template` bodies and matches the current Next.js export, but malformed future HTML could fail closed.
- A future source H1 containing an internal Markdown link will fail closed because link absolutization currently occurs before generated-frontmatter parsing. None of the 42 current H1 values contains a link.
- Headless Chrome emitted a host NSS root-certificate initialization warning while still loading and capturing the loopback pages successfully; no page-specific browser failure was observed.
