# 实现契约（P0 冻结）

本文件由 lead 独占维护。**任何 agent 不得修改 `src/shared.ts`、`src/remote-descriptor.ts`、`package.json`、`build.mjs`。**
需要改契约时，在最终报告里写明「需要什么改动」，由 lead 落地。

## 文件所有权

| 目录 / 文件 | 所有者 |
| --- | --- |
| `src/shared.ts`、`src/remote-descriptor.ts`、`package.json`、`build.mjs`、`tsconfig.json`、`CONTRACT.md`、`P1-PLAN.md` | lead |
| `src/host/**`、`src/index.ts` | 宿主层 agent |
| `src/client/**`（除 `diff-*.ts`）、`src/client.ts` | 客户端层 agent |
| `src/client/diff-tab.ts`、`src/client/diff-parse.ts` | diff 层 agent |
| `run/**` | 测试层 agent |
| `README.md`、`docs/**`、`locale/**`、`FEATURES.md` | lead |

C 的 `diff-tab.ts` 导出：

```ts
export const DIFF_TAB_DEFINITION: TabDefinition
export function makeDiffBody(React: unknown, runtime?: unknown): (props: unknown) => unknown
export function makeDiffTitle(React: unknown, runtime?: unknown): (props: unknown) => unknown  // 可选
```

B 在 `src/client.ts` 里 import 这两个并按 `ctx.slots.register` 注册，不要 C 自己去注册。

**sessionId 只能从 slot props 取**（`props.sessionId`）——`useTabInfo()` 的 `tab` 里没有 session 字段。这是经 C 核实 DSH 源码得出的结论。

## Remote 契约

命名空间 `gitSidebar`。方法（每个只收一个具名参数对象）：

| 方法 | 参数 | 返回 | 阶段 |
| --- | --- | --- | --- |
| `status` | `StatusArgs` | `StatusSnapshot` | P0 |
| `diff` | `DiffArgs` | `DiffPayload` | P0 |
| `stage` | `PathsArgs` | `WriteOutcome` | P0 |
| `unstage` | `PathsArgs` | `WriteOutcome` | P0 |
| `discard` | `DiscardArgs` | `WriteOutcome` | P0 |
| `commit` | `CommitArgs` | `CommitOutcome` | P0 |
| `history` | `HistoryArgs` | `HistoryPage` | P1 |
| `commitDetail` | `CommitDetailArgs` | `DiffPayload` | P1 |
| `branches` | `BranchListArgs` | `BranchList` | P1 |
| `checkout` | `CheckoutArgs` | `WriteOutcome` | P1 |
| `createBranch` | `CreateBranchArgs` | `WriteOutcome` | P1 |
| `stashes` | `StashListArgs` | `readonly StashEntry[]` | P1 |
| `stash` | `StashArgs` | `WriteOutcome` | P1 |
| `stashApply` | `StashApplyArgs` | `WriteOutcome` | P1 |
| `sync` | `SyncArgs` | `WriteOutcome` | P1 |
| `repositories` | `RepositoriesArgs` | `RepositoryList` | 多仓库 |
| `selectRepository` | `SelectRepositoryArgs` | `SelectOutcome` | 多仓库 |
| `fileSides` | `FileSidesArgs` | `DiffSides` | Monaco 差异 |
| `commitFiles` | `CommitDetailArgs` | `CommitFilesPayload` | Monaco 差异 |
| `commitSides` | `CommitSidesArgs` | `DiffSides` | Monaco 差异 |
| `stageHunk` / `unstageHunk` / `discardHunk` | `HunkArgs`（可选 `region`） | `WriteOutcome` | 块级 / hunk 级写入 |

全部类型定义见 `src/shared.ts`。**字段名以该文件为准，不要另起名字。**

### Monaco 差异（可选依赖）

