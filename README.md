# dsh-git-sidebar

DeepSeek Harness 的 Git 面板插件（`@dsh-plugin/dsh-git-sidebar`，仓库：<https://github.com/dsh-plugins/dsh-git-sidebar>）。

在**右侧栏「开始」页**的「工作区文件」正下方新增一个 **Git 面板** 按钮；选中后在右侧栏打开 Git 面板，直接管理会话工作目录所在仓库。

## 能力

| 能力 | 状态 |
| --- | --- |
| 「开始」页 `Git 面板` 按钮（位于「工作区文件」之下，无快捷键） | 已实现 |
| 当前分支 / detached HEAD 短 SHA / 仓库路径 | 已实现 |
| 暂存更改 / 更改两组，逐文件状态字母 `A M D R U` | 已实现 |
| 单文件暂存 / 取消暂存 / 放弃 / 查看差异 | 已实现 |
| 分组级全部暂存 / 全部取消暂存 / 放弃全部 | 已实现 |
| 提交（Ctrl+Enter），提交后清空并刷新 | 已实现 |
| 未配置 `user.name`/`user.email` 时的提示 | 已实现 |
| 放弃改动的确认对话框（未跟踪文件单独警告） | 已实现 |
| 统一 diff 标签页，行级增删高亮 + 行号 | 已实现 |
| 冲突文件识别与单独分组 | 已实现（只标记，暂不提供解决） |
| 中英文案、明暗主题 | 已实现 |
| 提交历史、分支管理、储藏、同步操作 | 未实现（见 `FEATURES.md`） |

## 使用

安装并启用后刷新页面，右侧栏「开始」页即出现 **Git 面板**。点开后面板读取该会话工作目录的仓库：

- 顶部显示分支名与仓库路径，右侧是刷新按钮；不自动刷新，切换文件后点刷新。
- 改动按「暂存更改」「更改」分组；把鼠标移到文件行上会显示操作按钮，键盘聚焦或触屏上常驻显示。
- 点文件行本身在右侧栏打开该文件的 diff，可与其他标签页并存。
- 提交框可用 `Ctrl+Enter`（macOS 上 `Cmd+Enter`）提交；暂存区为空或信息为空时提交按钮不可用，提示会说明原因。
- 放弃改动会弹确认框；未跟踪文件的删除是**不可恢复**的，确认框单独警告。

## 实现

面板由两半组成，通过一个 Typert Remote 命名空间 `gitSidebar` 通信：

- **宿主半**（`src/host/`）用 `ctx.subprocess` 执行 git，走 `ctx.sandboxPolicy` 的沙箱策略，cwd 取自 `ctx.workingDirectory.get(session)`。命令一律以 argv 数组传参、路径放在 `--` 之后，绝不拼 shell；每条命令有 deadline 与输出上限，失败原样呈现 git 的诊断。
- **浏览器半**（`src/client/`）注册右侧栏的 tab 类型与面板主体，样式只用 `--dsw-*` 主题令牌，图标是内联 Material Symbols path。

Remote 的方法表是手写的（`src/remote-descriptor.ts`），因为静态客户端包拿不到生成的 typert 产物。`run/contract.mjs` 校验该表、宿主服务方法与 wire 类型三者一致，防止改名漂移。

配色参照 Monokai Pro 的语义分配，但落地在主题令牌上：当前分支/ref 用品牌色，新增用 success 令牌，删除与冲突用 error 令牌，次要文本用 label-secondary。

## 安装

通过「插件管理器 → 添加插件 → 安装第三方插件」粘贴仓库地址：

```
git+https://github.com/dsh-plugins/dsh-git-sidebar.git
```

- 地址必须以 `git+` 开头；裸 `https://` 不会被识别为 Git 仓库。
- `lib/` 构建产物已提交入库，目标设备无需构建环境。
- 安装后重启 DSH，右侧栏「开始」页即见 **Git 面板**。

## 开发

```bash
pnpm install
pnpm typecheck
pnpm build
```

源码在 `src/`：`index.ts` 是宿主插件入口，`host/` 是 git 读取与写入，`client.ts` 是浏览器入口，`client/` 是面板与 diff 视图。esbuild 产物输出到 `lib/`，需与源码一并提交。

## 本地测试与预览

`run/` 目录全部在 `.gitignore` 中，只放自动测试与预览所需的文件，不会提交。

```bash
node run/setup.mjs        # 生成隔离的 DSH home 与 profile，用 junction 挂载本插件
node run/reset-home.mjs   # 造测试仓库 run/work/repo，并把默认工作区指向它
cd run && node test.mjs <带 token 的 dsh web 地址>
```

- `run/setup.mjs` 在 `run/home` 下建独立 profile（`base` + `web-app` + 本插件），不触碰日常使用的 profile。**本插件必须写进 profile 的 `dsh.profile.bundles`**，只加 patch 行会加载插件但插件管理器里没有条目。
- `run/reset-home.mjs` 用 `run/fixture.mjs` 造一个全新 git 仓库并把默认 Workspace 指过去，否则面板只会显示「不是 Git 仓库」。
- 启动测试实例要用 Desktop 内置的 0.2.2 运行时（PATH 上的 npm 版是 0.1.0，缺这些插槽），且需要 `DSH_PERMISSION_MODE=danger-full-access`，否则沙箱会拒绝在测试仓库里写入：

```powershell
$env:DSH_HOME = '<repo>\run\home'
$env:ELECTRON_RUN_AS_NODE = '1'
$env:DSH_PERMISSION_MODE = 'danger-full-access'
& $env:DSH_NODE_EXECUTABLE (Join-Path $env:DSH_INSTALL_DIR 'lib\bin.js') --profile web --no-open --port 4400
```

测试脚本：`test.mjs`（按钮位置）、`git-test.mjs`（P0 主流程）、`diff-test.mjs`（差异视图）、`dark.mjs`（深色）、`contract.mjs`（契约漂移）、`parity.mjs`（两个图标是否一致）、`pluginrow.mjs`（插件管理行图标）、`detail.mjs`（详情页插图）。截图输出到 `run/shots/`。

## 插件元数据

| 资源 | 路径 | 说明 |
| --- | --- | --- |
| 图标 | `icon.svg`（导出 `./icon`，`package.json` 亦有 `icon` 字段） | 36×36 视图框的分支图形，`#e5522f`；与面板内的 guide 图标几何一致，由 `run/parity.mjs` 守护 |
| 英文标题/描述 | `locale/en.json` | `meta.title`、`meta.description`、`meta.detail` |
| 中文标题/描述 | `locale/zh.json` | 同上 |
| 详情插图 | `docs/preview.svg` | 640×300，主题中性 |

## 许可

MIT
