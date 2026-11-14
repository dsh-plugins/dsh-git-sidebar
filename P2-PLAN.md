# P2 计划：多选、折叠、过滤、hunk 级操作、分支删除与合并

P0、P1 已完成并全部通过自动化：分支、暂存、提交（含暂存全部与改写）、放弃、diff、历史、分支切换与新建、储藏、同步、冲突逐区解决、中止操作。

P2 在 P1 之上补「更细的控制粒度」与「更省事的批量操作」。

## 一、hunk 级暂存与放弃（E4）

**契约**（已落地）

```ts
interface HunkArgs { sessionId: string; path: string; hunk: number }
stageHunk(args): Promise<WriteOutcome>
unstageHunk(args): Promise<WriteOutcome>
```

**宿主**：用只含目标 hunk 的补丁走 `git apply --cached [--reverse] --unidiff-zero`，临时文件在 `os.tmpdir()`，失败归为 `stale`。

**客户端**：diff 标签页每个 hunk 头加「暂存此块 / 取消暂存此块」按钮；点击后重读该文件 diff。仅当该 diff 是工作区或暂存区形态时可用（提交 diff 不显示按钮）。

**测试**：造一个文件含两个不相邻改动，暂存第 1 块后断言 `git diff --cached` 只含该块、`git diff` 仍含另一块。

## 二、多选与批量操作（B8、B6 扩展）

**客户端**：文件行支持 Ctrl/Cmd 点击多选、Shift 点击区间选择；选中后底部出现批量条：暂存 / 取消暂存 / 放弃（确认）。

**不做**：跨分组的选中（暂存区与工作区分开选中）。理由：两组的操作语义不同，混选只会让按钮含义模糊。

**测试**：选中 3 个文件 → 暂存 → 断言 3 个都进暂存区。

## 三、按目录折叠（B5）

**客户端**：文件路径按目录分组，目录行可折叠，折叠状态记在组件 state。默认展开；超过 20 个文件时默认折叠深层目录。

**不做**：持久化折叠状态（跨会话记住）。理由：会话之间路径集合差异大，记住的折叠多半是噪音。

## 四、变更列表过滤（B9）

**客户端**：分组标题右侧加一个过滤输入框，按路径子串匹配（不区分大小写），过滤只影响显示不影响操作。

## 五、分支删除与合并（G4、G6）

**契约**

```ts
deleteBranch(args: { sessionId, branch, force }): Promise<WriteOutcome>
mergeBranch(args: { sessionId, branch }): Promise<WriteOutcome>
```

**宿主**：
- `deleteBranch`：`git branch -d`（或 `-D`）；当前分支拒绝；未合并时先 `-d` 失败，返回 `problem: 'unmerged'` 让客户端提示「需要强制删除」
- `mergeBranch`：`git merge --no-edit <branch>`；冲突时返回 `ok: true`（合并在中途是正常状态），快照的 `operation` 会是 `merge`，冲突组会出现

**客户端**：分支选择器每个非当前分支行右侧加删除按钮（确认）；顶部菜单加「合并分支…」，弹出选择器选一个分支。

## 六、变更数量角标（B10）

**客户端**：侧栏面板的 tab chip 上显示变更总数（`Git · 3`）。用 tab 的 title 无法动态更新，改为在面板内部标题区显示；若要真正做角标需要 `sidebar.toggle.badge`，那是左侧栏的槽位，与右侧栏面板无关，**因此明确不做**。

## 实施顺序与验证

1. hunk 级（宿主 + diff 页按钮 + 测试）
2. 多选 + 批量
3. 目录折叠
4. 过滤
5. 分支删除与合并
6. 变更数量（面板内）

每步：`tsc` → `build` → 新增测试 → 全套回归（`contract` / `locale-parity` / `parity` / `git-test` / `diff-test` / `p1-test` / `sync-test` / `conflict-test` / `amend-test`）→ 提交。

## 明确不做

| 项目 | 原因 |
| --- | --- |
| 多仓库并行 | 一个会话一个工作目录；多仓库需要另一套 UI 前提 |
| 交互式变基 | 破坏性大、编辑器式交互复杂度高 |
| 子模块递归管理 | 遇到只提示，不做管理 |
| 跨分组多选 | 语义冲突，见上 |
| 折叠状态持久化 | 噪音大于收益 |
| 左侧栏角标 | 槽位属于左侧栏，与右侧栏面板无关 |
