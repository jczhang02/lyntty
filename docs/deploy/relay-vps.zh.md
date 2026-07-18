# Relay VPS 部署（中文同步说明）

> 同步状态（2026-07-19）：本轮 Bun-only 部署契约已完整更新于英文版 [`relay-vps.md`](./relay-vps.md)。中文版待逐段翻译；在此期间以英文版的迁移、备份、`doctor`、fail-stop 与回滚要求为准。

核心约束：生产部署只能解析已签名 Stable BOM 中的不可变 Relay digest，并在受保护环境内执行；本地验证不得冒充生产部署证据。