dsh-monaco 声明为 `peerDependenciesMeta` 里的 **optional peerDependency**，不写进客户端 `inject`：
服务用 `ctx.get('monacoEditor')` 惰性读取，读不到就继续用补丁块渲染，装与不装都不影响面板。
宿主半为此新增三个读取端点：`fileSides`（工作区/索引一侧的两份完整文本，工作区那侧走 `ctx.fs`，
对象那侧走 `git show`）、`commitFiles`（`diff-tree` 的名字状态 + numstat）、`commitSides`
（提交内单个文件的父/子版本）。三个端点都受配置 `maxSideBytes` 约束，超过就返回 `too-large`
而不是截断——半份文档会比对出另一份差异。合并提交没有唯一的旧侧：`commitFiles` / `commitSides`
统一按 `git diff <第一父> <提交>` 读取（根提交仍走 `diff-tree --root`），并在 payload 的 `merge`
里标记，客户端据此在页头说明。

块级写入用 `HunkArgs.region`：Git 会把相邻改动并成一个 hunk，编辑器再按上下文把它拆回连续改动块
（`src/host/patch.ts` 的 `regionPatch` 重建零上下文补丁，`@@ -a,b +c,d @@` 单侧为 0 时起点前移一行，
交给 `git apply --unidiff-zero` 回放）；不带 `region` 时仍是整 hunk 的老路径。客户端 `blocksOf()`
（`diff-monaco.ts`）必须与该函数用同一套切分规则，否则按钮会指向邻块。`discardHunk` 与 `stageHunk`
对称：重读工作区补丁、取出该块、反向应用到工作区文件（`git apply -R`，不加 `--cached`）。

`WriteProblem` 在 P1 增加 `dirty`（有未提交改动，拒绝切换分支）、`invalid-name`、`exists`。

### 分支预览：只读的「换一条分支看历史」

`HistoryArgs` 多一个可选 `branch`：给了就读这个**本地分支**的日志，省略读 HEAD（旧客户端行为不变）。
宿主用 `git rev-parse --verify --quiet refs/heads/<branch>^{commit}` 把它解析成完整对象名再喂给
`git log` / `git rev-list --count`——前缀固定，所以分支名不可能被当成选项，也顺带证明该 ref 仍然存在；
解析失败返回空页。**不新增 Remote 方法**，`run/contract.mjs` 无需改动。

预览状态本身只在客户端（面板一次挂载内），不写任何会话缓存：预览的历史页既不读也不写
`panel-cache` 的历史槽，退出预览即回到原 HEAD 缓存。历史列表按 `branch` 作为 `key` 重挂载，
因为它的 `load` 闭包捕获首次渲染的 props，只有重挂载才能换 ref 并从第 0 页重读。

预览时以下操作先弹确认框，确认后**先签出预览分支、成功再执行原操作**：历史行的「签出此提交」
「从此提交新建分支」、操作菜单的「合并」「拉取」「推送」、「新建分支」、以及删除正在预览的分支
（删除不签出——签出后 Git 会拒绝删除，改为删除成功后自动退出预览）。暂存/取消暂存/撤销/储藏/
提交/中止操作**不拦截**：它们只动索引与工作区，而宿主的 `checkout` 在存在未提交改动时一律拒绝，
拦截提交会让「预览时提交」变成永远不可能。面板在分支头下方用一条预览条说明这一切：
预览只换了描述对象，改动与提交仍落在实际签出的分支上。

### 多仓库：选中状态在宿主

`status`、`diff`、`stage`、`commit`、`history`、`branches`、`stashes`、`conflict`、`generateMessage` 都是
「读这个会话的仓库」，没有仓库参数。要支持一个工作目录下的多个仓库而**不改这 24 个方法的签名**，
选中状态放在宿主服务的 `Map<sessionId, root>` 里：

- 未选中时行为与以前完全一致（用会话工作目录）。
- `selectRepository({ sessionId, root })` 先用 `git rev-parse --show-toplevel` 校验 `root` 确实是某个
  仓库的顶层，再把该 root 记到会话上；`root` 省略或空串表示回到工作目录。
