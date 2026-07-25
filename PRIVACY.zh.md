# Lyntty 隐私政策

最后更新：2026-07-25

[English](./PRIVACY.md)

## 范围

Lyntty 是一个开源、自托管的本地 `pi` session 控制系统。本政策描述 Lyntty 项目发布的软件。`relay` 运营者可能还需要制定自己的政策并承担相应责任。

## 架构

- 配对电脑上的 Pi JSONL 是 canonical session history。
- Lyntty App 和 `lynttyd` 通过自托管 `relay` 交换数据。
- 协议标记为加密的 session content、session metadata、machine metadata、附件和 key envelope，会由 Lyntty client 在写入 `relay` 前加密。
- `relay` 路由并保存 ciphertext，但不是 canonical Pi history store。

## relay 处理的数据

`relay` 需要部分 operational data 来认证 client、排序消息、路由流量和管理 presence。根据使用的功能，这些数据可能包括：

- account、machine、session、message 和 local idempotency identifier；
- sequence number、timestamp、presence 和 connection state；
- 加密 message、metadata、attachment 和 key-envelope payload；
- Android notification 所需的 push token 和最小 notification routing payload；
- 普通 service log，其中可能包含 request timing、error detail 和运营者基础设施配置的 network address。

不能把 `relay` 当作本地 Pi JSONL history 的备份。

## 设备上的数据

App 和配对电脑会保存运行所需的凭据、加密材料、本地设置、draft、session state 和 cache。`lynttyd` 与 Pi extension 还会在配置的 Lyntty 目录中保存本地 queue、ownership 和 recovery state。

请保护设备存储与备份。能够访问本地凭据或未锁定设备的人，可能可以控制已配对 session。

## Push notification

启用 Android push 后，push token 和最小 notification payload 会经过自托管 `relay` 和 Expo push delivery service，后者使用运营者配置的 Firebase project 完成 Android delivery。Notification text 中不得包含源码、secret 或命令输出。

## Analytics、广告和订阅

Lyntty 不包含 product analytics、广告、social tracking、voice service、paywall 或 subscription telemetry。项目不会随软件分发运营托管账号或 `relay` 服务。

## 保留与删除

`relay` 保留期限由 self-host operator 和部署数据库政策决定。通过受支持的产品流程删除 session 或 machine 时，会在 database transaction、backup 和 operator retention procedure 的约束下删除对应 active record。本地 Pi JSONL 和本地备份需要单独管理。

## 安全责任

运营者应当：

- 使用 HTTPS 并限制 `relay` host 的管理访问；
- 保护 `LYNTTY_MASTER_SECRET`、配对链接、凭据、签名密钥和备份；
- 安装兼容的签名 Release 并应用安全更新；
- 从日志和 issue report 中删除 auth material 和私有内容；
- 为自己的部署制定 backup、retention、incident-response 和 lawful-access 政策。

## 你的选择

你可以停止使用某个 `relay`、移除配对节点、删除受支持的 session record、清除 App 本地数据，或者运行自行审核的 build。删除 App 数据不会自动删除本地 Pi JSONL、`relay` backup 或 operator log。

## 政策变化与联系

重大政策变化会在仓库中发布。非敏感问题使用官方 Lyntty issue tracker。漏洞遵循 [`SECURITY.md`](./SECURITY.zh.md)中的私密流程。公开报告中不得包含凭据、完整配对 URL、认证请求头、加密密钥、签名材料、私有代码或其他 secret。
