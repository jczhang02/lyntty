# R116 — 文档页面标题去重

日期：2026-07-26

分支：`fix/docs-heading-dedup`

Bead：`lyntty-2b4`

基线：`fd05b11c80a216fa2d0fc589d870bd1fce049a48`

实现提交：`d94b1dfe357f127bd5591e9afb8b9815ea32ae91`

## 结果

生成后的 Fumadocs 页面现在只显示一个文档标题，不再同时显示 manifest title 和源 Markdown H1。源文档没有改动。42 份 raw Markdown 均保留原始 H1，`llms-full.txt` 中每个有序页面正文也只对应一个生成标题。

以下情况会让静态导出 fail-closed：

- 公开源文件没有以非空 H1 开头；
- 任一本地化 HTML 页面渲染的 H1 数量不等于一；
- raw Markdown H1 与对应源文件的精确 H1 不一致；
- `llms-full.txt` 与有序页面正文的预期字节不一致。

## 线上复现

PR #53 合并为 `46598fc39d7a5bf2c7facad17e841c2fd71cf1a2`。该 SHA 的 Pages deployment `5607784310` 成功完成，但浏览器检查线上站点时发现了真实视觉问题：

- 桌面首页显示两次 `Lyntty Docs`；
- 英文移动页面显示两次 `Getting started`；
- 中文移动页面显示两次“开始使用”。

修复前的静态构建稳定复现了机制：manifest 管理的 42 个 HTML 页面全部包含两个渲染 H1。在先加入精确回归门禁、尚未修改生成逻辑时，以下命令按预期失败：

```text
cd docs/.site
bun run docs:build

Static docs validation failed: expected one rendered H1 on index.html, found 2
```

根因位于生成边界：`prepare-fumadocs-pages.mjs` 把每个源文件的首个 H1 复制进 MDX，而两个 route component 又会根据 manifest frontmatter 渲染 `DocsTitle`。

修复前的临时浏览器截图未纳入版本控制，SHA-256 如下：

| 画面 | SHA-256 |
| --- | --- |
| 桌面首页 | `55290ccff7b2dfea297f6b5b628e754dd485b9fb2c5138318defcd7e3d6747d1` |
| 英文移动端开始使用 | `4f8c7e8279d0f994ced8d605a431fd26f557e56dd779f3c8d4a3e8dcd4e40661` |
| 中文移动端开始使用 | `9bc8a7dc939c23edcc06db236ea1b35696e040f5cacd26346ad3505a2a8fff2d` |

## 修复

- `splitLeadingMarkdownH1()` 统一管理首个 H1 边界，并明确处理 BOM、CRLF、EOF、tab、Unicode 空白和缩进正文行为。
- 站点准备阶段只在 MDX 编译前移除源 H1，并把精确文本保存为生成 metadata。
- raw Markdown 生成阶段恢复精确源 H1，不再裁掉正文缩进。
- `llms-full.txt` 使用去除源 H1 后的正文，消除了此前相邻的重复标题。
- 同一次构建会校验生成 HTML、raw Markdown 与源文件映射、完整 `llms-full.txt`、route link、anchor、base path 和 404 输出。

独立审查先后发现了 H1 跨行匹配、正文 `trimStart()`、raw title 比较和 `llms-full.txt` 顺序边界。两轮修订关闭了全部 finding；最终审查结论为 `PASS`，无 blocker。

## 本地验证

最终检查在同步至 `origin/main` 的 `fd05b11c80a216fa2d0fc589d870bd1fce049a48` 后运行。

```text
bun test scripts/docs-site-contract.test.mjs
13 pass, 0 fail

bun run test:repo-hardening
84 pass, 0 fail

cd docs/.site
bun audit --audit-level=high
bun run docs:check
bun run docs:build
No vulnerabilities found
准备 42 个源文件
生成 44 条静态 route
验证 42 个本地化 HTML 页面和 42 份 raw Markdown

cd ../..
bun audit --audit-level=high
bun run ci:fast
No vulnerabilities found
Wire: 36 pass, 0 fail
CLI: 606 pass, 0 fail
Relay: 119 pass, 0 fail
App: 863 pass，98 个文件共 3381 项 assertion
development scripts: 36 pass, 0 fail
```

其他检查：

- 42 个公开内容页面全部只渲染一个 H1；
- 42 份 raw Markdown 的 H1 全部与对应源文件精确一致；
- `llms-full.txt` 与有序预期页面正文逐字节一致；
- `git diff --check` 通过；
- 实现提交 `d94b1dfe357f127bd5591e9afb8b9815ea32ae91` 具有 key `BABC6A51B0F43016329922DE1F863CBFD6EDCA6B` 的 Good OpenPGP signature。

