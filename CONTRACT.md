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

全部类型定义见 `src/shared.ts`。**字段名以该文件为准，不要另起名字。**

`WriteProblem` 在 P1 增加 `dirty`（有未提交改动，拒绝切换分支）、`invalid-name`、`exists`。

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

- **`inject` 实际为 `['subprocess', 'sandbox', 'sandboxPolicy', 'workingDirectory', 'sessions']`**：服务用 `ctx.sessions.get(sessionId)` 把 wire 上的会话 id 解析成 Session，不需要 `ctx.fs`。

- 会话与目录：`ctx.workingDirectory.get(session)` 取 cwd；会话不存在时返回 `kind: 'unavailable', problem: 'no-directory'`。
- 沙箱：`const policy = ctx.sandboxPolicy.resolve({ session })`；`policy.mode === 'danger-full-access'` 时直接用 argv，否则先 `await ctx.sandbox.confine(command, { ...policy, mode: policy.mode }, signal)` 取 `.argv`。
- 环境：清空 `GIT_DIR` `GIT_WORK_TREE` `GIT_COMMON_DIR` `GIT_INDEX_FILE` `GIT_OBJECT_DIRECTORY` `GIT_ALTERNATE_OBJECT_DIRECTORIES` `GIT_CONFIG` `GIT_CONFIG_PARAMETERS` `GIT_CONFIG_COUNT` `GIT_PREFIX` `GIT_ATTR_SOURCE`，设 `GIT_TERMINAL_PROMPT:'0'` `GIT_OPTIONAL_LOCKS:'0'` `LC_ALL:'C'`。
- 固定前缀：`['--no-optional-locks', '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false']`（放在 git 子命令之前）。
- 每条命令 `deadline(signal, config.timeoutMs)` + `stdio: { stdin: 'ignore', stdout: { maxBytes }, stderr: { maxBytes } }`，结束后 `child.terminate()` 并 `await child.waitForExit()`。
- 错误：退出码不在白名单 → 抛错；**`status` 端点自身永不抛**，把所有失败折进 `kind: 'unavailable'` + `problem` + `message`。写操作失败返回 `{ ok: false, problem: 'failed', message }`。

## 客户端侧要点

- `ctx.remote.$mount(gitSidebarContribution(zod))` → `ctx.get('remote.gitSidebar')`。
- 所有可见文字走 `ctx.locale`，命名空间 `gitSidebar`。
- 样式只用 `--dsw-*` 令牌，全部写在 `src/client/styles.ts`，以 `<style>` 元素或 `style` 属性注入，**不要**引入任何 Harness Client 包作为模块。
- 图标用内联 SVG path（Material Symbols 的 path 数据），20×20，`currentColor`。

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
