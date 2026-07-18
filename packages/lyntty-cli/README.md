# Lyntty CLI

`lyntty` controls local `pi` sessions from the Lyntty Android app. `lynttyd` is the local daemon that connects those sessions to a self-hosted Relay. The Pi extension talks only to local `lynttyd`; it never connects directly to the public Relay.

## Development

The repository pins Bun in `.bun-version` and `packageManager`.

```bash
bun install --frozen-lockfile
bun run --filter lyntty-cli typecheck
bun run --filter lyntty-cli test
bun packages/lyntty-cli/src/index.ts --help
```

Use a temporary `HOME` and `LYNTTY_HOME_DIR` for daemon, authentication, or Pi-extension tests. Do not install or reload the extension in a live Pi session by default.

## Commands

```text
lyntty                         Start a managed Pi session
lyntty auth login              Pair this computer with the Android app
lyntty daemon install          Repair/start the managed native user service
lyntty daemon start            Start the installed lynttyd user service
lyntty daemon status           Inspect lynttyd
lyntty update status           Inspect the transactional installation
lyntty update rollback         Restore the previous known-good release
lyntty remote install          Install the local Pi extension
lyntty remote list             List remote sessions
lyntty remote send …           Send a message to a Pi session
lyntty dev app-logs            Receive development app logs on loopback
lyntty doctor                  Run local diagnostics
```

`lyntty dev app-logs` binds to `127.0.0.1:8787` by default. Use `--host 0.0.0.0` only when emulator or LAN access is intentionally required.

Pi manages its own model and provider credentials. Lyntty does not run Claude, Codex, Gemini, OpenClaw, or arbitrary ACP runtimes.

## Configuration

| Variable | Purpose |
| --- | --- |
| `LYNTTY_SERVER_URL` | Relay API URL; defaults to the configured Lyntty Relay |
| `LYNTTY_HOME_DIR` | Local daemon, credential, and session state; defaults to `~/.lyntty` |
| `LYNTTY_PI_EXTENSION_PATH` | Explicit Pi extension path override; primarily for isolated tests |
| `PI_CODING_AGENT_DIR` | Pi agent directory used before the default `~/.pi/agent` path |
| `LYNTTY_INSTALL_ROOT` | Transactional release root override |

`lyntty daemon install` uses a systemd user service on Linux and a per-user LaunchAgent on macOS. It never uses sudo, and it refuses to install before authentication. Windows artifacts are available for smoke testing, but Windows service installation and update are not yet supported.

Release builds compile `lyntty` and `lynttyd` as standalone Bun executables. End users do not need Bun or Node. `lyntty --self-check --json` verifies the complete artifact. Installation and update require hashes bound by the signed release Compatibility BOM; see [`docs/release/cli.md`](../../docs/release/cli.md). Relay deployment is a separate operator workflow.

## License

MIT