- 选中随宿主进程生命周期存在，**宿主重启后丢失**，面板回到工作目录的仓库。
- diff 标签页没有仓库参数，正因为状态在宿主，它才会自动跟随当前选中的仓库。

扫描（`src/host/repos.ts`）只读文件系统，不 spawn git；只有「会话工作目录所属仓库」用一次
`rev-parse` 解析，保证报告的 root 与端点实际使用的一致。判定：`.git` 是目录 → `repository`；
`.git` 是文件且 gitdir 含 `/modules/` → `submodule`；否则 → `worktree`。

配置项（`src/index.ts`，均支持热改）：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `scanDepth` | 2 | 向下扫描层数，工作目录为 0 |
| `scanExclude` | `[]` | 追加黑名单正则（大小写不敏感，匹配目录自身名称） |
| `scanDefaultExclude` | `true` | 是否启用内置黑名单 |
| `scanMaxDirectories` | 5000 | 单次扫描的目录预算，超出则 `truncated` |

新增 Remote 方法时必须同步三处：`src/shared.ts` 类型、`src/remote-descriptor.ts` 的
`REMOTE_METHODS` 与 descriptor、`src/host/service.ts` 的 `async` 方法；另外
`run/contract.mjs` 的 `EXPECTED_ARGS` 也要登记，否则该检查会 FAIL。

## Agent 工具（不是 Remote 方法）

两个工具在 `src/host/tools.ts`，由 `src/index.ts` 用 `ctx.inject(['tools'], …)` 注册
——**不要**加进 `export const inject`，否则没有工具注册表的 profile 会连面板一起停用。

| 工具 | 参数 | 返回 |
| --- | --- | --- |
| `git_repositories` | 无 | `scanRoot`、`depth`、`entries[]`（`root`/`relative`/`name`/`kind`/`current`）、`truncated`、`warnings` |
| `git_open_repository` | `repository`：绝对 root、相对路径或 `.` | `root`、`relative`、`branch`、`detached`、三个改动计数 |

- 两者都从 `exec.agent?.id` 取 sessionId（**`Agent.id` 就是 `SessionId`**），再调
  `GitSidebarService.repositories()` / `selectRepository()`——与面板下拉走同一条路径，不复制扫描与校验。
- 定义是手写同形对象（`name`/`description`/`parameters`/`output{schema,render}`/`execute`），
  不 import `@deepseek-ai/dsh-tools`。**注意注册表会校验 output schema**：只支持单一 `type`，
  `type: ['string','null']` 会被拒；需要「可能为空」时用空串 + 单独的 boolean。
- UI：Host 侧没有任何「给客户端开 tab」的通道（可转发事件是 `dsh-api-remotes` 的白名单，第三方加不了），
  所以打开面板靠**工具卡片**——client 半用 `ctx.slots.register({ name: 'tool.call.toolview', key: '<wire name>' })`
  注册自己的行，行在 `phase === 'result'` 时调 `ctx.sidebarRight.openTab(PANEL_TAB_KIND)`，
  并按 `callId` 去重，避免重渲染/重放重复抢焦点。打开前 `invalidateAll(panelCache)`，
  否则面板会画出上一个 checkout 的快照。

## 宿主侧要点

- 服务 `extends TypertRemoteService`，`super(ctx, 'gitSidebar')`。
- 六个方法都必须是 `async`，参数可选（`args?: StatusArgs`），内部对缺失参数做校验并抛可读错误。
- 必须挂原型描述表：

```ts
const REMOTE_METHOD_DESCRIPTOR = '@deepseek-ai/dsh-typert-protocol/remote-methods'
Object.defineProperty(GitSidebarService.prototype, REMOTE_METHOD_DESCRIPTOR, {
  configurable: true,
  value: Object.freeze({
    version: 1,
    methods: Object.freeze(REMOTE_METHODS.map(method =>
      Object.freeze({ method, invocation: Object.freeze({ kind: 'direct' }) }))),
  }),
})
```

