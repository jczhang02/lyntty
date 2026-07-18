# R79 — standalone CLI artifact, user service, and atomic update evidence

Date: 2026-07-16

Branch: `refactor/bun-migration`

Bead: `lyntty-6o0.4`

## Scope

This round turns the already compiled `lyntty`/`lynttyd` pair into a complete runtime-free distribution:

- deterministic Linux/macOS archives and a Windows ZIP-capable layout;
- embedded build/release identity plus exact-inventory `--self-check`;
- bundled Pi themes, export assets, docs, Bun-adjusted examples, `rg`, and `difft`;
- atomic, ownership-aware Pi extension installation;
- systemd user and macOS LaunchAgent service managers with no sudo;
- versioned install root, stable `current` pointer, private journal, crash recovery, exact health gate, quarantine, and explicit rollback;
- hash-pinned POSIX bootstrap installer;
- manual Linux/macOS/Windows artifact smoke workflow that does not publish.

Windows service installation and transactional update remain explicitly unsupported. Stable macOS notarization and Windows Authenticode are later external release gates.

## Safety boundaries

- No test used live `~/.pi`, `~/.lyntty`, current Pi/tmux panes, or the live user service manager.
- CLI unit/integration fixtures now use the ignored `packages/lyntty-cli/dist/test-state` tree and remove each run. Large generated artifacts were removed after recording results; they were not retained in `/tmp`.
- `lyntty --self-check` and `lynttyd --build-info` dispatch before operational configuration is imported, so they create no HOME, Pi, or daemon state.
- The installer never reloads Pi. A changed extension requires a new Pi session or a user-triggered `/reload`.

## Verification

### Native Bun suite and compiled lifecycle

```bash
bun run --cwd packages/lyntty-cli test
bun run --cwd packages/lyntty-cli typecheck
bun run --cwd packages/lyntty-cli test:integration
```

Results:

- CLI: **570 passed, 0 failed, 1,244 assertions, 69 files**.
- TypeScript: passed.
- Compiled `lyntty` + compiled `lynttyd` + compiled Relay/PGlite lifecycle: passed.
- Integration state was isolated under package `dist/test-state` and removed on completion.

The focused transaction/security coverage includes:

- concurrent lock acquisition and crashed PID/start-token recovery;
- every install mutation behind a private journal;
- exact extension-byte restore and candidate quarantine after failed health;
- previous-known-good rollback with roll-forward retained;
- interrupted rollback recovery;
- commit-point journal cleanup failure;
- unknown regular/symlink launcher refusal;
- no-clobber behavior when a regular file is raced into `current`;
- exact release identity retained across daemon heartbeat writes;
- systemd/LaunchAgent command and failed-install restoration behavior.

### Complete Linux artifact

```bash
bun run --cwd packages/lyntty-cli build:artifact --target linux-x64
# self-check with HOME, LYNTTY_HOME_DIR, PI_CODING_AGENT_DIR and PATH isolated
<artifact>/lyntty --self-check --json
```

Result:

```json
{"ok":true,"releaseId":"lyntty-cli-1.1.10-linux-x64","version":"1.1.10","target":{"os":"linux","arch":"x64","libc":"glibc"},"checkedFiles":177,"daemonVersion":"1.1.10"}
```

The gate placed failing sentinels named `bun`, `node`, `npm`, `pnpm`, `npx`, and `tsx` on `PATH`; none ran. Self-check created neither Lyntty nor Pi state. The only executable files were:

```text
lyntty
lynttyd
tools/difft
tools/rg
```

Bundled Pi runtime text contained no command/shebang fallback to npm, pnpm, npx, or tsx.

Unsigned local validation hashes (not release artifacts):

```text
archive_sha256=46925a83b456aa0f3b90387676e4cb6e4e82a7ddea12c5f1304ed8ddda4fe768
manifest_sha256=52460e5f8432e3308d62533eb8990ef67f837d20660d97bd66d1ecc6e0ee2300
```

Two complete builds under `umask 077` + `TZ=Pacific/Honolulu` and `umask 022` + `TZ=Asia/Tokyo` produced the same archive and manifest hashes.

### Target layouts

Each target was cross-compiled one at a time, exact-inventory verified, inspected, and immediately removed to limit disk use:

```text
linux-arm64: 177 files; ELF aarch64
macOS x64: 177 files; Mach-O x86_64
macOS arm64: 177 files; Mach-O arm64
Windows x64: 177 files; PE32+ x86-64 console
```

This proves artifact generation/layout, not native execution on those hosts. Native macOS and Windows execution is assigned to the manual artifact workflow.

### Installer and service definitions

```bash
sh -n packages/lyntty-cli/install/install.sh
# local HTTPS-download seam replaced by a fixture curl; real tar/hash tools retained
# asserted self-check -> auth login -> self install arguments and cache cleanup
systemd-analyze verify <isolated>/lynttyd.service
bun run test:repo-hardening
bun -e 'YAML.parse(await Bun.file(".github/workflows/cli-smoke-test.yml").text())'
```

Results:

- hash-pinned bootstrap smoke: passed;
- shell syntax: passed;
- generated systemd user unit: passed (`systemd-analyze` also printed an unrelated pre-existing `libvirtd` override warning);
- repository hardening: 6/6 passed;
- workflow YAML parse: passed.

The workflow additionally runs the artifact on Linux, macOS x64, and Windows x64 with isolated state; Linux runs `systemd-analyze`, macOS runs `plutil -lint`, and Windows remains artifact/self-check only.

## Independent review

The first artifact-layout review found and drove fixes for self-check state writes, forgeable adjacent metadata, unlisted files/symlinks, daemon subprocess timeout, cross-environment reproducibility, Windows `$bunfs` detection, missing Pi examples, and packaged-tool PATH.

The installer/service/update review found and drove fixes for lock publication/PID reuse, version-only health, ephemeral service paths, unknown launcher symlinks/TOCTOU, commit-point cleanup, service definition refresh, and heartbeat loss of release identity. The final targeted re-review ended **APPROVE**, with no unresolved P0/P1.

## Residual gates

Not claimed in this round:

- the manual macOS/Windows GitHub artifact workflow has not yet run on this commit;
- no live systemd user or LaunchAgent was installed locally, by safety policy;
- signed Compatibility BOM/channel discovery is not connected yet, so `update apply` intentionally requires an explicit trusted manifest SHA-256;
- no artifacts here are notarized, Authenticode-signed, published, or promoted;
- stable component SemVer, SBOM/provenance, release publication, and protected PR remain later epic tasks.
