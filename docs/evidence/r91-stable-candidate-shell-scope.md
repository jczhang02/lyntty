# R91 — Stable Candidate BOM shell-scope recovery

Date: 2026-07-21

Branch: `fix/stable-candidate-shell-scope`

Bead: `lyntty-24v`

Implementation commit: `23dfb77dacd42df3bad2596b32a4252d7ca1a427` (GPG signature verified locally).

## Failure

Replacement Stable Candidate run `29832857951` used protected main `9dd1e91e8c7c8bd31003e7053cef4afbdf81beb0`. It passed five-platform CLI, signed Android APK, Relay multiarchitecture OCI, and the new two-platform Syft/SPDX generation, then stopped safely at `Assemble, sign, and verify immutable Compatibility BOM`.

The shell block assigned `CANDIDATE` only as an environment prefix for the heredoc Bun process:

```sh
CANDIDATE="$RUNNER_TEMP/candidate" bun - <<'BUN'
```

After that process exited, `set -u` correctly rejected the later `$CANDIDATE` reference as unbound. The run therefore never assembled or signed a BOM, sealed or uploaded a Candidate bundle, created a tag or Release, pushed GHCR, or deployed production. GitHub retained only automatic Buildx diagnostic artifact `jczhang02~lyntty~R8HLIC.dockerbuild` (artifact ID `8497144754`); it is not promotable release input.

## Fix

The workflow now assigns and exports the shell variable before the heredoc:

```sh
CANDIDATE="$RUNNER_TEMP/candidate"
export CANDIDATE
bun - <<'BUN'
```

This keeps the same value available to both the Bun inventory generator and every later BOM assemble/sign/verify command. A static regression assertion requires this exact export and rejects the old one-command environment prefix.

## Verification

- `bun run test:repo-hardening`: `30 pass / 0 fail`;
- all workflow YAML parsed;
- all `15` Candidate workflow shell blocks passed `bash -n` and error-level ShellCheck;
- `git diff --check`: pass.

A replacement Candidate must rebuild all bytes from the protected main containing this fix. No bytes from failed runs `29825007418` or `29832857951` may be reused.
