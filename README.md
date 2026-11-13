# dsh-git-sidebar

DeepSeek Harness 的 Git 侧栏插件（`@dsh-plugin/dsh-git-sidebar`，仓库：<https://github.com/dsh-plugins/dsh-git-sidebar>）。

在左侧边栏注册一行 **Git** 入口，选中后主区域显示 Git 面板。当前为首个版本：**只注册入口与占位面板，尚未读取仓库**。

## 当前状态

| 能力 | 状态 |
| --- | --- |
| 左侧边栏 `sidebar.panellist` 导航行 | 已实现 |
| `main` 插槽面板与中英文文案 | 已实现 |
| 分支 / 工作区状态 / 最近提交 | 未实现（面板只说明将提供这些内容） |

面板文案取自 `ctx.locale`，随 DSH 语言在中文与英文之间切换。

## 安装

通过「插件管理器 → 添加插件 → 安装第三方插件」粘贴仓库地址：

```
git+https://github.com/dsh-plugins/dsh-git-sidebar.git
```

- 地址必须以 `git+` 开头；裸 `https://` 不会被识别为 Git 仓库。
- `lib/` 构建产物会提交入库，因此目标设备无需构建环境即可安装。
- 安装后按提示重启 DSH，左侧边栏出现 **Git** 行。

## 开发

```bash
pnpm install   # 或 npm install
pnpm typecheck
pnpm build
```

源码在 `src/`：`index.ts` 为宿主半（当前仅导出 `apply` 占位），`client.ts` 为浏览器半，esbuild 产物输出到 `lib/`。

`lib/` 需要与源码一并提交：其他设备直接从 Git 安装，没有构建步骤。

## 结构

```
src/index.ts         宿主半（apply 占位）
src/client.ts        浏览器半：侧栏行 + main 面板
cordis.patch.yml     bundle 补丁，插入 git-sidebar 行
locale/en.json       Plugin Manager 显示的标题与描述
locale/zh.json
docs/DETAIL.md       插件详情页的单图文档
docs/preview.svg
icon.svg             侧栏与插件行使用的图标
```

## 后续方向

- 宿主半通过 Cordis 服务读取会话工作区的仓库状态（`git status --porcelain`、`git log -n`），经 Remote 暴露给浏览器半。
- 面板分组显示：当前分支、已暂存/未暂存改动、冲突、最近提交列表。
- 配置项放入 `Config`（例如提交条数、是否显示未跟踪文件），写在 `cordis.patch.yml` 的 `config` 中，升级时保留。

## 许可

MIT
