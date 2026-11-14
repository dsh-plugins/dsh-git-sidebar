# Git 历史可视化重写：实现规格

现状：`src/client/history.ts` 是一个扁平列表（短 SHA + subject + 作者 + 时间 + ref 标签），没有图形。
目标：按 VS Code「源代码管理 → Graph」的形态，重写成**带泳道的提交图**。

**这份规格是重写，不是修改**：`src/client/history.ts` 整个文件删掉重写，`graph-model.ts` 是新建的纯函数模块。
宿主侧只扩字段，不动结构。

---

## 一、数据：宿主提供什么

`src/shared.ts` 已经改好，**以它为准**：

```ts
export type RefKind = 'head' | 'local' | 'remote' | 'tag'

export interface CommitRef {
  readonly name: string      // main / origin/main / v1.0
  readonly kind: RefKind
}

export interface CommitEntry {
  readonly sha: string       // 完整 SHA
  readonly short: string     // 短 SHA
  readonly subject: string   // 首行
  readonly author: string
  readonly email: string     // 作者邮箱，图里作为身份
  readonly when: string      // ISO 8601
  readonly refs: readonly CommitRef[]
  readonly parents: readonly string[]   // 完整 SHA，Git 的顺序
}
```

宿主只需把 `readHistory` 的 `--format` 加上 `%P`（parents，空格分隔）与 `%ae`（email），
并把 `%D` 的装饰解析成 `CommitRef`：

| Git 的 `%D` 写法 | 解析成 |
| --- | --- |
| `HEAD -> main` | `{ name: 'main', kind: 'head' }` |
| `origin/main` 或任何含 `/` 的 | `{ name, kind: 'remote' }` |
| `tag: v1.0` | `{ name: 'v1.0', kind: 'tag' }` |
| 其余裸名 | `{ name, kind: 'local' }` |

`HEAD -> X` 里的 `HEAD` 本身不单独成条；它只把 `X` 标成 `head`。
detached HEAD 时 `%D` 可能是裸 `HEAD`，此时产出 `{ name: 'HEAD', kind: 'head' }`。

---

## 二、图形模型（纯函数，`src/client/graph-model.ts`）

### 输入输出

```ts
export interface GraphInput {
  readonly sha: string
  readonly parents: readonly string[]
}

export interface GraphLaneSegment {
  /** 这一笔所在的泳道，0 起。 */
  readonly lane: number
  readonly kind: 'through' | 'up' | 'down' | 'merge-in' | 'merge-out'
}

export interface GraphRow {
  readonly sha: string
  /** 提交自己所在的泳道。 */
  readonly lane: number
  /** 这一行里所有经过/转弯的线。 */
  readonly segments: readonly GraphLaneSegment[]
}

export interface GraphLayout {
  readonly rows: readonly GraphRow[]
  /** 用到的泳道数，画布宽度就是它。 */
  readonly lanes: number
}

export function layoutGraph(commits: readonly GraphInput[]): GraphLayout
```

### 算法（按此实现，不要自创）

沿 `commits` 从上到下（新 → 旧）扫描，维护一个数组 `lanes`，每个元素是「这条泳道正在等的 SHA」或 `null`（空闲）。

对每一行：

1. **占位**：找出所有 `lanes[i] === commit.sha` 的 `i`。
   - 一个都没有 → 说明它是新的头部提交：追加一条新泳道，`lane = lanes.length`，`lanes.push(sha)`。
   - 有多个 → `lane` 取最小的 `i`，其余 `i` 置 `null`（这些分支在此汇合）。
   - 有一个 → `lane = i`。
2. **本行的线**：
   - 每个仍然活跃（非 `null`）且 `i !== lane` 的泳道，画一条 `through`。
   - 该提交自己的泳道写 `lane` 位置上的节点（节点由渲染层画圆，不进 `segments`）。
3. **父提交分配**（按 Git 顺序）：
   - 第一个父：若 `lanes[lane] === commit.sha`（还没被替换），把 `lanes[lane] = parent`，本行在这个泳道上是 `down`（线继续向下）。
     - 若无父（根提交）→ `lanes[lane] = null`，本行是 `up`（线到此为止）。
   - 其后每个父（合并提交的第二个及以后）：先找有没有别的泳道已经在等这个 parent；
     - 有 → 从 `lane` 画一条 `merge-out` 到那个泳道，把本泳道的线接过去（不新增泳道）。
     - 没有 → 在 `lanes` 末尾追加一条新泳道指向该 parent，从 `lane` 画 `merge-out` 到新泳道。
4. **修剪**：连续为 `null` 的尾部队列在扫描中裁掉，保证 `lanes` 长度不会被历史深处的旧分支撑大。
5. `lanes` 输出为最终长度。

**颜色**：泳道颜色由渲染层按 `lane % palette.length` 取，调色板是一组 `--dsw-*` 令牌派生色（见第四节）。

### 必须满足的性质（测试会检查）

- 同一 SHA 只出现一行。
- 每行的 `segments` 里 `lane` 都在 `[0, lanes)` 内。
- 一条直线的泳道在两个相邻行之间保持同一个 `lane`（除非发生合并/分叉）。
- 线性历史（无合并）时 `lanes === 1`。
- 一个提交有 2 个父（合并）时，会产出至少一条 `merge-out` 或 `merge-in`。