`REMOTE_METHODS` 从 `src/remote-descriptor.ts` 导入，保证与客户端一致。

- **`inject` 实际为 `['subprocess', 'sandbox', 'sandboxPolicy', 'workingDirectory', 'sessions', 'fs', 'llm']`**：服务用 `ctx.sessions.get(sessionId)` 把 wire 上的会话 id 解析成 Session；`ctx.fs` 只用来读工作区那一侧的差异文本。

- 会话与目录：`ctx.workingDirectory.get(session)` 取 cwd；会话不存在时返回 `kind: 'unavailable', problem: 'no-directory'`。
- 沙箱：`const policy = ctx.sandboxPolicy.resolve({ session })`；`policy.mode === 'danger-full-access'` 时直接用 argv，否则先 `await ctx.sandbox.confine(command, { ...policy, mode: policy.mode }, signal)` 取 `.argv`。
- 环境：清空 `GIT_DIR` `GIT_WORK_TREE` `GIT_COMMON_DIR` `GIT_INDEX_FILE` `GIT_OBJECT_DIRECTORY` `GIT_ALTERNATE_OBJECT_DIRECTORIES` `GIT_CONFIG` `GIT_CONFIG_PARAMETERS` `GIT_CONFIG_COUNT` `GIT_PREFIX` `GIT_ATTR_SOURCE`，设 `GIT_TERMINAL_PROMPT:'0'` `GIT_OPTIONAL_LOCKS:'0'` `LC_ALL:'C'`。
- 固定前缀：`['--no-optional-locks', '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false']`（放在 git 子命令之前）。
- 每条命令 `deadline(signal, config.timeoutMs)` + `stdio: { stdin: 'ignore', stdout: { maxBytes }, stderr: { maxBytes } }`，结束后 `child.terminate()` 并 `await child.waitForExit()`。
- 错误：退出码不在白名单 → 抛错；**`status` 端点自身永不抛**，把所有失败折进 `kind: 'unavailable'` + `problem` + `message`。写操作失败返回 `{ ok: false, problem: 'failed', message }`。

## 客户端侧要点

- `ctx.remote.$mount(gitSidebarContribution(zod))` → `ctx.get('remote.gitSidebar')`。
- 所有可见文字走 `ctx.locale`，命名空间 `gitSidebar`。
- 样式只用 `--dsw-*` 令牌，全部写在 `src/client/styles.ts`（diff 视图在 `diff-tab.ts` 的 `DIFF_STYLES`），以 `<style>` 元素或 `style` 属性注入，**不要**引入任何 Harness Client 包作为模块。
- 图标用内联 SVG path（Material Symbols 的 path 数据），20×20，`currentColor`。
- Monaco 差异：`diff-tab.ts` 负责取数与回退，`diff-monaco.ts` 只负责编辑器与块按钮，`diff-commit.ts` 负责提交的文件选择。`ctx.monacoEditor` 是另一个插件的服务，只在组件挂载时经 `resolveApi()` 解析一次，**不得**写进 `inject`。

## 颜色语义（参照 Monokai Pro，落地到令牌）

| 语义 | Monokai | 令牌 |
| --- | --- | --- |
| 当前分支 / ref | `#ffd866` | `--dsw-alias-brand-primary` |
| 新增 | `#a9dc76` | success 令牌 + 低透明度底 |
| 删除 / 冲突 | `#ff6188` | error 令牌 + 低透明度底 |
| 次要文本 | `#939293` | `--dsw-alias-label-secondary` |

## 代码规范（AGENTS.md）

- 每行不超过 135 字符
- 不写复述代码的注释
- 禁止 FQCN，能用 import 就 import
- 不把多条语句压到一行
- UTF-8，保持文件原有行尾
