# dsh-git-sidebar

DeepSeek Harness 的 Git 面板插件（`@dsh-plugin/dsh-git-sidebar`，仓库：<https://github.com/dsh-plugins/dsh-git-sidebar>）。

在**右侧栏「开始」页**的「工作区文件」正下方新增一个 **Git 面板** 按钮；选中后在右侧栏打开 Git 面板，直接管理会话工作目录所在仓库。

## 能力

| 能力 | 状态 |
| --- | --- |
| 「开始」页 `Git 面板` 按钮（位于「工作区文件」之下，无快捷键） | 已实现 |
| 当前分支 / detached HEAD 短 SHA / 仓库路径 | 已实现 |
| 子目录多仓库：顶部仓库下拉切换，识别 submodule / linked worktree | 已实现 |
| 扫描深度可配（默认 2，工作目录为 0），正则黑名单含 `build` / `node_modules` / `.gradle` 等内置规则 | 已实现 |
| 给 agent 的两个工具：`git_repositories` 列出扫描到的仓库、`git_open_repository` 打开指定仓库的面板 | 已实现 |
| 上游 `↑n ↓m`，分支同步时隐藏 | 已实现 |
| 暂存更改 / 更改两组，逐文件状态字母 `A M D R U` | 已实现 |
| 单文件暂存 / 取消暂存 / 放弃 / 查看差异 | 已实现 |
| 分组级全部暂存 / 全部取消暂存 / 放弃全部 | 已实现 |
| 提交（Ctrl+Enter）、暂存全部并提交、改写上次提交 | 已实现 |
| 未配置 `user.name`/`user.email` 时的提示 | 已实现 |
| 放弃改动的确认对话框（未跟踪文件单独警告） | 已实现 |
| 统一 diff 标签页，行级增删高亮 + 行号 | 已实现 |
| 装了 `dsh-monaco` 时改用 Monaco 差异编辑器：比较两侧完整文件、语法高亮、并排/内联按宽度自适应 | 已实现 |
| 差异里的块操作：按「变更块」逐块「暂存 / 回滚 / 取消暂存」，每块画一条高度线、按钮居中（并排时在中缝，内联时在最左侧） | 已实现 |
| 提交差异逐文件预览：页头文件选择器，带状态字母与该文件增删行数 | 已实现 |
| 提交历史**泳道图**（分叉/合并在图上连通，8 色泳道，refs 按类型上色） | 已实现 |
| 分页、点开单提交 diff、折叠、方向键移动焦点 | 已实现 |
| 分支选择器：列出 / 切换 / 新建；脏工作区拒绝切换 | 已实现 |
| 储藏：储藏当前改动、应用、弹出、删除 | 已实现 |
| 同步：fetch / pull（仅快进）/ push，push 与 pull 先确认 | 已实现 |
| 冲突逐区解决（保留当前 / 传入 / 两者），标记已解决即暂存 | 已实现 |
| 中止进行中的合并 / 变基 / 拣选 / 还原 | 已实现 |
| 中英文案、明暗主题 | 已实现 |

## 使用

安装并启用后刷新页面，右侧栏「开始」页即出现 **Git 面板**。点开后面板读取该会话工作目录的仓库：

