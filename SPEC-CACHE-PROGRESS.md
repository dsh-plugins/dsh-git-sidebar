# 缓存 + VS Code 风格进度条：实现规格

目标三件事：

1. **缓存**：Git 历史、当前更改、分支、储藏、diff 内容——打开过的状态留在内存里，重新打开面板**不重新请求**。
2. **刷新中**：需要更新时（用户点刷新 / 写入后）显示 VS Code 那条 2px 横线动画，刷新按钮同时转。
3. **diff 缓存**：打开过的 diff 标签页再点开**不重新加载**。

**全部参考 VS Code 源码实现，不要自创。** 下面每一节都标了 VS Code 的源文件路径与关键行。

---

## 一、进度条：照抄 VS Code

**源文件**（已核实，可直接照抄结构）：

- `src/vs/base/browser/ui/progressbar/progressbar.ts`
- `src/vs/base/browser/ui/progressbar/progressbar.css`

### CSS（逐条对应 VS Code，颜色换成 DSH 令牌）

```css
/* 对应 .monaco-progress-container */
.gs-progress {
  box-sizing: border-box;
  width: 100%;
  height: 2px;
  overflow: hidden;   /* keep progress bit in bounds */
  position: relative;
  flex: none;
}

/* 对应 .monaco-progress-container .progress-bit */
.gs-progress-bit {
  position: absolute;
  left: 0;
  width: 2%;
  height: 2px;
  display: none;
  background: var(--dsw-alias-brand-primary);   /* VS Code 用 --vscode-progressBar-background */
}

/* 对应 .monaco-progress-container.active .progress-bit */
.gs-progress[data-active] .gs-progress-bit { display: block; }

/* 对应 .monaco-progress-container.infinite .progress-bit */
.gs-progress[data-infinite] .gs-progress-bit {
  animation-name: gs-progress;
  animation-duration: 4s;
  animation-iteration-count: infinite;
  animation-timing-function: linear;
  transform: translate3d(0, 0, 0);
}

/* 对应 .monaco-progress-container.infinite.infinite-long-running .progress-bit
   VS Code: 超过 10 秒改用 steps(100)，降低 GPU 压力 */
.gs-progress[data-infinite][data-long-running] .gs-progress-bit {
  animation-timing-function: steps(100);
}

/* 对应 @keyframes progress，数值逐字照抄 */
@keyframes gs-progress {
  from { transform: translateX(0%) scaleX(1); }
  50%  { transform: translateX(2500%) scaleX(3); }
  to   { transform: translateX(4900%) scaleX(1); }
}
```

**为什么是这些数值**（VS Code 原注释）：progress-bit 宽 2%（即父容器的 1/50），动画把它从 0% 移到 100% 容器宽。`translateX` 相对 bit 自身宽度，所以要乘它的相对尺寸：

- 父宽 5000%
- bit 宽 100%
- `translateX` 应为：50% → `5000% × 50% − 50% = 2450%`；100% → `5000% × 100% − 100% = 4900%`
- 中间用 `scaleX(3)` 让线条在扫过时变宽，这是 VS Code 的观感来源

### 组件行为（对应 `ProgressBar` 类）

```ts
export interface ProgressProps {
  /** 是否显示。false 时 bit 淡出 200ms 后隐藏（对应 done() 的 setTimeout(off, 200)）。 */
  readonly active: boolean
}
```

- `active` 变 true → 立刻 `data-active` + `data-infinite`，bit 宽度 2%、opacity 1（对应 `infinite()`）
- `active` 变 false → 先加 `data-done`，bit opacity 设 0，200ms 后移除全部属性（对应 `doDone(true)`）
- 持续 10 秒以上 → 加 `data-long-running`（对应 `LONG_RUNNING_INFINITE_THRESHOLD = 10000` 与 `infiniteLongRunning()`）

**位置**：面板顶部、分支头**之上**，紧跟 tab 内容区上沿，占满宽度，高 2px，不占布局跳动空间（父容器高度固定，进度条始终存在只是 bit 隐藏）。

---

## 二、刷新按钮

现有 `[data-git-refresh]` 保留，但：

- 刷新进行中：加 `data-turning` 属性（**已有**），CSS 让它旋转
- 旋转动画：`animation: gs-spin 1s linear infinite`，`@keyframes gs-spin { to { transform: rotate(360deg) } }`
- 刷新中 `disabled`（已有）
- **切换**：点刷新 → 进度条 `active` + 按钮转；请求结束 → 两者都停

`data-turning` 现在就存在但**没有对应 CSS**，这是要补的。

---

## 三、缓存

### 3.1 什么缓存

