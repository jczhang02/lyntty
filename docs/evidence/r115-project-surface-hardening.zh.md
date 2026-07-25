# R115 — 公共项目入口与 CI 信任边界加固

日期：2026-07-26

分支：`docs/project-surface-hardening`

Bead：`lyntty-pf1`

最终实现 HEAD：`f125bd76097a2aa69d9086ae5082b60d2fb60b5f`

最终实现 tree：`ec1f901a4fdaa86ab5e10b79682fcc4ef3ed8275`

## 结果

本轮处理了 Mole/Lyntty 对比中确认的公共工程缺口，没有引入 Mole 专属的产品描述或发布方式。

- 根目录 SECURITY 与 CONTRIBUTING 现有同步的中英文版本，写明了普通 fork/branch/push/PR 流程。GitHub Private Vulnerability Reporting 关闭时，只允许通过公开表单发起不含漏洞细节的联系请求。
- Fumadocs 采用显式、任务型的 21 对中英文 source manifest。Evidence、research、内部 Agent 指南与 `CONTEXT-MAP.md` 不进入公开站点。
- README 使用经过审查的 Preview-style 模拟器截图，并明确说明它不是 Stable artifact，也不是实体设备验收。截图已进入泄漏扫描，SHA-256 固定为 `a4b9c068c988b69951f375e2eba0ddb1294d2e441209ca878d4515974a3e2725`。
- Required `Repo hygiene` 在每个 PR 上安装、审计、检查并构建独立 docs 依赖图。Pages build job 只有 `contents: read`；不 checkout 的 deploy job 才持有 `pages: write` 与 OIDC 权限。Docs 安装统一使用 `--ignore-scripts`。
- Dependabot 只覆盖 root Bun、`docs/.site` 与 GitHub Actions。CodeQL action 固定到完整 SHA；外部运行完成 triage 前不设为 required。
- 两套 Bun lockfile 的 audit 都为零。Root 通过一行 patch 保留 `minimatch@3.1.5` callable API，modern minimatch 继续使用 named API。Docs 的 Sharp override 只在已经验证的静态导出配置内成立。
- 十二个 required context 始终生成。只有显式 current guides，或 `docs/assets/` 下新增、修改的普通 raster 文件，可以跳过昂贵的 package job 步骤。

## Docs-only classifier 的信任边界

首次实现没有因为测试通过就直接验收。独立 reviewer 先后复现了三类绕过：

1. PR 可以修改 workflow 当次执行的 classifier。
2. 即使 classifier 来自 base，wrapper 对 malformed 或被覆盖的输出约束仍不够严格。
3. PR 新增的 `bunfig.toml` preload 可以先于可信 classifier 或字节 validator 执行，并在进程退出时覆盖私有 output。

最终版本在 `typecheck.yml` 的五处 scope 与 `cli-smoke-test.yml` 的两处 scope 中执行同一套规则：

- 从精确 PR base SHA 提取 `scripts/ci-changed-paths.ts`；
- classifier、空 Bun config 与 output 都放在 `.git` 下；
- classifier 和 validator 都以 `--config=<trusted-empty-config> --no-env-file --no-install` 调用；
- 只接受精确的 ASCII `run_full=<true|false>\nreason=<allowed-reason>\n`，并检查字段语义一致；
- base 身份缺失或无效、Git 错误、空 diff、删除、重命名、类型或 mode 变化、symlink、gitlink、非法 UTF-8、BOM/NUL、重复或多余字段，以及任何不在 allowlist 中的路径，全部 fail-open 到完整门禁。

真实临时 Git 回归会在同一个恶意 commit 中加入 `bunfig.toml`/preload、篡改 classifier，并新增 package code。最终结果仍为 `run_full=true`、`reason=full-path`。

## 公开安装信任

README 与双语 CLI 发布指南把 bootstrap 步骤固定到同一个 immutable Stable Compatibility Release：

`compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1`

最终 remediation 阶段进行了只读 live Release 复核：Release 仍已发布、非 Draft、非 prerelease。下载后的 bootstrap assets 与文档值一致：

| Asset | SHA-256 |
| --- | --- |
| `install.sh` | `e6db6345bc2c0c22a180ff86d93df67486dbad9e694699ba74a8f4738272e85f` |
| `stable-release-trust-roots.json` | `def81e7ccffac1915c5b792674876f0c24fb4b8df648da0f3d39e75e117b0608` |
| `compatibility-bom.json` | `df231effa7b3047fb7acdd400cff49434494012b8e17767aee72f1d7049a8bca` |
| `compatibility-bom.sig.json` | `d74fb3508fad79c0705349788da12e1ba7e417953cf46d9e8afb4260b00bf43e` |

四组 archive/manifest digest 也相符：

| 平台 | Archive | `artifact-manifest.json` |
| --- | --- | --- |
| Linux x64 | `f665417d53d259da143a42589a7efc1374e61aeff6c26367a6974719c08d658f` | `9702e4f9c5220c549763fd796da747d92ad04d36d6af794dd1b75947b7822df9` |
| Linux arm64 | `29d6e6fc56eb0d7017c709bcc2de5fb48aaa97505c8eeec32aec72dca03a0091` | `d0e5f254356870e45d8ed032e42989532e3308e03395adc5b37bbc309b3ce751` |
| Darwin x64 | `bfdaf396ed1c26ed6275811221a406a00c7fc87e1be72c913afac23968f2658d` | `a6288f3839cbc59afe8aed63efa5ed1b4b50c28ef29e685b9ca8bcb1f3c13c05` |
| Darwin arm64 | `5b48ef1cd3cd830cb99b765bfe47159f185803a9d18eaa793aa6cd12db801731` | `d29eaa68f21f6c85c0c61b90302191ba1e46f90c6018f7f8f1f8060726b78443` |