- 提交历史以**泳道图**呈现：分叉、合并、根提交都在图上连通，左侧每条泳道一色（8 色，明暗主题各自可辨）。refs 按类型上色（当前分支 / 本地分支 / 远程跟踪 / tag）。点一行打开该提交自己的 diff；滚动到底自动加载下一页；方向键上下移动焦点。
- 顶部分支名可点击，展开分支选择器：列出本地分支、切换、新建、删除（未合并会二次确认）；`⋯` 菜单提供 fetch / pull / push、储藏当前改动、以及合并某个分支到当前分支。`pull` 只做快进，`push` 与 `pull` 都会先确认。
- 分支名右侧是**仓库下拉**：点开会扫描会话工作目录的子目录（默认两层），列出其中的 checkout。`.git` 是文件的 checkout 会标成 `submodule` 或 `worktree`；选中后整个面板（更改、历史、分支、储藏、diff）都切到那个仓库。选过之后菜单底部出现「回到工作目录」。
- 扫描默认跳过 `node_modules`、`build`、`dist`、`.gradle`、`.venv` 等目录；可用配置追加或关闭这些规则。
- 面板也能被 agent 打开：`git_repositories` 返回当前扫描到的仓库（root、相对路径、`submodule` / `worktree` 类型、哪个是当前），`git_open_repository` 接受绝对路径、相对路径或 `.`，选中后**自动把面板打开给用户看**。会话里这两次调用各自有一行工具卡片，卡片上的「打开 Git 面板」可以随时把面板叫回来。
- 改动按「暂存更改」「更改」分组；把鼠标移到文件行上会显示操作按钮，键盘聚焦或触屏上常驻显示。
- 点文件行本身在右侧栏打开该文件的 diff，可与其他标签页并存；点历史里的提交打开该提交自己的 diff。
- 装了 `dsh-monaco` 后，差异标签页改用 Monaco 差异编辑器：比的是两侧**完整文件**，带语法高亮与联动滚动。宽度够（≥ 640px）时并排显示，不够时内联显示，拖动右侧栏宽度会即时切换。
- 差异里的块按钮按**变更块**给出，而不是按 Git 的 hunk：Git 会把相邻改动（中间隔三条上下文以内）并成一个 hunk，编辑器再把它拆回连续的改动块，每块一对按钮，作用范围就是那一块——点第二块不会连带第一块。工作区侧是「回滚此块」和「暂存此块」，暂存区侧只有「取消暂存此块」，提交是历史、没有块按钮。
- 每块在行号左侧的装订线里画一条**高度线**表示它覆盖几行，按钮竖排在这条线的中点：并排时这条装订线正是两个编辑窗的中缝，内联时它在最左侧；滚动、缩放后仍对准各自的块。鼠标悬停约半秒显示说明。退回补丁块视图时（未装 dsh-monaco 等），按钮改为按 hunk 给出。
- 提交差异同样用编辑器，但一个提交跨多个文件，所以页头多一个文件选择器：逐文件查看，选项前缀是状态字母，页头右侧是该文件的 `+n -m`。合并提交没有唯一的旧侧，逐文件比较的是**第一父提交**，页头会写明这一点；补丁块视图对合并提交仍按 `git show` 的组合差异显示。
- 没装 `dsh-monaco`、编辑器加载失败、某一侧超过 `maxSideBytes`、或者是二进制文件时，差异自动退回补丁块视图，并在顶部说明原因。
- 提交框可用 `Ctrl+Enter`（macOS 上 `Cmd+Enter`）提交。暂存区为空时按钮变成「暂存全部并提交」；勾选「改写上次提交」可修改上一条提交信息（工作区干净时也能用）。
- 储藏分组可储藏当前改动，逐条应用、弹出或删除。
- 冲突文件点开进入逐区解决视图：每个冲突块显示双方内容与分支标签，可选保留当前 / 传入 / 两者（默认两者，因为不会丢行）。标记已解决会写回文件并暂存。
- 处于合并、变基、拣选或还原中途时，分支头下方显示提示条与「中止」按钮；中止会先确认，因为它丢弃这次操作里的全部解决结果。
- 放弃改动会弹确认框；未跟踪文件的删除是**不可恢复**的，确认框单独警告。

## 实现

面板由两半组成，通过一个 Typert Remote 命名空间 `gitSidebar` 通信：

- **宿主半**（`src/host/`）用 `ctx.subprocess` 执行 git，走 `ctx.sandboxPolicy` 的沙箱策略，cwd 取自 `ctx.workingDirectory.get(session)`。命令一律以 argv 数组传参、路径放在 `--` 之后，绝不拼 shell；每条命令有 deadline 与输出上限，失败原样呈现 git 的诊断。
- **浏览器半**（`src/client/`）注册右侧栏的 tab 类型与面板主体，样式只用 `--dsw-*` 主题令牌，图标是内联 Material Symbols path。

Remote 的方法表是手写的（`src/remote-descriptor.ts`），因为静态客户端包拿不到生成的 typert 产物。`run/contract.mjs` 校验该表、宿主服务方法与 wire 类型三者一致，防止改名漂移。

差异有两种渲染。`src/client/diff-tab.ts` 画补丁块（`diff` / `commitDetail` 端点），不依赖任何编辑器；`src/client/diff-monaco.ts` 在 dsh-monaco 存在时用它的客户端服务 `ctx.monacoEditor`（`ready` + Monaco 命名空间）建一个只读差异编辑器。该插件声明为 **optional peerDependency**，不写进 `inject`：服务用 `ctx.get('monacoEditor')` 惰性读取，所以不装它面板照常工作，也不会因为两个客户端的加载顺序把面板挂起（dsh-monaco 的启动批次排在后面）。两侧完整文本由 `fileSides` / `commitFiles` / `commitSides` 提供——工作区侧读 `ctx.fs`，对象侧读 `git show`；块级写入由 `stageHunk` / `unstageHunk` / `discardHunk` 完成：请求带 `region` 时，`src/host/patch.ts` 的 `regionPatch` 把该块重建为**零上下文**补丁（`@@ -a,b +c,d @@`，单侧为 0 时起点前移一行），交给 `git apply --unidiff-zero` 单独回放；不带 `region` 时退回整 hunk 的老路径。