---

## 三、渲染（`src/client/history.ts`，整体重写）

### 结构

```
┌─ 头 ────────────────────────────────────────────
│ ▾ 历史            12 个提交      [刷新]
├─ 列表（虚拟滚动可选，第一版不做）───────────────
│ ●─┐  3f2a1b0  修复 xxx        main  竹若泠  2 小时前
│ │ │
│ ● │  8c4d2e1  feat: yyy               张三  昨天
│ └─●  a1b2c3d  chore: zzz        origin/main
├─ 底部：加载更多 / 到底了 ──────────────────────
```

### 图区（gutter）

- 每行一个固定宽度的 SVG，宽 = `lanes * LANE_W`，`LANE_W = 14px`
- 行高 `ROW_H = 26px`
- 节点：`r = 4` 圆点，实心，用该泳道的颜色
- 线：`stroke-width = 2`，`stroke-linecap = round`
- 转弯用三次贝塞尔 `C`，控制点在行边界上，不要用 `Q` 拼直角
- 颜色走 `currentColor` 或直接 `stroke`，值来自 `LANE_COLORS` 常量

### 列表行

- 短 SHA：等宽字体，`--dsw-alias-label-secondary`
- subject：主文本，`--dsw-alias-label-primary`
- ref 标签：**胶囊**，按 kind 上色
  - `head` / `local`：品牌色底 + 品牌色文字
  - `remote`：次要色底
  - `tag`：warn 色底
- 作者 + 相对时间：右对齐，`--dsw-alias-label-tertiary`
- 整行 hover 高亮；点击打开该提交的 diff（保留现有行为，用 `commitDiffAddress`）

### 交互

- 头部可折叠（沿用 `onToggle`）
- 滚动到底自动加载下一页；底部仍保留按钮作为触屏与键盘路径
- 焦点：行是 `<button>`，Tab 可达；方向键上下移动焦点（列表内 roving tabindex 可选）

### 保留的 DOM 钩子（测试依赖，**必须保留**）

| 钩子 | 含义 |
| --- | --- |
| `[data-git-history]` | 整个历史区块 |
| `[data-git-history-toggle]` | 折叠按钮 |
| `[data-git-history-row="<sha>"]` | 一条提交（可点击元素） |
| `[data-git-history-more]` | 加载更多按钮 |
| `[data-git-history-end]` | 到底提示 |

### 新增的 DOM 钩子（测试依赖，**必须新增**）

| 钩子 | 含义 |
| --- | --- |
| `[data-git-graph]` | 图区容器 |
| `[data-git-graph-row="<sha>"]` | 该提交的 SVG |
| `data-lanes="<n>"` | 挂在 `[data-git-graph]` 上，泳道总数 |
| `[data-git-graph-node]` | 节点圆 |
| `[data-git-graph-line]` | 一条线 |
| `[data-git-ref-kind="head\|local\|remote\|tag"]` | ref 胶囊 |
| `data-lane="<n>"` | 挂在 `[data-git-graph-row]` 上，该提交所在泳道 |

---

## 四、样式

- 全部写进 `src/client/styles.ts` 的 `PANEL_STYLES`，类名前缀 `.gs-`，**只用 `--dsw-*` 令牌**
- 泳道色板用 `color-mix` 从令牌派生，至少 8 个互不相同的颜色，明暗主题都成立
- 现有 `.gs-history*` / `.gs-commit*` / `.gs-sha` / `.gs-refs` / `.gs-ref` 规则全部删除重建

---

## 五、测试

### `run/graph-model.test.mjs`（Node，纯函数）

直接 import `src/client/graph-model.ts`（Node 26 原生支持 TS 类型剥离，已验证可用）：

- 线性 3 提交 → `lanes === 1`，三行泳道都是 0
- 分叉后合并的形状 → 检查第二泳道出现又消失
- 根提交没有父 → 该行没有向下的线
- 合并提交（2 个父）→ 至少有 `merge-out`
- 不变量：`segments` 的 lane 都在范围内、SHA 不重复

### `run/history-test.mjs`（浏览器）

- 造一个带分叉合并的仓库（fixture 里新建 `setupGraphFixture()`）
- 断言图区出现、`data-lanes` 与预期一致
- 断言 `[data-git-graph-row]` 数量 == 提交数
- 断言每行 SVG 里的节点数 == 1
- 断言 ref 胶囊按 kind 上色（`data-git-ref-kind` 存在）
- 断言点一行仍能打开该提交 diff
- 断言滚动到底加载下一页

---

## 六、文件所有权

| 文件 | 所有者 |
| --- | --- |
| `src/shared.ts`、`src/remote-descriptor.ts`、`package.json`、`build.mjs`、`tsconfig.json` | lead（已完成） |
| `src/host/**` | 宿主 agent |
| `src/client/graph-model.ts`、`src/client/history.ts` | 图形 agent |
| `src/client/styles.ts`（只改 `.gs-history*` / `.gs-commit*` / `.gs-graph*` / `.gs-ref*` 段） | 图形 agent |
| `src/client/panel.ts`（只改传参，不改别处） | 图形 agent（谨慎） |
| `src/client.ts` 的字典（只加 `history.*` / `graph.*` 键） | 图形 agent（谨慎） |
| `run/**` | 测试 agent |

**不要改**：其它任何文件。
