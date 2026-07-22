# R106 — Launcher Icon 规范化

日期：2026-07-22

分支：`fix/remove-obsolete-icons`

Bead：`lyntty-70b`

## 结果

Stable Release Note 已改用当前 Android Launcher Icon，仓库中所有旧霓虹手机品牌图资产均已删除。

保留的规范 launcher 源文件：

- 可编辑源：`packages/lyntty-app/sources/assets/images/icon-source.svg`
- Expo launcher 输入：`packages/lyntty-app/sources/assets/images/icon.png`
- 当前 PNG SHA-256：`623c58fc79ca76c57eea042a1ec91ef51570ba05496039dfe3eda140b0b137db`

`app.config.js` 仍将 Expo 顶层 icon 指向该 PNG。Android adaptive、monochrome、notification、splash 及不同密度的 `mipmap`/`drawable` 资源均属于当前构建输入或已生成的 native 资源，因此全部保留。

## 已删除的旧资产

以下旧霓虹手机图已删除：

- `logo.png`
- `packages/lyntty-app/logo.png`
- `.github/mascot.png`
- `.github/header.png`
- `.github/logotype-dark.png`
- `.github/logotype-light.png`

前三个文件是逐字节相同的 1024×1024 PNG，SHA-256 为 `6bf41612ebe282a6813cc02fca02c92ae169c854ae285b0249d776fc0105dc17`。被删除的 header 也嵌入了同一张旧手机图；两个 GitHub logotype 则在 Lyntty 名称旁嵌入了该图的缩放版本。这六个文件均未被当前 App 配置、Gradle、Android Manifest 或生产 UI 代码引用。

新增仓库 hardening 回归：六个旧路径必须保持不存在；测试会实际加载 `app.config.js` 并检查解析后的规范 launcher icon 路径，还会从 Git index 读取所有 tracked PNG，确保旧霓虹图的 digest 不会重新出现。

历史 R11 证据仍会提及这些文件，因为它记录的是早期品牌改造时实际存在的产物。这里保留历史记录；文件本身已经删除，新 hardening 测试会阻止它们被重新加入。

## Stable Release Note 修正

GitHub Release `357552269`（`compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1`）已原位编辑，将：

```text
packages/lyntty-app/logo.png
```

替换为固定到该 Release source 的当前规范 icon：

```text
https://raw.githubusercontent.com/jczhang02/lyntty/39745de8dc9d7b7bfa6706320abbabb05c6cc3e1/packages/lyntty-app/sources/assets/images/icon.png
```

修改后确认：

- 标题仍为 `V1.2.0 Local First 📡`；
- 正文与已审阅的 Mole 风格版本逐字节一致，唯一变化是 icon URL；
- API 响应和匿名公开 Release 页面均不再包含旧 icon URL；
- tag、目标 source、Stable/Latest 状态与 immutable 状态未变化；
- 36 个资产的 ID、名称、大小和 digest 均未变化；
- 中英文实体机未验收警告仍然可见。

## 验证

```text
bun test scripts/workflow-hardening.test.mjs --test-name-pattern 'current launcher icon'
1 pass, 0 fail

bun test scripts/workflow-hardening.test.mjs
29 pass, 0 fail

CI=true bun run ci:fast
pass（仓库 hardening、audit、Wire、CLI、Relay、App、Android bundle、开发生命周期、diff check）

git diff --check
pass
```

删除前先运行 focused regression，因旧路径仍存在而按预期失败；六个旧资产全部删除后通过。

## 未执行与残余风险

- Android 源图和 native launcher 资源没有变化，因此没有发布新 APK。
- 未执行 Android 实体机验收；现有 Stable owner waiver 仍保持公开并继续有效。
- 未执行 Relay 部署或生产回滚。
