# dsh-git-sidebar

DeepSeek Harness 的 Git 面板插件（`@dsh-plugin/dsh-git-sidebar`，仓库：<https://github.com/dsh-plugins/dsh-git-sidebar>）。

在**右侧栏「开始」页**的「工作区文件」正下方新增一个 **Git 面板** 按钮；选中后在右侧栏打开一个 Git 标签页。当前为首个版本：**只提供按钮与占位面板，尚未读取仓库**。

## 当前状态

| 能力 | 状态 |
| --- | --- |
| 「开始」页 `Git 面板` 按钮（位于「工作区文件」之下） | 已实现 |
| 点击打开 `Git` 标签页 | 已实现 |
| 标签页面板与中英文案 | 已实现（占位内容） |
| 分支 / 工作区状态 / 最近提交 | 未实现 |

- 按钮不带快捷键：guide 条目没有声明 `commandId`，因此不会显示快捷键提示。
- 按钮文案随 DSH 语言切换：中文为「Git 面板 / 查看分支、工作区状态与提交」，英文为「Git panel / Inspect branches, working-tree status and commits」。
- 面板内容为占位文字，如实说明将在后续版本实现仓库读取，不展示伪造数据。

## 实现

插件使用右侧栏的两个扩展点，都在 `src/client.ts`：

1. `ctx.sidebarRightTabs.register({ id, kind, title, guide })` —— 声明一个按 kind 打开的页面类型，`guide` 中的条目即「开始」页上的按钮。`order: 12` 让它落在「工作区文件」（10）与「代码审查和变更」（15）之间，也就是第一个按钮的正下方。
2. `ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, Body)` —— 在标签页内渲染面板主体。

未加载任何 Harness Client 包作为模块，React 由 Web 外壳的模块表提供；样式只用 `--dsw-*` 主题令牌。

## 安装

通过「插件管理器 → 添加插件 → 安装第三方插件」粘贴仓库地址：

```
git+https://github.com/dsh-plugins/dsh-git-sidebar.git
```

- 地址必须以 `git+` 开头；裸 `https://` 不会被识别为 Git 仓库。
- `lib/` 构建产物已提交入库，目标设备无需构建环境。
- 安装后重启 DSH，打开右侧栏即见 **Git 面板** 按钮。

## 开发

```bash
pnpm install      # 或 npm install
pnpm typecheck
pnpm build
```

源码在 `src/`：`index.ts` 为宿主半（当前仅导出 `apply` 占位），`client.ts` 为浏览器半。esbuild 产物输出到 `lib/`，需与源码一并提交。

## 本地测试与预览

`run/` 目录全部在 `.gitignore` 中，只放自动测试与预览所需的文件，不会提交。

```bash
node run/setup.mjs        # 生成隔离的 DSH home 与 profile，用 junction 挂载本插件
cd run && node test.mjs <带 token 的 dsh web 地址>
```

- `run/setup.mjs` 在 `run/home` 下建一个独立 profile（`base` + `web-app` 两个 bundle + 本插件），把本插件以 junction 形式装进 `profiles/web/node_modules/@dsh-plugin/dsh-git-sidebar`，不触碰你日常使用的 profile。**本插件必须写进 profile 的 `dsh.profile.bundles`**，只加 patch 行会加载插件但插件管理器里没有条目，也就看不到图标与详情页。
- 测试脚本：`run/test.mjs`（按钮位置与面板）、`run/dark.mjs`（深色主题）、`run/icon.mjs`（两个图标的形状是否一致）、`run/pluginrow.mjs`（插件管理列表中的行图标）、`run/detail.mjs`（详情页插图）。截图输出到 `run/shots/`。
- 启动测试用的 Web 实例（注意要用 Desktop 内置的 0.2.2 运行时，而不是 PATH 上的 npm 版 0.1.0）：

```powershell
$env:DSH_HOME = '<repo>\run\home'
$env:ELECTRON_RUN_AS_NODE = '1'
& $env:DSH_NODE_EXECUTABLE (Join-Path $env:DSH_INSTALL_DIR 'lib\bin.js') --profile web --no-open --port 4321
```

## 后续方向

- 宿主半通过 Cordis 服务读取会话工作区的仓库状态（`git status --porcelain`、`git log -n`），经 Remote 暴露给浏览器半。
- 面板分组显示：当前分支、已暂存/未暂存改动、冲突、最近提交列表。
- 配置项放入 `Config`（提交条数、是否显示未跟踪文件），写在 `cordis.patch.yml` 的 `config` 中，升级时保留。

## 插件元数据

插件管理器与「设置 → 插件」在不激活插件的情况下读取以下内容：

| 资源 | 路径 | 说明 |
| --- | --- | --- |
| 图标 | `icon.svg`（导出 `./icon`，`package.json` 亦有 `icon` 字段） | 36×36 视图框的分支图形，`#e5522f`，无背景与文字；插件行 30px、卡片 36px 均可辨识 |
| 英文标题/描述 | `locale/en.json` | `meta.title`、`meta.description` |
| 中文标题/描述 | `locale/zh.json` | 同上 |
| 详情文档 | `docs/DETAIL.md`、`docs/DETAIL.zh.md` | 各含一行图片，由对应 `meta.detail` 声明 |
| 详情插图 | `docs/preview.svg` | 640×300，主题中性：只有描边与灰阶，浅色/深色主题通用 |

`meta.description` 说明功能、入口位置与「尚未读取仓库」这一限制；详情页只在其中展示那张插图。

## 许可

MIT
