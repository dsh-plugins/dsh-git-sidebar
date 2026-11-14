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
  function commitDiffAddress(sha) {
    return `${DIFF_ADDRESS_PREFIX}commit/${encodeURIComponent(sha)}`;
  }
  function parseCommitDiffAddress(address) {
    const prefix = `${DIFF_ADDRESS_PREFIX}commit/`;
    if (!address.startsWith(prefix)) return void 0;
    const raw = address.slice(prefix.length);
    if (raw.length === 0) return void 0;
    try {
      return decodeURIComponent(raw);
    } catch {
      return void 0;
    }
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
        descriptor("commit", () => ({
          sessionId: zod.string(),
          message: zod.string(),
          amend: zod.boolean().optional(),
          stageAll: zod.boolean().optional()
        })),
        descriptor("history", () => ({ sessionId: zod.string(), limit: zod.number(), skip: zod.number() })),
        descriptor("commitDetail", () => ({ sessionId: zod.string(), sha: zod.string() })),
        descriptor("branches", () => ({ sessionId: zod.string() })),
        descriptor("checkout", () => ({ sessionId: zod.string(), branch: zod.string() })),
        descriptor("createBranch", () => ({ sessionId: zod.string(), name: zod.string(), from: zod.string().optional() })),
        descriptor("stashes", () => ({ sessionId: zod.string() })),
        descriptor("stash", () => ({ sessionId: zod.string(), message: zod.string().optional() })),
        descriptor("stashApply", () => ({
          sessionId: zod.string(),
          index: zod.number(),
          drop: zod.boolean()
        })),
        descriptor("stashDrop", () => ({ sessionId: zod.string(), index: zod.number() })),
        descriptor("sync", () => ({ sessionId: zod.string(), action: zod.string() })),
        descriptor("conflict", () => ({ sessionId: zod.string(), path: zod.string() })),
        descriptor("resolveConflict", () => ({
          sessionId: zod.string(),
          path: zod.string(),
          choices: strings()
        })),
        descriptor("abortOperation", () => ({ sessionId: zod.string() }))
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
      async commit(sessionId, message, options) {
        try {
          const result = await remote.commit({ sessionId, message, ...options });
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
      },
      async history(sessionId, limit, skip) {
        try {
          const result = await remote.history({ sessionId, limit, skip });
          if (result.ok) return result.value;
          return { commits: [], hasMore: false };
        } catch {
          return { commits: [], hasMore: false };
        }
      },
      async requestCommit(args, signal) {
        void signal;
        try {
          const result = await remote.commitDetail(args);
          if (result.ok) return result.value;
          return { kind: "error", message: result.error.message };
        } catch (error) {
          return { kind: "error", message: messageOf(error) };
        }
      },
      async branches(sessionId) {
        try {
          const result = await remote.branches({ sessionId });
          if (result.ok) return result.value;
          return EMPTY_BRANCHES;
        } catch {
          return EMPTY_BRANCHES;
        }
      },
      checkout(sessionId, branch) {
        return foldWrite(() => remote.checkout({ sessionId, branch }));
      },
      createBranch(sessionId, name) {
        return foldWrite(() => remote.createBranch({ sessionId, name }));
      },
      async stashes(sessionId) {
        try {
          const result = await remote.stashes({ sessionId });
          return result.ok ? result.value : [];
        } catch {
          return [];
        }
      },
      stash(sessionId, message) {
        return foldWrite(() => remote.stash(message === void 0 ? { sessionId } : { sessionId, message }));
      },
      stashApply(sessionId, index, drop) {
        return foldWrite(() => remote.stashApply({ sessionId, index, drop }));
      },
      stashDrop(sessionId, index) {
        return foldWrite(() => remote.stashDrop({ sessionId, index }));
      },
      sync(sessionId, action) {
        return foldWrite(() => remote.sync({ sessionId, action }));
      },
      async conflict(sessionId, path) {
        try {
          const result = await remote.conflict({ sessionId, path });
          if (!result.ok) return { kind: "error", message: result.error.message };
          return result.value;
        } catch (error) {
          return { kind: "error", message: messageOf(error) };
        }
      },
      resolveConflict(sessionId, path, choices) {
        return foldWrite(() => remote.resolveConflict({ sessionId, path, choices }));
      },
      abortOperation(sessionId) {
        return foldWrite(() => remote.abortOperation({ sessionId }));
      }
    };
  }
  var EMPTY_BRANCHES = { current: null, local: [], remote: [] };
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
      "commit": "\u63D0\u4EA4",
      "empty": "\u6CA1\u6709\u5DEE\u5F02",
      "binary": "\u4E8C\u8FDB\u5236\u6587\u4EF6",
      "truncated": "\u5DEE\u5F02\u8FC7\u5927\uFF0C\u5DF2\u622A\u65AD",
      "failed": "\u65E0\u6CD5\u8BFB\u53D6\u8FD9\u4E2A\u5DEE\u5F02",
      "commitFailed": "\u65E0\u6CD5\u8BFB\u53D6\u8FD9\u4E2A\u63D0\u4EA4\u7684\u5DEE\u5F02",
      "commitUnavailable": "\u8FD9\u4E2A\u63D0\u4EA4\u7684\u5DEE\u5F02\u6682\u4E0D\u53EF\u7528",
      "unknownTarget": "\u8FD9\u4E2A\u5DEE\u5F02\u6807\u7B7E\u9875\u6CA1\u6709\u5BF9\u5E94\u5230\u6587\u4EF6\u6216\u63D0\u4EA4",
      "unavailable": "\u5DEE\u5F02\u670D\u52A1\u4E0D\u53EF\u7528"
    },
    en: {
      "title": "Diff",
      "staged": "Staged",
      "worktree": "Working tree",
      "commit": "Commit",
      "empty": "No changes",
      "binary": "Binary file",
      "truncated": "The diff is too large and was truncated",
      "failed": "Could not read this diff",
      "commitFailed": "Could not read this commit\u2019s diff",
      "commitUnavailable": "This commit\u2019s diff is unavailable",
      "unknownTarget": "This diff tab names no file or commit",
      "unavailable": "The diff service is unavailable"
    }
  };
  var SHORT_SHA = 7;
  var PREFIX = "dsh-gsd";
  var DIFF_TAB_DEFINITION = {
    id: DIFF_TAB_ID,
    kind: DIFF_TAB_KIND,
    multiple: true,
    // Claim this package's resource scheme so a diff opens as a resource tab:
    // that is what gives it a per-file identity and a chip naming the target.
    patterns: [`${DIFF_ADDRESS_PREFIX}**`],
    title: (address) => {
      const target = address === void 0 ? void 0 : addressTarget(address);
      return target === void 0 ? DEFAULT_TITLE : labelOf(target);
    }
  };
  function makeDiffBody(React, runtime) {
    const R = React;
    function DiffPanel(props) {
      const info = props.useTabInfo === void 0 ? void 0 : props.useTabInfo();
      const address = info?.tab.navigation.address ?? "";
      const target = targetOf(address, info?.tab.navigation.params);
      const revision = info?.tab.navigation.revision ?? 0;
      const sessionId = props.sessionId;
      const requestDiff = props.requestDiff ?? runtime?.requestDiff;
      const requestCommit = props.requestCommit ?? runtime?.requestCommit;
      const t = translator(props.t ?? runtime?.t);
      const [state, setState] = R.useState({ status: "loading" });
      const key = target === void 0 ? "" : targetKey(target);
      const missingReader = target !== void 0 && (target.kind === "commit" ? requestCommit === void 0 : requestDiff === void 0);
      R.useEffect(() => {
        if (sessionId === void 0 || target === void 0 || missingReader) return;
        const controller = new AbortController();
        let pending;
        if (target.kind === "commit") {
          if (requestCommit === void 0) return;
          pending = requestCommit({ sessionId, sha: target.sha }, controller.signal);
        } else {
          if (requestDiff === void 0) return;
          pending = requestDiff({ sessionId, path: target.path, staged: target.staged }, controller.signal);
        }
        const outer = info?.tab.signal;
        let live = true;
        const stop = () => {
          live = false;
        };
        if (outer !== void 0) outer.addEventListener("abort", stop);
        setState({ status: "loading" });
        void pending.then(
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
      }, [address, key, sessionId, requestDiff, requestCommit, revision, missingReader]);
      const truncated = state.status === "ready" && state.payload.kind === "text" && state.payload.truncated === true;
      return R.createElement(
        "div",
        { className: PREFIX, ...identityOf(target) },
        runtime?.stylesInstalled === true ? null : styleElement(R),
        head(R, t, target, state),
        truncated ? banner(R, t("truncated")) : null,
        content(R, t, target, state, missingReader)
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
      const reads = typed.requestDiff !== void 0 || typed.requestCommit !== void 0 || runtime?.requestDiff !== void 0 || runtime?.requestCommit !== void 0;
      const usable = typeof typed.useTabInfo === "function" && typeof typed.sessionId === "string" && reads;
      return R.createElement(usable ? DiffPanel : DiffUnavailable, typed);
    };
  }
  function head(React, t, target, state) {
    const counts = state.status === "ready" && state.payload.kind === "text" ? countOf(state.payload.hunks) : void 0;
    const named = target === void 0 ? "" : target.kind === "file" ? target.path : target.sha;
    const name = named === "" ? t("title") : named;
    return React.createElement(
      "div",
      { className: `${PREFIX}-head` },
      React.createElement("span", { className: `${PREFIX}-path`, title: name }, name),
      target === void 0 ? null : React.createElement("span", { className: `${PREFIX}-side` }, sideOf(t, target)),
      counts === void 0 ? null : React.createElement(
        "span",
        { className: `${PREFIX}-counts` },
        React.createElement("span", { className: `${PREFIX}-tally ${PREFIX}-up` }, `+${counts.added}`),
        React.createElement("span", { className: `${PREFIX}-tally ${PREFIX}-down` }, `-${counts.removed}`)
      )
    );
  }
  function content(React, t, target, state, missingReader) {
    if (target === void 0) return note(React, t("unknownTarget"));
    if (missingReader) {
      return note(React, t(target.kind === "commit" ? "commitUnavailable" : "unavailable"));
    }
    if (state.status === "loading") return skeleton(React);
    const failed = target.kind === "commit" ? t("commitFailed") : t("failed");
    if (state.status === "failed") return note(React, failed, state.message);
    const payload = state.payload;
    if (payload.kind === "error") return note(React, failed, payload.message);
    if (payload.kind === "binary") {
      return note(React, t("binary"), target.kind === "file" ? target.path : target.sha);
    }
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
    const fromAddress = addressTarget(address);
    if (fromAddress !== void 0) return fromAddress;
    if (typeof params !== "object" || params === null) return void 0;
    const record = params;
    const sha = shaOf(record.sha);
    if (sha !== void 0) return { kind: "commit", sha };
    if (typeof record.path !== "string" || record.path === "") return void 0;
    return { kind: "file", path: record.path, staged: record.staged === true };
  }
  function addressTarget(address) {
    const sha = parseCommitDiffAddress(address);
    if (sha !== void 0) return { kind: "commit", sha };
    const parsed = parseDiffAddress(address);
    if (parsed === void 0) return void 0;
    return { kind: "file", path: parsed.path, staged: parsed.staged };
  }
  function shaOf(value) {
    return typeof value === "string" && value.trim() !== "" ? value.trim() : void 0;
  }
  function targetKey(target) {
    return target.kind === "commit" ? `commit:${target.sha}` : `file:${target.staged ? "staged" : "worktree"}:${target.path}`;
  }
  function identityOf(target) {
    if (target === void 0) return { "data-git-diff": "" };
    if (target.kind === "commit") return { "data-git-diff": target.sha, "data-git-diff-commit": target.sha };
    return { "data-git-diff": target.path, "data-git-diff-file": target.path };
  }
  function labelOf(target) {
    return target.kind === "commit" ? shortSha(target.sha) : basenameOf(target.path);
  }
  function shortSha(sha) {
    return sha.slice(0, SHORT_SHA);
  }
  function sideOf(t, target) {
    if (target.kind === "commit") return t("commit");
    return t(target.staged ? "staged" : "worktree");
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
    diff: "M490-526h60v-84h84v-60h-84v-84h-60v84h-84v60h84v84Zm-84 156h228v-60H406v60ZM260-160q-24 0-42-18t-18-42v-640q0-24 18-42t42-18h348l232 232v468q0 24-18 42t-42 18H260Zm0-60h520v-442L578-860H260v640ZM140-40q-24 0-42-18t-18-42v-619h60v619h498v60H140Zm120-180v-640 640Z",
    more: "M240-400q-33 0-56.5-23.5T160-480q0-33 23.5-56.5T240-560q33 0 56.5 23.5T320-480q0 33-23.5 56.5T240-400Zm240 0q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm240 0q-33 0-56.5-23.5T640-480q0-33 23.5-56.5T720-560q33 0 56.5 23.5T800-480q0 33-23.5 56.5T720-400Z",
    chevron: "M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z",
    expand: "M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z",
    check: "M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z",
    stash: "m480-240 160-160-56-56-64 64v-168h-80v168l-64-64-56 56 160 160ZM200-640v440h560v-440H200Zm0 520q-33 0-56.5-23.5T120-200v-499q0-14 4.5-27t13.5-24l50-61q11-14 27.5-21.5T250-840h460q18 0 34.5 7.5T772-811l50 61q9 11 13.5 24t4.5 27v499q0 33-23.5 56.5T760-120H200Zm16-600h528l-34-40H250l-34 40Zm264 300Z",
    apply: "M480-560 320-400l56 56 64-64v168h80v-168l64 64 56-56-160-160Zm-280-80v440h560v-440H200Zm0 520q-33 0-56.5-23.5T120-200v-499q0-14 4.5-27t13.5-24l50-61q11-14 27.5-21.5T250-840h460q18 0 34.5 7.5T772-811l50 61q9 11 13.5 24t4.5 27v499q0 33-23.5 56.5T760-120H200Zm16-600h528l-34-40H250l-34 40Zm264 300Z",
    pop: "M440-320h80v-166l64 62 56-56-160-160-160 160 56 56 64-62v166ZM280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520Zm-400 0v520-520Z",
    sync: "M160-160v-80h110l-16-14q-52-46-73-105t-21-119q0-111 66.5-197.5T400-790v84q-72 26-116 88.5T240-478q0 45 17 87.5t53 78.5l10 10v-98h80v240H160Zm400-10v-84q72-26 116-88.5T720-482q0-45-17-87.5T650-648l-10-10v98h-80v-240h240v80H690l16 14q49 49 71.5 106.5T800-482q0 111-66.5 197.5T560-170Z",
    pull: "M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z",
    push: "M440-320v-326L336-542l-56-58 200-200 200 200-56 58-104-104v326h-80ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z",
    merge: "M160-292q-39 0-66.5-27.5T66-386q0-39 27.5-66.5T160-480q22 0 41.5 9.5T233-444q30-16 51-42t33-60q-25-14-40-39t-15-55q0-39 27.5-66.5T356-734q39 0 66.5 27.5T450-640q0 22-9.5 41.5T414-567q16 30 42 51t60 33q14-25 39-40t55-15q39 0 66.5 27.5T704-444q0 39-27.5 66.5T610-350q-22 0-41.5-9.5T529-392q-30 16-51 42t-33 60q25 14 40 39t15 55q0 39-27.5 66.5T356-102q-39 0-66.5-27.5T262-196q0-22 9.5-41.5T302-274q-16-30-42-51t-60-33q-14 25-39 40t-55 15Z"
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

/* Branch header: the wrap holds the row and the operation bar under it. */
.gs-header-wrap {
  position: relative;
  flex: 0 0 auto;
}

.gs-branch-btn {
  display: inline-flex;
  flex: 0 1 auto;
  gap: 2px;
  align-items: center;
  min-width: 0;
  padding: 2px 4px 2px 6px;
  margin-left: -6px;
  color: var(--dsw-alias-brand-primary);
  font: inherit;
  font-weight: 600;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-xs);
  cursor: pointer;
}

.gs-branch-btn[data-detached] {
  color: var(--dsw-alias-state-warn-primary);
}

.gs-branch-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-branch-btn:focus-visible,
.gs-branch-option:focus-visible,
.gs-menu-item:focus-visible,
.gs-history-title:focus-visible,
.gs-history-more:focus-visible,
.gs-commit-open:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -1px;
}

.gs-upstream {
  display: inline-flex;
  flex: none;
  gap: 4px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.gs-ahead {
  color: var(--dsw-alias-state-success-primary);
}

.gs-behind {
  color: var(--dsw-alias-state-warn-primary);
}

.gs-operation {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
  align-items: center;
  padding: 5px 12px;
  color: var(--dsw-alias-state-warn-primary);
  font-size: 12px;
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent);
}

.gs-operation-text {
  flex: 1 1 auto;
  min-width: 0;
}

.gs-operation-abort {
  flex: none;
  padding: 2px 8px;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  background: transparent;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-xs);
  cursor: pointer;
}

