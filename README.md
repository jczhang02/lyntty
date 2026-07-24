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
- `Session Remote`: send intent, follow up, redirect, stop, and review Pi messages, tool activity, changed files, checks, and errors.

## Architecture

- `pi` runs locally on the node.
- `lynttyd` is the node-local authority for session discovery, runtime control, activation lock, redaction, and recovery proof.
- `relay` routes encrypted sync/RPC between mobile and node. It is not canonical history.
- Mobile is Android-first. iOS may remain best-effort through Expo, but it is not the acceptance target.

## Current documentation

Start with:

- [`CONTEXT-MAP.md`](CONTEXT-MAP.md)
- [`docs/contexts/product/CONTEXT.md`](docs/contexts/product/CONTEXT.md)
- [`docs/architecture/pi-shared-control.md`](docs/architecture/pi-shared-control.md)
- [`docs/development.md`](docs/development.md)
- [`docs/release/compatibility-bom.md`](docs/release/compatibility-bom.md)
- [`docs/release/android-apk.md`](docs/release/android-apk.md)
- [`docs/release/cli.md`](docs/release/cli.md)

## Historical migration records

`docs/roadmap.md`, `docs/roadmap.zh.md`, and `docs/research/` preserve migration plans and research snapshots. They explain prior decisions but do not override current contexts, accepted architecture, code, or tests.

## Development

Lyntty uses a Bun-only, Pi-only workspace. Start an isolated worktree-local Relay and daemon with:

```bash
bun install --frozen-lockfile
bun dev:up
bun dev:verify
bun dev:down
```

Android is explicit with `bun dev:up --android`. See [`docs/development.md`](docs/development.md) for state, port, evidence, and process-ownership safety.

## License

MIT, subject to upstream licenses preserved in this repository.
