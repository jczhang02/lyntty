<h1 align="center">Lyntty Preview</h1>

<p align="center">
  Local Android control for your own <code>pi</code> sessions.
</p>

## Changelog

1. **Local Relay first** — Lyntty Preview now requires an explicit local Relay before account creation or sync can begin.
2. **Safer connection setup** — Relay validation uses the canonical `/health` contract, and cleartext HTTP is limited to localhost and private LAN addresses.
3. **Upgrade-safe Preview identity** — the dedicated Preview package keeps existing valid local Relay settings while remaining isolated from Stable Lyntty.
4. **Audited Android artifact** — version `{{VERSION_NAME}}` (`{{VERSION_CODE}}`) includes `arm64-v8a` and `x86_64`, with SHA-256, APK audit, runtime audit, and provenance assets.

## 更新日志

1. **本地 Relay 优先** — Lyntty Preview 现在必须先明确配置本地 Relay，之后才能创建账号或启动同步。
2. **更安全的连接设置** — 使用规范 `/health` 契约验证 Relay；HTTP 明文连接仅允许 localhost 和私有局域网地址。
3. **安全升级 Preview** — 独立 Preview 包会保留已有的有效本地 Relay 设置，并继续与 Stable Lyntty 完全隔离。
4. **经过审计的 Android 产物** — `{{VERSION_NAME}}`（`{{VERSION_CODE}}`）同时支持 `arm64-v8a` 和 `x86_64`，并附带 SHA-256、APK audit、runtime audit 与 provenance。

## Install / 安装

1. Download `{{APK_NAME}}` and `{{APK_NAME_NO_EXT}}.audit.txt`; let Android install or update the APK and keep both files in Downloads so `bun preview:test` can verify the reviewed artifact.
2. On the computer that will run `pi`, check out this release and prepare the workspace:

   ```bash
   git clone --branch {{TAG}} https://github.com/jczhang02/lyntty.git
   cd lyntty
   bun install --frozen-lockfile
   bun preview:test
   ```

3. In Lyntty Preview, enter the local Relay URL printed by `bun preview:test`, then create the local test account and pair the node.
4. When testing is complete:

   ```bash
   bun preview:stop
   # Use only when you intentionally want to delete the local test account, pairing, and Relay data:
   bun preview:reset
   ```

> Lyntty Preview is a developer test build. This release does not provide a hosted Preview Relay and does not replace the Stable app.
>
> Lyntty Preview 是开发测试版本。本 Release 不提供托管 Preview Relay，也不会替换 Stable App。

## Integrity / 完整性

- APK SHA-256: `{{SHA256}}`
- Source commit: `{{SOURCE_COMMIT}}`
- Package: `dev.jczhang.lyntty.preview`

---

Thanks for testing Lyntty. Issues and feedback: [github.com/jczhang02/lyntty](https://github.com/jczhang02/lyntty)