.gs-operation-abort:disabled {
  color: var(--dsw-alias-label-dimmed);
  border-color: var(--dsw-alias-border-l3);
  cursor: default;
}

/* Dropdowns: a full-window backdrop closes them, so no node needs a ref. */

.gs-backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
}

.gs-menu {
  position: absolute;
  top: calc(100% - 4px);
  right: 6px;
  z-index: 21;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  min-width: 180px;
  max-width: min(300px, calc(100vw - 24px));
  max-height: 60vh;
  padding: 4px;
  overflow: auto;
  color: var(--dsw-alias-label-primary);
  /* The shell's own menu surface: translucent over the panel in both palettes,
     where bg-layer-2 equals the panel fill in the light theme. */
  background: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-2));
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-md);
  box-shadow: var(--dsw-elevation-panel, 0 3px 8px rgb(0 0 0 / 12%));
  backdrop-filter: var(--dsw-menu-backdrop-filter, none);
}

.gs-branch-menu {
  right: 6px;
  left: 6px;
  max-width: none;
}

.gs-menu-title {
  margin: 2px 6px 4px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-weight: 600;
}

.gs-menu-note {
  margin: 2px 6px 6px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}

.gs-menu-sep {
  height: 0.5px;
  margin: 4px 2px;
  background: var(--dsw-alias-border-l3);
}

.gs-branch-list {
  display: flex;
  flex-direction: column;
  margin: 0 0 4px;
  padding: 0;
  list-style: none;
}

.gs-branch-option {
  display: flex;
  gap: 6px;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  min-height: 28px;
  padding: 3px 8px 3px 4px;
  color: inherit;
  font: inherit;
  text-align: start;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-xs);
  cursor: pointer;
}

.gs-branch-option[data-current] {
  color: var(--dsw-alias-brand-primary);
  font-weight: 600;
}

.gs-branch-option-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-branch-space {
  flex: none;
  width: 16px;
}

.gs-new-branch {
  display: flex;
  flex: none;
  gap: 4px;
  align-items: center;
  padding: 4px 2px 2px;
  border-top: 0.5px solid var(--dsw-alias-border-l3);
}

.gs-new-branch-input {
  box-sizing: border-box;
  flex: 1 1 auto;
  min-width: 0;
  height: 26px;
  padding: 2px 6px;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  background: var(--dsw-alias-bg-layer-1);
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-xs);
  outline: none;
}

.gs-new-branch-input:focus {
  border-color: var(--dsw-alias-state-business-primary);
}

.gs-new-branch-input::placeholder {
  color: var(--dsw-alias-label-dimmed);
}

.gs-new-branch-create {
  flex: none;
  height: 26px;
  padding: 0 10px;
  color: var(--dsw-alias-label-primary-foreground);
  font: inherit;
  font-size: 12px;
  background: var(--dsw-alias-button-primary-fill);
  border: 0;
  border-radius: var(--dsw-radius-xs);
  cursor: pointer;
}

