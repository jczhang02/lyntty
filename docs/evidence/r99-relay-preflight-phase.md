# R99 — Production Relay preflight phase diagnostics

Date: 2026-07-22

Branch: `fix/relay-preflight-phase`

Bead: `lyntty-24v.3`

> Follow-up: protected retry `29873580305` proved the diagnostic works and isolated the rejection to `legacy-image-layout`. Protected retry `29875585755` then narrowed it to `legacy-image-rendered-model`. The remaining rendered-service, image, volume, and R65 tag-binding assertions now emit fixed reason text without state values.

## Trigger

Protected run `29872651065` passed release/BOM/digest/attestation and SSH gates, then failed in the remote pre-stop preflight without identifying which fail-closed assertion rejected the live R65 state. Public Relay remained healthy on prior metadata (`versionCode=5`); logs showed no service stop, database backup/migration, or target container start.

## Change

The remote transaction now tracks a fixed, non-sensitive phase label and reports only that label when preflight exits nonzero. Labels cover argument, filesystem/marker, master-secret, image assignment, optional environment, prior runtime, and rollback-compatibility checks. Legacy image layout is further divided into source model, rendered model, running container, repository digest, staging, and install. The image-layout restoration trap reports the same label after paired restoration. Once the normal deployment rollback trap is armed, it replaces the diagnostic trap.

No environment value, image credential, host, key, URL query, or secret is printed. No acceptance gate is removed or relaxed.

## Verification

- hardening/redaction/Relay-SBOM: `35 pass / 0 fail`;
- `bun run ci:audit`: no vulnerabilities;
- workflow YAML parse, all `5` shell blocks under `bash -n` and error-level ShellCheck, and `git diff --check`: pass.

## Residual risk

The next protected retry is required to identify the exact live preflight boundary. The phase marker is diagnostic evidence only and cannot authorize mutation.