安装步骤不会把网络响应直接 pipe 给 shell，也不把独立 `latest` 文件或占位 hash 当作信任根。

## 最终验证

Raw local logs 不提交到仓库。最终 clean validation 目录为 `/tmp/lyntty-pf1-final-v3.hyMi1W`，绑定实现 HEAD `f125bd76097a2aa69d9086ae5082b60d2fb60b5f`。

```text
bun install --frozen-lockfile
bun pm untrusted
bun run ci:fast
PASS
  repository hardening: 82 pass, 0 fail
  root bun audit: No vulnerabilities found
  Wire: 36 pass, 0 fail
  CLI: 585 pass, 0 fail
  Relay: 119 pass, 0 fail
  App: 819 pass, 3295 assertions across 90 files
  development scripts: 36 pass, 0 fail

bun run ci:daemon-integration
PASS: compiled CLI/lynttyd daemon integration
```

Docs 验证从同一 HEAD 的全新 `git archive` 开始，没有复用 worktree 的 `node_modules`：

```text
cd docs/.site
bun install --frozen-lockfile --ignore-scripts
bun pm untrusted
bun audit
bun run docs:check
bun run docs:build
PASS
  禁用 lifecycle script 后安装 373 个 package
  0 untrusted dependencies with scripts
  No vulnerabilities found
  准备 42 个 manifest-owned source
  生成 44 条静态 route
  校验 42 个本地化 HTML 与 42 个 raw Markdown 页面
```

其他检查：

- Ruby Psych 成功解析 20 个 GitHub YAML 文件。
- `git diff --check` 通过，worktree clean。
- 十个实现 commit 均由 OpenPGP key `BABC6A51B0F43016329922DE1F863CBFD6EDCA6B` 验证为 `Good signature`。
- 独立需求 verifier 返回 `PASS`。
- 最终 classifier runtime review 在恶意 preload、dotenv 与 auto-install 反证后返回 `PASS`。
- 后续 Pages review 找到 build 权限过宽问题；拆分 build/deploy、加入 `--ignore-scripts` 与严格有序步骤回归后，聚焦复核返回 `PASS`。

本机没有 `actionlint`。YAML 解析与仓库内 workflow contracts 均通过，但本证据不声称运行过 `actionlint`。

## Commits

- `fde473a69dd815134463987d451cb67f75c8155a` — 公共安全与贡献入口
- `f13a414fadab81673d09564f69a6fb1aae44ae51` — 双语任务型文档站
- `adf1312554118f18977cb7c26d20d52479c11f2c` — 如实标注的视觉与 FAQ
- `28030c1569949bc6ca949f941b2b0a86d9ac623c` — required docs PR gate
- `dc990c470edd6616958d7a5f5ae5a27a3440743f` — 依赖维护基线
- `3f9f448a1bc7cf9f013fc65c3fd4a73f85046574` — docs-only 短路
- `1fd4882f5281d900b5233e648802c0627575007d` — base classifier/output 信任
- `9dfbe588785fa3a61d2ee0c0a40abc0b360bbf2a` — 公共信任缺口修正
- `97a0dfd6350adb31c6337c169d270bfe8c3c9938` — classifier runtime 隔离
- `f125bd76097a2aa69d9086ae5082b60d2fb60b5f` — Pages 部署权限隔离

## 未运行与剩余风险

- 没有 push、创建 PR、merge、workflow dispatch、Release mutation 或 GitHub settings mutation。
- 本分支尚未运行真实 PR Actions、Dependabot、CodeQL 或 Pages deploy。CodeQL 会保持 non-required，直到外部结果经过人工 triage。
- 只读检查时，GitHub Private Vulnerability Reporting 仍为关闭状态。因此 SECURITY 保留不含细节的公开联系 fallback；目前没有可公开的安全邮箱。
- 未运行 APK、Maestro、实体设备验收、live Pi-extension 安装、生产 Relay 部署、Stable E2E 或完整 Session Remote 验证。本轮没有修改产品 runtime code。
- `--ignore-scripts` 会阻止 docs 安装阶段的 lifecycle script，但固定版本的 docs packages 仍会在静态构建时执行。最小 job 权限、frozen lock、两套 audit 与 checkout-free deploy 能降低依赖失陷风险，不能把风险降为零。
- Sharp `0.35.3` 仍超出 Next `16.2.11` 声明的 `^0.34.5` 范围。本次接受仅限已经验证的 `images.unoptimized` 静态导出。
- 只按 context 名称保护分支时，GitHub 无法区分可信 workflow 与 PR 对 workflow 本身的修改。这类变更仍需人工 review，并受现有 signed、linear main ruleset 约束。
- GitHub settings manifest 将作为下一项单独记录。本证据不声称 PVR、About、topics、homepage、Wiki 或其他仓库设置已经变更。
