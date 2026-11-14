# Git 历史可视化重写：实现规格

## 零、本轮：完整 port VS Code 布局（当前实现）

上一轮的「紧凑排布 + 长直线折叠」被整体推翻，改成照抄 VS Code
`src/vs/workbench/contrib/scm/browser/scmHistory.ts` 的 `toISCMHistoryItemViewModelArray()`
（布局）与 `renderSCMHistoryItemGraph()`（几何）。输入仍然只有 `parents`
（`git log --topo-order --format=%H %P`），布局仍然是纯函数 `layoutGraph()`。

### 泳道分配（逐字照抄，不要自创）

状态是一个 `swimlanes` 数组，**下标就是列号**，元素是「这条泳道正在等的 SHA」+ 色号。
每行的 input 就是上一行的 output，规则只有五条：

1. `circleIndex = input.findIndex(lane => lane.id === sha)`；找不到时 `circleIndex = input.length`
   （新头部提交追加到最右，节点就画在那一列）。
2. 遍历 input 构建 output：遇到 `id === sha` 的泳道，只在 `circleIndex` 那一处 push
   `{ id: parents[0], color: 该泳道色 }`；**其余同 id 的泳道直接丢弃**。这一步是整张图
   唯一的「列收缩」，也是右侧整体左移的唯一来源。
3. 其它泳道按原顺序原样 push（深拷贝），中间不留空位。
4. `parents[1..]` **无条件 push 到 output 末尾**：不查重、不复用已有泳道、不找空位。
5. `parents.length === 0`（根提交）→ output 为空数组，此刻还在等待的泳道全部在这一行的节点上收束。

列数 = 扫描过程中 output 数组的最大长度（本轮还额外把根节点可能落在 `input.length`
的那一列算进去）。

### 为什么不能复用空出来的列（水波纹）

上一轮为了「干净」做了三件事：新头取最左空位（`lanes.indexOf(null)`）、merge 额外父取
「离节点最近的空位」（`nearestFree`）、尾部空列裁剪。它们的共同后果是**同一列在不同行里
指向不同的分支**：一条分支结束后留下的空位会被下一条新线立刻占用，于是同一条分支的线在
历史中间左移右移，节点列号逐行跳动，整张图像水波纹。本轮一条都不做：

- 表里没有 `null`，output 只由 push 构成，所以不存在「洞」，也没有可复用的空位；
- 一条泳道从生到死都待在同一个下标，新分支一律开在最右；
- 线只可能向左移动，且**只发生在「丢弃重复泳道」的那一行**（右侧整体左移一格），
  这是 VS Code 允许的唯一横移。

测试里把这三条写成了不变量：「每行首尾列号是 0..n-1 的稠密区间」「横移只出现在丢弃重复
泳道的行且只会向左」「父提交出现在下一行时不会跑到子提交右侧」。

### 颜色

8 色 `LANE_COLORS` 仍在 `history.ts`，但**颜色跟着泳道走**：泳道创建时记下色号（创建时
的列号），之后左移不变色，所以一条分支从头到尾同一个墨色。色号超出调色板长度时取模回绕。

### 几何（`history.ts`）

- `LANE_W = 14`、`ROW_H = 26`、圆角半径 `R = 5`、节点 `r = 4`、merge 节点 `r = 6`；
  `x(lane) = LANE_W * (lane + 1)`，左侧留一列 padding；整张图统一宽度 `LANE_W * (lanes + 1)`。
- 四种原语：
  - 同列直通：`M x 0 V H`；
  - 换列（`bend`）：`M xi 0 V (H/2-R)` → 1/4 弧 → `H (xo±R)` → 1/4 弧 → `V H`，横移发生在
    节点高度，不是斜线；
  - 汇入节点（`join`）：从顶边下来、在节点高度拐进节点中心；
  - 离开节点（`branch`）：从节点中心横出、拐弯后垂直下到底边（merge 额外父就是这一种）。
- **绘制顺序**：所有过路线 → merge 弧 → 节点上半段 → 节点下半段 → 圆点最后画；圆点带 2px
  行背景色描边，把穿过它的线遮断。
- 已删除：`foldLongStretches`、`GraphArrow`、`FOLD_AFTER`、`nearestFree`、`reserveLane` 的
  空位复用、`collapsed` 字段，以及渲染层的 `arrowShapes` / `jumpTargetOf` / `scrollTo` /
  `ARROW_H` / `ARROW_W` / `data-git-graph-jump`。
  `styles.ts` 里的 `.gs-graph-arrow` / `.gs-graph-jump` 规则本轮不动（不归本文件所有）。

### 数据形状

