"use strict";
(() => {
  // src/shared.ts
  var REMOTE_NAMESPACE = "gitSidebar";
  var PACKAGE_NAME = "@dsh-plugin/dsh-git-sidebar";
  var PANEL_TAB_ID = "@dsh-plugin/dsh-git-sidebar";
  var PANEL_TAB_KIND = "git-panel";
  var DIFF_TAB_ID = "@dsh-plugin/dsh-git-sidebar/diff";
  var DIFF_TAB_KIND = "git-diff";
  var DIFF_ADDRESS_PREFIX = "dsh-resource://git-diff/";
  function diffAddress(path, staged) {
    return `${DIFF_ADDRESS_PREFIX}${staged ? "staged" : "worktree"}/${encodeURIComponent(path)}`;
  }
  function parseDiffAddress(address) {
    if (!address.startsWith(DIFF_ADDRESS_PREFIX)) return void 0;
    const rest = address.slice(DIFF_ADDRESS_PREFIX.length);
    const slash = rest.indexOf("/");
    if (slash < 0) return void 0;
    const side = rest.slice(0, slash);
    if (side !== "staged" && side !== "worktree") return void 0;
    try {
      return { path: decodeURIComponent(rest.slice(slash + 1)), staged: side === "staged" };
    } catch {
      return void 0;
    }
  }

  // src/remote-descriptor.ts
  function gitSidebarContribution(zod) {
    const resultCodec = (method) => ({
      mode: "strict",
      typeSymbol: `${PACKAGE_NAME}/shared#${method}`,
      create: () => zod.object({})
    });
    const descriptor = (method, shape) => ({
      id: `${PACKAGE_NAME}#${REMOTE_NAMESPACE}/${method}`,
      service: REMOTE_NAMESPACE,
      namespace: REMOTE_NAMESPACE,
      method,
      invocation: { kind: "direct" },
      parameters: [{
        name: "args",
        wire: "args",
        source: "json",
        codec: {
          mode: "strict",
          typeSymbol: `${PACKAGE_NAME}/shared#${method}Args`,
          create: () => zod.object(shape())
        },
        strictCodec: {
          mode: "strict",
          typeSymbol: `${PACKAGE_NAME}/shared#${method}Args`,
          create: () => zod.strictObject(shape())
        }
      }],
      result: resultCodec(method)
    });
    const strings = () => zod.array(zod.string());
    return {
      package: PACKAGE_NAME,
      descriptors: [
        descriptor("status", () => ({ sessionId: zod.string() })),
        descriptor("diff", () => ({ sessionId: zod.string(), path: zod.string(), staged: zod.boolean() })),
        descriptor("stage", () => ({ sessionId: zod.string(), paths: strings() })),
        descriptor("unstage", () => ({ sessionId: zod.string(), paths: strings() })),
        descriptor("discard", () => ({ sessionId: zod.string(), paths: strings(), includeUntracked: zod.boolean() })),
        descriptor("commit", () => ({ sessionId: zod.string(), message: zod.string() }))
      ]
    };
  }

  // src/client/api.ts
  function unavailableSnapshot(message, problem) {
    return {
      kind: "unavailable",
      problem,
      staged: [],
      unstaged: [],
      conflicts: [],
      identity: { name: null, email: null },
      ...message === "" ? {} : { message }
    };
  }
  function messageOf(error) {
    if (error instanceof Error) return error.message;
    return typeof error === "string" ? error : "";
  }
  function resolveZod(module) {
    if (typeof module !== "object" || module === null) return void 0;
    const candidate = module;
    if (typeof candidate.object === "function") return module;
    const fallback = candidate.default;
    if (typeof fallback !== "object" || fallback === null) return void 0;
    if (typeof fallback.object !== "function") return void 0;
    return fallback;
  }
  function mountGitRemote(ctx, zod) {
    const ready = mountNamespace(ctx, zod);
    void ready.catch(() => void 0);
    return { ready };
  }
  async function mountNamespace(ctx, zod) {
    await ctx.remote.$mount(gitSidebarContribution(zod));
    const namespace = ctx.get(`remote.${REMOTE_NAMESPACE}`);
    if (typeof namespace !== "object" || namespace === null) {
      throw new Error(`git-sidebar: the Remote namespace "${REMOTE_NAMESPACE}" did not mount`);
    }
    return createApi(namespace);
  }
  function createApi(remote) {
    return {
      async status(sessionId) {
        try {
          const result = await remote.status({ sessionId });
          if (result.ok) return result.value;
          return unavailableSnapshot(result.error.message, "failed");
        } catch (error) {
          return unavailableSnapshot(messageOf(error), "failed");
        }
      },
      stage(sessionId, paths) {
        return foldWrite(() => remote.stage({ sessionId, paths }));
      },
      unstage(sessionId, paths) {
        return foldWrite(() => remote.unstage({ sessionId, paths }));
      },
      discard(sessionId, paths, includeUntracked) {
        return foldWrite(() => remote.discard({ sessionId, paths, includeUntracked }));
      },
      async commit(sessionId, message) {
        try {
          const result = await remote.commit({ sessionId, message });
          if (result.ok) return result.value;
          return { ok: false, problem: "failed", message: result.error.message };
        } catch (error) {
          return { ok: false, problem: "failed", message: messageOf(error) };
        }
      },
      async requestDiff(args, signal) {
        void signal;
        try {
          const result = await remote.diff(args);
          if (result.ok) return result.value;
          return { kind: "error", message: result.error.message };
        } catch (error) {
          return { kind: "error", message: messageOf(error) };
        }
      }
    };
  }
  async function foldWrite(call) {
    try {
      const result = await call();
      if (result.ok) return result.value;
      return { ok: false, problem: "failed", message: result.error.message };
    } catch (error) {
      return { ok: false, problem: "failed", message: messageOf(error) };
    }
  }

  // src/client/diff-parse.ts
  var HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
  function parseHunkHeader(header) {
    const match = HUNK_HEADER.exec(header);
    if (match === null) return void 0;
    const oldStart = Number(match[1]);
    const oldLines = match[2] === void 0 ? 1 : Number(match[2]);
    const newStart = Number(match[3]);
    const newLines = match[4] === void 0 ? 1 : Number(match[4]);
    if (![oldStart, oldLines, newStart, newLines].every(Number.isFinite)) return void 0;
    return { oldStart, oldLines, newStart, newLines };
  }
  function toRows(hunks) {
    const rows = [];
    for (const hunk of hunks) {
      rows.push({ kind: "hunk-header", text: drawn(hunk.header) });
      const section = hunk.section?.trim() ?? "";
      if (section !== "") rows.push({ kind: "meta", text: section });
      const range = parseHunkHeader(hunk.header);
      let oldNo = range?.oldStart;
      let newNo = range?.newStart;
      for (const line of hunk.lines) {
        const text = drawn(line.text);
        if (line.kind === "added") {
          rows.push({ kind: "added", text, newNo });
          if (newNo !== void 0) newNo += 1;
          continue;
        }
        if (line.kind === "removed") {
          rows.push({ kind: "removed", text, oldNo });
          if (oldNo !== void 0) oldNo += 1;
          continue;
        }
        rows.push({ kind: "context", text, oldNo, newNo });
        if (oldNo !== void 0) oldNo += 1;
        if (newNo !== void 0) newNo += 1;
      }
    }
    return rows;
  }
  function basenameOf(path) {
    const name = path.slice(path.lastIndexOf("/") + 1);
    return name === "" ? path : name;
  }
  function drawn(text) {
    return text.endsWith("\r") ? text.slice(0, -1) : text;
  }

  // src/client/diff-tab.ts
  var DIFF_LOCALE_NS = "git-sidebar-diff";
  var DEFAULT_TITLE = "Diff";
  var DIFF_DICTS = {
    zh: {
      "title": "\u5DEE\u5F02",
      "staged": "\u5DF2\u6682\u5B58",
      "worktree": "\u5DE5\u4F5C\u533A",
      "empty": "\u6CA1\u6709\u5DEE\u5F02",
      "binary": "\u4E8C\u8FDB\u5236\u6587\u4EF6",
      "truncated": "\u5DEE\u5F02\u8FC7\u5927\uFF0C\u5DF2\u622A\u65AD",
      "failed": "\u65E0\u6CD5\u8BFB\u53D6\u8FD9\u4E2A\u6587\u4EF6\u7684\u5DEE\u5F02",
      "unknownTarget": "\u8FD9\u4E2A\u5DEE\u5F02\u6807\u7B7E\u9875\u6CA1\u6709\u5BF9\u5E94\u5230\u6587\u4EF6",
      "unavailable": "\u5DEE\u5F02\u670D\u52A1\u4E0D\u53EF\u7528"
    },
    en: {
      "title": "Diff",
      "staged": "Staged",
      "worktree": "Working tree",
      "empty": "No changes",
      "binary": "Binary file",
      "truncated": "The diff is too large and was truncated",
      "failed": "Could not read this file\u2019s diff",
      "unknownTarget": "This diff tab names no file",
      "unavailable": "The diff service is unavailable"
    }
  };
  var PREFIX = "dsh-gsd";
  var DIFF_TAB_DEFINITION = {
    id: DIFF_TAB_ID,
    kind: DIFF_TAB_KIND,
    multiple: true,
    // Claim this package's resource scheme so a diff opens as a resource tab:
    // that is what gives it a per-file identity and a chip naming the file.
    patterns: [`${DIFF_ADDRESS_PREFIX}**`],
    title: (address) => {
      const parsed = address === void 0 ? void 0 : parseDiffAddress(address);
      return parsed === void 0 ? DEFAULT_TITLE : basenameOf(parsed.path);
    }
  };
  function makeDiffBody(React, runtime) {
    const R = React;
    function DiffPanel(props) {
      const info = props.useTabInfo === void 0 ? void 0 : props.useTabInfo();
      const address = info?.tab.navigation.address ?? "";
      const target = targetOf(address, info?.tab.navigation.params);
      const path = target?.path ?? "";
      const staged = target?.staged === true;
      const revision = info?.tab.navigation.revision ?? 0;
      const sessionId = props.sessionId;
      const requestDiff = props.requestDiff ?? runtime?.requestDiff;
      const t = translator(props.t ?? runtime?.t);
      const [state, setState] = R.useState({ status: "loading" });
      R.useEffect(() => {
        if (requestDiff === void 0 || target === void 0 || sessionId === void 0) return;
        const controller = new AbortController();
        const outer = info?.tab.signal;
        let live = true;
        const stop = () => {
          live = false;
        };
        if (outer !== void 0) outer.addEventListener("abort", stop);
        setState({ status: "loading" });
        void requestDiff({ sessionId, path, staged }, controller.signal).then(
          (payload) => {
            if (live) setState({ status: "ready", payload });
          },
          (error) => {
            if (live) setState({ status: "failed", message: messageOf2(error) });
          }
        );
        return () => {
          live = false;
          outer?.removeEventListener("abort", stop);
          controller.abort();
        };
      }, [address, path, staged, sessionId, requestDiff, revision]);
      const truncated = state.status === "ready" && state.payload.kind === "text" && state.payload.truncated === true;
      return R.createElement(
        "div",
        { className: PREFIX, "data-git-diff": path },
        runtime?.stylesInstalled === true ? null : styleElement(R),
        head(R, t, path, target, state),
        truncated ? banner(R, t("truncated")) : null,
        content(R, t, path, state, target)
      );
    }
    function DiffUnavailable(props) {
      const t = translator(props.t ?? runtime?.t);
      return R.createElement(
        "div",
        { className: PREFIX },
        runtime?.stylesInstalled === true ? null : styleElement(R),
        note(R, t("unavailable"))
      );
    }
    return function DiffBody(props) {
      const typed = props ?? {};
      const usable = typeof typed.useTabInfo === "function" && typeof typed.sessionId === "string" && (typed.requestDiff !== void 0 || runtime?.requestDiff !== void 0);
      return R.createElement(usable ? DiffPanel : DiffUnavailable, typed);
    };
  }
  function head(React, t, path, target, state) {
    const counts = state.status === "ready" && state.payload.kind === "text" ? countOf(state.payload.hunks) : void 0;
    return React.createElement(
      "div",
      { className: `${PREFIX}-head` },
      React.createElement(
        "span",
        { className: `${PREFIX}-path`, title: path },
        path === "" ? t("title") : path
      ),
      target === void 0 ? null : React.createElement("span", { className: `${PREFIX}-side` }, t(target.staged ? "staged" : "worktree")),
      counts === void 0 ? null : React.createElement(
        "span",
        { className: `${PREFIX}-counts` },
        React.createElement("span", { className: `${PREFIX}-tally ${PREFIX}-up` }, `+${counts.added}`),
        React.createElement("span", { className: `${PREFIX}-tally ${PREFIX}-down` }, `-${counts.removed}`)
      )
    );
  }
  function content(React, t, path, state, target) {
    if (target === void 0) return note(React, t("unknownTarget"));
    if (state.status === "loading") return skeleton(React);
    if (state.status === "failed") return note(React, t("failed"), state.message);
    const payload = state.payload;
    if (payload.kind === "error") return note(React, t("failed"), payload.message);
    if (payload.kind === "binary") return note(React, t("binary"), path);
    if (payload.hunks.length === 0) return note(React, t("empty"));
    const rows = toRows(payload.hunks);
    return React.createElement(
      "div",
      { className: `${PREFIX}-body` },
      React.createElement(
        "div",
        { className: `${PREFIX}-rows` },
        ...rows.map((row, index) => drawn2(React, row, index))
      )
    );
  }
  function drawn2(React, row, key) {
    if (row.kind === "hunk-header") {
      return React.createElement("div", { key, className: `${PREFIX}-hunk` }, row.text);
    }
    if (row.kind === "meta") {
      return React.createElement("div", { key, className: `${PREFIX}-meta` }, row.text);
    }
    return React.createElement(
      "div",
      {
        key,
        className: `${PREFIX}-row ${PREFIX}-${row.kind}`,
        "data-git-diff-row": row.kind
      },
      React.createElement("span", { className: `${PREFIX}-no` }, row.oldNo ?? ""),
      React.createElement("span", { className: `${PREFIX}-no` }, row.newNo ?? ""),
      React.createElement("span", { className: `${PREFIX}-sign` }, signOf(row.kind)),
      React.createElement("span", { className: `${PREFIX}-text` }, row.text)
    );
  }
  function signOf(kind) {
    if (kind === "added") return "+";
    if (kind === "removed") return "-";
    return " ";
  }
  function note(React, message, detail) {
    const repeat = detail === void 0 || detail === "" || detail === message;
    return React.createElement(
      "div",
      { className: `${PREFIX}-note`, role: "status" },
      React.createElement("p", { className: `${PREFIX}-line-note` }, message),
      repeat ? null : React.createElement("p", { className: `${PREFIX}-detail` }, detail ?? "")
    );
  }
  function banner(React, text) {
    return React.createElement("p", { className: `${PREFIX}-truncated`, role: "status" }, text);
  }
  function skeleton(React) {
    const widths = [62, 40, 74, 51, 33, 68, 45];
    return React.createElement(
      "div",
      { className: `${PREFIX}-body`, "aria-busy": "true" },
      ...widths.map((width, index) => React.createElement("div", {
        key: index,
        className: `${PREFIX}-skeleton`,
        style: { width: `${width}%` }
      }))
    );
  }
  function styleElement(React) {
    return React.createElement("style", { "data-dsh-git-sidebar-diff": "" }, DIFF_STYLES);
  }
  function countOf(hunks) {
    let added = 0;
    let removed = 0;
    for (const hunk of hunks) {
      for (const line of hunk.lines) {
        if (line.kind === "added") added += 1;
        else if (line.kind === "removed") removed += 1;
      }
    }
    return { added, removed };
  }
  function targetOf(address, params) {
    const parsed = parseDiffAddress(address);
    if (parsed !== void 0) return parsed;
    if (typeof params !== "object" || params === null) return void 0;
    const record = params;
    if (typeof record.path !== "string" || record.path === "") return void 0;
    return { path: record.path, staged: record.staged === true };
  }
  function messageOf2(error) {
    if (error instanceof Error && error.message !== "") return error.message;
    return typeof error === "string" ? error : "";
  }
  function translator(t) {
    return (key) => {
      if (t !== void 0) {
        const text = t(key);
        if (text !== key) return text;
      }
      return DIFF_DICTS.en?.[key] ?? key;
    };
  }
  var DIFF_STYLES = `
.${PREFIX} {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
}
.${PREFIX}-chip {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.${PREFIX}-head {
  display: flex;
  flex: none;
  gap: 8px;
  align-items: baseline;
  box-sizing: border-box;
  min-height: 32px;
  padding: 6px 12px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l3);
  color: var(--dsw-alias-label-secondary);
}
.${PREFIX}-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary);
}
.${PREFIX}-side {
  flex: none;
  padding: 1px 6px;
  border-radius: var(--dsw-radius-xs);
  background: var(--dsw-alias-bg-layer-2);
}
.${PREFIX}-counts {
  flex: none;
  display: flex;
  gap: 6px;
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}
.${PREFIX}-up {
  color: var(--dsw-alias-state-success-primary);
}
.${PREFIX}-down {
  color: var(--dsw-alias-state-error-primary);
}
.${PREFIX}-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
.${PREFIX}-rows {
  display: flex;
  flex-direction: column;
  min-width: min-content;
  padding: 4px 0 12px;
}
.${PREFIX}-row {
  display: flex;
  min-width: max-content;
  line-height: 18px;
}
.${PREFIX}-no {
  flex: none;
  width: 5ch;
  padding-right: 8px;
  text-align: right;
  color: var(--dsw-alias-label-secondary);
  user-select: none;
  font-variant-numeric: tabular-nums;
  font-family: var(--dsh-font-family-code, ui-monospace, monospace);
}
.${PREFIX}-sign {
  flex: none;
  width: 2ch;
  text-align: center;
  user-select: none;
  color: var(--dsw-alias-label-secondary);
  font-family: var(--dsh-font-family-code, ui-monospace, monospace);
}
.${PREFIX}-text {
  flex: 1 1 auto;
  padding-right: 12px;
  white-space: pre;
  tab-size: 4;
  font-family: var(--dsh-font-family-code, ui-monospace, monospace);
  font-size: var(--dsh-code-font-size, 11px);
}
.${PREFIX}-added {
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent);
}
.${PREFIX}-removed {
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);
}
.${PREFIX}-context {
  background: transparent;
}
.${PREFIX}-hunk {
  padding: 2px 12px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-1);
  white-space: pre;
  font-family: var(--dsh-font-family-code, ui-monospace, monospace);
}
.${PREFIX}-meta {
  padding: 0 12px;
  color: var(--dsw-alias-label-secondary);
  font-style: italic;
  white-space: pre;
}
.${PREFIX}-truncated {
  flex: none;
  margin: 8px 12px;
  padding: 4px 8px;
  border-radius: var(--dsw-radius-sm);
  color: var(--dsw-alias-state-warn-primary);
  background: var(--dsw-alias-bg-layer-1);
}
.${PREFIX}-note {
  flex: 1 1 auto;
  padding: 16px 12px;
  color: var(--dsw-alias-label-secondary);
}
.${PREFIX}-line-note {
  margin: 0;
}
.${PREFIX}-detail {
  margin: 6px 0 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--dsh-font-family-code, ui-monospace, monospace);
  font-size: var(--dsh-code-font-size, 11px);
}
.${PREFIX}-skeleton {
  height: 10px;
  margin: 8px 12px;
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-layer-2);
}
`;

  // src/client/icons.ts
  var VIEW_BOX = "0 -960 960 960";
  var ICONS = {
    refresh: "M480-160q-133 0-226.5-93.5T160-480q0-133 93.5-226.5T480-800q85 0 149 34.5T740-671v-129h60v254H546v-60h168q-38-60-97-97t-137-37q-109 0-184.5 75.5T220-480q0 109 75.5 184.5T480-220q83 0 152-47.5T728-393h62q-29 105-115 169t-195 64Z",
    stage: "M450-450H200v-60h250v-250h60v250h250v60H510v250h-60v-250Z",
    unstage: "M259-200v-60h310q70 0 120.5-46.5T740-422q0-69-50.5-115.5T569-584H274l114 114-42 42-186-186 186-186 42 42-114 114h294q95 0 163.5 64T800-422q0 94-68.5 158T568-200H259Z",
    discard: "M261-120q-24.75 0-42.37-17.63Q201-155.25 201-180v-570h-41v-60h188v-30h264v30h188v60h-41v570q0 24-18 42t-42 18H261Zm438-630H261v570h438v-570ZM367-266h60v-399h-60v399Zm166 0h60v-399h-60v399Z",
    diff: "M490-526h60v-84h84v-60h-84v-84h-60v84h-84v60h84v84Zm-84 156h228v-60H406v60ZM260-160q-24 0-42-18t-18-42v-640q0-24 18-42t42-18h348l232 232v468q0 24-18 42t-42 18H260Zm0-60h520v-442L578-860H260v640ZM140-40q-24 0-42-18t-18-42v-619h60v619h498v60H140Zm120-180v-640 640Z"
  };
  function Icon(React, name, props = {}) {
    const labelled = props.label !== void 0;
    return React.createElement("svg", {
      viewBox: VIEW_BOX,
      width: props.size ?? 20,
      height: props.size ?? 20,
      fill: "currentColor",
      focusable: false,
      ...labelled ? { role: "img", "aria-label": props.label } : { "aria-hidden": true }
    }, React.createElement("path", { d: ICONS[name] }));
  }
  function GitGuideIcon(React) {
    return function GitGuideArtwork(props) {
      const size = props.size ?? 26;
      const ink = "#e5522f";
      return React.createElement(
        "svg",
        {
          viewBox: "0 0 36 36",
          width: size,
          height: size,
          className: props.className,
          "aria-hidden": true,
          style: { display: "block" }
        },
        React.createElement("path", {
          d: "M13 9.7v16.6",
          stroke: ink,
          strokeWidth: 2.7,
          strokeLinecap: "round",
          fill: "none"
        }),
        React.createElement("path", {
          d: "M23 9.7v5.4c0 3.3-2.5 5.8-6 5.8H13",
          stroke: ink,
          strokeWidth: 2.7,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          fill: "none"
        }),
        React.createElement("circle", { cx: 13, cy: 9.7, r: 2.7, fill: ink }),
        React.createElement("circle", { cx: 23, cy: 9.7, r: 2.7, fill: ink }),
        React.createElement("circle", { cx: 13, cy: 26.3, r: 2.7, fill: ink })
      );
    };
  }

  // src/client/styles.ts
  var PREFIX2 = "gs";
  var PANEL_STYLES = `
.gs-root {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  color: var(--dsw-alias-label-primary);
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: 1.5;
}

.gs-header {
  display: flex;
  flex: 0 0 auto;
  gap: 4px;
  align-items: center;
  box-sizing: border-box;
  height: 38px;
  padding: 0 6px 0 12px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l3);
}

.gs-branch {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--dsw-alias-brand-primary);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-branch[data-detached] {
  color: var(--dsw-alias-state-warn-primary);
}

.gs-sub {
  flex: none;
  max-width: 40%;
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gs-tool {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 4px;
  color: var(--dsw-alias-label-secondary);
  line-height: 1;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
}

.gs-tool svg {
  width: 20px;
  height: 20px;
}

.gs-tool[data-turning] svg {
  animation: gs-turn 1s linear infinite;
}

.gs-tool:disabled {
  color: var(--dsw-alias-label-dimmed);
  cursor: default;
}

@keyframes gs-turn {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .gs-tool[data-turning] svg {
    animation: none;
    opacity: 0.5;
  }
}

.gs-body {
  display: flex;
  flex: 0 1 auto;
  flex-direction: column;
  min-height: 0;
  padding: 4px 6px 0;
  overflow: auto;
  overscroll-behavior: contain;
}

.gs-group {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  margin: 2px 0 6px;
}

.gs-group-head {
  display: flex;
  gap: 6px;
  align-items: center;
  min-height: 28px;
  padding: 2px 4px 2px 8px;
}

.gs-group-title {
  flex: none;
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  font-weight: 600;
}

.gs-group[data-tone='error'] .gs-group-title {
  color: var(--dsw-alias-state-error-primary);
}

.gs-count {
  flex: none;
  min-width: 16px;
  padding: 0 5px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 16px;
  text-align: center;
  background: color-mix(in srgb, var(--dsw-alias-label-secondary) 12%, transparent);
  border-radius: var(--dsw-radius-xs);
}

.gs-group-actions {
  display: flex;
  flex: none;
  gap: 2px;
  margin-left: auto;
}

.gs-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.gs-row {
  display: flex;
  align-items: center;
  gap: 2px;
  box-sizing: border-box;
  min-height: 30px;
  padding: 0 4px 0 0;
  border-radius: var(--dsw-radius-sm);
}

.gs-open {
  display: flex;
  flex: 1 1 auto;
  gap: 6px;
  align-items: center;
  min-width: 0;
  min-height: 28px;
  padding: 3px 4px 3px 6px;
  color: inherit;
  font: inherit;
  text-align: start;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
}

.gs-open:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -1px;
}

.gs-letter {
  flex: none;
  width: 12px;
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}

.gs-letter[data-status='added'] {
  color: var(--dsw-alias-state-success-primary);
}

.gs-letter[data-status='untracked'] {
  color: var(--dsw-alias-label-tertiary);
}

.gs-letter[data-status='modified'] {
  color: var(--dsw-alias-state-warn-primary);
}

.gs-letter[data-status='deleted'],
.gs-letter[data-status='conflicted'] {
  color: var(--dsw-alias-state-error-primary);
}

.gs-letter[data-status='renamed'] {
  color: var(--dsw-alias-state-business-primary);
}

.gs-name,
.gs-dir {
  display: flex;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.gs-name {
  flex: 0 1 auto;
}

.gs-dir {
  flex: 1 1 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.gs-head {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gs-tail {
  flex: none;
}

.gs-row[data-status='deleted'] .gs-name {
  color: var(--dsw-alias-label-secondary);
}

.gs-row[data-status='conflicted'] .gs-name {
  color: var(--dsw-alias-state-error-primary);
}

.gs-actions {
  display: flex;
  flex: none;
  gap: 1px;
  opacity: 0;
}

.gs-row:hover .gs-actions,
.gs-row:focus-within .gs-actions {
  opacity: 1;
}

/*
 * A pointer that cannot hover leaves the controls hidden, and a reader who does
 * not know they exist never reaches them. A dimmed always-on state keeps the
 * row quiet while still showing that the row can act.
 */
@media (hover: none) {
  .gs-actions {
    opacity: 0.55;
  }

  .gs-row:hover .gs-actions,
  .gs-row:focus-within .gs-actions {
    opacity: 1;
  }
}

.gs-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 2px;
  color: var(--dsw-alias-label-secondary);
  line-height: 1;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-xs);
  cursor: pointer;
}

.gs-action svg {
  width: 20px;
  height: 20px;
}

.gs-action:disabled {
  color: var(--dsw-alias-label-dimmed);
  cursor: default;
}

.gs-action:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}

@media (hover: hover) {
  .gs-row:hover {
    background: var(--dsw-alias-interactive-bg-hover);
  }

  .gs-tool:hover:not(:disabled),
  .gs-action:hover:not(:disabled) {
    color: var(--dsw-alias-label-primary);
    background: var(--dsw-alias-interactive-bg-hover);
  }

  .gs-action[data-danger]:hover:not(:disabled) {
    color: var(--dsw-alias-state-error-primary);
    background: var(--dsw-alias-interactive-bg-hover-danger);
  }

  .gs-commit-submit:hover:not(:disabled) {
    background: var(--dsw-alias-button-primary-hover);
  }
}

/* A touch screen has no hover to reveal the row controls, so they stay shown. */
@media (hover: none) {
  .gs-actions {
    opacity: 1;
  }
}

@media (pointer: coarse) {
  .gs-row,
  .gs-open {
    min-height: 44px;
  }

  .gs-action {
    width: 32px;
    height: 32px;
  }
}

.gs-commit {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 6px;
  padding: 8px 8px 10px;
  border-top: 0.5px solid var(--dsw-alias-border-l3);
}

.gs-commit-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 62px;
  max-height: 40vh;
  padding: 6px 8px;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  resize: vertical;
  background: var(--dsw-alias-bg-layer-1);
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-md);
  outline: none;
}

.gs-commit-input:focus {
  border-color: var(--dsw-alias-state-business-primary);
}

.gs-commit-input::placeholder {
  color: var(--dsw-alias-label-dimmed);
}

.gs-commit-input:disabled {
  color: var(--dsw-alias-label-secondary);
  cursor: default;
}

.gs-commit-foot {
  display: flex;
  gap: 8px;
  align-items: center;
}

.gs-commit-hint {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.gs-commit-hint[data-warn] {
  color: var(--dsw-alias-state-warn-primary);
}

.gs-commit-submit {
  flex: none;
  box-sizing: border-box;
  min-width: 72px;
  height: 28px;
  padding: 0 14px;
  color: var(--dsw-alias-label-primary-foreground);
  font: inherit;
  font-weight: 600;
  background: var(--dsw-alias-button-primary-fill);
  border: 0;
  border-radius: var(--dsw-radius-md);
  cursor: pointer;
}

/*
 * A disabled control keeps its shape: without a border the fill of the resting
 * button disappears against the panel, and the action stops reading as one.
 */
.gs-commit-submit:disabled {
  color: var(--dsw-alias-label-tertiary);
  background: var(--dsw-alias-bg-layer-1);
  border: 0.5px solid var(--dsw-alias-border-l3);
  cursor: default;
}

.gs-commit-submit:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}

.gs-notice {
  margin: 4px 8px 0;
  padding: 6px 8px;
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);
  border-radius: var(--dsw-radius-sm);
  white-space: pre-wrap;
  word-break: break-word;
}

.gs-state {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 6px;
  padding: 16px 12px;
}

.gs-state-title {
  margin: 0;
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}

.gs-state-line {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.gs-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 12px 0;
}

.gs-skeleton-bar {
  height: 10px;
  background: var(--dsw-alias-bg-skeleton);
  border-radius: var(--dsw-radius-xs);
}

.gs-history-slot {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
`;

  // src/client/commit-box.ts
  function blockedReasonKey(props) {
    if (props.busy) return "commit.busy";
    if (props.stagedCount === 0) return "commit.nothingStaged";
    if (props.message.trim() === "") return "commit.emptyMessage";
    return void 0;
  }
  function hintOf(props) {
    const blocked = blockedReasonKey(props);
    if (blocked !== void 0) return props.t(blocked);
    if (props.identityMissing) return props.t("commit.identityMissing");
    return props.t("commit.hint", { count: props.stagedCount });
  }
  function CommitBox(React, props) {
    const { t, busy, identityMissing } = props;
    const blocked = blockedReasonKey(props);
    const submit = () => {
      if (blocked === void 0) props.onSubmit();
    };
    return React.createElement(
      "div",
      { className: `${PREFIX2}-commit` },
      React.createElement("textarea", {
        className: `${PREFIX2}-commit-input`,
        value: props.message,
        placeholder: t("commit.placeholder"),
        "aria-label": t("commit.placeholder"),
        "data-git-message": "",
        rows: 3,
        spellCheck: false,
        disabled: busy,
        onChange: (event) => {
          props.onChange(event.target.value);
        },
        onKeyDown: (event) => {
          if (event.key !== "Enter" || !event.ctrlKey && !event.metaKey) return;
          event.preventDefault();
          submit();
        }
      }),
      React.createElement(
        "div",
        { className: `${PREFIX2}-commit-foot` },
        React.createElement("p", {
          className: `${PREFIX2}-commit-hint`,
          "data-warn": identityMissing ? "" : void 0,
          role: blocked === void 0 ? void 0 : "status"
        }, hintOf(props)),
        React.createElement("button", {
          type: "button",
          className: `${PREFIX2}-commit-submit`,
          "data-git-commit": "",
          disabled: blocked !== void 0,
          title: t("commit.submit"),
          onClick: submit
        }, t("commit.submit"))
      )
    );
  }

  // src/client/dialog.ts
  function nameFiles(t, paths) {
    const first = paths[0] ?? "";
    if (paths.length <= 1) return first;
    if (paths.length <= 5) return paths.join("\n");
    return t("dialog.filesMany", { first, count: paths.length });
  }
  function formatDiscardPrompt(t, prompt) {
    const lines = [t("dialog.discard.title"), "", t("dialog.discard.body"), "", nameFiles(t, prompt.files)];
    if (prompt.untracked.length > 0) {
      lines.push("", t("dialog.discard.untracked"), "", nameFiles(t, prompt.untracked));
    }
    return lines.join("\n");
  }
  function confirmDiscard(t, prompt) {
    return window.confirm(formatDiscardPrompt(t, prompt));
  }

  // src/client/row.ts
  var LETTERS = {
    added: "A",
    modified: "M",
    deleted: "D",
    renamed: "R",
    untracked: "U",
    conflicted: "U"
  };
  var KEPT_END = 12;
  var MIN_HEAD = 8;
  function shortenPath(path) {
    const characters = Array.from(path);
    if (characters.length <= KEPT_END + MIN_HEAD) return { head: path, tail: "" };
    return { head: characters.slice(0, -KEPT_END).join(""), tail: characters.slice(-KEPT_END).join("") };
  }
  function pathParts(path) {
    const slash = path.lastIndexOf("/");
    if (slash < 0) return { directory: "", name: path };
    return { directory: path.slice(0, slash), name: path.slice(slash + 1) };
  }
  function labelOf(t, entry) {
    const from = entry.from;
    if (entry.status === "renamed" && from !== void 0) {
      return {
        name: `${from} \u2192 ${entry.path}`,
        directory: "",
        title: t("row.renamed", { from, path: entry.path })
      };
    }
    const parts = pathParts(entry.path);
    return { name: parts.name, directory: parts.directory, title: entry.path };
  }
  function makeFileRow(React) {
    return function FileRow(props) {
      const { entry, actions, t } = props;
      const label = labelOf(t, entry);
      return React.createElement(
        "li",
        {
          className: `${PREFIX2}-row`,
          "data-git-row": entry.path,
          "data-status": entry.status
        },
        React.createElement(
          "button",
          {
            type: "button",
            className: `${PREFIX2}-open`,
            title: label.title,
            "aria-label": label.title,
            onClick: () => {
              const open = actions.find((action) => action.id === "diff");
              if (open !== void 0) open.run();
            }
          },
          React.createElement("span", {
            className: `${PREFIX2}-letter`,
            "data-status": entry.status,
            "aria-hidden": true
          }, LETTERS[entry.status]),
          shortened(React, `${PREFIX2}-name`, label.name),
          label.directory === "" ? null : shortened(React, `${PREFIX2}-dir`, label.directory)
        ),
        React.createElement(
          "span",
          { className: `${PREFIX2}-actions` },
          ...actions.map((action) => actionButton(React, action))
        )
      );
    };
  }
  function shortened(React, className, text) {
    const parts = shortenPath(text);
    return React.createElement(
      "span",
      { className },
      React.createElement("span", { className: `${PREFIX2}-head` }, parts.head),
      parts.tail === "" ? null : React.createElement("span", { className: `${PREFIX2}-tail` }, parts.tail)
    );
  }
  function actionButton(React, action) {
    return React.createElement("button", {
      key: action.id,
      type: "button",
      className: `${PREFIX2}-action`,
      "aria-label": action.label,
      title: action.label,
      "data-action": action.id,
      "data-git-row-action": action.id,
      ...action.danger === true ? { "data-danger": "" } : {},
      ...action.disabled === true ? { disabled: true } : {},
      onClick: () => {
        action.run();
      }
    }, Icon(React, action.icon));
  }

  // src/client/panel.ts
  var EMPTY_SNAPSHOT = {
    kind: "repository",
    staged: [],
    unstaged: [],
    conflicts: [],
    identity: { name: null, email: null }
  };
  function makePanel(React, runtime) {
    const t = runtime.t;
    const FileRow = makeFileRow(React);
    function GitPanel(props) {
      const sessionId = props.sessionId ?? "";
      const [snapshot, setSnapshot] = React.useState(void 0);
      const [loading, setLoading] = React.useState(true);
      const [busy, setBusy] = React.useState(false);
      const [message, setMessage] = React.useState("");
      const [notice, setNotice] = React.useState("");
      const load = React.useCallback(() => {
        if (sessionId === "") {
          setLoading(false);
          return;
        }
        setLoading(true);
        void runtime.api.ready.then((api) => api.status(sessionId)).catch((error) => unavailableSnapshot(messageOf(error), "failed")).then((next) => {
          setSnapshot(next);
          setLoading(false);
        });
      }, [sessionId]);
      React.useEffect(() => {
        load();
      }, [load]);
      const current = () => snapshot ?? EMPTY_SNAPSHOT;
      const tab = runtime.tab(props);
      const calls = {
        stage: (paths) => runtime.api.ready.then((api) => api.stage(sessionId, paths)),
        unstage: (paths) => runtime.api.ready.then((api) => api.unstage(sessionId, paths)),
        discard: (paths, includeUntracked) => runtime.api.ready.then((api) => api.discard(sessionId, paths, includeUntracked)),
        commit: (text) => runtime.api.ready.then((api) => api.commit(sessionId, text))
      };
      const write = (action, failure) => {
        setNotice("");
        setBusy(true);
        void action().catch((error) => ({ ok: false, problem: "failed", message: messageOf(error) })).then((outcome) => {
          setBusy(false);
          if (outcome.ok) {
            setSnapshot(outcome.snapshot);
            return;
          }
          setNotice(outcome.message === "" ? failure : outcome.message);
        });
      };
      const refresh = () => {
        setNotice("");
        load();
      };
      const stageAll = () => {
        const paths = current().unstaged.map((entry) => entry.path);
        if (paths.length > 0) write(() => calls.stage(paths), t("notice.stageFailed"));
      };
      const unstageAll = () => {
        const paths = current().staged.map((entry) => entry.path);
        if (paths.length > 0) write(() => calls.unstage(paths), t("notice.unstageFailed"));
      };
      const discardUnstaged = () => {
        const entries = current().unstaged;
        if (entries.length === 0) return;
        const files = entries.map((entry) => entry.path);
        const untracked = entries.filter((entry) => entry.status === "untracked").map((entry) => entry.path);
        if (!confirmDiscard(t, { files, untracked })) return;
        write(() => calls.discard(files, true), t("notice.discardFailed"));
      };
      const discardStaged = () => {
        const files = current().staged.map((entry) => entry.path);
        if (files.length === 0) return;
        if (!confirmDiscard(t, { files, untracked: [] })) return;
        write(() => calls.discard(files, false), t("notice.discardFailed"));
      };
      const commit = () => {
        const text = message.trim();
        if (text === "") return;
        setNotice("");
        setBusy(true);
        void calls.commit(text).catch((error) => ({ ok: false, problem: "failed", message: messageOf(error) })).then((outcome) => {
          setBusy(false);
          if (!outcome.ok) {
            setNotice(outcome.message);
            return;
          }
          setSnapshot(outcome.snapshot);
          setMessage("");
        });
      };
      const rowActions = (entry, staged, conflicted) => {
        const openDiff = () => {
          openFileDiff(tab, entry.path, staged);
        };
        const diffAction = { id: "diff", icon: "diff", label: t("row.diff"), run: openDiff };
        if (conflicted) return [diffAction];
        if (staged) {
          return [{
            id: "unstage",
            icon: "unstage",
            label: t("row.unstage"),
            run: () => {
              write(() => calls.unstage([entry.path]), t("notice.unstageFailed"));
            }
          }, diffAction];
        }
        const discard = () => {
          const untracked = entry.status === "untracked";
          if (!confirmDiscard(t, { files: [entry.path], untracked: untracked ? [entry.path] : [] })) return;
          write(() => calls.discard([entry.path], untracked), t("notice.discardFailed"));
        };
        return [{
          id: "stage",
          icon: "stage",
          label: t("row.stage"),
          run: () => {
            write(() => calls.stage([entry.path]), t("notice.stageFailed"));
          }
        }, {
          id: "discard",
          icon: "discard",
          label: t("row.discard"),
          danger: true,
          run: discard
        }, diffAction];
      };
      if (snapshot === void 0) {
        return React.createElement(
          "section",
          {
            className: `${PREFIX2}-root`,
            "data-git-panel": "",
            ...busy ? { "data-git-busy": "" } : {}
          },
          branchHeader(React, t, void 0, loading, refresh),
          sessionId === "" ? stateBlock(React, t("state.noSession.title"), t("state.noSession.body")) : skeleton2(React)
        );
      }
      if (snapshot.kind === "unavailable") {
        const problem = snapshot.problem ?? "failed";
        return React.createElement(
          "section",
          {
            className: `${PREFIX2}-root`,
            "data-git-panel": "",
            "data-problem": problem
          },
          branchHeader(React, t, snapshot, loading, refresh),
          stateBlock(React, t(`state.${problem}.title`), t(`state.${problem}.body`), snapshot.message)
        );
      }
      const total = snapshot.staged.length + snapshot.unstaged.length + snapshot.conflicts.length;
      if (total === 0) {
        return React.createElement(
          "section",
          {
            className: `${PREFIX2}-root`,
            "data-git-panel": "",
            ...busy ? { "data-git-busy": "" } : {}
          },
          branchHeader(React, t, snapshot, loading, refresh),
          notice === "" ? null : React.createElement("p", { className: `${PREFIX2}-notice`, role: "alert" }, notice),
          stateBlock(React, t("state.clean.title"), t("state.clean.body")),
          React.createElement("div", {
            className: `${PREFIX2}-history-slot`,
            "data-git-history-slot": "",
            style: { flex: 1, minHeight: 0, overflow: "auto" }
          })
        );
      }
      return React.createElement(
        "section",
        {
          className: `${PREFIX2}-root`,
          "data-git-panel": "",
          ...busy ? { "data-git-busy": "" } : {}
        },
        branchHeader(React, t, snapshot, loading, refresh),
        React.createElement(
          "div",
          { className: `${PREFIX2}-body` },
          notice === "" ? null : React.createElement("p", { className: `${PREFIX2}-notice`, role: "alert" }, notice),
          changeGroup(React, {
            title: t("group.staged"),
            group: "staged",
            count: snapshot.staged.length,
            rows: snapshot.staged.map((entry) => React.createElement(FileRow, {
              key: `staged:${entry.path}`,
              entry,
              actions: rowActions(entry, true, false),
              t
            })),
            actions: [{
              id: "unstage-all",
              label: t("group.unstageAll"),
              icon: "unstage",
              disabled: busy || snapshot.staged.length === 0,
              run: unstageAll
            }, {
              id: "discard-staged",
              label: t("group.discardStaged"),
              icon: "discard",
              danger: true,
              disabled: busy || snapshot.staged.length === 0,
              run: discardStaged
            }]
          }),
          changeGroup(React, {
            title: t("group.changes"),
            group: "unstaged",
            count: snapshot.unstaged.length,
            rows: snapshot.unstaged.map((entry) => React.createElement(FileRow, {
              key: `changes:${entry.path}`,
              entry,
              actions: rowActions(entry, false, false),
              t
            })),
            actions: [{
              id: "stage-all",
              label: t("group.stageAll"),
              icon: "stage",
              disabled: busy || snapshot.unstaged.length === 0,
              run: stageAll
            }, {
              id: "discard-all",
              label: t("group.discardAll"),
              icon: "discard",
              danger: true,
              disabled: busy || snapshot.unstaged.length === 0,
              run: discardUnstaged
            }]
          }),
          snapshot.conflicts.length === 0 ? null : changeGroup(React, {
            title: t("group.conflicts"),
            group: "conflicts",
            tone: "error",
            count: snapshot.conflicts.length,
            rows: snapshot.conflicts.map((entry) => React.createElement(FileRow, {
              key: `conflicted:${entry.path}`,
              entry,
              actions: rowActions(entry, false, true),
              t
            })),
            actions: []
          })
        ),
        CommitBox(React, {
          message,
          stagedCount: snapshot.staged.length,
          identityMissing: isIdentityMissing(snapshot.identity),
          busy,
          t,
          onChange: setMessage,
          onSubmit: commit
        }),
        // The lower half stays empty in this version: the history view that will
        // fill it owns no state here, and the slot keeps its place in the layout.
        React.createElement("div", {
          className: `${PREFIX2}-history-slot`,
          "data-git-history-slot": "",
          style: { flex: 1, minHeight: 0, overflow: "auto" }
        })
      );
    }
    return GitPanel;
  }
  function openFileDiff(tab, path, staged) {
    if (tab === void 0) return;
    tab.actions.openResource(diffAddress(path, staged), { kind: DIFF_TAB_KIND });
  }
  function lastSegment(path) {
    const trimmed = path.replace(/[\\/]+$/, "");
    const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
    return cut < 0 ? trimmed : trimmed.slice(cut + 1);
  }
  function isIdentityMissing(identity) {
    return identity.name === null || identity.email === null;
  }
  function branchHeader(React, t, snapshot, loading, refresh) {
    const detached = snapshot?.branch === null;
    const label = snapshot === void 0 || snapshot.kind === "unavailable" ? "" : snapshot.branch ?? snapshot.commit ?? t("branch.unknown");
    const root = snapshot?.root;
    return React.createElement(
      "div",
      { className: `${PREFIX2}-header` },
      snapshot === void 0 ? React.createElement("span", { className: `${PREFIX2}-branch`, "aria-busy": "true" }, loading ? "\u2026" : "") : React.createElement("span", {
        className: `${PREFIX2}-branch`,
        "data-git-branch": "",
        "data-detached": detached ? "" : void 0,
        title: root === void 0 || label === "" ? void 0 : `${label}
${root}`
      }, label),
      root === void 0 ? null : React.createElement("span", {
        className: `${PREFIX2}-sub`,
        title: root,
        // The column is narrow, so the reading shows the last segment while the
        // tooltip keeps the whole path.
        "data-full": root
      }, lastSegment(root)),
      React.createElement("button", {
        type: "button",
        className: `${PREFIX2}-tool`,
        "aria-label": t("refresh"),
        title: t("refresh"),
        "data-git-refresh": "",
        "data-turning": loading ? "" : void 0,
        disabled: loading,
        onClick: refresh
      }, Icon(React, "refresh"))
    );
  }
  function changeGroup(React, props) {
    const { title, count, rows, actions, tone } = props;
    return React.createElement(
      "section",
      {
        className: `${PREFIX2}-group`,
        "data-git-group": props.group,
        "data-tone": tone,
        "data-count": count
      },
      React.createElement(
        "div",
        { className: `${PREFIX2}-group-head` },
        React.createElement("h3", { className: `${PREFIX2}-group-title` }, title),
        React.createElement("span", { className: `${PREFIX2}-count` }, String(count)),
        React.createElement(
          "span",
          { className: `${PREFIX2}-group-actions` },
          ...actions.map((action) => groupButton(React, action))
        )
      ),
      rows.length === 0 ? null : React.createElement("ul", { className: `${PREFIX2}-list` }, ...rows)
    );
  }
  function groupButton(React, action) {
    return React.createElement("button", {
      key: action.id,
      type: "button",
      className: `${PREFIX2}-action`,
      "aria-label": action.label,
      title: action.label,
      "data-action": action.id,
      "data-git-action": action.id,
      ...action.danger === true ? { "data-danger": "" } : {},
      ...action.disabled === true ? { disabled: true } : {},
      onClick: action.run
    }, Icon(React, action.icon));
  }
  function stateBlock(React, title, body, detail) {
    const text = detail ?? "";
    return React.createElement(
      "div",
      { className: `${PREFIX2}-state`, role: "status" },
      React.createElement("p", { className: `${PREFIX2}-state-title` }, title),
      React.createElement("p", { className: `${PREFIX2}-state-line` }, body),
      text === "" ? null : React.createElement("p", { className: `${PREFIX2}-state-line` }, text)
    );
  }
  function skeleton2(React) {
    const widths = [46, 70, 58, 34];
    return React.createElement(
      "div",
      { className: `${PREFIX2}-skeleton`, "aria-busy": "true" },
      ...widths.map((width, index) => React.createElement("div", {
        key: index,
        className: `${PREFIX2}-skeleton-bar`,
        style: { width: `${width}%` }
      }))
    );
  }

  // src/client.ts
  var SOURCE = "@dsh-plugin/dsh-git-sidebar";
  var NS = "gitSidebar";
  var loader = globalThis.__ModuleLoader__;
  var DICTS = {
    zh: {
      "panel.label": "Git",
      "guide.title": "Git \u9762\u677F",
      "guide.description": "\u67E5\u770B\u5206\u652F\u3001\u5DE5\u4F5C\u533A\u72B6\u6001\u4E0E\u63D0\u4EA4",
      "refresh": "\u5237\u65B0",
      "branch.unknown": "\u672A\u77E5\u5206\u652F",
      "group.staged": "\u6682\u5B58\u66F4\u6539",
      "group.changes": "\u66F4\u6539",
      "group.conflicts": "\u51B2\u7A81",
      "group.stageAll": "\u5168\u90E8\u6682\u5B58",
      "group.unstageAll": "\u5168\u90E8\u53D6\u6D88\u6682\u5B58",
      "group.discardAll": "\u653E\u5F03\u5168\u90E8\u66F4\u6539",
      "group.discardStaged": "\u653E\u5F03\u5168\u90E8\u6682\u5B58",
      "row.stage": "\u6682\u5B58",
      "row.unstage": "\u53D6\u6D88\u6682\u5B58",
      "row.discard": "\u653E\u5F03\u66F4\u6539",
      "row.diff": "\u67E5\u770B\u5DEE\u5F02",
      "row.renamed": "{from} \u2192 {path}",
      "commit.placeholder": "\u63D0\u4EA4\u4FE1\u606F\uFF08Ctrl+Enter \u63D0\u4EA4\uFF09",
      "commit.submit": "\u63D0\u4EA4",
      "commit.hint": "\u5DF2\u6682\u5B58 {count} \u4E2A\u6587\u4EF6",
      "commit.busy": "\u6B63\u5728\u5904\u7406\u2026",
      "commit.identityMissing": "\u672A\u914D\u7F6E Git \u7528\u6237\u8EAB\u4EFD\uFF0C\u8BF7\u5148\u8BBE\u7F6E user.name \u4E0E user.email",
      "commit.nothingStaged": "\u6682\u5B58\u533A\u4E3A\u7A7A\uFF0C\u8BF7\u5148\u6682\u5B58\u8981\u63D0\u4EA4\u7684\u66F4\u6539",
      "commit.emptyMessage": "\u8BF7\u5148\u586B\u5199\u63D0\u4EA4\u4FE1\u606F",
      "notice.stageFailed": "\u6682\u5B58\u5931\u8D25",
      "notice.unstageFailed": "\u53D6\u6D88\u6682\u5B58\u5931\u8D25",
      "notice.discardFailed": "\u653E\u5F03\u66F4\u6539\u5931\u8D25",
      "state.noSession.title": "\u6CA1\u6709\u53EF\u7528\u7684\u4F1A\u8BDD",
      "state.noSession.body": "\u6253\u5F00\u4E00\u4E2A\u4F1A\u8BDD\u540E\uFF0C\u8FD9\u91CC\u4F1A\u663E\u793A\u8BE5\u4F1A\u8BDD\u5DE5\u4F5C\u76EE\u5F55\u7684 Git \u72B6\u6001\u3002",
      "state.clean.title": "\u6CA1\u6709\u672A\u63D0\u4EA4\u7684\u66F4\u6539",
      "state.clean.body": "\u5DE5\u4F5C\u533A\u4E0E\u6682\u5B58\u533A\u90FD\u4E0E\u5F53\u524D\u63D0\u4EA4\u4E00\u81F4\u3002",
      "state.no-repository.title": "\u8FD9\u91CC\u4E0D\u662F Git \u4ED3\u5E93",
      "state.no-repository.body": "\u53EF\u4EE5\u5728\u8BE5\u76EE\u5F55\u7684\u7EC8\u7AEF\u91CC\u6267\u884C git init \u521B\u5EFA\u4E00\u4E2A\u4ED3\u5E93\uFF0C\u6216\u5207\u6362\u5230\u5176\u4ED6\u5DE5\u4F5C\u76EE\u5F55\u3002",
      "state.no-directory.title": "\u6CA1\u6709\u53EF\u7528\u7684\u5DE5\u4F5C\u76EE\u5F55",
      "state.no-directory.body": "\u8BF7\u4E3A\u4F1A\u8BDD\u9009\u62E9\u4E00\u4E2A\u5DE5\u4F5C\u76EE\u5F55\uFF0C\u518D\u56DE\u5230\u8FD9\u91CC\u3002",
      "state.git-missing.title": "\u627E\u4E0D\u5230 git",
      "state.git-missing.body": "\u8BF7\u5B89\u88C5 Git \u5E76\u786E\u4FDD\u5B83\u4F4D\u4E8E PATH \u4E2D\uFF0C\u7136\u540E\u5237\u65B0\u3002",
      "state.failed.title": "\u65E0\u6CD5\u8BFB\u53D6\u4ED3\u5E93\u72B6\u6001",
      "state.failed.body": "\u8BFB\u53D6 Git \u72B6\u6001\u65F6\u5931\u8D25\uFF0C\u4E0B\u4E00\u6761\u4FE1\u606F\u662F\u5177\u4F53\u539F\u56E0\u3002",
      "dialog.discard.title": "\u653E\u5F03\u8FD9\u4E9B\u66F4\u6539\uFF1F",
      "dialog.discard.body": "\u672A\u6682\u5B58\u7684\u5185\u5BB9\u5C06\u88AB\u8FD8\u539F\u5230\u6700\u8FD1\u4E00\u6B21\u63D0\u4EA4\uFF0C\u6B64\u64CD\u4F5C\u65E0\u6CD5\u64A4\u9500\u3002",
      "dialog.discard.untracked": "\u5176\u4E2D\u5305\u542B\u672A\u8DDF\u8E2A\u7684\u6587\u4EF6\uFF1A\u5B83\u4EEC\u4F1A\u88AB\u76F4\u63A5\u5220\u9664\uFF0C\u65E0\u6CD5\u6062\u590D\u3002",
      "dialog.filesMany": "{first} \u7B49 {count} \u4E2A\u6587\u4EF6"
    },
    en: {
      "panel.label": "Git",
      "guide.title": "Git panel",
      "guide.description": "Inspect branches, working-tree status and commits",
      "refresh": "Refresh",
      "branch.unknown": "Unknown branch",
      "group.staged": "Staged changes",
      "group.changes": "Changes",
      "group.conflicts": "Conflicts",
      "group.stageAll": "Stage all",
      "group.unstageAll": "Unstage all",
      "group.discardAll": "Discard all changes",
      "group.discardStaged": "Discard all staged",
      "row.stage": "Stage",
      "row.unstage": "Unstage",
      "row.discard": "Discard changes",
      "row.diff": "View diff",
      "row.renamed": "{from} \u2192 {path}",
      "commit.placeholder": "Commit message (Ctrl+Enter to commit)",
      "commit.submit": "Commit",
      "commit.hint": "{count} file(s) staged",
      "commit.busy": "Working\u2026",
      "commit.identityMissing": "No Git author is configured; set user.name and user.email first",
      "commit.nothingStaged": "Nothing is staged; stage the changes to commit",
      "commit.emptyMessage": "Write a commit message first",
      "notice.stageFailed": "Could not stage",
      "notice.unstageFailed": "Could not unstage",
      "notice.discardFailed": "Could not discard",
      "state.noSession.title": "No Session to read",
      "state.noSession.body": "Open a Session and this panel shows the Git state of its working directory.",
      "state.clean.title": "No uncommitted changes",
      "state.clean.body": "The working tree and the index both match the current commit.",
      "state.no-repository.title": "This is not a Git repository",
      "state.no-repository.body": "Run git init in a terminal at that directory, or switch to another working directory.",
      "state.no-directory.title": "No working directory",
      "state.no-directory.body": "Choose a working directory for the Session, then come back.",
      "state.git-missing.title": "git was not found",
      "state.git-missing.body": "Install Git and make sure it is on PATH, then refresh.",
      "state.failed.title": "Could not read the repository",
      "state.failed.body": "Reading the Git state failed; the line below is the reason.",
      "dialog.discard.title": "Discard these changes?",
      "dialog.discard.body": "Unstaged content returns to the last commit. This cannot be undone.",
      "dialog.discard.untracked": "Untracked files are among them: they are deleted outright and cannot be restored.",
      "dialog.filesMany": "{first} and {count} files in all"
    }
  };
  function installStyles(ctx, sheet, name) {
    ctx.effect(() => {
      if (typeof document === "undefined") return;
      const tag = document.createElement("style");
      tag.dataset.plugin = SOURCE;
      tag.dataset.pluginCss = `${SOURCE}/${name}`;
      tag.textContent = sheet;
      document.head.appendChild(tag);
      return () => {
        tag.remove();
      };
    }, `git-sidebar: ${name}`);
  }
  function diffReader(remote) {
    return (args) => remote.ready.then((api) => api.requestDiff(args));
  }
  loader.load({
    id: SOURCE,
    factory(requireModule) {
      const React = requireModule("react");
      const zod = resolveZod(requireModule("zod"));
      const GuideIcon = GitGuideIcon(React);
      return {
        inject: ["remote", "slots", "locale", "sidebarRightTabs"],
        apply(ctx) {
          ctx.effect(() => ctx.locale.register(NS, DICTS), "git-sidebar: dictionaries");
          ctx.effect(() => ctx.locale.register(DIFF_LOCALE_NS, DIFF_DICTS), "git-sidebar: diff dictionaries");
          const t = ctx.locale.bind(NS);
          installStyles(ctx, PANEL_STYLES, "panel.css");
          installStyles(ctx, DIFF_STYLES, "diff.css");
          if (zod === void 0) {
            console.error(`git-sidebar: the loader module table has no zod; ${SOURCE} mounts no Remote`);
          }
          const remote = zod === void 0 ? { ready: Promise.reject(new Error("git-sidebar: zod is unavailable")) } : mountGitRemote(ctx, zod);
          void remote.ready.catch(() => void 0);
          ctx.effect(() => ctx.sidebarRightTabs.register({
            id: PANEL_TAB_ID,
            kind: PANEL_TAB_KIND,
            title: () => t("panel.label"),
            guide: [{
              id: "open",
              // Workspace files is 10 and Code review 15: 12 sits directly below
              // the first button.
              order: 12,
              title: () => t("guide.title"),
              description: () => t("guide.description"),
              icon: GuideIcon
            }]
          }), "git-sidebar: tab type");
          const Panel = makePanel(React, {
            api: remote,
            t,
            tab: (props) => props.useTabInfo === void 0 ? void 0 : props.useTabInfo().tab
          });
          ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
            name: "sidebar.right.pane.tab",
            key: PANEL_TAB_ID,
            locale: NS
          }, Panel)), "git-sidebar: panel body");
          const DiffBody = makeDiffBody(React, {
            requestDiff: diffReader(remote),
            t: ctx.locale.bind(DIFF_LOCALE_NS),
            stylesInstalled: true
          });
          ctx.effect(() => ctx.sidebarRightTabs.register(DIFF_TAB_DEFINITION), "git-sidebar: diff tab type");
          ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
            name: "sidebar.right.pane.tab",
            key: DIFF_TAB_ID,
            locale: DIFF_LOCALE_NS
          }, DiffBody)), "git-sidebar: diff body");
        }
      };
    }
  });
})();
