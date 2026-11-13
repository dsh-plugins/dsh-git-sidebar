# P1 计划：同步、历史、分支、储藏、冲突

P0 已完成：分支头、两组变更、暂存/取消暂存/放弃、提交、diff。以下按 P1 顺序实现，每块独立可验证。

## 分工原则

沿用 P0 的方式：**lead 先扩契约，再按层并行**。

- 契约（`src/shared.ts`、`src/remote-descriptor.ts`）只由 lead 改
- 宿主层（`src/host/**`）、客户端层（`src/client/**`）、测试层（`run/**`）分给不同 agent
- 每块完成后 lead 集成、跑全套自动化、提交

## 第一块：状态刷新与上游信息（A4、J7）

**契约扩展**

```ts
interface StatusSnapshot {
  // 现有字段不动，新增：
  upstream?: {
    name: string            // origin/main
    ahead: number
    behind: number
  } | null
  operation?: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | null
}
```

**宿主**：`status` 端点补一次 `rev-parse --abbrev-ref @{upstream}` 与 `rev-list --left-right --count`。
**客户端**：分支头右侧显示 `↑n ↓m`；无 upstream 时不显示。
**测试**：`run/upstream-test.mjs` 造一个有 remote 的夹具。

## 第二块：提交历史（F1、F2、F4）

**契约**

```ts
interface CommitEntry {
  sha: string
  short: string
  subject: string
  author: string
  when: string              // ISO
  refs: string[]            // 分支/tag 名
}
history(args: { sessionId, limit, skip }): Promise<CommitEntry[]>
commitDetail(args: { sessionId, sha }): Promise<DiffPayload>
```

**宿主**：`log --format` 用 `%x00` 分隔，`--decorate` 拿 refs；`show --format= --patch` 拿单提交 diff。
**客户端**：填进 P0 就留好的 `data-git-history-slot`，滚动到底加载下一页；点提交展开详情。
**测试**：断言条数、分页、refs 标记。

## 第三块：分支管理（G1、G2、G3）

**契约**

```ts
branches(args: { sessionId }): Promise<{ current: string | null; local: string[]; remote: string[] }>
checkout(args: { sessionId, branch }): Promise<WriteOutcome>
createBranch(args: { sessionId, name, from? }): Promise<WriteOutcome>
```

**宿主**：`for-each-ref` 拿列表；`checkout` 前先 `status --porcelain` 判断有无未提交改动，有则返回 `{ ok:false, problem:'dirty' }` 让客户端提示。
**客户端**：分支头点击展开分支选择器（列表 + 新建输入行）。
**测试**：切换分支、新建分支、脏工作区拒绝切换。

## 第四块：同步操作（A5）

**契约**

```ts
sync(args: { sessionId, action: 'fetch' | 'pull' | 'push' }): Promise<WriteOutcome>
```

**宿主**：这三条会碰网络与凭据，需要单独的更长 timeout（`syncTimeoutMs`，默认 60s）与更大的输出上限；`GIT_TERMINAL_PROMPT=0` 保证不挂死，凭据缺失时以 git 的 stderr 报错。
**客户端**：分支头旁的下拉菜单（fetch / pull / push），执行中显示忙碌态。
**安全**：`pull` 与 `push` 在确认对话框里说明会影响远端。

## 第五块：储藏（H1、H2）

**契约**

```ts
stashes(args: { sessionId }): Promise<StashEntry[]>
stash(args: { sessionId, message? }): Promise<WriteOutcome>
stashApply(args: { sessionId, index, drop: boolean }): Promise<WriteOutcome>
```

**宿主**：`stash list --format=%gd%x00%gs`、`stash push -m`、`stash pop/apply`。
**客户端**：面板底部或独立分组「储藏」，可展开。
**测试**：储藏后工作区变干净、pop 后恢复。

## 第六块：冲突解决（I1–I5）

**契约**

```ts
conflictFiles(args: { sessionId, path }): Promise<{ hunks: ConflictHunk[] }>
resolveConflict(args: { sessionId, path, resolutions: Resolution[] }): Promise<WriteOutcome>
abortOperation(args: { sessionId }): Promise<WriteOutcome>
```

**宿主**：读工作区文件里的冲突标记解析分段；写回时按选择拼接；`abortOperation` 按当前 `operation` 调 `merge --abort` / `rebase --abort`。
**客户端**：冲突文件行点开进入冲突视图，逐块选「当前/传入/两者」。
**测试**：造真实冲突，逐块解决后提交。

## 顺序与验证

1. 第一块 → 回归 → 提交
2. 第二块 → 回归 → 提交
3. 第三块 → 回归 → 提交
4. 第四块 → 回归 → 提交
5. 第五块 → 回归 → 提交
6. 第六块 → 回归 → 提交

每块完成后跑：`run/contract.mjs`、`run/git-test.mjs`、`run/diff-test.mjs`、新增的该块测试、`run/dark.mjs`。全部通过才提交。

## P2 待办（P1 完成后）

多选、目录折叠、文件过滤、hunk 级暂存、提交详情、分支删除/重命名/合并、多仓库、变更数量角标。