```ts
export interface GraphRowStroke {
  readonly prior?: number   // 从顶边进入的列；缺省表示从本行节点出发
  readonly next?: number    // 从底边离开的列；缺省表示在本行节点收束
  readonly kind: 'through' | 'bend' | 'join' | 'branch'
  readonly color: number    // 调色板槽位，整条线不变
}

export interface GraphRow {
  readonly sha: string
  readonly lane: number     // 节点列
  readonly color: number    // 节点色号（= 第一父线色号）
  readonly merged: boolean  // 多于一个父提交，画大一点的节点
  readonly strokes: readonly GraphRowStroke[]
}

export interface GraphLayout {
  readonly rows: readonly GraphRow[]
  readonly lanes: number
}
```

`strokes` 的边界约定让渲染层不需要知道邻居：每行只在 `prior` / `next` 标注的列上接触上下边，
上一行 `next` 的集合与下一行 `prior` 的集合逐项相等（测试断言）。

### 本轮验证（`run/work/anvil-500.txt`，真实仓库 500 个提交）

| 指标 | 上一轮 | 本轮 |
| --- | --- | --- |
| 行数 | 500 | 500 |
| 列数（lanes） | 14 | 15 |
| 行内空洞（列存在但无线） | 340 | 0 |
| 折叠行 / 箭头 | 3116 / 258 | 0 / 0 |
| 横移段数（换列） | 不适用（无身份） | 145，全部发生在丢弃重复泳道的那一行 |
| 无法解释的横移 | — | 0 |

---

## 上一轮：紧凑排布 + 长直线折叠（本轮已推翻）

数据仍只有 `parents`（`git log --topo-order --format=%H %P`），布局仍是纯函数 `layoutGraph()`（`src/client/graph-model.ts`）。

### 泳道分配

- 一张 `lanes: (sha|null)[]` 表，下标就是列号；每行把「等待本提交的那条泳道」交给它的第一个父提交，其余泳道原样保留。
- **新线取最左空位**（不是追加到最右）：一条分支结束后留下的空列会被下一条新线立刻占用。VS Code 是追加到最右并保留重复泳道（本轮实测在 500 提交样本上只有 15 列，见「零」节的表）。
- **merge 的额外父优先复用已有泳道**；确实需要新列时取**离节点最近的空位**，于是折角只经过空格，不会横跨其它线（旧实现会从节点一路横跨到最右列，就是贯穿屏幕的那条横线）。
- 尾部空列每行裁剪。

### 长直线折叠（IntelliJ 行为）

- 一条线连续 **`FOLD_AFTER = 5` 行**没有自己的节点时（`src/client/graph-model.ts` 的 `foldLongStretches`），中间的行不再画线，只在两端各留一行、各放一个箭头：上端 `down` 指向下方那个提交，下端 `up` 指回上方那个提交；点击箭头 `scrollIntoView({ block: 'center' })` 跳到目标行。
- 若下方那个提交还没加载（页尾），箭头带空 `to`，点击等于「加载下一页」。
- IntelliJ 的门槛是 `LONG_EDGE_SIZE = 30`、两端各留 1 行（`PrintElementGeneratorImpl`，判据 `down-up < size || min(row-up, down-row) <= part`，中间行换成只有箭头的 `TerminalEdgePrintElement`，代码级默认 `isShowLongEdges = false`）；这里降到 5，因为侧栏一屏只有十几行。

### 数据形状与渲染

`GraphRow.segments[].collapsed` 标记被折掉的一段；`GraphRow.arrows[]` 是这一行的箭头（`lane` / `direction` / `to`）。`history.ts` 遇到 `collapsed` 直接跳过，箭头画成三角形 + 透明点击区（`data-git-graph-jump`）。箭头位于行按钮内部，所以行点击先判断目标是不是箭头，是则跳转/加载更多，否则才打开 diff。

### 参考实现（本轮核实过的源码）

- VS Code：`src/vs/workbench/contrib/scm/browser/scmHistory.ts` 的 `toISCMHistoryItemViewModelArray()` / `renderSCMHistoryItemGraph()`——泳道数组、第一父原地替换、汇合丢重复列左移；merge 额外父无脑追加到最右（当时以为这是宽度爆炸来源，本轮在 500 提交的真实样本上实测只有 15 列：额外父通常几行内就被它自己的行消费掉）；**无折叠**；长横线靠节点背景色描边遮罩（`.graph > circle { stroke: var(--vscode-sideBar-background) }`）。
- IntelliJ：`GraphLayoutBuilder.kt`（按分支重要性给稳定 `layoutIndex`，行内 x 是排序位次）、`SimpleGraphCellPainter.kt`（只在相邻两行之间斜一次，画直线段而非贝塞尔）、`PrintElementGeneratorImpl.kt`（长边折叠常量与判据）。

---

## 一、第一版规格（保留）

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