修复后的导出只在 loopback 提供服务，并使用隔离的 headless Chrome profile 分别以桌面 `1440x1000` 和移动端 `390x844` 渲染。截图显示单一标题，同时保留预期导航、语言链接、排版和内容流：

| 画面 | SHA-256 |
| --- | --- |
| 桌面首页 | `bdc691467835afc14098d1597405029eaea965fdcfe353f3c6a05b48df43ac1c` |
| 英文移动端开始使用 | `b7319f0750f1c4234b6f348da6e436bd26894c9c456952ee849a695daac63771` |
| 中文移动端开始使用 | `aa76bf11f765d1e99c9386e36525c4549bf9a7d940fb7b1a87355b161f6c8d6b` |

截图和原始日志仍是临时本地 artifact，不含账号、配对、relay 或 session 数据。

## 安装与重试说明

第一次运行根级 `bun install --frozen-lockfile --ignore-scripts` 时，`expo-modules-core` 的 npm tarball 出现一次临时提取失败；一次有界重试成功。随后第一次 `ci:fast` 因生命周期脚本被有意关闭、生成的 Prisma client 不存在而失败。运行仓库可信的 `bun install --frozen-lockfile` postinstall 后生成 client，最终完整 `ci:fast` 通过。这些是环境准备失败，不是产品或文档测试失败。

## 外部验证

PR [#59](https://github.com/jczhang02/lyntty/pull/59) 针对 head `080f3ab2097db89b0933deaff027be451f92757c` 运行。15 项上报检查全部通过，包括 12 个 required context、Relay image verification、CodeQL workflow 和 code-scanning check `89770648079`。

| Workflow | Run | 结果 |
| --- | --- | --- |
| Relay image verification | `30193409761` | success |
| CLI Artifact Smoke Test | `30193409772` | success |
| Lyntty CI | `30193409773` | success |
| CodeQL baseline | `30193409775` | success |

PR 于 `2026-07-26T07:56:14Z` squash-merge 为 `6e13f73029cb1385415f0b5b649dee3290ce0a4f`。GitHub 报告其签名有效且已验证；merge tree `f144e93a10c7a7b99ecfd72ff63c29a89a9ce99a` 与已审查 PR head tree 完全一致。

合并后的运行也全部通过：

| Workflow | Run | 结果 |
| --- | --- | --- |
| Lyntty CI | `30193688194` | success |
| Deploy docs | `30193688200` | success |
| CodeQL baseline | `30193688201` | success |

Pages deployment `5608408027` 把精确 main SHA `6e13f73029cb1385415f0b5b649dee3290ce0a4f` 发布到未改变的地址 <https://jczhang02.github.io/lyntty/>。完整线上读取确认：

- 42/42 条 HTML route 返回 200，只渲染一个预期 H1，并保留正确语言、canonical URL 和 `/lyntty/` base path；
- 42/42 份 raw Markdown、`llms.txt` 和 `llms-full.txt` 与已验证本地导出逐字节一致；
- 自定义未知 route 返回 404，并包含预期双语内容与 `noindex`；
- 桌面首页及英文/中文移动端浏览器截图均清楚显示单一页面标题，导航和排版保持正常。

| 线上画面 | SHA-256 |
| --- | --- |
| 桌面首页 | `2926cf957ef71c9fbe9b1d5269a27f915e6f50af3dd63a4e54b9900859c83be9` |
| 英文移动端开始使用 | `b7319f0750f1c4234b6f348da6e436bd26894c9c456952ee849a695daac63771` |
| 中文移动端开始使用 | `aa76bf11f765d1e99c9386e36525c4549bf9a7d940fb7b1a87355b161f6c8d6b` |

最终线上 verifier 遇到一次临时 GitHub Pages 连接超时后，使用每个 URL 有界重试继续执行；最终通过覆盖了以上全部 route 与 artifact。

没有修改 GitHub setting、Pages 域名、Release、tag、asset 或 required-context 配置。

## 未运行项与残余风险

- 未重新运行 APK、Maestro、实体机、live Pi extension、`lynttyd`、Relay 部署、Stable 端到端和 Session Remote 检查；本次只修改静态文档生成与校验。
- H1 数量使用有界静态 HTML scanner，而不是完整浏览器 DOM parser。它会排除 comment 以及 `script`、`style`、`template` 正文，并与当前 Next.js 导出一致；未来异常 HTML 会 fail-closed。
- 如果未来的源 H1 含站内 Markdown link，由于链接绝对化发生在生成 frontmatter 解析前，校验会 fail-closed。目前 42 个 H1 都不含链接。
- Headless Chrome 在成功加载和截图 loopback 页面时输出了宿主机 NSS root-certificate 初始化 warning；没有观察到页面自身的浏览器失败。
