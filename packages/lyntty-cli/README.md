# Lyntty

Code on the go — control AI coding agents from your phone, browser, or terminal.

Free. Open source. Code anywhere.

## Installation

```bash
npm install -g lyntty
```

> Migrated from the `lyntty-coder` package. Thanks to [@franciscop](https://github.com/franciscop) for donating the `lyntty` package name!

## Usage

### Claude Code (default)

```bash
lyntty
# or
lyntty claude
```

This will:
1. Start a Claude Code session
2. Display a QR code to connect from your mobile device or browser
3. Allow real-time session control — all communication is end-to-end encrypted
4. Start new sessions directly from your phone or web while your computer is online

### More agents

```
lyntty codex
lyntty gemini
lyntty openclaw

# or any ACP-compatible CLI
lyntty acp opencode
lyntty acp -- custom-agent --flag
```

## Daemon

The daemon is a background service that stays running on your machine. It lets you spawn and manage coding sessions remotely — from your phone or the web app — without needing an open terminal.

```bash
lyntty daemon start
lyntty daemon stop
lyntty daemon status
lyntty daemon list
```

The daemon starts automatically when you run `lyntty`, so you usually don't need to manage it manually.

### Keeping the daemon running across reboots

If you want the daemon to come back automatically after a reboot — without opening a `lyntty` session first — start it from your shell profile so it inherits your normal user session context (PATH, keychain access, OAuth credentials):

```bash
# ~/.zshrc or ~/.bashrc
if [[ -o interactive ]] && [[ -z "$LYNTTY_DAEMON_CHECKED" ]]; then
    export LYNTTY_DAEMON_CHECKED=1
    () {
        local state=$HOME/.lyntty/daemon.state.json
        local pid=$(grep -oE '"pid"[[:space:]]*:[[:space:]]*[0-9]+' "$state" 2>/dev/null | grep -oE '[0-9]+')
        if [[ -z "$pid" ]] || ! kill -0 "$pid" 2>/dev/null; then
            lyntty daemon start >/dev/null 2>&1
        fi
    } &!
fi
```

The first interactive shell after a reboot triggers the start; subsequent shells short-circuit because the daemon is already running.

> **macOS users:** prefer this shell-init approach over a `launchd` LaunchAgent. A LaunchAgent runs in an agent domain that is **detached from your GUI/Aqua login session**, which means the bundled `claude-agent-sdk` cannot reach the macOS keychain and silently fails authentication ("Failed to authenticate. API Error: 401 terminated", `duration_api_ms: 0`). If you must use launchd, your wrapper has to read the OAuth access token from `~/.claude/.credentials.json` and export it as `CLAUDE_CODE_OAUTH_TOKEN` before exec'ing the daemon — and you'll need to handle token rotation yourself.

## Authentication

```bash
lyntty auth login
lyntty auth logout
```

Lyntty uses cryptographic key pairs for authentication — your private key stays on your machine. All session data is end-to-end encrypted before leaving your device.

To connect third-party agent APIs:

```bash
lyntty connect gemini
lyntty connect claude
lyntty connect codex
lyntty connect status
```

## Commands

| Command | Description |
|---------|-------------|
| `lyntty` | Start Claude Code session (default) |
| `lyntty codex` | Start Codex mode |
| `lyntty gemini` | Start Gemini CLI session |
| `lyntty openclaw` | Start OpenClaw session |
| `lyntty acp` | Start any ACP-compatible agent |
| `lyntty resume <id>` | Resume a previous session |
| `lyntty notify` | Send push notification to your devices |
| `lyntty doctor` | Diagnostics & troubleshooting |

---

## Advanced

### Environment Variables

| Variable | Description |
|----------|-------------|
| `LYNTTY_SERVER_URL` | Custom server URL (default: `https://api.cluster-fluster.com`) |
| `LYNTTY_WEBAPP_URL` | Custom web app URL (default: `https://app.lyntty.engineering`) |
| `LYNTTY_HOME_DIR` | Custom home directory for Lyntty data (default: `~/.lyntty`) |
| `LYNTTY_DISABLE_CAFFEINATE` | Disable macOS sleep prevention |
| `LYNTTY_EXPERIMENTAL` | Enable experimental features |

### Sandbox (experimental)

Lyntty can run agents inside an OS-level sandbox to restrict file system and network access.

```bash
lyntty sandbox configure
lyntty sandbox status
lyntty sandbox disable
```

### Building from source

```bash
git clone https://github.com/slopus/lyntty
cd lyntty-cli
yarn install
yarn workspace lyntty cli --help
```

## Requirements

- Node.js >= 20.0.0
- For Claude: `claude` CLI installed & logged in
- For Codex: `codex` CLI installed & logged in
- For Gemini: `npm install -g @google/gemini-cli` + `lyntty connect gemini`

## License

MIT
