# Compatibility BOM（中文同步说明）

> 同步状态（2026-07-19）：canonical bytes、签名、sequence、兼容窗口和 channel 隔离见英文版 [`compatibility-bom.md`](./compatibility-bom.md)，当前以英文版为准。

BOM、签名与 predecessor digest 都绑定带末尾 LF 的精确 canonical 文件字节；Stable/Preview 的 key、URL、package、image 与 replay state 必须隔离。
