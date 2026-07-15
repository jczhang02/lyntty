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
lyntty daemon start            Start lynttyd
lyntty daemon status           Inspect lynttyd
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
| `LYNTTY_PI_EXTENSION_PATH` | Isolated Pi extension path override for tests |

Release builds compile `lyntty` and `lynttyd` as standalone Bun executables. End users do not need Bun or Node. Release installers and checksums are published through GitHub Releases; Relay deployment is a separate operator workflow.

## License

MIT
