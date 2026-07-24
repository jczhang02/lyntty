# Lyntty 交付标准化（中文同步说明）

> 同步状态（2026-07-23）：Bun-only 迁移已完成。当前 delivery architecture、runtime invariants、external acceptance 和验证命令完整维护于英文版 [`PLAN.md`](./PLAN.md)，以英文版为准。

当前目标保持 Android-first、Pi-only、自托管且用户交付 runtime-free。四个 active workspace 使用 Bun；发布由组件 SemVer、Wire capability 与签名 Compatibility BOM 约束，并通过 protected PR 合入。
