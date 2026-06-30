<h1 align="center">Lyntty</h1>

<p align="center">
  Mobile control for local <code>pi</code> sessions.
</p>

<p align="center">
  Android-first · mobile-only · node-local runtime · encrypted relay
</p>

## What Lyntty is

Lyntty is a mobile remote-control product for `pi` sessions running on machines you own.

The phone is not a terminal mirror and not a remote desktop. It is a focused control surface for:

- `Sessions Home`: see active and historical `pi` sessions.
- `Node Management`: pair and inspect machines running `lynttyd`.
- `Session Remote`: send intent, follow up, redirect, stop, and review structured runtime events.
- `Review Evidence`: inspect changed files, checks, errors, artifacts, recovery state, and next actions.

## Architecture

- `pi` runs locally on the node.
- `lynttyd` is the node-local authority for session discovery, runtime control, activation lock, redaction, and recovery proof.
- `relay` routes encrypted sync/RPC between mobile and node. It is not canonical history.
- Mobile is Android-first. iOS may remain best-effort through Expo, but it is not the acceptance target.

## Current roadmap

See:

- `docs/roadmap.md`
- `docs/roadmap.zh.md`
- `docs/research/lyntty-product-boundary.md`
- `docs/research/lyntty-session-discovery.md`

## Development status

The repository is being migrated to a Lyntty-based implementation because Lyntty provides the desired OSS mobile control feel and a strong sync/daemon/mobile foundation. Non-Lyntty product features are being removed while preserving the mobile interaction quality and the encrypted relay/session infrastructure.

## License

MIT, subject to upstream licenses preserved in this repository.
