# R102 — Explicit repair for legacy Relay image-tag config drift

Date: 2026-07-22

Branch: `fix/relay-tag-drift-repair`

Bead: `lyntty-24v.3`

## Live evidence and decision

Protected run `29878472712` classified the unique canonical production `LYNTTY_RELAY_IMAGE_TAG` value as `alternate-sha-tag`. This is outside the documented R65 state and is not accepted as an alternate prior runtime. The run remained fail-closed before service stop, backup, schema migration, or target start.

The only supported operator repair is stale configuration convergence to the already running, documented R65 runtime. It is not permission to migrate an alternate running image.

## Repair boundary

Before changing `.env`, the workflow must prove all of the following:

1. the raw Compose file is the exact supported R65 variable layout;
2. the source assignment is one canonical alternate `sha-*` tag in the same repository;
3. exactly one Relay container is running and its Docker `Config.Image` is exactly `ghcr.io/jczhang02/lyntty-relay:sha-9752c689c927`;
4. the running container image ID equals the local documented-tag image ID;
5. that image has exactly one same-repository `RepoDigest` and includes the documented RepoTag;
6. pulling the immutable prior digest yields the same image ID.

If any condition fails, no repair or service mutation occurs.

After identity proof, the repair:

- creates a root-private byte-preserving `.env` backup;
- stages a file that changes only `LYNTTY_RELAY_IMAGE_TAG` to the documented running tag;
- validates the staged Docker Compose image before installation;
- stages a root-private receipt;
- atomically installs `.env`, verifies the running container is unchanged, then installs the receipt;
- keeps an EXIT/HUP/INT/TERM rollback trap armed through receipt commit;
- restores both `.env` and the prior receipt state on any failure; failed restoration writes mode-600 `.rollback-incomplete` and blocks retry.

Once committed, the existing legacy image-layout migration derives the prior immutable digest from the verified running bytes and retains its own paired rollback.

## Verification

The extracted remote-transaction seam covers:

- successful stale-config repair followed by layout migration;
- exact final `.env`, private original backup, value-free receipt, and idempotent retry;
- alternate running-container refusal;
- post-install validation failure restoration;
- receipt-install failure restoration;
- TERM interruption after `.env` installation restoration;
- restoration failure, mode-600 blocking marker, and marker-based retry refusal;
- realistic staged `$expected` image validation in the jq mock;
- no secret or alternate tag emitted in stdout/stderr/receipt.

Repository hardening: `35 pass / 0 fail`. `bun audit`: clean. Untrusted lifecycle scripts: `0`. YAML, all five workflow shell blocks, error-level ShellCheck, and `git diff --check`: pass.

## Residual risk

> Follow-up: run `29880608810` proved the running container was not R65, so this repair correctly made no change. R103 documents the exact later production image/deploy/provenance identity instead of widening the drift-repair path.

The next protected deployment is the live proof. If the running container is not the documented R65 runtime, this repair will fail before mutation and the operator must produce new exact image identity/provenance evidence instead of widening this path.
