# R83 隔离开发流程（中文同步说明）

> 同步状态（2026-07-19）：完整双 worktree、进程所有权与恢复证据见英文版 [`r83-isolated-development-workflow.md`](./r83-isolated-development-workflow.md)，当前以英文版为准。

R83 证明 `dev:up/check/verify/down` 的端口、状态、凭据、PGlite、生命周期锁与整个进程组均按 worktree 隔离。