.gs-new-branch-create:disabled {
  color: var(--dsw-alias-label-tertiary);
  background: var(--dsw-alias-bg-layer-1);
  border: 0.5px solid var(--dsw-alias-border-l3);
  cursor: default;
}

.gs-more-menu {
  min-width: 190px;
}

.gs-menu-item {
  display: flex;
  gap: 8px;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  min-height: 30px;
  padding: 4px 8px;
  color: inherit;
  font: inherit;
  text-align: start;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-xs);
  cursor: pointer;
}

.gs-menu-item svg {
  flex: none;
  width: 18px;
  height: 18px;
  color: var(--dsw-alias-label-secondary);
}

.gs-menu-item:disabled {
  color: var(--dsw-alias-label-dimmed);
  cursor: default;
}

/* History */

.gs-history {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  border-top: 0.5px solid var(--dsw-alias-border-l3);
}

.gs-history-head {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
  align-items: center;
  min-height: 30px;
  padding: 2px 8px 2px 4px;
}

.gs-history-title {
  display: inline-flex;
  flex: none;
  gap: 2px;
  align-items: center;
  padding: 2px 4px;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-xs);
  cursor: pointer;
}

.gs-history-title svg {
  width: 16px;
  height: 16px;
}

.gs-history-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}

.gs-commits {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0 6px 4px;
  list-style: none;
}

.gs-commit {
  display: flex;
  border-radius: var(--dsw-radius-sm);
}

.gs-commit-open {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 2px 6px;
  align-items: baseline;
  min-width: 0;
  padding: 4px 6px;
  color: inherit;
  font: inherit;
  text-align: start;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
}

.gs-sha {
  grid-column: 1;
  color: var(--dsw-alias-label-secondary);
  font-family: var(--dsh-font-family-code, ui-monospace, monospace);
  font-size: 11px;
}

.gs-subject {
  grid-column: 2;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-refs {
  display: flex;
  grid-column: 3;
  grid-row: 1;
  flex-wrap: wrap;
  gap: 3px;
  justify-content: flex-end;
}

.gs-ref {
  max-width: 120px;
  overflow: hidden;
  padding: 0 5px;
  color: var(--dsw-alias-brand-primary);
  font-size: 10px;
  line-height: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent);
  border-radius: var(--dsw-radius-xs);
}

.gs-ref[data-ref='tag'] {
  color: var(--dsw-alias-label-secondary);
  background: color-mix(in srgb, var(--dsw-alias-label-secondary) 14%, transparent);
}

.gs-commit-meta {
  display: flex;
  grid-column: 1 / -1;
  gap: 6px;
  min-width: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.gs-author {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-when {
  flex: none;
  margin-left: auto;
}

.gs-history-note,
.gs-history-end {
  margin: 0;
  padding: 8px 12px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.gs-history-more {
  display: block;
  width: calc(100% - 16px);
  margin: 2px 8px 8px;
  padding: 5px 8px;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  background: transparent;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
}

.gs-history-more:disabled {
  color: var(--dsw-alias-label-dimmed);
  cursor: default;
}

/* Stashes */

.gs-stash-group {
  margin-bottom: 4px;
}

.gs-group-note {
  margin: 0;
  padding: 2px 8px 6px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.gs-stash-open {
  display: flex;
  flex: 1 1 auto;
  gap: 8px;
  align-items: baseline;
  min-width: 0;
  padding: 3px 4px 3px 6px;
}

.gs-stash-subject {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary);
}

.gs-stash-row .gs-actions {
  opacity: 1;
}

@media (hover: hover) {
  .gs-branch-btn:hover:not(:disabled),
  .gs-history-title:hover,
  .gs-menu-item:hover:not(:disabled),
  .gs-branch-option:hover:not(:disabled),
  .gs-history-more:hover:not(:disabled) {
    background: var(--dsw-alias-interactive-bg-hover);
  }

  .gs-commit:hover {
    background: var(--dsw-alias-interactive-bg-hover);
  }

  .gs-branch-option[data-current]:hover:not(:disabled) {
    background: transparent;
  }
}

@media (pointer: coarse) {
  .gs-menu-item,
  .gs-branch-option {
    min-height: 40px;
  }
}
/* The conflict view: two sides per region, each with a choice. */
.gs-conflict {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  padding: 8px;
  gap: 8px;
}

.gs-conflict-head {
  display: flex;
  flex: none;
  gap: 6px;
  align-items: center;
}

.gs-conflict-path {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-conflict-list {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow: auto;
}

.gs-conflict-region {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-md);
}

.gs-conflict-side {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 6px;
  border-radius: var(--dsw-radius-sm);
}

.gs-conflict-side[data-side='ours'] {
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 8%, transparent);
}

.gs-conflict-side[data-side='theirs'] {
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent);
}

.gs-conflict-label {
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-weight: 600;
}

.gs-conflict-text {
  margin: 0;
  overflow-x: auto;
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsh-font-family-code, ui-monospace, monospace);
  font-size: 12px;
  white-space: pre;
}

.gs-conflict-choices {
  display: flex;
  flex: none;
  gap: 4px;
}

.gs-conflict-choice {
  padding: 3px 8px;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  background: var(--dsw-alias-bg-layer-1);
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
}

.gs-conflict-choice[data-active] {
  color: var(--dsw-alias-label-primary-foreground);
  background: var(--dsw-alias-button-primary-fill);
  border-color: transparent;
}

.gs-conflict-choice:disabled {
  cursor: default;
  opacity: 0.6;
}

.gs-conflict-actions {
  display: flex;
  flex: none;
  justify-content: flex-end;
}
`;

  // src/client/branch-header.ts
  function makeBranchHeader(React) {
    return function BranchHeader(props) {
      const { snapshot, loading, busy, t } = props;
      const [menu, setMenu] = React.useState("none");
      const [branches, setBranches] = React.useState(void 0);
      const [draft, setDraft] = React.useState("");
      React.useEffect(() => {
        if (menu !== "branch") return;
        let live = true;
        setBranches(void 0);
        void props.listBranches().then((list) => {
          if (live) setBranches(list);
        }).catch(() => {
          if (live) setBranches(void 0);
        });
        return () => {
          live = false;
        };
      }, [menu]);
      const close = () => {
        setMenu("none");
      };
      const detached = snapshot?.branch === null;
      const usable = snapshot !== void 0 && snapshot.kind === "repository";
      const label = !usable ? "" : snapshot.branch ?? snapshot.commit ?? t("branch.unknown");
      const root = snapshot?.root;
      const upstream = usable ? snapshot.upstream ?? null : null;
      const operation = usable ? snapshot.operation ?? null : null;
      const pick = (branch) => {
        setMenu("none");
        props.checkout(branch);
      };
      const create = () => {
        const name = draft.trim();
        if (name === "") return;
        setMenu("none");
        setDraft("");
        props.createBranch(name);
      };
      return React.createElement(
        "div",
        { className: `${PREFIX2}-header-wrap` },
        React.createElement(
          "div",
          { className: `${PREFIX2}-header` },
          snapshot === void 0 || !usable ? React.createElement("span", {
            className: `${PREFIX2}-branch`,
            "data-git-branch": "",
            "data-git-branch-button": "",
            "data-unusable": "",
            "aria-busy": "true"
          }, snapshot === void 0 ? loading ? "\u2026" : "" : label) : React.createElement(
            "button",
            {
              type: "button",
              className: `${PREFIX2}-branch ${PREFIX2}-branch-btn`,
              "data-git-branch": "",
              "data-git-branch-button": "",
              "data-detached": detached ? "" : void 0,
              "aria-haspopup": "menu",
              "aria-expanded": menu === "branch" ? "true" : "false",
              title: root === void 0 ? label : `${label}
