# R119 — Stable predecessor path portability

Date: 2026-07-27

Branch: `fix/stable-predecessor-paths`

Bead: `lyntty-mpr`

Base: `6bd9db80e1092616c781550165c1f797767dfc88`

## Observed release failure

Stable Candidate run [`30236540399`](https://github.com/jczhang02/lyntty/actions/runs/30236540399) completed successfully from protected `main` at `6bd9db80e1092616c781550165c1f797767dfc88`. Its unique Candidate artifact was bound to the intended identity `compat-v1.2.1_1.2.1_1.2.1_0.2.0-s2`.

Promotion run [`30238922664`](https://github.com/jczhang02/lyntty/actions/runs/30238922664) downloaded that exact Candidate and passed its attestation and complete checksum verification. It then failed before publication while invoking Compatibility history verification. The retained BOM path came from the Candidate's first build runner:

```text
/home/runner/work/_temp/candidate/predecessors/<tag>/compatibility-bom.json
```

That absolute path did not exist after the bundle was unpacked under a different Promotion runner. GitHub skipped every later mutation step, including Relay image promotion, Release asset preparation, tag/Release publication, and Latest verification. The target tag and Release did not exist after the failure.

## Root cause

`release-candidate.yml` wrote `predecessorEntries[].path` directly to `predecessor-paths.txt`. Those values were absolute paths rooted at the Candidate runner's `$RUNNER_TEMP`. Candidate assembly consumed the file on the same runner, so it passed there. Promotion later consumed the sealed file on another runner, where the original temporary root was invalid.

Stable sequence 1 had no predecessor and therefore could not exercise this path. Sequence 2 was the first Stable Candidate to expose the cross-runner portability defect.

## Fix

- Candidate assembly now stores each retained BOM path relative to the Candidate root.
- Candidate verification and Promotion both accept only a channel-tag-shaped path under `predecessors/`.
- Each workflow resolves the validated path against its current `$CANDIDATE` root and requires the resulting BOM file to exist.
- Absolute build-runner paths and malformed paths fail closed.

The signed BOM itself already used root-relative artifact references; this change aligns the internal history-verification input with that portable model. It does not weaken BOM signature, predecessor-chain, source, sequence, Android `versionCode`, attestation, checksum, tag-ruleset, or immutable-Release checks.

## Test-first verification

The new regression was run before implementation:

```text
bun test scripts/workflow-hardening.test.mjs
31 pass, 1 fail
```

The failure required root-relative serialization and cross-runner resolution. After implementation, the test executes the workflow's serialization fragment under a runner-A Candidate root, copies the sealed tree to a distinct runner-B root, and executes both workflow resolver blocks there. It covers newline-terminated and unterminated records, a sequence-1 empty list, stale absolute and traversal paths, blank records, and a valid-shaped missing file:

```text
bun test scripts/workflow-hardening.test.mjs
32 pass, 0 fail
```

Workflow syntax and shell validation:

```text
Ruby YAML parse: release-candidate.yml and release-promote.yml passed
release-candidate.yml: 15 Bash run blocks
release-promote.yml: 9 Bash run blocks
all 24 blocks: bash -n and shellcheck --shell=bash -S error passed
git diff --check: passed
```

Complete local gate:

```text
bun install --frozen-lockfile
bun pm untrusted
bun run ci:fast
```

Result:

- frozen install: pass;
- untrusted dependency scripts: `0`;
- repository hardening: `85 pass`, `0 fail`;
- dependency audit: no vulnerabilities;
- Wire: `36 pass`, `0 fail`;
- CLI: `606 pass`, `0 fail`;
- Relay: `119 pass`, `0 fail`;
- App: `863 pass`, `0 fail`, `3381` assertions across `98` files;
- isolated development scripts: `36 pass`, `0 fail`;
- independent docs install/audit/check: no vulnerabilities, `42` pages prepared, MDX generation and TypeScript checks passed.

## Publication state and residual risk

The failed Promotion published nothing. Because protected Promotion requires the Candidate source to remain the current protected `main`, this workflow fix must merge first and a new Candidate must be built from that new exact source before Promotion is retried.

Physical Android validation remains intentionally not performed under the optional Stable policy. Production Relay deployment remains outside this release task. The protected Candidate and Promotion workflows must still prove the rebuilt artifact, signed BOM history, exact source, Relay digest, and immutable Release transaction before the release can be claimed complete.