配色参照 Monokai Pro 的语义分配，但落地在主题令牌上：当前分支/ref 用品牌色，新增用 success 令牌，删除与冲突用 error 令牌，次要文本用 label-secondary。

### 配置

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `gitCommand` | `git` | git 可执行文件 |
| `timeoutMs` / `syncTimeoutMs` / `graceMs` | 15000 / 60000 / 2000 | 单条命令的截止时间与退出宽限 |
| `maxOutputBytes` / `maxDiffBytes` | 4 MiB / 1 MiB | 单条命令输出上限、diff 渲染上限 |
| `maxSideBytes` | 2 MiB | 差异编辑器比较的单个文件文本上限；超过时退回补丁视图，不截断 |
| `draftProvider` / `draftModel` / `draftPrompt` | 空 / 空 / 内置 | 生成提交信息用的路由与提示词 |
| `draftMaxInputBytes` / `draftMaxOutputTokens` / `draftTimeoutMs` | 24576 / 512 / 45000 | 生成提交信息的限制 |
| `scanDepth` | `2` | 向下扫描几层找仓库，会话工作目录为深度 0 |
| `scanExclude` | `[]` | 追加的黑名单正则，匹配目录当前层级的名称（大小写不敏感） |
| `scanDefaultExclude` | `true` | 是否启用内置黑名单（`node_modules`、`build`、`.gradle` 等） |
| `scanMaxDirectories` | `5000` | 单次扫描最多访问的目录数，超出时下拉里会标注结果不完整 |

## 安装

在 DSH `0.2.3-alpha.2` 安装并启用 loader 后，从 npm 安装 Git 面板开发版：

```sh
dsh plugin --profile web add @dsh-plugin/dsh-loader@next
dsh plugin --profile web add @dsh-plugin/dsh-git-sidebar@next
```
- 安装后重启 DSH，右侧栏「开始」页即见 **Git 面板**。
- 同时安装 `dsh-monaco`（`git+https://github.com/dsh-plugins/dsh-monaco.git`）后，差异视图自动升级为编辑器；不装也能用，只是退回补丁块渲染。

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

测试脚本：`test.mjs`（按钮位置）、`git-test.mjs`（P0 主流程）、`diff-test.mjs`（差异视图）、`p1-test.mjs`（分支/储藏）、`graph-model.test.mjs`（泳道布局纯函数，不需要浏览器）、`repo-scan.test.mjs`（子目录扫描、深度、黑名单、submodule/worktree 判定，不需要浏览器）、`repo-test.mjs`（浏览器：仓库下拉扫描、切换、回到工作目录）、`history-test.mjs`（历史泳道图）、`history-dark.mjs`（深色泳道配色）、`hunk-test.mjs`（hunk 级暂存）、`branch-test.mjs`（分支删除与合并）、`sync-test.mjs`（对本地裸仓库的 fetch/pull/push）、`conflict-test.mjs`（冲突逐区解决与中止）、`amend-test.mjs`（暂存全部并提交、改写上次提交）、`dark.mjs`（深色）、`contract.mjs`（契约漂移）、`locale-parity.mjs`（中英键一致）、`parity.mjs`（两个图标是否一致）、`pluginrow.mjs`（插件管理行图标）、`detail.mjs`（详情页插图）。截图输出到 `run/shots/`。

`repo-test.mjs` 会在 `run/` 下造 `demo-app`、`demo-lib` 与 linked worktree `demo-wt` 作为扫描对象；`run/` 已 gitignore，删掉即可重建。`tools-smoke.mjs` 覆盖两个 agent 工具的定义、仓库名解析（绝对路径 / 相对路径 / `.`）、未知仓库的报错与选择调用。

## 插件元数据

| 资源 | 路径 | 说明 |
| --- | --- | --- |
| 图标 | `icon.svg`（导出 `./icon`，`package.json` 亦有 `icon` 字段） | 36×36 视图框的分支图形，官方插件蓝青渐变（主线 `#69B9FF`→`#324DE2`，侧枝 `#51CFDB`→`#108792`）；与面板内的 guide 图标几何一致，由 `run/parity.mjs` 守护 |
| 英文标题/描述 | `locale/en.json` | `meta.title`、`meta.description`、`meta.detail` |
| 中文标题/描述 | `locale/zh.json` | 同上 |
| 详情插图 | `docs/preview.svg` | 640×300，主题中性 |

## 许可

MIT
