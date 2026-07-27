# 安全政策

[English](./SECURITY.md)

## 支持范围

安全修复面向 GitHub Latest 指向的当前 Stable Compatibility Release。Preview 和 Expo Dev 不受支持，也不是安全修复发布渠道。旧版本、Actions artifacts、源码快照和本地修改版本不提供安全支持。

Lyntty 由维护者个人运营，并由用户自行托管。`relay` 运营者需要负责主机安全、TLS、访问控制、备份、保留策略和自己部署环境的事件响应。

## 报告漏洞

GitHub Private Vulnerability Reporting 是预定的私密渠道。如果 GitHub 在[这个 advisory 地址](https://github.com/jczhang02/lyntty/security/advisories/new)显示报告表单，请通过该表单提交。

如果私密表单不可用，请创建一个[不含详情的安全联系请求](https://github.com/jczhang02/lyntty/issues/new?template=security-contact.yml)。该请求是公开的，只能包含表单要求的确认。维护者会先安排私密联系渠道，再接收技术信息。

一份有用的私密报告应包括：

- 受影响的 App、CLI/`lynttyd`、`relay`、Pi extension、Wire、workflow 或发布 artifact；
- 精确版本、Release tag、源码 commit、镜像 digest 或 asset 名称；
- 预期影响和触发条件；
- 最小复现步骤；
- 必要时提供已经脱敏的日志或截图。

附加证据前，请删除凭据、完整配对 URL、认证请求头、加密密钥、签名密钥、私有代码、请求正文和私有命令输出。不得测试不属于你或未经授权的系统、账号和节点。

## 响应预期

维护者会尽力处理报告，但不承诺响应 SLA、漏洞奖励或固定的修复发布时间。确认的问题会以当前 Stable 为基准进行分诊。需要协调披露时间时会保持私密，并在修复或缓解措施可用且适合公开后记录结果。

## 公开 bug 报告

非敏感缺陷请使用普通 [bug form](https://github.com/jczhang02/lyntty/issues/new?template=bug.yml)。请完成其中的脱敏检查。漏洞详情只能留在按照上述流程建立的私密沟通中。
