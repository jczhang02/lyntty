# Lyntty 文档

Lyntty 是一个 Android-first、自托管的本地 [`pi`](https://github.com/earendil-works/pi) session 控制面。App 控制你自己电脑上的 session；Pi JSONL、tool、凭据和 workspace 留在配对节点。

[English](./README.md)

## 从这里开始

- [开始使用](./getting-started.zh.md)：安装同一组兼容 Stable、部署 `relay`、配对节点并验证 `Session Remote`。
- [常见问题](./faq.zh.md)：查阅产品范围、信任边界、构建通道、平台支持和更新行为。
- [故障排查](./troubleshooting.zh.md)：处理连接、daemon、Pi extension、history、APK、Metro 和版本问题。
- [安全政策](../SECURITY.zh.md)：漏洞使用私密流程，公开报告必须脱敏。
- [隐私政策](../PRIVACY.zh.md)：了解哪些数据留在节点，以及自托管 `relay` 会处理什么。

## 当前产品与运行文档

按任务阅读当前来源：

- 产品边界：[Product context](./contexts/product/CONTEXT.zh.md)和[产品 PRD](./prds/lyntty-product.zh.md)
- Runtime topology：[Pi shared-control 架构](./architecture/pi-shared-control.zh.md)
- 本地开发：[开发指南](./development.zh.md)
- 自托管：[`relay` VPS 部署](./deploy/relay-vps.zh.md)
- Android 分发：[Android APK Release 与 update](./release/android-apk.zh.md)
- 节点 artifact：[CLI 与 daemon Release](./release/cli.zh.md)
- 兼容与 rollback：[签名 Compatibility BOM](./release/compatibility-bom.zh.md)
- Required checks：[CI matrix](./quality/ci.zh.md)

普通控制路径是：

```text
phone -> relay -> lynttyd -> local Pi extension -> pi
```

`lyntty remote` 是单独的 operator control-plane client，可以直接连接 `relay`，但不是手机发送路径中的 node-side bridge。

## 项目与贡献

- [参与贡献](../CONTRIBUTING.zh.md)
- [Issue tracker 约定](./agents/issue-tracker.zh.md)
- [Triage labels](./agents/triage-labels.zh.md)
- [Domain document 约定](./agents/domain.zh.md)

## 历史迁移记录

- `roadmap.md`、`roadmap.zh.md` 和 `roadmap.lyntty.md` 是已经完成的 migration plan。
- `research/` 保存带日期的背景材料和上游调查。
- `recovered/` 保存迁入的历史决策。
- `evidence/` 证明特定时间点的观测和操作，不是当前产品政策。

不能只因为年代久远或缺少导航就删除记录。历史内容冲突时，以当前 context、accepted architecture、runbook、代码和测试为准。

## 文档基础设施

`.site/` 是 Fumadocs presentation layer。Source-of-truth 文档留在 generated site directory 之外。编辑文档时遵守 [`AGENTS.md`](./AGENTS.md)。
