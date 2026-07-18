# 隔离开发流程（中文同步说明）

> 同步状态（2026-07-19）：规范性命令与安全细节见英文版 [`development.md`](./development.md)。中文版待逐段翻译；当前以英文版为准。

公开入口为 `bun dev:up/check/verify/down`。每个 worktree 必须隔离端口、HOME、`LYNTTY_HOME_DIR`、PGlite、Pi 目录与进程组；`--android` 只能显式启用。macOS 需先执行一次 `brew install flock`，用于 PGlite 生命周期锁。