${root}`,
              onClick: () => {
                setMenu(menu === "branch" ? "none" : "branch");
              }
            },
            React.createElement("span", { className: `${PREFIX2}-branch-name` }, label),
            Icon(React, "chevron", { size: 14 })
          ),
          upstreamSits(React, t, upstream),
          root === void 0 ? null : React.createElement("span", {
            className: `${PREFIX2}-sub`,
            title: root,
            // The column is narrow, so the reading shows the last segment while
            // the tooltip keeps the whole path.
            "data-full": root
          }, lastSegment(root)),
          React.createElement("button", {
            type: "button",
            className: `${PREFIX2}-tool`,
            "aria-label": t("more.actions"),
            title: t("more.actions"),
            "data-git-more": "",
            "aria-haspopup": "menu",
            "aria-expanded": menu === "more" ? "true" : "false",
            disabled: !usable || busy,
            onClick: () => {
              setMenu(menu === "more" ? "none" : "more");
            }
          }, Icon(React, "more")),
          React.createElement("button", {
            type: "button",
            className: `${PREFIX2}-tool`,
            "aria-label": t("refresh"),
            title: t("refresh"),
            "data-git-refresh": "",
            "data-turning": loading ? "" : void 0,
            disabled: loading,
            onClick: props.refresh
          }, Icon(React, "refresh")),
          menu === "none" ? null : React.createElement("div", {
            className: `${PREFIX2}-backdrop`,
            "data-git-dismiss": "",
            onClick: close
          }),
          menu === "branch" ? picker(React, props, branches, draft, setDraft, create, pick, busy, close) : null,
          menu === "more" ? operations(React, props, usable, busy, () => {
            setMenu("none");
            props.sync("fetch");
          }, (action) => {
            setMenu("none");
            props.sync(action);
          }, () => {
            setMenu("none");
            props.stash();
          }) : null
        ),
        operation === null ? null : operationBar(React, t, operation, busy, props.abort)
      );
    };
  }
  function upstreamSits(React, t, upstream) {
    if (upstream === null || upstream === void 0) return null;
    if (upstream.ahead === 0 && upstream.behind === 0) return null;
    return React.createElement(
      "span",
      {
        className: `${PREFIX2}-upstream`,
        "data-git-upstream": "",
        title: t("upstream.title", { name: upstream.name })
      },
      upstream.ahead === 0 ? null : React.createElement("span", { className: `${PREFIX2}-ahead`, "data-count": "ahead" }, `\u2191${upstream.ahead}`),
      upstream.behind === 0 ? null : React.createElement("span", { className: `${PREFIX2}-behind`, "data-count": "behind" }, `\u2193${upstream.behind}`)
    );
  }
  function operationBar(React, t, operation, busy, abort) {
    return React.createElement(
      "div",
      { className: `${PREFIX2}-operation`, "data-git-operation": operation },
      React.createElement(
        "span",
        { className: `${PREFIX2}-operation-text` },
        t(`operation.${operation}`, { operation })
      ),
      React.createElement("button", {
        type: "button",
        className: `${PREFIX2}-operation-abort`,
        "data-git-abort": "",
        disabled: busy,
        title: t("operation.abort"),
        onClick: abort
      }, t("operation.abort"))
    );
  }
  function picker(React, props, branches, draft, setDraft, create, pick, busy, close) {
    const { t } = props;
    const current = branches?.current ?? null;
    const local = branches?.local ?? [];
    return React.createElement(
      "div",
      {
        className: `${PREFIX2}-menu ${PREFIX2}-branch-menu`,
        "data-git-branch-menu": "",
        role: "menu"
      },
      React.createElement("p", { className: `${PREFIX2}-menu-title` }, t("branch.selector")),
      branches === void 0 ? React.createElement("p", { className: `${PREFIX2}-menu-note`, role: "status" }, t("branch.loading")) : local.length === 0 ? React.createElement("p", { className: `${PREFIX2}-menu-note`, role: "status" }, t("branch.empty")) : React.createElement(
        "ul",
        { className: `${PREFIX2}-branch-list` },
        ...local.map((name) => React.createElement(
          "li",
          { key: name },
          React.createElement(
            "button",
            {
              type: "button",
              className: `${PREFIX2}-branch-option`,
              "data-git-branch-option": name,
              "data-current": name === current ? "" : void 0,
              role: "menuitemradio",
              "aria-checked": name === current ? "true" : "false",
              disabled: busy || name === current,
              title: name,
              onClick: () => {
                pick(name);
              }
            },
            name === current ? Icon(React, "check", { size: 16 }) : React.createElement("span", {
              className: `${PREFIX2}-branch-space`
            }),
            React.createElement("span", { className: `${PREFIX2}-branch-option-name` }, name)
          )
        ))
      ),
      React.createElement(
        "div",
        { className: `${PREFIX2}-new-branch` },
        React.createElement("input", {
          type: "text",
          className: `${PREFIX2}-new-branch-input`,
          "data-git-new-branch": "",
          value: draft,
          placeholder: t("branch.newPlaceholder"),
          "aria-label": t("branch.newPlaceholder"),
          spellCheck: false,
          disabled: busy,
          onChange: (event) => {
            setDraft(event.target.value);
          },
          onKeyDown: (event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              create();
            } else if (event.key === "Escape") {
              event.preventDefault();
              close();
            }
          }
        }),
        React.createElement("button", {
          type: "button",
          className: `${PREFIX2}-new-branch-create`,
          "data-git-create-branch": "",
          disabled: busy || draft.trim() === "",
          title: t("branch.create"),
          onClick: create
        }, t("branch.create"))
      )
    );
  }
  function operations(React, props, usable, busy, fetch, sync, stash) {
    const { t } = props;
    const items = [
      { id: "fetch", icon: "sync", label: t("sync.fetch"), run: fetch },
      { id: "pull", icon: "pull", label: t("sync.pull"), run: () => {
        sync("pull");
      } },
      { id: "push", icon: "push", label: t("sync.push"), run: () => {
        sync("push");
      } }
    ];
    return React.createElement(
      "div",
      {
        className: `${PREFIX2}-menu ${PREFIX2}-more-menu`,
        "data-git-more-menu": "",
        role: "menu"
      },
      ...items.map((item) => React.createElement("button", {
        key: item.id,
        type: "button",
        className: `${PREFIX2}-menu-item`,
        "data-git-sync": item.id,
        role: "menuitem",
        disabled: busy || !usable,
        onClick: item.run
      }, Icon(React, item.icon), React.createElement("span", null, item.label))),
      React.createElement("span", { className: `${PREFIX2}-menu-sep`, role: "separator" }),
      React.createElement("button", {
        type: "button",
        className: `${PREFIX2}-menu-item`,
        "data-git-stash-new": "",
        role: "menuitem",
        disabled: busy || !usable,
        onClick: stash
      }, Icon(React, "stash"), React.createElement("span", null, t("stash.current")))
    );
  }
  function lastSegment(path) {
    const trimmed = path.replace(/[\\/]+$/, "");
    const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
    return cut < 0 ? trimmed : trimmed.slice(cut + 1);
  }

  // src/client/commit-box.ts
  function blockedReasonKey(props) {
    if (props.busy) return "commit.busy";
    if (props.clean && !props.amend) return "commit.clean";
    if (props.stagedCount === 0 && !props.amend && props.unstagedCount === 0) return "commit.nothingStaged";
    if (props.message.trim() === "") return "commit.emptyMessage";
    return void 0;
  }
  function hintOf(props) {
    const blocked = blockedReasonKey(props);
    if (blocked !== void 0) return props.t(blocked);
    if (props.identityMissing) return props.t("commit.identityMissing");
    if (props.amend) return props.t("commit.amendHint");
    if (props.stagedCount === 0) return props.t("commit.stageAllHint", { count: props.unstagedCount });
    return props.t("commit.hint", { count: props.stagedCount });
  }
  function CommitBox(React, props) {
    const { t, busy, identityMissing, canAmend } = props;
    const blocked = blockedReasonKey(props);
    const submit = () => {
      if (blocked === void 0) props.onSubmit(props.stagedCount === 0);
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
        canAmend ? React.createElement(
          "label",
          { className: `${PREFIX2}-commit-amend` },
          React.createElement("input", {
            type: "checkbox",
            "data-git-amend": "",
            checked: props.amend,
            disabled: busy,
            onChange: (event) => {
              props.onAmendChange(event.target.checked);
            }
          }),
          React.createElement("span", null, t("commit.amend"))
        ) : null,
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
          title: props.stagedCount === 0 ? t("commit.stageAllSubmit") : t("commit.submit"),
          onClick: submit
        }, props.stagedCount === 0 ? t("commit.stageAllSubmit") : t("commit.submit"))
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
  function formatStashPrompt(t, prompt) {
    const lines = [
      t(prompt.action === "pop" ? "dialog.stash.popTitle" : "dialog.stash.dropTitle"),
      "",
      t(prompt.action === "pop" ? "dialog.stash.popBody" : "dialog.stash.dropBody"),
      "",
      `stash@{${prompt.index}}  ${prompt.subject}`
    ];
    return lines.join("\n");
  }
  function confirmStash(t, prompt) {
    return window.confirm(formatStashPrompt(t, prompt));
  }
  function formatSyncPrompt(t, action, upstream) {
    const name = upstream ?? t("sync.noUpstream");
    return [
      t(action === "pull" ? "dialog.pull.title" : "dialog.push.title"),
      "",
      t(action === "pull" ? "dialog.pull.body" : "dialog.push.body", { name })
    ].join("\n");
  }
  function confirmSync(t, action, upstream) {
    return window.confirm(formatSyncPrompt(t, action, upstream));
  }
  function confirmAbort(t, operation) {
    return window.confirm(t("dialog.abort", { operation }));
  }
  function notify(message) {
    window.alert(message);
  }

  // src/client/history.ts
  var PAGE = 20;
  function makeHistory(React) {
    return function History(props) {
      const { t, open } = props;
      const [commits, setCommits] = React.useState([]);
      const [hasMore, setHasMore] = React.useState(false);
      const [loading, setLoading] = React.useState(false);
      const [failed, setFailed] = React.useState(false);
      const [gate] = React.useState({ reading: false });
      const asked = commits.length;
      const read = React.useCallback((skip) => {
        if (gate.reading) return;
        gate.reading = true;
        setLoading(true);
        setFailed(false);
        void props.load(PAGE, skip).then((page) => {
          setCommits((previous) => skip === 0 ? page.commits : [...previous, ...page.commits]);
          setHasMore(page.hasMore);
          setLoading(false);
        }).catch(() => {
          setFailed(true);
          setLoading(false);
        }).then(() => {
          gate.reading = false;
        });
      }, []);
      React.useEffect(() => {
        if (!open) return;
        read(0);
      }, [open, props.revision]);
      const more = () => {
        if (loading || !hasMore) return;
        read(asked);
      };
      const onScroll = (event) => {
        const node = event.currentTarget;
        if (node.scrollTop + node.clientHeight < node.scrollHeight - 24) return;
        more();
      };
      return React.createElement(
        "section",
        {
          className: `${PREFIX2}-history`,
          "data-git-history": "",
          "data-open": open ? "" : void 0
        },
        React.createElement(
          "div",
          { className: `${PREFIX2}-history-head` },
          React.createElement(
            "button",
            {
              type: "button",
              className: `${PREFIX2}-history-title`,
              "data-git-history-toggle": "",
              "aria-expanded": open ? "true" : "false",
              title: t(open ? "history.collapse" : "history.expand"),
              onClick: props.onToggle
            },
            Icon(React, open ? "expand" : "chevron", { size: 16 }),
            React.createElement("h3", { className: `${PREFIX2}-group-title` }, t("history.title"))
          ),
          commits.length === 0 ? null : React.createElement("span", { className: `${PREFIX2}-count` }, String(commits.length))
        ),
        open ? historyBody(React, props, commits, hasMore, loading, failed, more, onScroll) : null
      );
    };
  }
  function historyBody(React, props, commits, hasMore, loading, failed, more, onScroll) {
    const { t, tab } = props;
    if (failed) {
      return React.createElement("p", { className: `${PREFIX2}-history-note`, role: "status" }, t("history.failed"));
    }
    if (commits.length === 0) {
      return React.createElement(
        "p",
        { className: `${PREFIX2}-history-note`, role: "status" },
        loading ? t("history.loading") : t("history.empty")
      );
    }
    return React.createElement(
      "div",
      { className: `${PREFIX2}-history-body`, onScroll },
      React.createElement(
        "ul",
        { className: `${PREFIX2}-commits` },
        ...commits.map((commit) => commitRow(React, t, tab, commit))
      ),
      hasMore ? React.createElement("button", {
        type: "button",
        className: `${PREFIX2}-history-more`,
        "data-git-history-more": "",
        disabled: loading,
        onClick: more
      }, loading ? t("history.loading") : t("history.more")) : React.createElement(
        "p",
        { className: `${PREFIX2}-history-end`, "data-git-history-end": "" },
        t("history.end")
      )
    );
  }
  function commitRow(React, t, tab, commit) {
    const open = () => {
      if (tab === void 0) return;
      tab.actions.openResource(commitDiffAddress(commit.sha), { kind: DIFF_TAB_KIND });
    };
    return React.createElement(
      "li",
      { key: commit.sha, className: `${PREFIX2}-commit` },
      React.createElement(
        "button",
        {
          type: "button",
          className: `${PREFIX2}-commit-open`,
          "data-git-history-row": commit.sha,
          title: `${commit.short} ${commit.subject}`,
          onClick: open
        },
        React.createElement("span", { className: `${PREFIX2}-sha` }, commit.short),
        React.createElement("span", { className: `${PREFIX2}-subject` }, commit.subject),
        commit.refs.length === 0 ? null : React.createElement(
          "span",
          { className: `${PREFIX2}-refs` },
          ...commit.refs.map((ref) => React.createElement("span", {
            key: ref,
            className: `${PREFIX2}-ref`,
            "data-ref": refKind(ref)
          }, refName(ref)))
        ),
        React.createElement(
          "span",
          { className: `${PREFIX2}-commit-meta` },
          React.createElement("span", { className: `${PREFIX2}-author` }, commit.author),
          React.createElement(
            "span",
            { className: `${PREFIX2}-when`, title: commit.when },
            relativeTime(t, commit.when)
          )
        )
      )
    );
  }
  function refKind(ref) {
    return ref.startsWith("tag: ") ? "tag" : "branch";
  }
  function refName(ref) {
    const tag = "tag: ";
    return ref.startsWith(tag) ? ref.slice(tag.length) : ref;
  }
  function relativeTime(t, when) {
    const then = Date.parse(when);
    if (!Number.isFinite(then)) return when;
    const seconds = Math.max(0, Math.round((Date.now() - then) / 1e3));
    if (seconds < 60) return t("history.justNow");
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return t("history.minutesAgo", { count: minutes });
    const hours = Math.round(minutes / 60);
    if (hours < 24) return t("history.hoursAgo", { count: hours });
    const days = Math.round(hours / 24);
    if (days < 30) return t("history.daysAgo", { count: days });
    const months = Math.round(days / 30);
    if (months < 12) return t("history.monthsAgo", { count: months });
    return t("history.yearsAgo", { count: Math.round(months / 12) });
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
  function labelOf2(t, entry) {
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
      const label = labelOf2(t, entry);
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
              const open = actions.find((action) => action.id === "resolve") ?? actions.find((action) => action.id === "diff");
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

  // src/client/stash-group.ts
  function makeStashGroup(React) {
    function StashRow(props) {
      const { entry, t, busy } = props;
      const ask = (prompt, run) => {
        if (!confirmStash(t, prompt)) return;
        run();
      };
      const actions = [{
        id: "apply",
        icon: "apply",
        label: t("stash.apply"),
        run: () => {
          props.apply(entry.index);
        }
      }, {
        id: "pop",
        icon: "pop",
        label: t("stash.pop"),
        run: () => {
          ask({ action: "pop", subject: entry.subject, index: entry.index }, () => {
            props.pop(entry.index);
          });
        }
      }, {
        id: "drop",
        icon: "discard",
        label: t("stash.drop"),
        danger: true,
        run: () => {
          ask({ action: "drop", subject: entry.subject, index: entry.index }, () => {
            props.drop(entry.index);
          });
        }
      }];
      return React.createElement(
        "li",
        {
          className: `${PREFIX2}-row ${PREFIX2}-stash-row`,
          "data-git-stash-row": String(entry.index)
        },
        React.createElement(
          "span",
          { className: `${PREFIX2}-stash-open`, title: entry.subject },
          React.createElement("span", { className: `${PREFIX2}-sha` }, `stash@{${entry.index}}`),
          React.createElement("span", { className: `${PREFIX2}-stash-subject` }, entry.subject)
        ),
        React.createElement(
          "span",
          { className: `${PREFIX2}-actions` },
          ...actions.map((action) => React.createElement("button", {
            key: action.id,
            type: "button",
            className: `${PREFIX2}-action`,
            "aria-label": action.label,
            title: action.label,
            "data-git-stash-action": action.id,
            ...action.danger === true ? { "data-danger": "" } : {},
            disabled: busy,
            onClick: action.run
          }, Icon(React, action.icon)))
        )
      );
    }
    function StashGroup(props) {
      const { entries, canStash, busy, t } = props;
      if (entries.length === 0 && !canStash) return null;
      return React.createElement(
        "section",
        {
          className: `${PREFIX2}-group ${PREFIX2}-stash-group`,
          "data-git-stash": "",
          "data-count": entries.length
        },
        React.createElement(
          "div",
          { className: `${PREFIX2}-group-head` },
          React.createElement("h3", { className: `${PREFIX2}-group-title` }, t("stash.group")),
          React.createElement("span", { className: `${PREFIX2}-count` }, String(entries.length)),
          React.createElement(
            "span",
            { className: `${PREFIX2}-group-actions` },
            React.createElement("button", {
              type: "button",
              className: `${PREFIX2}-action`,
              "aria-label": t("stash.current"),
              title: canStash ? t("stash.current") : t("stash.currentDisabled"),
              "data-action": "stash-current",
              "data-git-action": "stash-current",
              "data-git-stash-current": "",
              disabled: busy || !canStash,
              onClick: props.stash
            }, Icon(React, "stash"))
          )
        ),
        entries.length === 0 ? React.createElement("p", { className: `${PREFIX2}-group-note`, role: "status" }, t("stash.empty")) : React.createElement(
          "ul",
          { className: `${PREFIX2}-list` },
          ...entries.map((entry) => React.createElement(StashRow, {
            key: `${entry.index}:${entry.subject}`,
            entry,
            ...props
          }))
        )
      );
    }
    return StashGroup;
  }

  // src/client/conflict-view.ts
  var CHOICES = [
    { id: "ours", key: "conflict.ours" },
    { id: "theirs", key: "conflict.theirs" },
    { id: "both", key: "conflict.both" }
  ];
  function makeConflictView(React) {
    function Region(props) {
      const { segment, index, choice, busy, t } = props;
      return React.createElement(
        "div",
        {
          className: `${PREFIX2}-conflict-region`,
          "data-git-conflict-region": String(index),
          "data-choice": choice
        },
        React.createElement(
          "div",
          { className: `${PREFIX2}-conflict-side`, "data-side": "ours" },
          React.createElement(
            "span",
            { className: `${PREFIX2}-conflict-label` },
            segment.oursLabel === "" ? t("conflict.ours") : segment.oursLabel
          ),
          React.createElement("pre", { className: `${PREFIX2}-conflict-text` }, segment.ours.join("\n"))
        ),
        React.createElement(
          "div",
          { className: `${PREFIX2}-conflict-side`, "data-side": "theirs" },
          React.createElement(
            "span",
            { className: `${PREFIX2}-conflict-label` },
            segment.theirsLabel === "" ? t("conflict.theirs") : segment.theirsLabel
          ),
          React.createElement("pre", { className: `${PREFIX2}-conflict-text` }, segment.theirs.join("\n"))
        ),
        React.createElement(
          "div",
          { className: `${PREFIX2}-conflict-choices` },
          ...CHOICES.map((entry) => React.createElement("button", {
            key: entry.id,
            type: "button",
            className: `${PREFIX2}-conflict-choice`,
            "data-git-conflict-choice": entry.id,
            "aria-pressed": choice === entry.id ? "true" : "false",
            "data-active": choice === entry.id ? "" : void 0,
            disabled: busy,
            onClick: () => {
              props.choose(index, entry.id);
            }
          }, t(entry.key)))
        )
      );
    }
    return function ConflictView(props) {
      const { path, content: content2, busy, t, choices } = props;
      const regions = content2 !== void 0 && content2.kind === "marked" ? content2.segments.filter((segment) => segment.kind === "conflict") : [];
      const head2 = React.createElement(
        "div",
        { className: `${PREFIX2}-conflict-head` },
        React.createElement("span", { className: `${PREFIX2}-conflict-path`, title: path }, path),
        React.createElement("button", {
          type: "button",
          className: `${PREFIX2}-tool`,
          "aria-label": t("conflict.close"),
          title: t("conflict.close"),
          onClick: props.close
        }, Icon(React, "chevron", { size: 14 }))
      );
      if (content2 === void 0) {
        return React.createElement(
          "section",
          { className: `${PREFIX2}-conflict`, "data-git-conflict": path },
          head2,
          React.createElement("p", { className: `${PREFIX2}-state-line`, role: "status" }, t("conflict.loading"))
        );
      }
      if (content2.kind === "error") {
        return React.createElement(
          "section",
          { className: `${PREFIX2}-conflict`, "data-git-conflict": path },
          head2,
          React.createElement("p", { className: `${PREFIX2}-state-line`, role: "alert" }, content2.message)
        );
      }
      if (content2.kind === "resolved") {
        return React.createElement(
          "section",
          { className: `${PREFIX2}-conflict`, "data-git-conflict": path },
          head2,
          React.createElement("p", { className: `${PREFIX2}-state-line`, role: "status" }, t("conflict.clean")),
          React.createElement(
            "div",
            { className: `${PREFIX2}-conflict-actions` },
            React.createElement("button", {
              type: "button",
              className: `${PREFIX2}-commit-submit`,
              "data-git-conflict-submit": "",
              disabled: busy,
              onClick: props.submit
            }, t("conflict.markResolved"))
          )
        );
      }
      return React.createElement(
        "section",
        { className: `${PREFIX2}-conflict`, "data-git-conflict": path },
        head2,
        React.createElement(
          "div",
          { className: `${PREFIX2}-conflict-list` },
          ...regions.map((segment, index) => React.createElement(Region, {
            key: index,
            segment,
            index,
            choice: regionChoice(choices, index),
            busy,
            t,
            choose: props.choose
          }))
        ),
        React.createElement(
          "div",
          { className: `${PREFIX2}-conflict-actions` },
          React.createElement("button", {
            type: "button",
            className: `${PREFIX2}-commit-submit`,
            "data-git-conflict-submit": "",
            disabled: busy,
            onClick: props.submit
          }, t("conflict.markResolved"))
        )
      );
    };
  }
  function regionChoice(choices, index) {
    return choices[index] ?? "both";
  }
  function conflictNotice(outcome, t) {
    return outcome.ok ? "" : outcome.message === "" ? t("notice.resolveFailed") : outcome.message;
  }

  // src/client/panel.ts
  var EMPTY_SNAPSHOT = {
    kind: "repository",
    staged: [],
    unstaged: [],
    conflicts: [],
    identity: { name: null, email: null }
  };
  var EMPTY_BRANCHES2 = { current: null, local: [], remote: [] };
  var EMPTY_PAGE = { commits: [], hasMore: false };
  var REFUSAL_ALERTS = /* @__PURE__ */ new Set(["dirty", "exists", "invalid-name"]);
  function defaultChoices(content2) {
    if (content2.kind !== "marked") return [];
    const regions = content2.segments.filter((segment) => segment.kind === "conflict");
    return regions.map(() => "both");
  }
  function makePanel(React, runtime) {
    const t = runtime.t;
    const FileRow = makeFileRow(React);
    const BranchHeader = makeBranchHeader(React);
    const StashGroup = makeStashGroup(React);
    const History = makeHistory(React);
    function GitPanel(props) {
      const sessionId = props.sessionId ?? "";
      const [snapshot, setSnapshot] = React.useState(void 0);
      const [loading, setLoading] = React.useState(true);
      const [busy, setBusy] = React.useState(false);
      const [message, setMessage] = React.useState("");
      const [amend, setAmend] = React.useState(false);
      const [notice, setNotice] = React.useState("");
      const [stashes, setStashes] = React.useState([]);
      const [historyOpen, setHistoryOpen] = React.useState(true);
      const [conflict, setConflict] = React.useState(null);
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
      const loadStashes = React.useCallback(() => {
        if (sessionId === "") return;
        void runtime.api.ready.then((api) => api.stashes(sessionId)).catch(() => []).then(setStashes);
      }, [sessionId]);
      React.useEffect(() => {
        loadStashes();
      }, [loadStashes]);
      const current = () => snapshot ?? EMPTY_SNAPSHOT;
      const tab = runtime.tab(props);
      const calls = {
        stage: (paths) => runtime.api.ready.then((api) => api.stage(sessionId, paths)),
        unstage: (paths) => runtime.api.ready.then((api) => api.unstage(sessionId, paths)),
        discard: (paths, includeUntracked) => runtime.api.ready.then((api) => api.discard(sessionId, paths, includeUntracked)),
        commit: (text, options) => runtime.api.ready.then((api) => api.commit(sessionId, text, options)),
        branches: () => runtime.api.ready.then((api) => api.branches(sessionId)).catch(() => EMPTY_BRANCHES2),
        checkout: (branch) => runtime.api.ready.then((api) => api.checkout(sessionId, branch)),
        createBranch: (name) => runtime.api.ready.then((api) => api.createBranch(sessionId, name)),
        stash: () => runtime.api.ready.then((api) => api.stash(sessionId)),
        stashApply: (index, drop) => runtime.api.ready.then((api) => api.stashApply(sessionId, index, drop)),
        stashDrop: (index) => runtime.api.ready.then((api) => api.stashDrop(sessionId, index)),
        sync: (action) => runtime.api.ready.then((api) => api.sync(sessionId, action)),
        history: (limit, skip) => runtime.api.ready.then((api) => api.history(sessionId, limit, skip)).catch(() => EMPTY_PAGE)
      };
      const write = (action, failure) => {
        setNotice("");
        setBusy(true);
        void action().catch((error) => ({ ok: false, problem: "failed", message: messageOf(error) })).then((outcome) => {
          setBusy(false);
          if (outcome.ok) {
            setSnapshot(outcome.snapshot);
            loadStashes();
            return;
          }
          const text = refusalText(t, outcome.problem, outcome.message, failure);
          setNotice(text);
          if (REFUSAL_ALERTS.has(outcome.problem)) notify(text);
        });
      };
      const refresh = () => {
        setNotice("");
        load();
        loadStashes();
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
      const stashCurrent = () => {
        write(() => calls.stash(), t("notice.stashFailed"));
      };
      const stashApply = (index) => {
        write(() => calls.stashApply(index, false), t("notice.stashApplyFailed"));
      };
      const stashPop = (index) => {
        write(() => calls.stashApply(index, true), t("notice.stashPopFailed"));
      };
      const stashDrop = (index) => {
        write(() => calls.stashDrop(index), t("notice.stashDropFailed"));
      };
      const checkout = (branch) => {
        write(() => calls.checkout(branch), t("notice.checkoutFailed"));
      };
      const createBranch = (name) => {
        write(() => calls.createBranch(name), t("notice.createBranchFailed"));
      };
      const sync = (action) => {
        if (action !== "fetch" && !confirmSync(t, action, current().upstream?.name ?? null)) return;
        setNotice("");
        setBusy(true);
        void calls.sync(action).catch((error) => ({ ok: false, problem: "failed", message: messageOf(error) })).then((outcome) => {
          setBusy(false);
          if (outcome.ok) {
            setSnapshot(outcome.snapshot);
            setNotice(t("notice.syncDone", { action: t(`sync.${action}`) }));
            return;
          }
          setNotice(refusalText(t, outcome.problem, outcome.message, t("notice.syncFailed")));
        });
      };
      const openConflict = (path) => {
        setConflict({ path, content: void 0, choices: [] });
        void runtime.api.ready.then((api) => api.conflict(sessionId, path)).catch((error) => ({ kind: "error", message: messageOf(error) })).then((content2) => {
          setConflict((open) => open === null || open.path !== path ? open : { path, content: content2, choices: defaultChoices(content2) });
        });
      };
      const chooseRegion = (index, choice) => {
        setConflict((open) => {
          if (open === null) return open;
          const choices = [...open.choices];
          choices[index] = choice;
          return { ...open, choices };
        });
      };
      const resolveOpenConflict = () => {
        if (conflict === null) return;
        const { path, choices } = conflict;
        setBusy(true);
        setNotice("");
        void runtime.api.ready.then((api) => api.resolveConflict(sessionId, path, choices)).catch((error) => ({ ok: false, problem: "failed", message: messageOf(error) })).then((outcome) => {
          setBusy(false);
          const text = conflictNotice(outcome, t);
          if (text !== "") {
            setNotice(text);
            return;
          }
          if (outcome.ok) setSnapshot(outcome.snapshot);
          setConflict(null);
        });
      };
      const abortOperation = () => {
        if (current().operation === null || current().operation === void 0) return;
        if (!confirmAbort(t, String(current().operation))) return;
        write(() => runtime.api.ready.then((api) => api.abortOperation(sessionId)), t("notice.abortFailed"));
      };
      const commitWith = (stageAll2) => {
        const text = message.trim();
        if (text === "") return;
        setNotice("");
        setBusy(true);
        void calls.commit(text, { amend, stageAll: stageAll2 }).catch((error) => ({ ok: false, problem: "failed", message: messageOf(error) })).then((outcome) => {
          setBusy(false);
          if (!outcome.ok) {
            setNotice(outcome.message);
            return;
          }
          setSnapshot(outcome.snapshot);
          setMessage("");
          setAmend(false);
        });
      };
      const rowActions = (entry, staged, conflicted) => {
        const openDiff = () => {
          openFileDiff(tab, entry.path, staged);
        };
        const diffAction = { id: "diff", icon: "diff", label: t("row.diff"), run: openDiff };
        if (conflicted) {
          return [{
            id: "resolve",
            icon: "merge",
            label: t("row.resolve"),
            run: () => {
              openConflict(entry.path);
            }
          }, diffAction];
        }
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
      const headerProps = () => ({
        snapshot,
        loading,
        busy,
        t,
        refresh,
        listBranches: calls.branches,
        checkout,
        createBranch,
        sync,
        stash: stashCurrent,
        abort: abortOperation
      });
      const stashProps = () => ({
        entries: stashes,
        canStash: current().kind === "repository" && current().staged.length + current().unstaged.length + current().conflicts.length > 0,
        busy,
        t,
        stash: stashCurrent,
        apply: stashApply,
        pop: stashPop,
        drop: stashDrop
      });
      const historyElement = () => React.createElement(History, {
        open: historyOpen,
        t,
        load: calls.history,
        tab,
        // A commit changes the newest entry, so the list is read again after one.
        revision: snapshot?.commit ?? "",
        onToggle: () => {
          setHistoryOpen(!historyOpen);
        }
      });
      const ConflictView = makeConflictView(React);
      const bodyElement = (snapshotNow) => {
        if (conflict !== null) {
          return React.createElement(ConflictView, {
            path: conflict.path,
            content: conflict.content,
            choices: conflict.choices,
            busy,
            t,
            choose: chooseRegion,
            submit: resolveOpenConflict,
            close: () => {
              setConflict(null);
            }
          });
        }
        return React.createElement(
          "div",
          { className: `${PREFIX2}-body` },
          notice === "" ? null : React.createElement("p", { className: `${PREFIX2}-notice`, role: "alert" }, notice),
          changeGroup(React, {
            title: t("group.staged"),
            group: "staged",
            count: snapshotNow.staged.length,
            rows: snapshotNow.staged.map((entry) => React.createElement(FileRow, {
              key: `staged:${entry.path}`,
              entry,
              actions: rowActions(entry, true, false),
              t
            })),
            actions: [{
              id: "unstage-all",
              label: t("group.unstageAll"),
              icon: "unstage",
              disabled: busy || snapshotNow.staged.length === 0,
              run: unstageAll
            }, {
              id: "discard-staged",
              label: t("group.discardStaged"),
              icon: "discard",
              danger: true,
              disabled: busy || snapshotNow.staged.length === 0,
              run: discardStaged
            }]
          }),
          changeGroup(React, {
            title: t("group.changes"),
            group: "unstaged",
            count: snapshotNow.unstaged.length,
            rows: snapshotNow.unstaged.map((entry) => React.createElement(FileRow, {
              key: `changes:${entry.path}`,
              entry,
              actions: rowActions(entry, false, false),
              t
            })),
            actions: [{
              id: "stage-all",
              label: t("group.stageAll"),
              icon: "stage",
              disabled: busy || snapshotNow.unstaged.length === 0,
              run: stageAll
            }, {
              id: "discard-all",
              label: t("group.discardAll"),
              icon: "discard",
              danger: true,
              disabled: busy || snapshotNow.unstaged.length === 0,
              run: discardUnstaged
            }]
          }),
          snapshotNow.conflicts.length === 0 ? null : changeGroup(React, {
            title: t("group.conflicts"),
            group: "conflicts",
            tone: "error",
            count: snapshotNow.conflicts.length,
            rows: snapshotNow.conflicts.map((entry) => React.createElement(FileRow, {
              key: `conflicted:${entry.path}`,
              entry,
              actions: rowActions(entry, false, true),
              t
            })),
            actions: []
          }),
          React.createElement(StashGroup, stashProps())
        );
      };
      if (snapshot === void 0) {
        return React.createElement(
          "section",
          {
            className: `${PREFIX2}-root`,
            "data-git-panel": "",
            ...busy ? { "data-git-busy": "" } : {}
          },
          React.createElement(BranchHeader, headerProps()),
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
          React.createElement(BranchHeader, headerProps()),
          stateBlock(React, t(`state.${problem}.title`), t(`state.${problem}.body`), snapshot.message),
          historyElement()
        );
      }
      const total = snapshot.staged.length + snapshot.unstaged.length + snapshot.conflicts.length;
      if (total === 0 && conflict === null) {
        return React.createElement(
          "section",
          {
            className: `${PREFIX2}-root`,
            "data-git-panel": "",
            ...busy ? { "data-git-busy": "" } : {}
          },
          React.createElement(BranchHeader, headerProps()),
          notice === "" ? null : React.createElement("p", { className: `${PREFIX2}-notice`, role: "alert" }, notice),
          stateBlock(React, t("state.clean.title"), t("state.clean.body")),
          React.createElement(StashGroup, stashProps()),
          CommitBox(React, {
            message,
            stagedCount: 0,
            unstagedCount: 0,
            clean: true,
            identityMissing: isIdentityMissing(snapshot.identity),
            busy,
            canAmend: snapshot.commit !== null && snapshot.commit !== void 0,
            amend,
            t,
            onChange: setMessage,
            onAmendChange: setAmend,
            onSubmit: commitWith
          }),
          historyElement()
        );
      }
      return React.createElement(
        "section",
        {
          className: `${PREFIX2}-root`,
          "data-git-panel": "",
          ...busy ? { "data-git-busy": "" } : {}
        },
        React.createElement(BranchHeader, headerProps()),
        bodyElement(snapshot),
        CommitBox(React, {
          message,
          stagedCount: snapshot.staged.length,
          unstagedCount: snapshot.unstaged.length,
          clean: false,
          identityMissing: isIdentityMissing(snapshot.identity),
          busy,
          canAmend: snapshot.commit !== null && snapshot.commit !== void 0,
          amend,
          t,
          onChange: setMessage,
          onAmendChange: setAmend,
          onSubmit: commitWith
        }),
        historyElement()
      );
    }
    return GitPanel;
  }
  function openFileDiff(tab, path, staged) {
    if (tab === void 0) return;
    tab.actions.openResource(diffAddress(path, staged), { kind: DIFF_TAB_KIND });
  }
  function isIdentityMissing(identity) {
    return identity.name === null || identity.email === null;
  }
  function refusalText(t, problem, message, fallback) {
    if (problem === "dirty") return t("notice.dirty");
    if (problem === "exists") return t("notice.exists");
    if (problem === "invalid-name") return t("notice.invalidName");
    return message === "" ? fallback : message;
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
      "more.actions": "\u66F4\u591A\u64CD\u4F5C",
      "branch.unknown": "\u672A\u77E5\u5206\u652F",
      "branch.selector": "\u5207\u6362\u5206\u652F",
      "branch.loading": "\u6B63\u5728\u8BFB\u53D6\u5206\u652F\u2026",
      "branch.empty": "\u6CA1\u6709\u672C\u5730\u5206\u652F",
      "branch.newPlaceholder": "\u65B0\u5EFA\u5206\u652F",
      "branch.create": "\u521B\u5EFA",
      "upstream.title": "\u4E0A\u6E38 {name}",
      "operation.merge": "\u6B63\u5728\u8FDB\u884C\u5408\u5E76\uFF08merge\uFF09",
      "operation.rebase": "\u6B63\u5728\u8FDB\u884C\u53D8\u57FA\uFF08rebase\uFF09",
      "operation.cherry-pick": "\u6B63\u5728\u6311\u9009\u63D0\u4EA4\uFF08cherry-pick\uFF09",
      "operation.abort": "\u4E2D\u6B62",
      "operation.abortLater": "\u4E2D\u6B62\u64CD\u4F5C\u5C06\u5728\u4E0B\u4E00\u7248\u672C\u63D0\u4F9B",
      "sync.fetch": "\u83B7\u53D6\uFF08fetch\uFF09",
      "sync.pull": "\u62C9\u53D6\uFF08pull\uFF09",
      "sync.push": "\u63A8\u9001\uFF08push\uFF09",
      "sync.noUpstream": "\u5F53\u524D\u5206\u652F\u6CA1\u6709\u4E0A\u6E38",
      "history.title": "\u5386\u53F2",
      "history.empty": "\u8FD8\u6CA1\u6709\u63D0\u4EA4",
      "history.loading": "\u6B63\u5728\u52A0\u8F7D\u2026",
      "history.more": "\u52A0\u8F7D\u66F4\u591A",
      "history.end": "\u5DF2\u5230\u6700\u65E9\u4E00\u6761",
      "history.failed": "\u65E0\u6CD5\u8BFB\u53D6\u63D0\u4EA4\u5386\u53F2",
      "history.expand": "\u5C55\u5F00\u5386\u53F2",
      "history.collapse": "\u6536\u8D77\u5386\u53F2",
      "history.justNow": "\u521A\u521A",
      "history.minutesAgo": "{count} \u5206\u949F\u524D",
      "history.hoursAgo": "{count} \u5C0F\u65F6\u524D",
      "history.daysAgo": "{count} \u5929\u524D",
      "history.monthsAgo": "{count} \u4E2A\u6708\u524D",
      "history.yearsAgo": "{count} \u5E74\u524D",
      "stash.group": "\u50A8\u85CF",
      "stash.empty": "\u6CA1\u6709\u50A8\u85CF",
      "stash.current": "\u50A8\u85CF\u5F53\u524D\u6539\u52A8",
      "stash.currentDisabled": "\u5DE5\u4F5C\u533A\u5E72\u51C0\uFF0C\u6CA1\u6709\u53EF\u50A8\u85CF\u7684\u6539\u52A8",
      "stash.apply": "\u5E94\u7528",
      "stash.pop": "\u5F39\u51FA",
      "stash.drop": "\u5220\u9664",
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
      "row.resolve": "\u89E3\u51B3\u51B2\u7A81",
      "row.renamed": "{from} \u2192 {path}",
      "commit.placeholder": "\u63D0\u4EA4\u4FE1\u606F\uFF08Ctrl+Enter \u63D0\u4EA4\uFF09",
      "commit.submit": "\u63D0\u4EA4",
      "commit.hint": "\u5DF2\u6682\u5B58 {count} \u4E2A\u6587\u4EF6",
      "commit.busy": "\u6B63\u5728\u5904\u7406\u2026",
      "commit.identityMissing": "\u672A\u914D\u7F6E Git \u7528\u6237\u8EAB\u4EFD\uFF0C\u8BF7\u5148\u8BBE\u7F6E user.name \u4E0E user.email",
      "commit.nothingStaged": "\u6682\u5B58\u533A\u4E3A\u7A7A\uFF0C\u8BF7\u5148\u6682\u5B58\u8981\u63D0\u4EA4\u7684\u66F4\u6539",
      "commit.emptyMessage": "\u8BF7\u5148\u586B\u5199\u63D0\u4EA4\u4FE1\u606F",
      "commit.clean": "\u5DE5\u4F5C\u533A\u6CA1\u6709\u6539\u52A8\uFF1B\u53EF\u52FE\u9009\u300C\u6539\u5199\u4E0A\u6B21\u63D0\u4EA4\u300D\u4FEE\u6539\u63D0\u4EA4\u4FE1\u606F",
      "commit.amend": "\u6539\u5199\u4E0A\u6B21\u63D0\u4EA4",
      "commit.amendHint": "\u5C06\u6539\u5199\u4E0A\u4E00\u6B21\u63D0\u4EA4",
      "commit.stageAllHint": "\u63D0\u4EA4\u65F6\u4F1A\u5148\u6682\u5B58 {count} \u4E2A\u6587\u4EF6",
      "commit.stageAllSubmit": "\u6682\u5B58\u5168\u90E8\u5E76\u63D0\u4EA4",
      "notice.stageFailed": "\u6682\u5B58\u5931\u8D25",
      "notice.unstageFailed": "\u53D6\u6D88\u6682\u5B58\u5931\u8D25",
      "notice.discardFailed": "\u653E\u5F03\u66F4\u6539\u5931\u8D25",
      "notice.checkoutFailed": "\u5207\u6362\u5206\u652F\u5931\u8D25",
      "notice.createBranchFailed": "\u521B\u5EFA\u5206\u652F\u5931\u8D25",
      "notice.stashFailed": "\u50A8\u85CF\u5931\u8D25",
      "notice.stashApplyFailed": "\u5E94\u7528\u50A8\u85CF\u5931\u8D25",
      "notice.stashPopFailed": "\u5F39\u51FA\u50A8\u85CF\u5931\u8D25",
      "notice.stashDropFailed": "\u5220\u9664\u50A8\u85CF\u5931\u8D25",
      "notice.syncFailed": "\u540C\u6B65\u5931\u8D25",
      "notice.resolveFailed": "\u89E3\u51B3\u51B2\u7A81\u5931\u8D25",
      "notice.abortFailed": "\u4E2D\u6B62\u64CD\u4F5C\u5931\u8D25",
      "conflict.ours": "\u4FDD\u7559\u5F53\u524D",
      "conflict.theirs": "\u4FDD\u7559\u4F20\u5165",
      "conflict.both": "\u4E24\u8005\u90FD\u4FDD\u7559",
      "conflict.loading": "\u6B63\u5728\u8BFB\u53D6\u51B2\u7A81\u5185\u5BB9\u2026",
      "conflict.clean": "\u8FD9\u4E2A\u6587\u4EF6\u5DF2\u6CA1\u6709\u51B2\u7A81\u6807\u8BB0\uFF1B\u6807\u8BB0\u4E3A\u5DF2\u89E3\u51B3\u5373\u53EF\u6682\u5B58\u3002",
      "conflict.markResolved": "\u6807\u8BB0\u4E3A\u5DF2\u89E3\u51B3",
      "conflict.close": "\u5173\u95ED",
      "dialog.abort": "\u4E2D\u6B62\u6B63\u5728\u8FDB\u884C\u7684 {operation}\uFF1F\u5DF2\u89E3\u51B3\u7684\u51B2\u7A81\u4F1A\u5168\u90E8\u4E22\u5931\u3002",
      "notice.syncDone": "{action} \u5B8C\u6210",
      "notice.dirty": "\u6709\u672A\u63D0\u4EA4\u7684\u6539\u52A8\uFF0C\u65E0\u6CD5\u5207\u6362\u5206\u652F",
      "notice.exists": "\u540C\u540D\u5206\u652F\u5DF2\u5B58\u5728",
      "notice.invalidName": "\u8FD9\u4E2A\u540D\u79F0\u4E0D\u662F\u6709\u6548\u7684\u5206\u652F\u540D",
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
      "dialog.filesMany": "{first} \u7B49 {count} \u4E2A\u6587\u4EF6",
      "dialog.stash.popTitle": "\u5F39\u51FA\u8FD9\u6761\u50A8\u85CF\uFF1F",
      "dialog.stash.popBody": "\u6539\u52A8\u4F1A\u56DE\u5230\u5DE5\u4F5C\u533A\uFF0C\u50A8\u85CF\u8BB0\u5F55\u5C06\u88AB\u5220\u9664\u3002",
      "dialog.stash.dropTitle": "\u5220\u9664\u8FD9\u6761\u50A8\u85CF\uFF1F",
      "dialog.stash.dropBody": "\u50A8\u85CF\u8BB0\u5F55\u5C06\u88AB\u5220\u9664\uFF0C\u5176\u4E2D\u7684\u6539\u52A8\u4E0D\u4F1A\u518D\u56DE\u5230\u5DE5\u4F5C\u533A\u3002",
      "dialog.pull.title": "\u62C9\u53D6\u8FDC\u7AEF\uFF1F",
      "dialog.pull.body": "\u4F1A\u628A {name} \u5408\u5165\u5F53\u524D\u5206\u652F\uFF0C\u53EF\u80FD\u4EA7\u751F\u51B2\u7A81\u6216\u6539\u5199\u5DE5\u4F5C\u533A\u3002",
      "dialog.push.title": "\u63A8\u9001\u5230\u8FDC\u7AEF\uFF1F",
      "dialog.push.body": "\u4F1A\u628A\u5F53\u524D\u5206\u652F\u7684\u63D0\u4EA4\u63A8\u9001\u5230 {name}\uFF0C\u5176\u4ED6\u4EBA\u4F1A\u770B\u5230\u8FD9\u4E9B\u63D0\u4EA4\u3002"
    },
    en: {
      "panel.label": "Git",
      "guide.title": "Git panel",
      "guide.description": "Inspect branches, working-tree status and commits",
      "refresh": "Refresh",
      "more.actions": "More actions",
      "branch.unknown": "Unknown branch",
      "branch.selector": "Switch branch",
      "branch.loading": "Reading branches\u2026",
      "branch.empty": "No local branches",
      "branch.newPlaceholder": "New branch",
      "branch.create": "Create",
      "upstream.title": "Tracking {name}",
      "operation.merge": "A merge is in progress",
      "operation.rebase": "A rebase is in progress",
      "operation.cherry-pick": "A cherry-pick is in progress",
      "operation.abort": "Abort",
      "operation.abortLater": "Aborting arrives in the next version",
      "sync.fetch": "Fetch",
      "sync.pull": "Pull",
      "sync.push": "Push",
      "sync.noUpstream": "the current branch has no upstream",
      "history.title": "History",
      "history.empty": "No commits yet",
      "history.loading": "Loading\u2026",
      "history.more": "Load more",
      "history.end": "That is the first commit",
      "history.failed": "Could not read the commit history",
      "history.expand": "Expand the history",
      "history.collapse": "Collapse the history",
      "history.justNow": "just now",
      "history.minutesAgo": "{count}m ago",
      "history.hoursAgo": "{count}h ago",
      "history.daysAgo": "{count}d ago",
      "history.monthsAgo": "{count}mo ago",
      "history.yearsAgo": "{count}y ago",
      "stash.group": "Stashes",
      "stash.empty": "No stashes",
      "stash.current": "Stash current changes",
      "stash.currentDisabled": "The working tree is clean, so there is nothing to stash",
      "stash.apply": "Apply",
      "stash.pop": "Pop",
      "stash.drop": "Drop",
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
      "row.resolve": "Resolve conflict",
      "row.renamed": "{from} \u2192 {path}",
      "commit.placeholder": "Commit message (Ctrl+Enter to commit)",
      "commit.submit": "Commit",
      "commit.hint": "{count} file(s) staged",
      "commit.busy": "Working\u2026",
      "commit.identityMissing": "No Git author is configured; set user.name and user.email first",
      "commit.nothingStaged": "Nothing is staged; stage the changes to commit",
      "commit.emptyMessage": "Write a commit message first",
      "commit.clean": "The tree is clean; tick Amend to rewrite the message",
      "commit.amend": "Amend the last commit",
      "commit.amendHint": "The last commit is rewritten",
      "commit.stageAllHint": "Committing stages {count} file(s) first",
      "commit.stageAllSubmit": "Stage all and commit",
      "notice.stageFailed": "Could not stage",
      "notice.unstageFailed": "Could not unstage",
      "notice.discardFailed": "Could not discard",
      "notice.checkoutFailed": "Could not switch branches",
      "notice.createBranchFailed": "Could not create the branch",
      "notice.stashFailed": "Could not stash",
      "notice.stashApplyFailed": "Could not apply the stash",
      "notice.stashPopFailed": "Could not pop the stash",
      "notice.stashDropFailed": "Could not drop the stash",
      "notice.syncFailed": "Sync failed",
      "notice.resolveFailed": "Could not resolve the conflict",
      "notice.abortFailed": "Could not abort the operation",
      "conflict.ours": "Keep ours",
      "conflict.theirs": "Keep theirs",
      "conflict.both": "Keep both",
      "conflict.loading": "Reading the conflict\u2026",
      "conflict.clean": "This file holds no conflict markers; mark it resolved to stage it.",
      "conflict.markResolved": "Mark resolved",
      "conflict.close": "Close",
      "dialog.abort": "Abort the {operation} in progress? Every resolution in it is lost.",
      "notice.syncDone": "{action} finished",
      "notice.dirty": "The working tree has uncommitted changes, so the branch was not switched",
      "notice.exists": "A branch with that name already exists",
      "notice.invalidName": "That is not a valid branch name",
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
      "dialog.filesMany": "{first} and {count} files in all",
      "dialog.stash.popTitle": "Pop this stash entry?",
      "dialog.stash.popBody": "The changes return to the working tree and the entry is removed.",
      "dialog.stash.dropTitle": "Drop this stash entry?",
      "dialog.stash.dropBody": "The entry is removed and its changes never return to the working tree.",
      "dialog.pull.title": "Pull from the upstream?",
      "dialog.pull.body": "Brings {name} into the current branch, which can conflict or rewrite the working tree.",
      "dialog.push.title": "Push to the upstream?",
      "dialog.push.body": "Publishes this branch\u2019s commits to {name}, where other people will see them."
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
  function commitReader(remote) {
    return (args) => remote.ready.then((api) => api.requestCommit(args));
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
            requestCommit: commitReader(remote),
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