| 数据 | 缓存键 | 失效时机 |
| --- | --- | --- |
| `status` 快照 | `sessionId` | 用户点刷新、任何写操作成功后（用返回值覆盖，不重读）、切分支/合并后 |
| 历史第一页 | `sessionId` | 用户点刷新、提交成功、切换分支/合并/储藏后 |
| 分支列表 | `sessionId` | 每次打开菜单时**重读**（现状，保持不变） |
| 储藏列表 | `sessionId` | 用户点刷新、储藏相关操作后 |
| diff 内容 | `sessionId + path + staged` | 该文件所在的 diff 标签页被关闭时**不失效**；用户手动点刷新时失效 |

### 3.2 放在哪

**不要**新建全局单例。用一条 React `useState` 持有的 Map，挂在 panel 组件里：

```ts
interface PanelCache {
  readonly status: Map<string, StatusSnapshot>          // key: sessionId
  readonly stashes: Map<string, readonly StashEntry[]>
  readonly history: Map<string, { commits: readonly CommitEntry[]; hasMore: boolean }>
}
```

初次挂载时：

```ts
const cached = cache.status.get(sessionId)
if (cached !== undefined) {
  setSnapshot(cached)      // 命中 → 直接画，不请求
  setLoading(false)
} else {
  load()                   // 未命中 → 请求
}
```

**关键**：`useEffect` 的依赖保持 `[sessionId]`，不要因为 `revision` 变了就重读——现在 history 的 effect 依赖 `[open, props.revision]`，`revision` 变化会重读，这正是「每次打开都刷新」的来源之一。

### 3.3 diff 缓存

diff 标签页的缓存键是地址（`dsh-resource://git-diff/...`）。要求：

- 打开一个 diff tab，读到 payload 后**存进缓存**
- 关闭再打开同一个文件的 diff → **命中缓存直接画**，不请求
- 缓存条目数上限 50，超出按 LRU 淘汰（简单的 Map 插入顺序即可：命中时 delete 再 set 移到末尾）
- 用户点刷新（面板的刷新按钮）→ 清空 diff 缓存

**注意**：diff 内容的缓存必须是**跨 tab 实例**的，因为关掉 tab 组件就卸载了。所以它不能放在组件 state 里，要放在**模块级**的一个 Map（`diff-cache.ts`），或者在 `client.ts` 里创建一份传给两边。

---

## 四、文件所有权（三路并行）

| agent | 文件 |
| --- | --- |
| 进度条 | `src/client/progress.ts`（新建）、`src/client/styles.ts` 里只加 `.gs-progress*` 与 `.gs-tool[data-turning]` 段 |
| 缓存 | `src/client/panel-cache.ts`（新建）、`src/client/diff-cache.ts`（新建）、`src/client/panel.ts`、`src/client.ts` 的 client 入口 |
| diff 缓存接入 | `src/client/diff-tab.ts` |
| 测试 | `run/**` |

**不要改**：`src/shared.ts`、`src/remote-descriptor.ts`、`src/host/**`、`package.json`、`build.mjs`、`tsconfig.json`、任何 .md。

**新增 DOM 钩子**（测试依赖）：
- `[data-git-progress]` 进度条容器，`data-active` / `data-infinite` / `data-long-running` / `data-done`
- `[data-git-progress-bit]` 内部那根线
- `[data-git-cache="hit|miss"]` 挂在面板根上，便于断言「第二次打开没有请求」

---

## 五、测试

- `run/cache-test.mjs`：开面板 → 记下请求次数（可用 `page.on('request')` 过滤 Remote 路径）→ 关闭再打开 → 断言没有新请求、渲染一致
- `run/progress-test.mjs`：点刷新 → 断言 `[data-git-progress][data-active]` 出现、`[data-git-refresh][data-turning]` 存在、`animation-name` 是 `gs-progress`、`animation-duration` 是 `4s`、keyframes 里三个 transform 值正确（用 `getComputedStyle` + 读 CSSOM）
- `run/diff-cache-test.mjs`：开一个 diff → 关掉 → 再开 → 断言无新请求

全部轮询等待，不要固定 sleep。

---

## 六、验收标准

1. 打开面板一次，关闭再打开：**零 Remote 请求**，内容立刻呈现
2. 点刷新：顶部出现 2px 横线扫过动画（4s 一轮，中点变宽 3 倍），按钮同时旋转
3. 刷新超过 10 秒：wall-clock 后动画改 `steps(100)`
4. diff 标签页关掉再打开：零请求
5. 所有写操作（暂存/提交/放弃/切换分支…）成功后：用返回的快照更新缓存，**不额外请求**
6. `tsc` 0 错误、`build` 成功、`locale-parity` 全 PASS
