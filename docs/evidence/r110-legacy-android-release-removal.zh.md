# R110 — 旧 Android Release 删除

日期：2026-07-23

状态：三个经所有者授权的旧 GitHub Release 及其 assets 已删除；对应 Git tag 和全部当前发布通道均已保留并通过独立验证

## 授权与范围

所有者明确指示：`这三个 release 直接删除.` 其中“三个”指紧接着列出的三个旧 Android Release：

- `android-v1.7.1-3`；
- `android-v1.0.0-4`；
- `android-v1.0.0-5`。

删除范围包括三个 GitHub Release 对象及其六个附属 assets。命令刻意没有使用 `--cleanup-tag`，因此三个 direct Git tag 全部保留。Stable Compatibility、独立 APK Preview、Expo Dev、它们的 assets 和 tags、GitHub Latest、workflows 与 reactions 均不在删除范围内。

## 删除前身份

| Tag | Release ID | Node ID | Direct tag SHA | Body SHA-256 | Asset inventory SHA-256 |
| --- | ---: | --- | --- | --- | --- |
| `android-v1.7.1-3` | `349921576` | `RE_kwDOTBWyxc4U22Eo` | `9752c689c92744466abb15828c06f10c2653669b` | `aead5a222cb8411d8371744c1bbc51fc70790f32976d13b46e0c3e2660d81181` | `066d54bff9d0bf987af77b2d178d33694370e8254ddf4bfe15bf71cb3c244520` |
| `android-v1.0.0-4` | `350330783` | `RE_kwDOTBWyxc4U4Z-f` | `8868767032a8abf31af564074e99ff66f20d796e` | `90cdf0b9cb8917b9f9b9156b8d65c45a351f0790ad345abfca5b933a13eba4c1` | `a80112f63bf908003dde1b9f93570cae2b26e74e2a5253e910ad7813ce30d91b` |
| `android-v1.0.0-5` | `351558216` | `RE_kwDOTBWyxc4U9FpI` | `e243429200bd83288f1dac1454a2db43a4024003` | `9ca400a58309b9d394ca8fe1febf56f9e1af7b3b9d2b1cc62bcb0a99c9098476` | `e88ce7cfae5c84bdfff0cd614a85cbfed62e97d0703f05b79b5b66660f92fa99` |

三个 Release 均为非 draft、非 prerelease、非 immutable，并各有两个 assets：

| Tag | Manifest asset ID | APK asset ID | APK 大小 | APK API SHA-256 digest |
| --- | ---: | ---: | ---: | --- |
| `android-v1.7.1-3` | `468535644` | `468535645` | `125200576` | `9bd412dcc452d5cf046ee35a50a8ddd70ff9a6f207b2e2d6a967acd27af15b43` |
| `android-v1.0.0-4` | `469205228` | `469205229` | `132427524` | `8425801a699c53a8285528d532d841f37fa6ccf3afbd4b40f5e443cddaaea4fc` |
| `android-v1.0.0-5` | `471384267` | `471384268` | `132087156` | `1100eb0df3d88ca9dc446b9575768bd16937194f030315732ecbfc0ed07b94d7` |

删除前已经保存每份正文和 asset 元组的完整 API 快照。公开旧 Relay 路径 `https://relay.jczhang.cc/v1/version` 在删除前已经返回 HTTP 404，没有提供仍指向这些 assets 的在线更新 manifest。

## 删除命令

以下命令均未带 `--cleanup-tag`：

```bash
gh release delete "android-v1.7.1-3" --repo "jczhang02/lyntty" --yes
gh release delete "android-v1.0.0-4" --repo "jczhang02/lyntty" --yes
gh release delete "android-v1.0.0-5" --repo "jczhang02/lyntty" --yes
```

没有运行 tag-delete、asset-delete、Release-create/edit、workflow-dispatch 或 reaction 命令。

## 删除后验证

重新执行经过认证的 GitHub API 检查，证明：

- 按精确 tag 查询三个 Release 均返回 HTTP 404；
- 按原 numeric ID 查询三个 Release 均返回 HTTP 404；
- 六个原 asset-ID endpoint 均返回 HTTP 404；
- 三个解析后的 direct-tag 对象与删除前快照结构完全相同，仍指向身份表中的 SHA；
- 仓库 Release 列表现在仅包含下列三个当前发布通道。

| 保留的 Release | Release ID | Target/direct tag SHA | Draft | Prerelease | Immutable | Assets |
| --- | ---: | --- | --- | --- | --- | ---: |
| Stable Compatibility `compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1` | `357552269` | `39745de8dc9d7b7bfa6706320abbabb05c6cc3e1` | false | false | true | 36 |
| 独立 APK Preview `android-preview-v1.2.0-920001` | `357064582` | `60f0d620f97f91ea20ac7a97d85bcc9685e46e83` | false | true | true | 5 |
| Expo Dev `android-expo-dev-v1.2.0-930001` | `358594428` | `04b63ea7a35f98c3012cc2ca6b00b7dae9e76968` | false | true | true | 7 |

三个保留 Release 的 title/body、Release 身份、target、发布 flags、direct tag ref 以及每个 asset 的 ID/名称/大小/digest 元组均与删除前快照相同，48 个 assets 没有变化。GitHub Latest 仍是 Release `357552269`、tag `compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1`。

另一个 verifier 重新使用只读 `gh api` 查询所有已删除 Release、原 assets、保留 tags、当前 Releases 与 Latest，并独立返回 `PASS`。

仓库证据检查通过：

```text
bun run test:repo-hardening
41 pass, 0 fail

git diff --check
git diff --cached --check
PASS
```

## 未执行与剩余影响

- 删除前没有下载或重新托管三个旧 APK。它们的 GitHub Release 下载 URL 现在按要求不可用；保留源码 tag 不会保留附属 Release assets。
- R65、R66 等历史证据仍准确记录当时的发布事实，但其中旧 Release 下载 URL 现在返回 404。
- 如果某个旧版已安装 APK 或私有 manifest 直接固定了这些已删除 URL，它将无法继续下载对应 APK。当前 Compatibility Stable、APK Preview 与 Expo Dev 分发路径未改变。
- 保留的 Git tags 只能在另一次明确授权下删除；本次操作不包含该权限。
