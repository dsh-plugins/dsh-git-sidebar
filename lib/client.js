"use strict";
(() => {
  // src/shared.ts
  var GIT_TOOL_NAMES = {
    /** List the checkouts the panel's scan finds. */
    list: "git_repositories",
    /** Select one checkout and present its panel. */
    open: "git_open_repository"
  };
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
        descriptor("fileSides", () => ({ sessionId: zod.string(), path: zod.string(), staged: zod.boolean() })),
        descriptor("stage", () => ({ sessionId: zod.string(), paths: strings() })),
        descriptor("unstage", () => ({ sessionId: zod.string(), paths: strings() })),
        descriptor("discard", () => ({ sessionId: zod.string(), paths: strings(), includeUntracked: zod.boolean() })),
        descriptor("commit", () => ({
          sessionId: zod.string(),
          message: zod.string(),
          amend: zod.boolean().optional(),
          stageAll: zod.boolean().optional(),
          paths: strings().optional()
        })),
        descriptor("history", () => ({
          sessionId: zod.string(),
          limit: zod.number(),
          skip: zod.number(),
          branch: zod.string().optional()
        })),
        descriptor("commitDetail", () => ({ sessionId: zod.string(), sha: zod.string() })),
        descriptor("commitFiles", () => ({ sessionId: zod.string(), sha: zod.string() })),
        descriptor("commitSides", () => ({ sessionId: zod.string(), sha: zod.string(), path: zod.string() })),
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
        descriptor("abortOperation", () => ({ sessionId: zod.string() })),
        descriptor("stageHunk", () => ({
          sessionId: zod.string(),
          path: zod.string(),
          hunk: zod.number(),
          region: zod.number().optional()
        })),
        descriptor("unstageHunk", () => ({
          sessionId: zod.string(),
          path: zod.string(),
          hunk: zod.number(),
          region: zod.number().optional()
        })),
        descriptor("discardHunk", () => ({
          sessionId: zod.string(),
          path: zod.string(),
          hunk: zod.number(),
          region: zod.number().optional()
        })),
        descriptor("deleteBranch", () => ({ sessionId: zod.string(), branch: zod.string(), force: zod.boolean() })),
        descriptor("mergeBranch", () => ({ sessionId: zod.string(), branch: zod.string() })),
        descriptor("generateMessage", () => ({ sessionId: zod.string(), staged: zod.boolean() })),
        descriptor("repositories", () => ({ sessionId: zod.string() })),
        descriptor("selectRepository", () => ({ sessionId: zod.string(), root: zod.string().optional() }))
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
      async requestSides(args, signal) {
        void signal;
        try {
          const result = await remote.fileSides(args);
          if (result.ok) return result.value;
          return { kind: "error", message: result.error.message };
        } catch (error) {
          return { kind: "error", message: messageOf(error) };
        }
      },
      async requestCommitFiles(args, signal) {
        void signal;
        try {
          const result = await remote.commitFiles(args);
          if (result.ok) return result.value;
          return { kind: "error", message: result.error.message };
        } catch (error) {
          return { kind: "error", message: messageOf(error) };
        }
      },
      async requestCommitSides(args, signal) {
        void signal;
        try {
          const result = await remote.commitSides(args);
          if (result.ok) return result.value;
          return { kind: "error", message: result.error.message };
        } catch (error) {
          return { kind: "error", message: messageOf(error) };
        }
      },
      discardHunk(args) {
        return foldWrite(() => remote.discardHunk(args));
      },
      async history(sessionId, limit, skip, branch) {
        try {
          const args = branch === void 0 ? { sessionId, limit, skip } : { sessionId, limit, skip, branch };
          const result = await remote.history(args);
          if (result.ok) return result.value;
          return { commits: [], hasMore: false, total: 0 };
        } catch {
          return { commits: [], hasMore: false, total: 0 };
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
      createBranch(sessionId, name, from) {
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
      },
      stageHunk(args) {
        return foldWrite(() => remote.stageHunk(args));
      },
      unstageHunk(args) {
        return foldWrite(() => remote.unstageHunk(args));
      },
      deleteBranch(sessionId, branch, force) {
        return foldWrite(() => remote.deleteBranch({ sessionId, branch, force }));
      },
      mergeBranch(sessionId, branch) {
        return foldWrite(() => remote.mergeBranch({ sessionId, branch }));
      },
      async generateMessage(sessionId, staged) {
        const result = await remote.generateMessage({ sessionId, staged });
        if (result.ok) return result.value;
        return { ok: false, problem: "failed", message: result.error.message };
      },
      async repositories(sessionId) {
        try {
          const result = await remote.repositories({ sessionId });
          if (result.ok) return result.value;
          return { ...EMPTY_REPOSITORIES, error: result.error.message };
        } catch (error) {
          return { ...EMPTY_REPOSITORIES, error: messageOf(error) };
        }
      },
      async selectRepository(sessionId, root) {
        try {
          const result = await remote.selectRepository(root === void 0 ? { sessionId } : { sessionId, root });
          if (result.ok) return result.value;
          return { ok: false, problem: "failed", message: result.error.message };
        } catch (error) {
          return { ok: false, problem: "failed", message: messageOf(error) };
        }
      }
    };
  }
  var EMPTY_REPOSITORIES = {
    scanRoot: "",
    depth: 0,
    selected: null,
    entries: [],
    truncated: false,
    warnings: []
  };
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

  // src/client/diff-cache.ts
  var LIMIT = 50;
  var entries = /* @__PURE__ */ new Map();
  function readDiffCache(address) {
    const payload = entries.get(address);
    if (payload === void 0) return void 0;
    entries.delete(address);
    entries.set(address, payload);
    return payload;
  }
  function writeDiffCache(address, payload) {
    entries.delete(address);
    entries.set(address, payload);
    while (entries.size > LIMIT) {
      const oldest = entries.keys().next();
      if (oldest.done === true) return;
      entries.delete(oldest.value);
    }
  }
  function clearDiffCache() {
    entries.clear();
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
    const rows2 = [];
    let current;
    for (const hunk of hunks) {
      if (hunk.path !== void 0 && hunk.path !== current) {
        current = hunk.path;
        rows2.push({ kind: "file", text: hunk.path });
      }
      rows2.push({ kind: "hunk-header", text: drawn(hunk.header) });
      const section = hunk.section?.trim() ?? "";
      if (section !== "") rows2.push({ kind: "meta", text: section });
      const range = parseHunkHeader(hunk.header);
      let oldNo = range?.oldStart;
      let newNo = range?.newStart;
      for (const line of hunk.lines) {
        const text = drawn(line.text);
        if (line.kind === "added") {
          rows2.push({ kind: "added", text, newNo });
          if (newNo !== void 0) newNo += 1;
          continue;
        }
        if (line.kind === "removed") {
          rows2.push({ kind: "removed", text, oldNo });
          if (oldNo !== void 0) oldNo += 1;
          continue;
        }
        rows2.push({ kind: "context", text, oldNo, newNo });
        if (oldNo !== void 0) oldNo += 1;
        if (newNo !== void 0) newNo += 1;
      }
    }
    return rows2;
  }
  function basenameOf(path) {
    const name = path.slice(path.lastIndexOf("/") + 1);
    return name === "" ? path : name;
  }
  function drawn(text) {
    return text.endsWith("\r") ? text.slice(0, -1) : text;
  }

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
    eye: "M480-320q75 0 127.5-52.5T660-500q0-75-52.5-127.5T480-680q-75 0-127.5 52.5T300-500q0 75 52.5 127.5T480-320Zm0-72q-45 0-76.5-31.5T372-500q0-45 31.5-76.5T480-608q45 0 76.5 31.5T588-500q0 45-31.5 76.5T480-392Zm0 192q-146 0-266-81.5T40-500q54-137 174-218.5T480-800q146 0 266 81.5T920-500q-54 137-174 218.5T480-200Z",
    undo: "M280-200v-80h284q63 0 109.5-40T720-420q0-60-46.5-100T564-560H312l104 104-56 56-200-200 200-200 56 56-104 104h252q97 0 166.5 63T800-420q0 94-69.5 157T564-200H280Z",
    spark: "M480-80 373-240H160v-213L0-560l160-107v-213h213L480-1040l107 160h213v213l160 107-160 107v213H587L480-80Zm0-108 86-127h174v-174l127-86-127-86v-174H546l-86-127-86 127H200v174l-127 86 127 86v174h174l86 127Z",
    clock: "M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm40-120v-200H360v80h80v120h80Z",
    stash: "m480-240 160-160-56-56-64 64v-168h-80v168l-64-64-56 56 160 160ZM200-640v440h560v-440H200Zm0 520q-33 0-56.5-23.5T120-200v-499q0-14 4.5-27t13.5-24l50-61q11-14 27.5-21.5T250-840h460q18 0 34.5 7.5T772-811l50 61q9 11 13.5 24t4.5 27v499q0 33-23.5 56.5T760-120H200Zm16-600h528l-34-40H250l-34 40Zm264 300Z",
    apply: "M480-560 320-400l56 56 64-64v168h80v-168l64 64 56-56-160-160Zm-280-80v440h560v-440H200Zm0 520q-33 0-56.5-23.5T120-200v-499q0-14 4.5-27t13.5-24l50-61q11-14 27.5-21.5T250-840h460q18 0 34.5 7.5T772-811l50 61q9 11 13.5 24t4.5 27v499q0 33-23.5 56.5T760-120H200Zm16-600h528l-34-40H250l-34 40Zm264 300Z",
    pop: "M440-320h80v-166l64 62 56-56-160-160-160 160 56 56 64-62v166ZM280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520Zm-400 0v520-520Z",
    sync: "M160-160v-80h110l-16-14q-52-46-73-105t-21-119q0-111 66.5-197.5T400-790v84q-72 26-116 88.5T240-478q0 45 17 87.5t53 78.5l10 10v-98h80v240H160Zm400-10v-84q72-26 116-88.5T720-482q0-45-17-87.5T650-648l-10-10v98h-80v-240h240v80H690l16 14q49 49 71.5 106.5T800-482q0 111-66.5 197.5T560-170Z",
    pull: "M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z",
    push: "M440-320v-326L336-542l-56-58 200-200 200 200-56 58-104-104v326h-80ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z",
    merge: "M160-292q-39 0-66.5-27.5T66-386q0-39 27.5-66.5T160-480q22 0 41.5 9.5T233-444q30-16 51-42t33-60q-25-14-40-39t-15-55q0-39 27.5-66.5T356-734q39 0 66.5 27.5T450-640q0 22-9.5 41.5T414-567q16 30 42 51t60 33q14-25 39-40t55-15q39 0 66.5 27.5T704-444q0 39-27.5 66.5T610-350q-22 0-41.5-9.5T529-392q-30 16-51 42t-33 60q25 14 40 39t15 55q0 39-27.5 66.5T356-102q-39 0-66.5-27.5T262-196q0-22 9.5-41.5T302-274q-16-30-42-51t-60-33q-14 25-39 40t-55 15Z",
    repo: "M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Zm0-80h640v-400H447l-80-80H160v480Zm0 0v-480 480Z"
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
  function markGradient(React, id, from, to, axis) {
    const [x1, y1, x2, y2] = axis;
    return React.createElement(
      "linearGradient",
      { id, x1, y1, x2, y2, gradientUnits: "userSpaceOnUse" },
      React.createElement("stop", { stopColor: from }),
      React.createElement("stop", { offset: 1, stopColor: to })
    );
  }
  function GitGuideIcon(React) {
    return function GitGuideArtwork(props) {
      const size = props.size ?? 26;
      const unique = React.useId?.().replaceAll(":", "");
      const uid = unique === void 0 ? "git-sidebar-guide" : `git-sidebar-guide-${unique}`;
      const ink = `url(#${uid}-ink)`;
      return React.createElement(
        "svg",
        {
          viewBox: "0 0 36 36",
          width: size,
          height: size,
          className: props.className,
          fill: "none",
          "aria-hidden": true,
          style: { display: "block" }
        },
        React.createElement("path", {
          d: "M13 10V26",
          stroke: ink,
          strokeWidth: 3.4,
          strokeLinecap: "round"
        }),
        React.createElement("path", {
          d: "M23 10V14.6C23 17.5 20.9 19.8 17.8 19.8H14.7",
          stroke: `url(#${uid}-branch)`,
          strokeWidth: 3.4,
          strokeLinecap: "round",
          strokeLinejoin: "round"
        }),
        React.createElement("circle", { cx: 13, cy: 10, r: 3.8, fill: ink }),
        React.createElement("circle", { cx: 23, cy: 10, r: 3.8, fill: `url(#${uid}-side)` }),
        React.createElement("circle", { cx: 13, cy: 26, r: 3.8, fill: ink }),
        React.createElement(
          "defs",
          null,
          markGradient(React, `${uid}-ink`, "#69B9FF", "#324DE2", [13, 6.2, 13, 29.8]),
          markGradient(React, `${uid}-branch`, "#51CFDB", "#497BEE", [23, 10, 14.7, 19.8]),
          markGradient(React, `${uid}-side`, "#51CFDB", "#108792", [19.8, 6.2, 26.2, 13.8])
        )
      );
    };
  }

  // src/client/language-match.ts
  function languageForPath(languages, path) {
    const normalized = path.replaceAll("\\", "/");
    const name = normalized.slice(normalized.lastIndexOf("/") + 1).toLowerCase();
    if (name.length === 0) return void 0;
    for (let index = languages.length - 1; index >= 0; index -= 1) {
      const declared = languages[index];
      if (declared?.filenames?.some((filename) => filename.toLowerCase() === name) === true) return declared.id;
    }
    let best;
    for (let index = languages.length - 1; index >= 0; index -= 1) {
      const declared = languages[index];
      if (declared === void 0) continue;
      for (const extension of declared.extensions ?? []) {
        const suffix = extension.toLowerCase();
        if (!suffix.startsWith(".") || !name.endsWith(suffix)) continue;
        if (best === void 0 || suffix.length > best.length) best = { id: declared.id, length: suffix.length };
      }
    }
    if (best !== void 0) return best.id;
    for (let index = languages.length - 1; index >= 0; index -= 1) {
      for (const pattern of languages[index]?.filenamePatterns ?? []) {
        if (matches(pattern, normalized.slice(normalized.lastIndexOf("/") + 1))) return languages[index]?.id;
      }
    }
    return void 0;
  }
  function matches(pattern, name) {
    try {
      return new RegExp(pattern, "iu").test(name);
    } catch (error) {
      console.warn(
        'git-sidebar: a language declared an unreadable filenamePattern "%s": %s',
        pattern,
        error instanceof Error ? error.message : String(error)
      );
      return false;
    }
  }

  // src/client/diff-monaco.ts
  var SIDE_BY_SIDE_MIN_WIDTH = 640;
  var ACTION_ICON = 13;
  var LINE_HEIGHT_FALLBACK = 20;
  var FONT_FALLBACK = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  var CODE_FAMILY = "--ds-font-family-code";
  var CODE_FAMILY_FALLBACK = "--dsw-font-family";
  var CODE_SIZE = "--dsh-code-font-size";
  var SVG_NAMESPACE = "http://www.w3.org/2000/svg";
  var modelStamp = 0;
  function readCodeFont() {
    const family = resolvedFamily(CODE_FAMILY) ?? resolvedFamily(CODE_FAMILY_FALLBACK) ?? FONT_FALLBACK;
    const host = document.body ?? document.documentElement;
    const raw = host === null ? "" : getComputedStyle(host).getPropertyValue(CODE_SIZE).trim();
    const size = raw === "" ? Number.NaN : Number.parseFloat(raw);
    return Number.isFinite(size) && size > 0 ? { family, size } : { family };
  }
  function resolvedFamily(variable) {
    const host = document.body ?? document.documentElement;
    if (host === null) return void 0;
    const probe = document.createElement("span");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.pointerEvents = "none";
    probe.style.setProperty("font-family", `var(${variable}, 'dsh-git-sidebar-missing-font')`);
    host.appendChild(probe);
    try {
      const value = getComputedStyle(probe).fontFamily?.trim() ?? "";
      if (value.length === 0) return void 0;
      if (value.replace(/\s+/gu, "").toLowerCase().includes("dsh-git-sidebar-missing-font")) return void 0;
      return value;
    } finally {
      probe.remove();
    }
  }
  function languageIdFor(api, path) {
    return languageForPath(api.languages.getLanguages(), path) ?? "plaintext";
  }
  function modelUri(api, path, side) {
    modelStamp += 1;
    const name = path.replaceAll("\\", "/").split("/").pop() ?? "file";
    return api.Uri.parse(`inmemory://git-diff/${side}/${modelStamp}/${encodeURIComponent(name)}`);
  }
  function constructionOptions(mode, font, label) {
    return {
      readOnly: true,
      originalEditable: false,
      renderSideBySide: mode === "side",
      // The width this plugin decides the layout with is the same one Monaco
      // would otherwise decide for itself; leaving its own breakpoint on would
      // make the two disagree in the 640–900px range.
      useInlineViewWhenSpaceIsLimited: false,
      renderOverviewRuler: false,
      renderMarginRevertIcon: false,
      renderIndicators: true,
      // The action stack lives in the glyph margin, left of the line numbers, the
      // same column VS Code reserves for a change's actions.
      glyphMargin: true,
      scrollBeyondLastLine: false,
      diffWordWrap: "off",
      automaticLayout: false,
      fontFamily: font.family,
      ...font.size === void 0 ? {} : { fontSize: font.size },
      ariaLabel: label
    };
  }
  function blocksOf(hunks) {
    const blocks = [];
    for (let hunk = 0; hunk < hunks.length; hunk += 1) {
      const entry = hunks[hunk];
      if (entry === void 0) continue;
      const range = parseHunkHeader(entry.header);
      if (range === void 0) continue;
      let line = Math.max(range.newStart, 1);
      let region = -1;
      let block;
      for (const inner of entry.lines) {
        if (inner.kind === "context") {
          if (block !== void 0) {
            blocks.push({ hunk, region, ...block });
            block = void 0;
          }
          line += 1;
          continue;
        }
        if (block === void 0) {
          region += 1;
          block = { line, added: 0, removed: 0 };
        }
        if (inner.kind === "added") {
          block.added += 1;
          line += 1;
        } else {
          block.removed += 1;
        }
      }
      if (block !== void 0) blocks.push({ hunk, region, ...block });
    }
    return blocks;
  }
  function createEngine(api, host, path, texts, prefix, mode, font, label) {
    const language = languageIdFor(api, path);
    const editor = api.editor.createDiffEditor(host, constructionOptions(mode, font, label));
    const original = api.editor.createModel(texts.oldText, language, modelUri(api, path, "old"));
    const modifiedModel = api.editor.createModel(texts.newText, language, modelUri(api, path, "new"));
    editor.setModel({ original, modified: modifiedModel });
    const modifiedEditor = editor.getModifiedEditor();
    const layer = document.createElement("div");
    layer.className = `${prefix}-monaco-actions`;
    host.appendChild(layer);
    const tags = /* @__PURE__ */ new Map();
    let current;
    let layout = mode;
    let codeFont = font;
    const lastLine = () => modifiedEditor.getModel()?.getLineCount() ?? 1;
    const clearWidgets = () => {
      for (const node of tags.values()) node.remove();
      tags.clear();
    };
    const measureLineHeight = () => {
      const last = lastLine();
      let smallest = Number.POSITIVE_INFINITY;
      for (let line = 1; line < Math.min(last, 20); line += 1) {
        const gap = modifiedEditor.getTopForLineNumber(line + 1) - modifiedEditor.getTopForLineNumber(line);
        if (gap > 0 && gap < smallest) smallest = gap;
      }
      return Number.isFinite(smallest) ? smallest : LINE_HEIGHT_FALLBACK;
    };
    const placeGutter = (config) => {
      const hostRect = host.getBoundingClientRect();
      const anchored = layout === "side" ? modifiedEditor : editor.getOriginalEditor();
      const left = anchored.getDomNode().getBoundingClientRect().left - hostRect.left;
      const viewTop = modifiedEditor.getDomNode().getBoundingClientRect().top - hostRect.top;
      const scroll = modifiedEditor.getScrollTop();
      const lineHeight = measureLineHeight();
      const last = lastLine();
      const topOf = (line) => {
        const at = Math.min(Math.max(line, 1), last);
        return modifiedEditor.getTopForLineNumber(at) + (line > last ? lineHeight : 0);
      };
      const wanted = /* @__PURE__ */ new Set();
      for (const block of blocksOf(config.hunks)) {
        const key = `${block.hunk}:${block.region}`;
        wanted.add(key);
        let node = tags.get(key);
        if (node === void 0) {
          node = blockTag(prefix, config, block);
          tags.set(key, node);
          layer.appendChild(node);
        }
        const start = topOf(block.line);
        let blockTop;
        let height;
        if (block.added > 0) {
          blockTop = start;
          height = Math.max(topOf(block.line + block.added) - start, lineHeight);
        } else {
          height = Math.max(block.removed * lineHeight, lineHeight);
          blockTop = Math.max(start - height, 0);
          height = Math.max(start - blockTop, lineHeight);
        }
        const top = viewTop + blockTop - scroll;
        if (top + height < 0 || top > hostRect.height) {
          node.style.display = "none";
          continue;
        }
        node.style.display = "";
        node.style.height = `${height}px`;
        node.style.transform = `translate(${left}px, ${top}px)`;
      }
      for (const [key, node] of tags) {
        if (wanted.has(key)) continue;
        node.remove();
        tags.delete(key);
      }
    };
    const signatureOf = (config) => [
      config.side,
      config.busy,
      config.t("hunk.stage"),
      config.t("hunk.unstage"),
      config.t("hunk.discard"),
      config.hunks.map((hunk) => hunk.header).join("~")
    ].join("|");
    let signature = "";
    const disposeScroll = modifiedEditor.onDidScrollChange(() => {
      if (current !== void 0) placeGutter(current);
    });
    const disposeLayout = modifiedEditor.onDidLayoutChange(() => {
      if (current !== void 0) placeGutter(current);
    });
    const disposeDiff = editor.onDidUpdateDiff(() => {
      if (current !== void 0) placeGutter(current);
    });
    return {
      resize(width, height) {
        if (width === 0 || height === 0) return;
        editor.layout({ width, height });
        if (current !== void 0) placeGutter(current);
      },
      update(config) {
        current = config;
        if (config.mode !== layout) {
          layout = config.mode;
          editor.updateOptions({ renderSideBySide: layout === "side" });
          editor.layout({ width: host.clientWidth, height: host.clientHeight });
        }
        const next = signatureOf(config);
        if (next !== signature) {
          signature = next;
          clearWidgets();
        }
        placeGutter(config);
      },
      reposition() {
        if (current !== void 0) placeGutter(current);
      },
      updateFont(next) {
        codeFont = next;
        editor.updateOptions({ fontFamily: codeFont.family, ...codeFont.size === void 0 ? {} : { fontSize: codeFont.size } });
      },
      dispose() {
        disposeScroll.dispose();
        disposeLayout.dispose();
        disposeDiff.dispose();
        clearWidgets();
        layer.remove();
        editor.dispose();
        original.dispose();
        modifiedModel.dispose();
      }
    };
  }
  function blockTag(prefix, config, block) {
    const node = document.createElement("div");
    node.className = `${prefix}-monaco-block`;
    node.dataset.gitHunk = String(block.hunk);
    node.dataset.gitRegion = String(block.region);
    const rule = document.createElement("span");
    rule.className = `${prefix}-monaco-rule`;
    node.appendChild(rule);
    const stack = document.createElement("span");
    stack.className = `${prefix}-monaco-stack`;
    for (const button2 of actionsOf(prefix, config, block)) stack.appendChild(button2);
    node.appendChild(stack);
    return node;
  }
  function actionsOf(prefix, config, block) {
    if (config.side === "commit") return [];
    if (config.side === "staged") {
      return [actionButton(prefix, config, block, "unstage", config.t("hunk.unstage"))];
    }
    const buttons = [actionButton(prefix, config, block, "stage", config.t("hunk.stage"))];
    if (config.discard !== void 0) {
      buttons.unshift(actionButton(prefix, config, block, "discard", config.t("hunk.discard")));
    }
    return buttons;
  }
  function actionButton(prefix, config, block, action, label) {
    const button2 = document.createElement("button");
    button2.type = "button";
    button2.className = `${prefix}-monaco-action`;
    button2.dataset.gitHunkAction = action;
    button2.dataset.gitHunk = String(block.hunk);
    button2.dataset.gitRegion = String(block.region);
    button2.disabled = config.busy;
    button2.title = label;
    button2.setAttribute("aria-label", label);
    button2.appendChild(glyph(action === "discard" ? "undo" : action));
    button2.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (action === "discard") config.discard?.(block.hunk, block.region);
      else config.move(block.hunk, block.region, action);
    });
    return button2;
  }
  function glyph(name) {
    const svg = document.createElementNS(SVG_NAMESPACE, "svg");
    svg.setAttribute("viewBox", VIEW_BOX);
    svg.setAttribute("width", String(ACTION_ICON));
    svg.setAttribute("height", String(ACTION_ICON));
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const path = document.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute("d", ICONS[name]);
    svg.appendChild(path);
    return svg;
  }
  function useMonacoApiState(R, resolve) {
    const [state, setState] = R.useState({ status: "loading" });
    R.useEffect(() => {
      let live = true;
      void resolve().then((api) => {
        if (!live) return;
        setState(api === void 0 ? { status: "failed" } : { status: "ready", api });
      }, (error) => {
        console.warn(
          "git-sidebar: the diff editor namespace failed to resolve (%s); diffs stay textual",
          error instanceof Error ? error.message : String(error)
        );
        if (live) setState({ status: "failed" });
      });
      return () => {
        live = false;
      };
    }, [resolve]);
    return state;
  }
  function widgetConfig(props, mode) {
    return {
      mode,
      hunks: props.hunks,
      side: props.side,
      busy: props.busy,
      t: props.t,
      ...props.discard === void 0 ? {} : { discard: props.discard },
      move: props.move
    };
  }
  function makeMonacoDiffView(React, prefix) {
    const R = React;
    return function MonacoDiffView(props) {
      const hostRef = R.useRef(null);
      const engineRef = R.useRef(null);
      const [mode, setMode] = R.useState("inline");
      const [broken, setBroken] = R.useState(false);
      const configRef = R.useRef(widgetConfig(props, "inline"));
      R.useEffect(() => {
        const host = hostRef.current;
        if (host === null) return;
        let engine;
        try {
          engine = createEngine(
            props.api,
            host,
            props.path,
            props,
            prefix,
            mode,
            readCodeFont(),
            props.t("editor.label")
          );
        } catch (error) {
          console.warn(
            "git-sidebar: the Monaco diff editor could not be created (%s)",
            error instanceof Error ? error.message : String(error)
          );
          setBroken(true);
          return;
        }
        engineRef.current = engine;
        const config = widgetConfig(props, mode);
        configRef.current = config;
        engine.update(config);
        const observer = new ResizeObserver(() => {
          const width = host.clientWidth;
          const height = host.clientHeight;
          if (width === 0 || height === 0) return;
          engine.resize(width, height);
          const next = width >= SIDE_BY_SIDE_MIN_WIDTH ? "side" : "inline";
          setMode((previous) => previous === next ? previous : next);
        });
        observer.observe(host);
        return () => {
          observer.disconnect();
          engine.dispose();
          engineRef.current = null;
        };
      }, [props.api, props.path, props.oldText, props.newText]);
      R.useEffect(() => {
        const config = widgetConfig(props, mode);
        configRef.current = config;
        engineRef.current?.update(config);
      }, [mode, props.hunks, props.side, props.busy, props.t, props.move, props.discard]);
      R.useEffect(() => {
        if (props.onThemeChange === void 0) return;
        return props.onThemeChange(() => {
          engineRef.current?.updateFont(readCodeFont());
        });
      }, [props.onThemeChange]);
      if (broken) {
        return R.createElement(
          "div",
          { className: `${prefix}-note`, role: "status" },
          R.createElement("p", { className: `${prefix}-line-note` }, props.t("editor.unavailable"))
        );
      }
      return R.createElement("div", { className: `${prefix}-monaco`, ref: hostRef });
    };
  }

  // src/client/diff-commit.ts
  var PREFIX = "dsh-gsd";
  var STATUS_LETTERS = {
    added: "A",
    modified: "M",
    deleted: "D",
    renamed: "R",
    untracked: "?",
    conflicted: "U"
  };
  function makeCommitDiffBody(React, runtime) {
    const R = React;
    return function CommitDiffBody(props) {
      const sessionId = props.sessionId;
      const t = props.t;
      const api = useMonacoApiState(R, runtime.resolveApi);
      const [files, setFiles] = R.useState({ status: "loading" });
      const [selected, setSelected] = R.useState(void 0);
      const [sides, setSides] = R.useState({ status: "loading" });
      R.useEffect(() => {
        if (sessionId === void 0) return;
        let live = true;
        setFiles({ status: "loading" });
        void runtime.requestFiles({ sessionId, sha: props.sha }, props.signal).then((payload) => {
          if (!live) return;
          if (payload.kind === "error") setFiles({ status: "failed", message: payload.message });
          else setFiles({ status: "files", files: payload.files, merge: payload.merge === true });
        }, (error) => {
          if (live) setFiles({ status: "failed", message: messageOf2(error) });
        });
        return () => {
          live = false;
        };
      }, [sessionId, props.sha, props.revision, props.signal]);
      const listed = files.status === "files" ? files.files : void 0;
      R.useEffect(() => {
        if (listed === void 0) return;
        if (selected !== void 0 && listed.some((file) => file.path === selected)) return;
        setSelected(listed[0]?.path);
      }, [listed, selected]);
      const entry = listed?.find((file) => file.path === selected);
      R.useEffect(() => {
        if (sessionId === void 0 || entry === void 0 || entry.binary) {
          setSides({ status: "loading" });
          return;
        }
        let live = true;
        setSides({ status: "loading" });
        void runtime.requestSides({ sessionId, sha: props.sha, path: entry.path }, props.signal).then((payload) => {
          if (live) setSides({ status: "ready", sides: payload });
        }, (error) => {
          if (live) setSides({ status: "failed", message: messageOf2(error) });
        });
        return () => {
          live = false;
        };
      }, [sessionId, props.sha, props.revision, props.signal, entry?.path, entry?.binary]);
      return R.createElement(
        "div",
        {
          className: PREFIX,
          "data-git-diff": props.sha,
          "data-git-diff-commit": props.sha
        },
        head(R, t, props.sha, entry),
        // A merge has no single old side; saying which one the view took keeps the
        // file list, its counts, and the editor from implying otherwise.
        files.status === "files" && files.merge ? R.createElement("p", { className: `${PREFIX}-truncated`, role: "status" }, t("commit.merge")) : null,
        picker(R, t, listed, selected, (path) => {
          setSelected(path);
        }),
        body(R, t, {
          files,
          entry,
          sides,
          path: selected ?? props.sha,
          runtime,
          api
        })
      );
    };
  }
  function head(React, t, sha, entry) {
    return React.createElement(
      "div",
      { className: `${PREFIX}-head` },
      React.createElement("span", { className: `${PREFIX}-path`, title: sha }, sha),
      React.createElement("span", { className: `${PREFIX}-side` }, t("commit")),
      entry === void 0 ? null : React.createElement(
        "span",
        { className: `${PREFIX}-counts` },
        React.createElement("span", { className: `${PREFIX}-tally ${PREFIX}-up` }, `+${entry.added}`),
        React.createElement("span", { className: `${PREFIX}-tally ${PREFIX}-down` }, `-${entry.removed}`)
      )
    );
  }
  function picker(React, t, files, selected, choose) {
    if (files === void 0) return null;
    if (files.length <= 1) {
      return React.createElement(
        "div",
        { className: `${PREFIX}-files` },
        React.createElement("span", { className: `${PREFIX}-files-label` }, t("commit.files"), ` ${files.length}`)
      );
    }
    return React.createElement(
      "div",
      { className: `${PREFIX}-files` },
      React.createElement("label", { className: `${PREFIX}-files-label` }, t("commit.files")),
      React.createElement("select", {
        className: `${PREFIX}-files-select`,
        "data-git-diff-file-select": "",
        value: selected ?? "",
        onChange: (event) => {
          choose(event.target.value);
        }
      }, ...files.map((file) => React.createElement("option", {
        key: file.path,
        value: file.path
      }, `${STATUS_LETTERS[file.status] ?? "?"} ${file.path}`)))
    );
  }
  function body(React, t, state) {
    if (state.files.status === "loading") return skeleton(React);
    if (state.files.status === "failed") return note(React, t("commitFailed"), state.files.message);
    if (state.files.files.length === 0) return note(React, t("empty"));
    if (state.entry === void 0) return skeleton(React);
    if (state.entry.binary) return note(React, t("binary"), state.entry.path);
    if (state.sides.status === "loading") return skeleton(React);
    if (state.sides.status === "failed") return note(React, t("failed"), state.sides.message);
    const sides = state.sides.sides;
    if (sides.kind === "binary") return note(React, t("binary"), state.path);
    if (sides.kind === "too-large") return note(React, t("editor.tooLarge"), bytesOf(sides.bytes));
    if (sides.kind === "error") return note(React, t("failed"), sides.message);
    if (state.api.status === "failed") return note(React, t("editor.unavailable"));
    if (state.api.status === "loading") return skeleton(React);
    return React.createElement(state.runtime.diffView, {
      api: state.api.api,
      path: state.path,
      oldText: sides.oldText,
      newText: sides.newText,
      hunks: [],
      side: "commit",
      busy: false,
      t,
      move: () => void 0,
      ...state.runtime.onThemeChange === void 0 ? {} : { onThemeChange: state.runtime.onThemeChange }
    });
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
  function note(React, message, detail) {
    const repeat = detail === void 0 || detail === "" || detail === message;
    return React.createElement(
      "div",
      { className: `${PREFIX}-note`, role: "status" },
      React.createElement("p", { className: `${PREFIX}-line-note` }, message),
      repeat ? null : React.createElement("p", { className: `${PREFIX}-detail` }, detail ?? "")
    );
  }
  function bytesOf(bytes) {
    const units = ["B", "KiB", "MiB", "GiB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit] ?? "B"}`;
  }
  function messageOf2(error) {
    if (error instanceof Error && error.message !== "") return error.message;
    return String(error);
  }

  // src/client/hunk-controls.ts
  function hunkButtons(React, controls, index, prefix) {
    if (controls === void 0 || controls.side === "commit") return null;
    const staging = controls.side === "worktree";
    return React.createElement(
      "span",
      { className: `${prefix}-hunk-actions` },
      button(React, prefix, controls, index, staging ? "stage" : "unstage", staging ? "hunk.stage" : "hunk.unstage"),
      staging && controls.discard !== void 0 ? button(React, prefix, controls, index, "discard", "hunk.discard") : null
    );
  }
  function button(React, prefix, controls, index, action, label) {
    const name = controls.t(label);
    return React.createElement("button", {
      type: "button",
      className: `${prefix}-hunk-action`,
      "data-git-hunk-action": action,
      "data-git-hunk": String(index),
      disabled: controls.busy,
      title: name,
      "aria-label": name,
      onClick: () => {
        if (action === "discard") controls.discard?.(index, void 0);
        else controls.move(index, void 0, action);
      }
    }, Icon(React, action === "discard" ? "discard" : action));
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
      "unavailable": "\u5DEE\u5F02\u670D\u52A1\u4E0D\u53EF\u7528",
      "commit.files": "\u6587\u4EF6",
      "commit.merge": "\u5408\u5E76\u63D0\u4EA4\uFF1A\u9010\u6587\u4EF6\u6BD4\u8F83\u7684\u662F\u7B2C\u4E00\u7236\u63D0\u4EA4",
      "editor.label": "\u5DEE\u5F02\u7F16\u8F91\u5668",
      "editor.tooLarge": "\u6587\u4EF6\u8FC7\u5927\uFF0C\u5DEE\u5F02\u7F16\u8F91\u5668\u663E\u793A\u4E0D\u4E86\uFF0C\u5DF2\u9000\u56DE\u8865\u4E01\u89C6\u56FE",
      "editor.unavailable": "\u5DEE\u5F02\u7F16\u8F91\u5668\u4E0D\u53EF\u7528\uFF0C\u5DF2\u9000\u56DE\u8865\u4E01\u89C6\u56FE",
      "hunk.stage": "\u6682\u5B58\u6B64\u5757",
      "hunk.unstage": "\u53D6\u6D88\u6682\u5B58\u6B64\u5757",
      "hunk.discard": "\u56DE\u6EDA\u6B64\u5757\uFF08\u64A4\u9500\u5DE5\u4F5C\u533A\u91CC\u7684\u8FD9\u90E8\u5206\u6539\u52A8\uFF09"
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
      "unavailable": "The diff service is unavailable",
      "commit.files": "Files",
      "commit.merge": "Merge commit: files are compared against the first parent",
      "editor.label": "Diff editor",
      "editor.tooLarge": "The file is too large for the diff editor; showing the patch instead",
      "editor.unavailable": "The diff editor is unavailable; showing the patch instead",
      "hunk.stage": "Stage this block",
      "hunk.unstage": "Unstage this block",
      "hunk.discard": "Roll this block back out of the working tree"
    }
  };
  var SHORT_SHA = 7;
  var PREFIX2 = "dsh-gsd";
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
    const MonacoDiff = makeMonacoDiffView(React, PREFIX2);
    const CommitBody = runtime?.requestCommitFiles === void 0 || runtime.requestCommitSides === void 0 ? void 0 : makeCommitDiffBody(React, {
      requestFiles: runtime.requestCommitFiles,
      requestSides: runtime.requestCommitSides,
      diffView: (props) => MonacoDiff(props),
      resolveApi,
      t: translator(runtime?.t),
      ...runtime.onThemeChange === void 0 ? {} : { onThemeChange: runtime.onThemeChange }
    });
    async function resolveApi() {
      const service = runtime?.editor?.();
      if (service === void 0) return void 0;
      if (service.version !== 1) {
        console.warn("git-sidebar: the Monaco editor service is version %s, not 1; diffs stay textual", service.version);
        return void 0;
      }
      try {
        await service.ready;
      } catch (error) {
        console.warn("git-sidebar: the Monaco editor failed to load (%s); diffs stay textual", messageOf3(error));
        return void 0;
      }
      const api = service.monaco;
      if (api === void 0) {
        console.warn("git-sidebar: the Monaco editor reported readiness without a namespace; diffs stay textual");
        return void 0;
      }
      return api;
    }
    function DiffPanel(props) {
      const info = props.useTabInfo === void 0 ? void 0 : props.useTabInfo();
      const address = info?.tab.navigation.address ?? "";
      const target = targetOf(address, info?.tab.navigation.params);
      const revision = info?.tab.navigation.revision ?? 0;
      const sessionId = props.sessionId;
      const requestDiff = props.requestDiff ?? runtime?.requestDiff;
      const requestCommit = props.requestCommit ?? runtime?.requestCommit;
      const requestSides = props.requestSides ?? runtime?.requestSides;
      const discardHunk = props.discardHunk ?? runtime?.discardHunk;
      const t = translator(props.t ?? runtime?.t);
      const service = runtime?.editor?.();
      const editorExpected = service !== void 0 && service.version === 1;
      const apiState = useMonacoApiState(R, resolveApi);
      const api = apiState.status === "ready" ? apiState.api : void 0;
      const editorFailed = editorExpected && apiState.status === "failed";
      const useEditor = editorExpected && !editorFailed;
      const [state, setState] = R.useState({ status: "loading" });
      const [moving, setMoving] = R.useState(null);
      const [moveNotice, setMoveNotice] = R.useState("");
      const [revisionTick, setRevisionTick] = R.useState(0);
      const moveHunk = props.moveHunk ?? runtime?.moveHunk;
      const side = target === void 0 || target.kind === "commit" ? "commit" : target.staged ? "staged" : "worktree";
      const key = target === void 0 ? "" : targetKey(target);
      const reader = target === void 0 ? void 0 : target.kind === "commit" ? requestCommit : requestDiff;
      const missingReader = target !== void 0 && reader === void 0;
      const commitEditor = CommitBody !== void 0 && target?.kind === "commit" && useEditor;
      const readable = target !== void 0 && !commitEditor;
      const wantsSides = target?.kind === "file" && requestSides !== void 0 && useEditor;
      R.useEffect(() => {
        if (sessionId === void 0 || target === void 0 || missingReader || !readable) return;
        const controller = new AbortController();
        const sidesPending = wantsSides && requestSides !== void 0 && target.kind === "file" ? requestSides({ sessionId, path: target.path, staged: target.staged }, controller.signal) : void 0;
        let pending2;
        if (target.kind === "commit") {
          if (requestCommit === void 0) return;
          pending2 = requestCommit({ sessionId, sha: target.sha }, controller.signal);
        } else {
          if (requestDiff === void 0) return;
          pending2 = requestDiff({ sessionId, path: target.path, staged: target.staged }, controller.signal);
        }
        const outer = info?.tab.signal;
        let live = true;
        const stop = () => {
          live = false;
        };
        if (outer !== void 0) outer.addEventListener("abort", stop);
        setState({ status: "loading" });
        void pending2.then(async (payload) => {
          const sides = sidesPending === void 0 || payload.kind !== "text" || payload.hunks.length === 0 ? void 0 : await sidesPending;
          if (!live) return;
          setState({ status: "ready", payload, ...sides === void 0 ? {} : { sides } });
        }, (error) => {
          if (live) setState({ status: "failed", message: messageOf3(error) });
        });
        return () => {
          live = false;
          outer?.removeEventListener("abort", stop);
          controller.abort();
        };
      }, [
        address,
        key,
        sessionId,
        requestDiff,
        requestCommit,
        requestSides,
        revision,
        revisionTick,
        missingReader,
        readable,
        wantsSides
      ]);
      const settled = (outcome) => {
        setMoving(null);
        if (!outcome.ok) {
          setMoveNotice(outcome.message);
          return;
        }
        setMoveNotice("");
        clearDiffCache();
        setRevisionTick((tick) => tick + 1);
      };
      const refused = (error) => {
        setMoving(null);
        setMoveNotice(messageOf3(error));
      };
      const moveable = (moveHunk !== void 0 || discardHunk !== void 0) && target?.kind === "file" && sessionId !== void 0;
      const controls = moveable ? {
        side,
        busy: moving !== null,
        t,
        move: (hunk, region, direction) => {
          if (moveHunk === void 0 || target?.kind !== "file" || sessionId === void 0) return;
          setMoving(hunk);
          void moveHunk({
            sessionId,
            path: target.path,
            hunk,
            ...region === void 0 ? {} : { region }
          }, direction).then(settled, refused);
        },
        ...discardHunk === void 0 ? {} : {
          discard: (hunk, region) => {
            if (target?.kind !== "file" || sessionId === void 0) return;
            setMoving(hunk);
            void discardHunk({
              sessionId,
              path: target.path,
              hunk,
              ...region === void 0 ? {} : { region }
            }).then(settled, refused);
          }
        }
      } : void 0;
      if (commitEditor && target?.kind === "commit") {
        return R.createElement(CommitBody, {
          ...sessionId === void 0 ? {} : { sessionId },
          sha: target.sha,
          revision,
          ...info?.tab.signal === void 0 ? {} : { signal: info.tab.signal },
          t
        });
      }
      const truncated = state.status === "ready" && state.payload.kind === "text" && state.payload.truncated === true;
      const fallback = state.status === "ready" ? fallbackNote(t, state.sides) : void 0;
      const failedEditor = editorFailed ? t("editor.unavailable") : void 0;
      return R.createElement(
        "div",
        { className: PREFIX2, ...identityOf(target) },
        runtime?.stylesInstalled === true ? null : styleElement(R),
        head2(R, t, target, state),
        moveNotice === "" ? null : banner(R, moveNotice),
        truncated ? banner(R, t("truncated")) : null,
        failedEditor === void 0 ? null : banner(R, failedEditor),
        fallback === void 0 ? null : banner(R, fallback),
        content(R, {
          MonacoDiff,
          api,
          target,
          state,
          missingReader,
          ...controls === void 0 ? {} : { controls },
          revision: revisionTick,
          side,
          t,
          ...runtime?.onThemeChange === void 0 ? {} : { onThemeChange: runtime.onThemeChange }
        })
      );
    }
    function DiffUnavailable(props) {
      const t = translator(props.t ?? runtime?.t);
      return R.createElement(
        "div",
        { className: PREFIX2 },
        runtime?.stylesInstalled === true ? null : styleElement(R),
        note2(R, t("unavailable"))
      );
    }
    return function DiffBody(props) {
      const typed = props ?? {};
      const reads = typed.requestDiff !== void 0 || typed.requestCommit !== void 0 || runtime?.requestDiff !== void 0 || runtime?.requestCommit !== void 0;
      const usable = typeof typed.useTabInfo === "function" && typeof typed.sessionId === "string" && reads;
      return R.createElement(usable ? DiffPanel : DiffUnavailable, typed);
    };
  }
  function head2(React, t, target, state) {
    const counts = state.status === "ready" && state.payload.kind === "text" ? countOf(state.payload.hunks) : void 0;
    const named = target === void 0 ? "" : target.kind === "file" ? target.path : target.sha;
    const name = named === "" ? t("title") : named;
    return React.createElement(
      "div",
      { className: `${PREFIX2}-head` },
      React.createElement("span", { className: `${PREFIX2}-path`, title: name }, name),
      target === void 0 ? null : React.createElement("span", { className: `${PREFIX2}-side` }, sideOf(t, target)),
      counts === void 0 ? null : React.createElement(
        "span",
        { className: `${PREFIX2}-counts` },
        React.createElement("span", { className: `${PREFIX2}-tally ${PREFIX2}-up` }, `+${counts.added}`),
        React.createElement("span", { className: `${PREFIX2}-tally ${PREFIX2}-down` }, `-${counts.removed}`)
      )
    );
  }
  function content(React, options) {
    const { target, state, t, missingReader } = options;
    if (target === void 0) return note2(React, t("unknownTarget"));
    if (missingReader) {
      return note2(React, t(target.kind === "commit" ? "commitUnavailable" : "unavailable"));
    }
    if (state.status === "loading") return skeleton2(React);
    const failed = target.kind === "commit" ? t("commitFailed") : t("failed");
    if (state.status === "failed") return note2(React, failed, state.message);
    const payload = state.payload;
    if (payload.kind === "error") return note2(React, failed, payload.message);
    if (payload.kind === "binary") {
      return note2(React, t("binary"), target.kind === "file" ? target.path : target.sha);
    }
    if (payload.hunks.length === 0) return note2(React, t("empty"));
    const edited = montage(React, options, payload);
    if (edited !== void 0) return edited;
    return rows(React, payload.hunks, options.controls, options.revision);
  }
  function montage(React, options, payload) {
    const { api, target, state, controls, side, t } = options;
    if (api === void 0 || state.status !== "ready" || target?.kind !== "file") return void 0;
    const sides = state.sides;
    if (sides === void 0 || sides.kind !== "text" || payload.kind !== "text") return void 0;
    const editor = {
      api,
      path: target.path,
      oldText: sides.oldText,
      newText: sides.newText,
      hunks: payload.hunks,
      side,
      busy: controls?.busy === true,
      t,
      move: (hunk, region, direction) => {
        controls?.move(hunk, region, direction);
      },
      ...controls?.discard === void 0 ? {} : { discard: controls.discard },
      ...options.onThemeChange === void 0 ? {} : { onThemeChange: options.onThemeChange }
    };
    return React.createElement(options.MonacoDiff, editor);
  }
  function rows(React, hunks, controls, revision) {
    const drawn2 = toRows(hunks);
    let hunk = -1;
    return React.createElement(
      "div",
      { className: `${PREFIX2}-body`, "data-git-diff-revision": String(revision) },
      React.createElement(
        "div",
        { className: `${PREFIX2}-rows` },
        ...drawn2.map((row, index) => {
          if (row.kind === "hunk-header") hunk += 1;
          return drawnRow(React, row, index, row.kind === "hunk-header" ? hunkButtons(React, controls, hunk, PREFIX2) : null);
        })
      )
    );
  }
  function drawnRow(React, row, key, extra) {
    if (row.kind === "file") {
      return React.createElement("div", {
        key,
        className: `${PREFIX2}-file`,
        "data-git-diff-file": row.text,
        title: row.text
      }, row.text);
    }
    if (row.kind === "hunk-header") {
      return React.createElement("div", { key, className: `${PREFIX2}-hunk` }, row.text, extra);
    }
    if (row.kind === "meta") {
      return React.createElement("div", { key, className: `${PREFIX2}-meta` }, row.text);
    }
    return React.createElement(
      "div",
      {
        key,
        className: `${PREFIX2}-row ${PREFIX2}-${row.kind}`,
        "data-git-diff-row": row.kind
      },
      React.createElement("span", { className: `${PREFIX2}-no` }, row.oldNo ?? ""),
      React.createElement("span", { className: `${PREFIX2}-no` }, row.newNo ?? ""),
      React.createElement("span", { className: `${PREFIX2}-sign` }, signOf(row.kind)),
      React.createElement("span", { className: `${PREFIX2}-text` }, row.text)
    );
  }
  function signOf(kind) {
    if (kind === "added") return "+";
    if (kind === "removed") return "-";
    return " ";
  }
  function note2(React, message, detail) {
    const repeat = detail === void 0 || detail === "" || detail === message;
    return React.createElement(
      "div",
      { className: `${PREFIX2}-note`, role: "status" },
      React.createElement("p", { className: `${PREFIX2}-line-note` }, message),
      repeat ? null : React.createElement("p", { className: `${PREFIX2}-detail` }, detail ?? "")
    );
  }
  function fallbackNote(t, sides) {
    if (sides === void 0 || sides.kind === "text") return void 0;
    if (sides.kind === "too-large") return `${t("editor.tooLarge")} (${bytesOf(sides.bytes)})`;
    const reason = sides.kind === "error" ? sides.message : "";
    return reason === "" ? t("editor.unavailable") : `${t("editor.unavailable")}: ${reason}`;
  }
  function banner(React, text) {
    return React.createElement("p", { className: `${PREFIX2}-truncated`, role: "status" }, text);
  }
  function skeleton2(React) {
    const widths = [62, 40, 74, 51, 33, 68, 45];
    return React.createElement(
      "div",
      { className: `${PREFIX2}-body`, "aria-busy": "true" },
      ...widths.map((width, index) => React.createElement("div", {
        key: index,
        className: `${PREFIX2}-skeleton`,
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
  function messageOf3(error) {
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
.${PREFIX2} {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
}
.${PREFIX2}-chip {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.${PREFIX2}-head {
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
.${PREFIX2}-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary);
}
.${PREFIX2}-side {
  flex: none;
  padding: 1px 6px;
  border-radius: var(--dsw-radius-xs);
  background: var(--dsw-alias-bg-layer-2);
}
.${PREFIX2}-counts {
  flex: none;
  display: flex;
  gap: 6px;
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}
.${PREFIX2}-up {
  color: var(--dsw-alias-state-success-primary);
}
.${PREFIX2}-down {
  color: var(--dsw-alias-state-error-primary);
}
.${PREFIX2}-files {
  display: flex;
  flex: none;
  gap: 8px;
  align-items: center;
  box-sizing: border-box;
  padding: 4px 12px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l3);
}
.${PREFIX2}-files-label {
  flex: none;
  color: var(--dsw-alias-label-secondary);
}
.${PREFIX2}-files-select {
  flex: 1 1 auto;
  min-width: 0;
  padding: 2px 6px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1);
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-sm);
  font-family: var(--dsh-font-family-code, ui-monospace, monospace);
  font-size: var(--dsh-code-font-size, 11px);
}
.${PREFIX2}-monaco {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
.${PREFIX2}-monaco-actions {
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
}
.${PREFIX2}-monaco-block {
  position: absolute;
  top: 0;
  left: 0;
  width: 16px;
  pointer-events: none;
}
.${PREFIX2}-monaco-rule {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 7px;
  width: 1px;
  background: var(--dsw-alias-border-l2);
}
.${PREFIX2}-monaco-stack {
  position: absolute;
  top: 50%;
  left: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  transform: translateY(-50%);
  pointer-events: none;
}
.${PREFIX2}-monaco-action {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 16px;
  height: 16px;
  padding: 0;
  color: var(--dsw-alias-label-secondary);
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-xs);
  cursor: pointer;
  pointer-events: auto;
}
.${PREFIX2}-monaco-action:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}
.${PREFIX2}-monaco-action:disabled {
  color: var(--dsw-alias-label-dimmed);
  cursor: default;
}
.${PREFIX2}-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
.${PREFIX2}-rows {
  display: flex;
  flex-direction: column;
  min-width: min-content;
  padding: 4px 0 12px;
}
.${PREFIX2}-row {
  display: flex;
  min-width: max-content;
  line-height: 18px;
}
.${PREFIX2}-no {
  flex: none;
  width: 5ch;
  padding-right: 8px;
  text-align: right;
  color: var(--dsw-alias-label-secondary);
  user-select: none;
  font-variant-numeric: tabular-nums;
  font-family: var(--dsh-font-family-code, ui-monospace, monospace);
}
.${PREFIX2}-sign {
  flex: none;
  width: 2ch;
  text-align: center;
  user-select: none;
  color: var(--dsw-alias-label-secondary);
  font-family: var(--dsh-font-family-code, ui-monospace, monospace);
}
.${PREFIX2}-text {
  flex: 1 1 auto;
  padding-right: 12px;
  white-space: pre;
  tab-size: 4;
  font-family: var(--dsh-font-family-code, ui-monospace, monospace);
  font-size: var(--dsh-code-font-size, 11px);
}
.${PREFIX2}-added {
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent);
}
.${PREFIX2}-removed {
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);
}
.${PREFIX2}-context {
  background: transparent;
}
.${PREFIX2}-file {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 4px 12px;
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: var(--dsw-alias-bg-layer-2);
  border-bottom: 0.5px solid var(--dsw-alias-border-l3);
}
.${PREFIX2}-hunk {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 2px 12px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-1);
  white-space: pre;
  font-family: var(--dsh-font-family-code, ui-monospace, monospace);
}
.${PREFIX2}-hunk-actions {
  display: flex;
  flex: none;
  gap: 2px;
  margin-left: auto;
  font-family: var(--dsh-content-font-family, inherit);
}
.${PREFIX2}-hunk-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 2px;
  color: var(--dsw-alias-label-secondary);
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-xs);
  cursor: pointer;
}
.${PREFIX2}-hunk-action svg {
  width: 16px;
  height: 16px;
}
.${PREFIX2}-hunk-action:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}
.${PREFIX2}-hunk-action:disabled {
  color: var(--dsw-alias-label-dimmed);
  cursor: default;
}
.${PREFIX2}-meta {
  padding: 0 12px;
  color: var(--dsw-alias-label-secondary);
  font-style: italic;
  white-space: pre;
}
.${PREFIX2}-truncated {
  flex: none;
  margin: 8px 12px;
  padding: 4px 8px;
  border-radius: var(--dsw-radius-sm);
  color: var(--dsw-alias-state-warn-primary);
  background: var(--dsw-alias-bg-layer-1);
}
.${PREFIX2}-note {
  flex: 1 1 auto;
  padding: 16px 12px;
  color: var(--dsw-alias-label-secondary);
}
.${PREFIX2}-line-note {
  margin: 0;
}
.${PREFIX2}-detail {
  margin: 6px 0 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--dsh-font-family-code, ui-monospace, monospace);
  font-size: var(--dsh-code-font-size, 11px);
}
.${PREFIX2}-skeleton {
  height: 10px;
  margin: 8px 12px;
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-layer-2);
}
`;

  // src/client/styles.ts
  var PREFIX3 = "gs";
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

/*
 * The refresh bar, copied from VS Code's progressbar: a 2px track whose bit is
 * 2% wide and sweeps to 4900% of its own width. The track is always drawn and
 * only the bit hides, so the header below never moves.
 */
.gs-progress {
  box-sizing: border-box;
  width: 100%;
  height: 2px;
  overflow: hidden; /* keep progress bit in bounds */
  position: relative;
  flex: none;
}

.gs-progress-bit {
  position: absolute;
  left: 0;
  width: 2%;
  height: 2px;
  display: none;
  background: var(--dsw-alias-brand-primary);
}

.gs-progress[data-active] .gs-progress-bit {
  display: block;
}

.gs-progress[data-infinite] .gs-progress-bit {
  animation-name: gs-progress;
  animation-duration: 4s;
  animation-iteration-count: infinite;
  animation-timing-function: linear;
  transform: translate3d(0, 0, 0);
}

/*
 * VS Code switches to steps(100) past ten seconds, which keeps a stuck run from
 * asking the compositor for every frame.
 */
.gs-progress[data-infinite][data-long-running] .gs-progress-bit {
  animation-timing-function: steps(100);
}

@keyframes gs-progress {
  from { transform: translateX(0%) scaleX(1); }
  50%  { transform: translateX(2500%) scaleX(3); }
  to   { transform: translateX(4900%) scaleX(1); }
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

.gs-repo-wrap {
  flex: none;
  max-width: 40%;
}

/* The repository picker: the header's path reading, now a control. */
.gs-repo {
  display: inline-flex;
  gap: 2px;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  padding: 2px 4px;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-size: 11px;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-xs);
  cursor: pointer;
}

.gs-repo:hover:not(:disabled) {
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-2);
}

.gs-repo:disabled {
  cursor: default;
}

.gs-repo-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-repo-menu {
  min-width: 240px;
}

.gs-repo-list {
  display: flex;
  flex-direction: column;
  margin: 0 0 4px;
  padding: 0;
  list-style: none;
}

.gs-repo-option {
  display: flex;
  flex: 1 1 auto;
  gap: 6px;
  align-items: center;
  box-sizing: border-box;
  min-width: 0;
  min-height: 28px;
  padding: 3px 8px 3px 4px;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  text-align: start;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-xs);
  cursor: pointer;
}

.gs-repo-option:hover:not(:disabled) {
  background: var(--dsw-alias-bg-layer-2);
}

.gs-repo-option[data-current] {
  color: var(--dsw-alias-brand-primary);
  font-weight: 600;
}

.gs-repo-option:disabled {
  color: var(--dsw-alias-label-dimmed);
  cursor: default;
}

.gs-repo-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-repo-badge {
  flex: none;
  margin-left: auto;
  padding: 0 4px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
  line-height: 16px;
  background: var(--dsw-alias-bg-layer-2);
  border-radius: var(--dsw-radius-xs);
}

/* The agent tools' conversation rows: one line of title and summary, plus the
   control that puts the panel back on screen. */
.gs-tool-row {
  display: flex;
  gap: 8px;
  align-items: center;
  box-sizing: border-box;
  padding: 6px 8px;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
}

.gs-tool-row > svg {
  flex: none;
  color: var(--dsw-alias-label-secondary);
}

.gs-tool-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.gs-tool-title {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-tool-summary {
  overflow: hidden;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-tool-open {
  flex: none;
  padding: 3px 8px;
  color: var(--dsw-alias-brand-primary);
  font: inherit;
  font-size: 11px;
  background: transparent;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
}

.gs-tool-open:hover:not(:disabled) {
  background: var(--dsw-alias-bg-layer-2);
}

.gs-tool-open:disabled {
  color: var(--dsw-alias-label-dimmed);
  cursor: default;
}

.gs-tool-open:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -1px;
}

.gs-graph-arrow {
  pointer-events: none;
}

/* The arrow's click area: invisible, and wide enough to hit without aiming. */
.gs-graph-jump {
  fill: transparent;
  cursor: pointer;
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
  animation: gs-spin 1s linear infinite;
}

.gs-tool:disabled {
  color: var(--dsw-alias-label-dimmed);
  cursor: default;
}

@keyframes gs-spin {
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

/* A headless group keeps only its actions, which still need to sit at the end. */
.gs-group-head-actions {
  justify-content: flex-end;
  padding: 2px 4px;
}

/*
 * The three lists as a strip rather than a stack: a reader works in one of them
 * at a time, and the two they are not in were taking the height the one they
 * are in needed.
 */
.gs-tabs {
  display: flex;
  flex: none;
  gap: 2px;
  align-items: stretch;
  padding: 4px 4px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l3);
}

.gs-tab {
  display: inline-flex;
  flex: 1 1 auto;
  gap: 5px;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 5px 6px;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-sm) var(--dsw-radius-sm) 0 0;
  cursor: pointer;
}

.gs-tab[data-active] {
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
  background: var(--dsw-alias-interactive-bg-hover);
  box-shadow: inset 0 -2px 0 var(--dsw-alias-brand-primary);
}

.gs-tab:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -1px;
}

.gs-tab-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  flex: 1 1 auto;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  padding: 8px 8px 10px;
  overflow: auto;
  border-top: 0.5px solid var(--dsw-alias-border-l3);
}

/* The message field is the one control that gives way when the reader shrinks
   the region: the amend row and the buttons keep their height, and the field
   shrinks to a single line before anything else is cut. */
.gs-commit-input {
  box-sizing: border-box;
  flex: 1 1 auto;
  width: 100%;
  min-height: 24px;
  max-height: 40vh;
  padding: 6px 8px;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  resize: none;
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

/* The amend row and the buttons keep their height: only the message field gives
   way, and it stops at a single line before anything is clipped. */
.gs-commit-head,
.gs-commit-foot {
  flex: none;
}

.gs-commit-foot {
  display: flex;
  gap: 8px;
  align-items: center;
}

/*
 * The amend row sits above the field and the buttons below it, which is the
 * order JetBrains uses: the toggle changes what the buttons will do, so it is
 * read before them, and the two send actions close the block.
 */
.gs-commit-head {
  position: relative;
  display: flex;
  flex: none;
  gap: 6px;
  align-items: center;
}

.gs-commit-recent,
.gs-commit-draft {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 22px;
  height: 22px;
  padding: 0;
  color: var(--dsw-alias-label-tertiary);
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
}

/* The draft button reads as the notable one in this row: it is the only
   control there that writes something on the reader's behalf. */
.gs-commit-draft {
  margin-left: auto;
  color: var(--dsw-alias-brand-primary);
}

.gs-commit-draft[data-turning] svg {
  animation: gs-spin 1s linear infinite;
}

.gs-commit-recent:disabled,
.gs-commit-draft:disabled {
  cursor: default;
  opacity: 0.5;
}

.gs-commit-recent-menu {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  min-width: 220px;
  max-width: 100%;
  padding: 4px;
  margin-top: 2px;
  background: var(--dsw-alias-bg-layer-2);
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-md);
  box-shadow: var(--dsw-shadow-md, 0 6px 18px rgb(0 0 0 / 24%));
}

.gs-commit-recent-item {
  padding: 5px 8px;
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  text-align: start;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
}

.gs-commit-push {
  flex: none;
  box-sizing: border-box;
  height: 28px;
  padding: 0 12px;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  background: var(--dsw-alias-bg-layer-1);
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-md);
  cursor: pointer;
}

.gs-commit-push:disabled {
  color: var(--dsw-alias-label-tertiary);
  cursor: default;
}

.gs-commit-push:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}

.gs-commit-hint {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  text-align: end;
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

.gs-row[data-selected] {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);
}

.gs-selection {
  display: flex;
  flex: none;
  gap: 8px;
  align-items: center;
  margin: 4px 0 0;
  padding: 4px 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent);
  border-radius: var(--dsw-radius-sm);
}

.gs-selection-clear {
  margin-left: auto;
  padding: 0;
  color: var(--dsw-alias-brand-primary);
  font: inherit;
  font-size: 11px;
  background: transparent;
  border: 0;
  cursor: pointer;
}

/*
 * The filter and the list's actions share one row: they are two halves of the
 * same job, and the group used to spend a whole line on the second half.
 */
.gs-toolbar {
  display: flex;
  flex: none;
  gap: 6px;
  align-items: center;
  padding: 6px 4px 2px;
}

.gs-toolbar .gs-filter {
  flex: 1 1 auto;
  min-width: 0;
}

.gs-toolbar-fill {
  flex: 1 1 auto;
}

.gs-filter {
  flex: none;
  box-sizing: border-box;
  width: 100%;
  margin: 4px 0 6px;
  padding: 4px 8px;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  background: var(--dsw-alias-bg-layer-1);
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-sm);
  outline: none;
}

.gs-filter:focus {
  border-color: var(--dsw-alias-state-business-primary);
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

/* The preview: a branch the panel describes without checking it out. */

.gs-preview-badge {
  flex: none;
  padding: 0 5px;
  color: var(--dsw-alias-brand-primary);
  font-size: 10px;
  font-weight: 600;
  line-height: 15px;
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent);
  border-radius: var(--dsw-radius-xs);
}

.gs-preview-bar {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
  align-items: center;
  padding: 3px 8px 3px 12px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent);
  border-bottom: 0.5px solid var(--dsw-alias-border-l3);
}

.gs-preview-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-preview-exit {
  flex: none;
  padding: 1px 6px;
  color: var(--dsw-alias-brand-primary);
  font: inherit;
  font-size: 11px;
  background: transparent;
  border: 0.5px solid var(--dsw-alias-brand-primary);
  border-radius: var(--dsw-radius-xs);
  cursor: pointer;
}

.gs-branch-btn:focus-visible,
.gs-branch-act:focus-visible,
.gs-preview-exit:focus-visible,
.gs-repo:focus-visible,
.gs-repo-option:focus-visible,
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
  position: fixed;
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
  /*
   * The picker is placed under the branch button by measurement, so it keeps
   * the shared menu width. It is wider than the other menus because a row holds
   * a branch name and three text buttons.
   */
  min-width: 300px;
  max-width: min(380px, calc(100vw - 24px));
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
  flex: 1 1 auto;
  gap: 6px;
  align-items: center;
  box-sizing: border-box;
  min-width: 0;
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
  flex: 1 1 auto;
  min-width: 0;
  padding: 0 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-radius: var(--dsw-radius-xs);
}

.gs-branch-space {
  flex: none;
  width: 16px;
}

/* One branch row: its name, then the three text buttons that act on it. */

.gs-branch-item {
  display: flex;
  flex: none;
  gap: 2px;
  align-items: center;
  min-height: 28px;
  padding-inline: 4px;
  border-radius: var(--dsw-radius-xs);
}

.gs-branch-item[data-current] .gs-branch-option-name {
  color: var(--dsw-alias-brand-primary);
  font-weight: 600;
}

.gs-branch-item[data-previewed] {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent);
}

/* The row's three actions read as one family, so the eye can compare them. */
.gs-branch-act {
  flex: none;
  padding: 1px 6px;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  line-height: 16px;
  white-space: nowrap;
  background: transparent;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-xs);
  cursor: pointer;
}

.gs-branch-act[data-act='preview'][data-active] {
  color: var(--dsw-alias-brand-primary);
  border-color: var(--dsw-alias-brand-primary);
}

.gs-branch-act[data-act='delete'] {
  color: var(--dsw-alias-label-tertiary);
}

.gs-branch-act:disabled {
  color: var(--dsw-alias-label-dimmed);
  border-color: var(--dsw-alias-border-l3);
  cursor: default;
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

/* History: the header, the graph gutter, and the rows it stacks. */

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

.gs-history-count {
  flex: none;
  min-width: 16px;
  padding: 0 5px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  line-height: 16px;
  text-align: center;
  background: color-mix(in srgb, var(--dsw-alias-label-secondary) 12%, transparent);
  border-radius: var(--dsw-radius-xs);
}

/* The branch a previewed log belongs to, named beside the history title. */
.gs-history-branch {
  flex: none;
  max-width: 40%;
  padding: 0 5px;
  overflow: hidden;
  color: var(--dsw-alias-brand-primary);
  font-size: 11px;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 0.5px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent);
  border-radius: var(--dsw-radius-xs);
}

.gs-history-refresh {
  width: 24px;
  height: 24px;
  margin-left: auto;
  padding: 2px;
}

.gs-history-refresh svg {
  width: 16px;
  height: 16px;
}

.gs-history-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  /*
   * Rows are a fixed height and the region is sized in whole rows, so snapping
   * keeps a wheel gesture from parking the list between two of them: a row cut
   * at the top edge reads as a broken list even when it is only a scroll offset.
   */
  scroll-snap-type: y mandatory;
}

/*
 * The graph wraps the list so one node carries the lane count the whole column
 * shares: every row's slice is drawn at the widest row's width, which is what
 * keeps the gutters aligned while a reader scrolls.
 */
.gs-graph {
  display: flex;
  flex-direction: column;
}

.gs-commits {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0 0 4px;
  list-style: none;
}

.gs-commit-row {
  display: flex;
  flex: none;
  height: 26px;
  padding: 0 6px 0 0;
  border-radius: var(--dsw-radius-sm);
  scroll-snap-align: start;
}

/*
 * The menu button is hidden until the row is hovered or holds the focus, so a
 * long history reads as a list of commits rather than a grid of controls. It
 * still occupies its width, which is what keeps the rows from shifting as the
 * pointer moves down them.
 */
.gs-commit-more {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 20px;
  height: 20px;
  align-self: center;
  padding: 0;
  color: var(--dsw-alias-label-tertiary);
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  opacity: 0;
  cursor: pointer;
}

.gs-commit-row:hover .gs-commit-more,
.gs-commit-row:focus-within .gs-commit-more,
.gs-commit-more[aria-expanded='true'] {
  opacity: 1;
}

.gs-commit-more:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -1px;
  opacity: 1;
}

/* Placed by the row's own measurement, so it escapes the list's scroller. */
.gs-commit-menu {
  position: fixed;
  z-index: 21;
  display: flex;
  flex-direction: column;
  min-width: 190px;
  padding: 4px;
  background: var(--dsw-alias-bg-layer-2);
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-md);
  box-shadow: var(--dsw-shadow-md, 0 6px 18px rgb(0 0 0 / 24%));
}

.gs-commit-menu-item {
  padding: 5px 8px;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  text-align: start;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
}

.gs-commit-menu-item:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -1px;
}

.gs-commit-open {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: auto auto minmax(0, 1fr) auto auto;
  gap: 0 6px;
  align-items: center;
  box-sizing: border-box;
  height: 26px;
  min-width: 0;
  padding: 0;
  color: inherit;
  font: inherit;
  text-align: start;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
}

/*
 * The slice is exactly one row tall and as wide as the graph, so the stroke that
 * ends at its bottom edge continues as the stroke that starts at the next row's
 * top edge. It may not be clipped: a cubic that leaves the row would show a cut.
 */
.gs-graph-row {
  display: block;
  flex: none;
  overflow: visible;
}

.gs-graph-line {
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.gs-graph-node {
  stroke: none;
}

.gs-sha {
  grid-column: 2;
  color: var(--dsw-alias-label-secondary);
  font-family: var(--dsh-font-family-code, ui-monospace, monospace);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.2px;
}

.gs-subject {
  grid-column: 3;
  min-width: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-refs {
  display: flex;
  grid-column: 4;
  flex-wrap: nowrap;
  gap: 3px;
  justify-content: flex-end;
  min-width: 0;
  overflow: hidden;
}

/*
 * A capsule's ink says what it names: the checked-out branch and the local
 * branches share the brand colour, a remote-tracking branch stays quiet, and a
 * tag takes the warning ink so it cannot be mistaken for a branch.
 */
.gs-ref {
  max-width: 120px;
  overflow: hidden;
  padding: 0 5px;
  font-size: 10px;
  font-weight: 600;
  line-height: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-radius: var(--dsw-radius-xs);
}

.gs-ref[data-git-ref-kind='head'] {
  color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent);
  box-shadow: inset 0 0 0 0.5px color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent);
}

.gs-ref[data-git-ref-kind='local'] {
  color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent);
}

.gs-ref[data-git-ref-kind='remote'] {
  color: var(--dsw-alias-label-secondary);
  background: color-mix(in srgb, var(--dsw-alias-label-secondary) 14%, transparent);
}

.gs-ref[data-git-ref-kind='tag'] {
  color: var(--dsw-alias-state-warn-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 14%, transparent);
}

.gs-commit-meta {
  display: flex;
  grid-column: 5;
  gap: 6px;
  align-items: baseline;
  min-width: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.gs-author {
  min-width: 0;
  max-width: 14ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-when {
  flex: none;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
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

/* The panel's own modal: a layer over the panel, not the browser's chrome. */
.gs-dialog-layer {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.gs-dialog-backdrop {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 40%, rgb(0 0 0 / 45%));
}

.gs-dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
  width: min(420px, 100%);
  max-height: 80vh;
  padding: 16px;
  overflow: auto;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-2);
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-lg, 12px);
  box-shadow: 0 16px 48px rgb(0 0 0 / 32%);
}

.gs-dialog-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.gs-dialog-body {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.gs-dialog-list {
  max-height: 180px;
  margin: 0;
  padding: 6px 8px;
  overflow: auto;
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsh-font-family-code, ui-monospace, monospace);
  font-size: 11px;
  list-style: none;
  background: var(--dsw-alias-bg-layer-1);
  border-radius: var(--dsw-radius-sm);
}

.gs-dialog-warning {
  margin: 0;
  color: var(--dsw-alias-state-warn-primary);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-line;
}

.gs-dialog-input {
  box-sizing: border-box;
  width: 100%;
  height: 30px;
  padding: 0 8px;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  background: var(--dsw-alias-bg-layer-1);
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-md);
  outline: none;
}

.gs-dialog-input:focus {
  border-color: var(--dsw-alias-state-business-primary);
}

.gs-dialog-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;
}

.gs-dialog-confirm,
.gs-dialog-cancel {
  box-sizing: border-box;
  min-width: 72px;
  height: 28px;
  padding: 0 14px;
  font: inherit;
  border-radius: var(--dsw-radius-md);
  cursor: pointer;
}

.gs-dialog-confirm {
  color: var(--dsw-alias-label-primary-foreground);
  font-weight: 600;
  background: var(--dsw-alias-button-primary-fill);
  border: 0;
}

.gs-dialog-confirm[data-danger] {
  color: var(--dsw-alias-label-primary-foreground);
  background: var(--dsw-alias-state-error-primary);
}

.gs-dialog-confirm:disabled {
  color: var(--dsw-alias-label-tertiary);
  background: var(--dsw-alias-bg-layer-1);
  border: 0.5px solid var(--dsw-alias-border-l3);
  cursor: default;
}

.gs-dialog-cancel {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1);
  border: 0.5px solid var(--dsw-alias-border-l3);
}

.gs-dialog-confirm:focus-visible,
.gs-dialog-cancel:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
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
  .gs-branch-item:hover .gs-branch-option-name,
  .gs-history-more:hover:not(:disabled) {
    background: var(--dsw-alias-interactive-bg-hover);
  }

  .gs-branch-act:hover:not(:disabled) {
    color: var(--dsw-alias-brand-primary);
    border-color: var(--dsw-alias-brand-primary);
  }

  .gs-branch-act[data-act='delete']:hover:not(:disabled) {
    color: var(--dsw-alias-state-error-primary);
    border-color: var(--dsw-alias-state-error-primary);
  }

  .gs-preview-exit:hover {
    background: var(--dsw-alias-interactive-bg-hover);
  }

  .gs-commit-row:hover {
    background: var(--dsw-alias-interactive-bg-hover);
  }

  .gs-tab:hover:not([data-active]),
  .gs-commit-more:hover,
  .gs-commit-menu-item:hover {
    background: var(--dsw-alias-interactive-bg-hover);
  }
}

@media (pointer: coarse) {
  .gs-menu-item {
    min-height: 40px;
  }

  .gs-branch-item {
    min-height: 40px;
  }

  .gs-branch-act,
  .gs-preview-exit {
    min-height: 26px;
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

/* The commit box at the start of a change row: it names what the next commit holds. */
.gs-pick {
  flex: none;
  margin: 0 0 0 6px;
  accent-color: var(--dsw-alias-button-primary-fill);
  cursor: pointer;
}

/*
 * The three regions of the body: the change list, the commit box, and the
 * history. Each takes exactly the height the reader set for it, so what one
 * holds never decides how much room the others get. The column scrolls when the
 * three heights do not fit, which is the one thing that keeps a short window
 * from hiding a region outright.
 */
.gs-panes {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.gs-pane {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border-top: 0.5px solid var(--dsw-alias-border-l3);
}

.gs-pane[data-collapsed] {
  flex: 0 0 auto;
}

/*
 * The grab strip on the region's top edge. It is 8px of padding over the whole
 * width rather than a visible bar, so the panel reads as three blocks of
 * content until the pointer finds it. It sits above the region's own content in
 * the stacking order: a body that overflows would otherwise paint over the strip
 * and take the pointer, which turns a resize into a scroll.
 */
.gs-pane-resize {
  position: relative;
  z-index: 2;
  flex: none;
  height: 8px;
  cursor: row-resize;
  background: transparent;
}

.gs-pane-resize:hover,
.gs-pane-resize:focus-visible {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent);
  outline: none;
}

.gs-pane-head {
  display: flex;
  flex: none;
  gap: 4px;
  align-items: center;
  min-height: 26px;
  padding: 2px 8px 2px 4px;
}

.gs-pane-toggle {
  display: inline-flex;
  flex: none;
  gap: 2px;
  align-items: center;
  min-width: 0;
  padding: 2px 4px;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-xs);
  cursor: pointer;
}

.gs-pane-toggle:hover {
  color: var(--dsw-alias-label-primary);
}

.gs-pane-toggle:focus-visible {
  outline: 1px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}

.gs-pane-toggle svg {
  width: 16px;
  height: 16px;
}

.gs-pane-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.gs-pane[data-collapsed] .gs-pane-body {
  display: none;
}

/* The commit box is a stack of controls rather than a list: the region is a flex
   column so the message field can give way while the amend row and the buttons
   keep their height, and the box scrolls only when the reader drags the region
   below what those controls need. */
.gs-pane[data-git-pane='commit'] .gs-pane-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0 2px 10px;
  overflow: hidden;
}

/* The change list keeps the same clearance at its foot, so the last row is not
   cut by the border of the region below it. */
.gs-pane[data-git-pane='changes'] .gs-pane-body {
  padding-bottom: 8px;
  overflow: auto;
  overscroll-behavior: contain;
}

/*
 * The history's own title button folds the same state as the region's head, so
 * two switches for one list would sit on top of each other. The region's head
 * carries the title and the fold; the history keeps the count and the refresh.
 */
.gs-pane[data-git-pane='history'] .gs-history-title {
  display: none;
}

/*
 * A drag must not select the labels it passes over: the pointer is moving the
 * divider, and the browser's default would paint a selection instead.
 */
body.gs-dragging {
  cursor: row-resize;
  user-select: none;
}
`;

  // src/client/branch-header.ts
  function mergeable(branches) {
    if (branches === void 0) return [];
    return branches.local.filter((name) => name !== branches.current);
  }
  var MENU_W = 340;
  function anchorUnder(node) {
    const box = node.getBoundingClientRect();
    const widest = window.innerWidth - MENU_W - 8;
    return { top: box.bottom + 4, left: Math.max(8, Math.min(box.left, widest)) };
  }
  function makeBranchHeader(React) {
    return function BranchHeader(props) {
      const { snapshot, loading, busy, t } = props;
      const [menu2, setMenu] = React.useState("none");
      const [menuAt, setMenuAt] = React.useState(null);
      const [branches, setBranches] = React.useState(void 0);
      const [draft, setDraft] = React.useState("");
      React.useEffect(() => {
        if (menu2 === "none") return;
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
      }, [menu2]);
      const close = () => {
        setMenu("none");
      };
      const openMenu = (kind, node) => {
        if (menu2 === kind) {
          setMenu("none");
          return;
        }
        setMenuAt(anchorUnder(node));
        setMenu(kind);
      };
      const detached = snapshot?.branch === null;
      const usable = snapshot !== void 0 && snapshot.kind === "repository";
      const checkedOut = !usable ? null : snapshot.branch ?? snapshot.commit ?? t("branch.unknown");
      const preview = usable ? props.preview : null;
      const label = !usable ? "" : preview ?? checkedOut ?? t("branch.unknown");
      const root = snapshot?.root;
      const upstream = usable && preview === null ? snapshot.upstream ?? null : null;
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
        { className: `${PREFIX3}-header-wrap` },
        React.createElement(
          "div",
          { className: `${PREFIX3}-header` },
          snapshot === void 0 || !usable ? React.createElement("span", {
            className: `${PREFIX3}-branch`,
            "data-git-branch": "",
            "data-git-branch-button": "",
            "data-unusable": "",
            "aria-busy": "true"
          }, snapshot === void 0 ? loading ? "\u2026" : "" : label) : React.createElement(
            "button",
            {
              type: "button",
              className: `${PREFIX3}-branch ${PREFIX3}-branch-btn`,
              "data-git-branch": "",
              "data-git-branch-button": "",
              "data-detached": detached ? "" : void 0,
              "data-git-preview": preview === null ? void 0 : "",
              "aria-haspopup": "menu",
              "aria-expanded": menu2 === "branch" ? "true" : "false",
              title: headerTitle(t, label, preview, checkedOut, root),
              onClick: (event) => {
                openMenu("branch", event.currentTarget);
              }
            },
            React.createElement("span", { className: `${PREFIX3}-branch-name` }, label),
            preview === null ? null : React.createElement("span", {
              className: `${PREFIX3}-preview-badge`,
              "data-git-preview-badge": ""
            }, t("branch.previewBadge")),
            Icon(React, "chevron", { size: 14 })
          ),
          upstreamSits(React, t, upstream),
          props.repo ?? null,
          React.createElement("button", {
            type: "button",
            className: `${PREFIX3}-tool`,
            "aria-label": t("more.actions"),
            title: t("more.actions"),
            "data-git-more": "",
            "aria-haspopup": "menu",
            "aria-expanded": menu2 === "more" ? "true" : "false",
            disabled: !usable || busy,
            onClick: (event) => {
              openMenu("more", event.currentTarget);
            }
          }, Icon(React, "more")),
          React.createElement("button", {
            type: "button",
            className: `${PREFIX3}-tool`,
            "aria-label": t("refresh"),
            title: t("refresh"),
            "data-git-refresh": "",
            "data-turning": loading ? "" : void 0,
            disabled: loading,
            onClick: props.refresh
          }, Icon(React, "refresh")),
          menu2 === "none" ? null : React.createElement("div", {
            className: `${PREFIX3}-backdrop`,
            "data-git-dismiss": "",
            onClick: close
          }),
          menu2 === "branch" ? picker2(React, props, branches, draft, setDraft, create, pick, busy, close, menuAt) : null,
          menu2 === "more" ? operations(React, props, usable, busy, () => {
            setMenu("none");
            props.sync("fetch");
          }, (action) => {
            setMenu("none");
            props.sync(action);
          }, () => {
            setMenu("none");
            props.stash();
          }, mergeable(branches), (branch) => {
            setMenu("none");
            props.mergeBranch(branch);
          }, menuAt) : null
        ),
        preview === null ? null : previewBar(React, t, preview, checkedOut, props.exitPreview),
        operation === null ? null : operationBar(React, t, operation, busy, props.abort)
      );
    };
  }
  function headerTitle(t, label, preview, checkedOut, root) {
    const lines = [label];
    if (preview !== null) lines.push(t("branch.previewHint", { current: checkedOut ?? "" }));
    if (root !== void 0) lines.push(root);
    return lines.join("\n");
  }
  function previewBar(React, t, preview, checkedOut, exit) {
    return React.createElement(
      "div",
      {
        className: `${PREFIX3}-preview-bar`,
        "data-git-preview-bar": preview,
        role: "status"
      },
      React.createElement("span", {
        className: `${PREFIX3}-preview-text`,
        title: t("branch.previewBar", { branch: preview, current: checkedOut ?? "" })
      }, t("branch.previewBar", { branch: preview, current: checkedOut ?? "" })),
      React.createElement("button", {
        type: "button",
        className: `${PREFIX3}-preview-exit`,
        "data-git-preview-exit": "",
        title: t("branch.previewExit"),
        onClick: exit
      }, t("branch.previewExit"))
    );
  }
  function upstreamSits(React, t, upstream) {
    if (upstream === null || upstream === void 0) return null;
    if (upstream.ahead === 0 && upstream.behind === 0) return null;
    return React.createElement(
      "span",
      {
        className: `${PREFIX3}-upstream`,
        "data-git-upstream": "",
        title: t("upstream.title", { name: upstream.name })
      },
      upstream.ahead === 0 ? null : React.createElement("span", { className: `${PREFIX3}-ahead`, "data-count": "ahead" }, `\u2191${upstream.ahead}`),
      upstream.behind === 0 ? null : React.createElement("span", { className: `${PREFIX3}-behind`, "data-count": "behind" }, `\u2193${upstream.behind}`)
    );
  }
  function operationBar(React, t, operation, busy, abort) {
    return React.createElement(
      "div",
      { className: `${PREFIX3}-operation`, "data-git-operation": operation },
      React.createElement(
        "span",
        { className: `${PREFIX3}-operation-text` },
        t(`operation.${operation}`, { operation })
      ),
      React.createElement("button", {
        type: "button",
        className: `${PREFIX3}-operation-abort`,
        "data-git-abort": "",
        disabled: busy,
        title: t("operation.abort"),
        onClick: abort
      }, t("operation.abort"))
    );
  }
  function picker2(React, props, branches, draft, setDraft, create, pick, busy, close, at) {
    const { t } = props;
    const current = branches?.current ?? null;
    const local = branches?.local ?? [];
    const preview = props.preview;
    return React.createElement(
      "div",
      {
        className: `${PREFIX3}-menu ${PREFIX3}-branch-menu`,
        "data-git-branch-menu": "",
        role: "menu",
        style: at === null ? void 0 : { top: `${at.top}px`, left: `${at.left}px` }
      },
      React.createElement("p", { className: `${PREFIX3}-menu-title` }, t("branch.selector")),
      branches === void 0 ? React.createElement("p", { className: `${PREFIX3}-menu-note`, role: "status" }, t("branch.loading")) : local.length === 0 ? React.createElement("p", { className: `${PREFIX3}-menu-note`, role: "status" }, t("branch.empty")) : React.createElement(
        "ul",
        { className: `${PREFIX3}-branch-list` },
        ...local.map((name) => branchRow(React, props, name, current, preview, busy, pick, (branch) => {
          close();
          props.previewBranch(branch);
        }))
      ),
      preview === null ? null : React.createElement("button", {
        type: "button",
        className: `${PREFIX3}-menu-item`,
        "data-git-preview-clear": "",
        role: "menuitem",
        title: t("branch.previewExit"),
        onClick: () => {
          close();
          props.exitPreview();
        }
      }, Icon(React, "eye"), React.createElement("span", null, t("branch.previewExit"))),
      React.createElement(
        "div",
        { className: `${PREFIX3}-new-branch` },
        React.createElement("input", {
          type: "text",
          className: `${PREFIX3}-new-branch-input`,
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
          className: `${PREFIX3}-new-branch-create`,
          "data-git-create-branch": "",
          disabled: busy || draft.trim() === "",
          title: t("branch.create"),
          onClick: create
        }, t("branch.create"))
      )
    );
  }
  function branchRow(React, props, name, current, preview, busy, pick, previewPick) {
    const { t } = props;
    const checkedOut = name === current;
    const previewing = name === preview;
    return React.createElement(
      "li",
      {
        key: name,
        className: `${PREFIX3}-branch-item`,
        "data-current": checkedOut ? "" : void 0,
        "data-previewed": previewing ? "" : void 0
      },
      // One fixed slot for the mark, so every row starts its name at the same
      // column whether it is the checkout, the preview, or neither.
      React.createElement(
        "span",
        { className: `${PREFIX3}-branch-space` },
        checkedOut ? Icon(React, "check", { size: 16 }) : previewing ? Icon(React, "eye", { size: 16 }) : null
      ),
      // The name is a label, not a control: the row acts through the three buttons
      // beside it, so a click on the text does nothing at all.
      React.createElement("span", {
        className: `${PREFIX3}-branch-option-name`,
        "data-git-branch-name": name,
        title: name
      }, name),
      React.createElement("button", {
        type: "button",
        className: `${PREFIX3}-branch-act`,
        "data-act": "checkout",
        "data-git-branch-option": name,
        "data-git-branch-checkout": name,
        role: "menuitem",
        disabled: busy || checkedOut,
        title: `${t("branch.checkout")} ${name}`,
        onClick: () => {
          pick(name);
        }
      }, t("branch.checkout")),
      React.createElement("button", {
        type: "button",
        className: `${PREFIX3}-branch-act`,
        "data-act": "preview",
        "data-git-branch-preview": name,
        "data-active": previewing ? "" : void 0,
        role: "menuitem",
        disabled: busy || checkedOut || previewing,
        title: `${t("branch.preview")} ${name}`,
        onClick: () => {
          previewPick(name);
        }
      }, t("branch.preview")),
      // The checked-out branch has no delete control: Git refuses it, so offering
      // the button would only produce a refusal.
      checkedOut ? null : React.createElement("button", {
        type: "button",
        className: `${PREFIX3}-branch-act`,
        "data-act": "delete",
        "data-git-branch-delete": name,
        role: "menuitem",
        disabled: busy,
        title: t("branch.delete"),
        onClick: () => {
          props.deleteBranch(name);
        }
      }, t("branch.remove"))
    );
  }
  function operations(React, props, usable, busy, fetch, sync, stash, localBranches, merge, at) {
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
        className: `${PREFIX3}-menu ${PREFIX3}-more-menu`,
        "data-git-more-menu": "",
        role: "menu",
        style: at === null ? void 0 : { top: `${at.top}px`, left: `${at.left}px` }
      },
      ...items.map((item) => React.createElement("button", {
        key: item.id,
        type: "button",
        className: `${PREFIX3}-menu-item`,
        "data-git-sync": item.id,
        role: "menuitem",
        disabled: busy || !usable,
        onClick: item.run
      }, Icon(React, item.icon), React.createElement("span", null, item.label))),
      React.createElement("span", { className: `${PREFIX3}-menu-sep`, role: "separator" }),
      React.createElement("button", {
        type: "button",
        className: `${PREFIX3}-menu-item`,
        "data-git-stash-new": "",
        role: "menuitem",
        disabled: busy || !usable,
        onClick: stash
      }, Icon(React, "stash"), React.createElement("span", null, t("stash.current"))),
      React.createElement("span", { className: `${PREFIX3}-menu-sep`, role: "separator" }),
      ...localBranches.length === 0 ? [] : [React.createElement("p", { key: "merge-label", className: `${PREFIX3}-menu-title` }, t("branch.mergeInto"))],
      ...localBranches.map((name) => React.createElement("button", {
        key: `merge:${name}`,
        type: "button",
        className: `${PREFIX3}-menu-item`,
        "data-git-merge": name,
        role: "menuitem",
        disabled: busy || !usable,
        onClick: () => {
          merge(name);
        }
      }, Icon(React, "merge"), React.createElement("span", null, name)))
    );
  }

  // src/client/repo-picker.ts
  var MENU_W2 = 260;
  function anchorUnder2(node) {
    const box = node.getBoundingClientRect();
    const widest = window.innerWidth - MENU_W2 - 8;
    return { top: box.bottom + 4, left: Math.max(8, Math.min(box.left, widest)) };
  }
  function lastSegment(path) {
    const trimmed = path.replace(/[\\/]+$/, "");
    const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
    return cut < 0 ? trimmed : trimmed.slice(cut + 1);
  }
  var KIND_KEY = {
    repository: "",
    submodule: "repo.submodule",
    worktree: "repo.worktree"
  };
  function labelOf2(entry) {
    return entry.relative === "." ? entry.name : entry.relative;
  }
  function makeRepoBar(React) {
    return function RepoBar(props) {
      const { t, root, busy, enabled } = props;
      const [open2, setOpen] = React.useState(false);
      const [at, setAt] = React.useState(null);
      const [list, setList] = React.useState(void 0);
      React.useEffect(() => {
        if (!open2) return;
        let live = true;
        setList(void 0);
        void props.list().then((next) => {
          if (live) setList(next);
        }).catch(() => {
          if (live) setList(void 0);
        });
        return () => {
          live = false;
        };
      }, [open2]);
      const toggle = (node) => {
        if (open2) {
          setOpen(false);
          return;
        }
        setAt(anchorUnder2(node));
        setOpen(true);
      };
      const close = () => {
        setOpen(false);
      };
      const pick = (next) => {
        setOpen(false);
        if (next !== root) props.select(next);
      };
      const known = list?.entries.find((entry) => entry.root === root);
      const label = root === void 0 ? props.loading ? "\u2026" : t("repo.none") : known === void 0 ? lastSegment(root) : labelOf2(known);
      return React.createElement(
        "div",
        { className: `${PREFIX3}-repo-wrap` },
        React.createElement(
          "button",
          {
            type: "button",
            className: `${PREFIX3}-repo`,
            "data-git-repo": "",
            "data-git-repo-button": "",
            "data-git-repo-root": root ?? "",
            "aria-haspopup": "menu",
            "aria-expanded": open2 ? "true" : "false",
            "aria-label": t("repo.selector"),
            title: root === void 0 ? t("repo.selector") : `${t("repo.selector")}
${root}`,
            disabled: !enabled || busy,
            onClick: (event) => {
              toggle(event.currentTarget);
            }
          },
          Icon(React, "repo", { size: 14 }),
          React.createElement("span", { className: `${PREFIX3}-repo-name` }, label),
          Icon(React, "chevron", { size: 14 })
        ),
        open2 ? React.createElement("div", {
          className: `${PREFIX3}-backdrop`,
          "data-git-dismiss": "",
          onClick: close
        }) : null,
        open2 ? menu(React, t, list, root, at, busy, pick, close) : null
      );
    };
  }
  function menu(React, t, list, root, at, busy, pick, close) {
    const entries2 = list?.entries ?? [];
    return React.createElement(
      "div",
      {
        className: `${PREFIX3}-menu ${PREFIX3}-repo-menu`,
        "data-git-repo-menu": "",
        role: "menu",
        style: at === null ? void 0 : { top: `${at.top}px`, left: `${at.left}px` }
      },
      React.createElement("p", { className: `${PREFIX3}-menu-title` }, t("repo.selector")),
      list === void 0 ? React.createElement("p", { className: `${PREFIX3}-menu-note`, role: "status" }, t("repo.loading")) : list.error !== void 0 ? React.createElement(
        "p",
        { className: `${PREFIX3}-menu-note`, role: "status" },
        `${t("repo.failed")}: ${list.error}`
      ) : entries2.length === 0 ? React.createElement("p", { className: `${PREFIX3}-menu-note`, role: "status" }, t("repo.empty")) : React.createElement(
        "ul",
        { className: `${PREFIX3}-repo-list` },
        ...entries2.map((entry) => React.createElement(
          "li",
          { key: entry.root },
          React.createElement(
            "button",
            {
              type: "button",
              className: `${PREFIX3}-repo-option`,
              "data-git-repo-option": entry.root,
              "data-current": entry.root === root ? "" : void 0,
              role: "menuitemradio",
              "aria-checked": entry.root === root ? "true" : "false",
              disabled: busy,
              title: entry.root,
              onClick: () => {
                pick(entry.root);
              }
            },
            // One fixed slot for the check, so every row starts at the same
            // column whether or not it is the current checkout.
            React.createElement(
              "span",
              { className: `${PREFIX3}-branch-space` },
              entry.root === root ? Icon(React, "check", { size: 16 }) : null
            ),
            React.createElement("span", { className: `${PREFIX3}-repo-path` }, labelOf2(entry)),
            KIND_KEY[entry.kind] === "" ? null : React.createElement("span", {
              className: `${PREFIX3}-repo-badge`,
              "data-kind": entry.kind
            }, t(KIND_KEY[entry.kind]))
          )
        ))
      ),
      React.createElement("span", { className: `${PREFIX3}-menu-sep`, role: "separator" }),
      ...footer(React, t, list, pick, close)
    );
  }
  function footer(React, t, list, pick, close) {
    if (list === void 0) return [];
    const parts = [React.createElement("p", {
      key: "scanned",
      className: `${PREFIX3}-menu-note`
    }, t("repo.scanned", { count: list.entries.length, depth: list.depth }))];
    if (list.truncated) {
      parts.push(React.createElement("p", { key: "truncated", className: `${PREFIX3}-menu-note` }, t("repo.truncated")));
    }
    if (list.warnings.length > 0) {
      parts.push(React.createElement(
        "p",
        { key: "warnings", className: `${PREFIX3}-menu-note` },
        t("repo.warnings", { count: list.warnings.length })
      ));
    }
    if (list.selected !== null) {
      parts.push(React.createElement("button", {
        key: "reset",
        type: "button",
        className: `${PREFIX3}-menu-item`,
        "data-git-repo-reset": "",
        role: "menuitem",
        title: list.scanRoot,
        onClick: () => {
          close();
          pick(void 0);
        }
      }, Icon(React, "undo"), React.createElement("span", null, t("repo.reset"))));
    }
    return parts;
  }

  // src/client/commit-box.ts
  function blockedReasonKey(props) {
    if (props.busy) return "commit.busy";
    if (props.clean && !props.amend) return "commit.clean";
    if (props.stagedCount === 0 && !props.amend && props.unstagedCount === 0) return "commit.nothingStaged";
    if (props.pickedCount === 0 && !props.amend && props.stagedCount > 0) return "commit.noPick";
    if (props.message.trim() === "") return "commit.emptyMessage";
    return void 0;
  }
  function hintOf(props) {
    const blocked = blockedReasonKey(props);
    if (blocked !== void 0) return props.t(blocked);
    if (props.identityMissing) return props.t("commit.identityMissing");
    if (props.pickedCount > 0) return props.t("commit.pickedHint", { count: props.pickedCount });
    if (props.amend) return props.t("commit.amendHint");
    if (props.stagedCount === 0) return props.t("commit.stageAllHint", { count: props.unstagedCount });
    return props.t("commit.hint", { count: props.stagedCount });
  }
  function CommitBox(React, props) {
    const { t, busy, identityMissing, canAmend, recent, recentOpen } = props;
    const blocked = blockedReasonKey(props);
    const stageAll = props.stagedCount === 0 && props.pickedCount === 0;
    const submit = () => {
      if (blocked === void 0) props.onSubmit(stageAll);
    };
    const submitAndPush = () => {
      if (blocked === void 0) props.onSubmitAndPush(stageAll);
    };
    return React.createElement(
      "div",
      { className: `${PREFIX3}-commit` },
      // Amend first: it changes what the buttons below will do, so it belongs
      // above the thing it modifies rather than beside the result.
      React.createElement(
        "div",
        { className: `${PREFIX3}-commit-head` },
        canAmend ? React.createElement(
          "label",
          { className: `${PREFIX3}-commit-amend` },
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
        canAmend && recent.length > 0 ? React.createElement("button", {
          type: "button",
          className: `${PREFIX3}-commit-recent`,
          "data-git-recent": "",
          "aria-haspopup": "menu",
          "aria-expanded": recentOpen ? "true" : "false",
          title: t("commit.recent"),
          "aria-label": t("commit.recent"),
          disabled: busy,
          onClick: () => {
            props.onRecentToggle();
          }
        }, Icon(React, "clock", { size: 14 })) : null,
        React.createElement("button", {
          type: "button",
          className: `${PREFIX3}-commit-draft`,
          "data-git-draft": "",
          "data-turning": props.drafting ? "" : void 0,
          title: t("commit.draft"),
          "aria-label": t("commit.draft"),
          disabled: busy || props.drafting,
          onClick: () => {
            props.onDraft();
          }
        }, Icon(React, "spark", { size: 14 })),
        recentOpen && recent.length > 0 ? React.createElement(
          "div",
          { className: `${PREFIX3}-commit-recent-menu`, "data-git-recent-menu": "", role: "menu" },
          ...recent.map((subject) => React.createElement("button", {
            key: subject,
            type: "button",
            className: `${PREFIX3}-commit-recent-item`,
            role: "menuitem",
            title: subject,
            onClick: () => {
              props.onChange(subject);
              props.onRecentToggle();
            }
          }, subject))
        ) : null
      ),
      React.createElement("textarea", {
        className: `${PREFIX3}-commit-input`,
        value: props.message,
        placeholder: t("commit.placeholder"),
        "aria-label": t("commit.placeholder"),
        "data-git-message": "",
        rows: 4,
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
        { className: `${PREFIX3}-commit-foot` },
        React.createElement("button", {
          type: "button",
          className: `${PREFIX3}-commit-submit`,
          "data-git-commit": "",
          disabled: blocked !== void 0,
          title: stageAll ? t("commit.stageAllSubmit") : t("commit.submit"),
          onClick: submit
        }, stageAll ? t("commit.stageAllSubmit") : t("commit.submit")),
        React.createElement("button", {
          type: "button",
          className: `${PREFIX3}-commit-push`,
          "data-git-commit-push": "",
          disabled: blocked !== void 0,
          title: t("commit.pushTitle"),
          onClick: submitAndPush
        }, t("commit.push")),
        React.createElement("p", {
          className: `${PREFIX3}-commit-hint`,
          "data-warn": identityMissing ? "" : void 0,
          role: blocked === void 0 ? void 0 : "status"
        }, hintOf(props))
      )
    );
  }

  // src/client/dialog-host.ts
  var pending = null;
  var listeners = /* @__PURE__ */ new Set();
  function announce() {
    for (const listener of listeners) listener();
  }
  function open(ask) {
    pending?.settle(null);
    return new Promise((settle) => {
      pending = { ask, settle };
      announce();
    });
  }
  function currentAsk() {
    return pending?.ask ?? null;
  }
  function watchDialogs(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
  function settleDialog(answer) {
    const asking = pending;
    if (asking === null) return;
    pending = null;
    announce();
    asking.settle(answer);
  }
  function askConfirm(ask) {
    return open(ask).then((answer) => answer === true);
  }
  function askText(ask) {
    return open(ask).then((answer) => {
      if (typeof answer !== "string") return null;
      const text = answer.trim();
      return text === "" ? null : text;
    });
  }
  function showNotice(ask) {
    return open(ask).then(() => void 0);
  }
  function makeDialogHost(React) {
    return function DialogHost() {
      const [ask, setAsk] = React.useState(currentAsk());
      const [draft, setDraft] = React.useState("");
      React.useEffect(() => {
        const read = () => {
          const next = currentAsk();
          setAsk(next);
          setDraft(next?.input ?? "");
        };
        read();
        return watchDialogs(read);
      }, []);
      if (ask === null) return null;
      const typed = ask.input !== void 0;
      const confirm = () => {
        settleDialog(typed ? draft : true);
      };
      const cancel = () => {
        settleDialog(typed ? null : false);
      };
      return React.createElement(
        "div",
        {
          className: `${PREFIX3}-dialog-layer`,
          "data-git-dialog": "",
          role: "dialog",
          "aria-modal": "true",
          "aria-label": ask.title
        },
        React.createElement("div", {
          className: `${PREFIX3}-dialog-backdrop`,
          "data-git-dialog-dismiss": "",
          onClick: cancel
        }),
        React.createElement(
          "div",
          { className: `${PREFIX3}-dialog` },
          React.createElement("h2", { className: `${PREFIX3}-dialog-title` }, ask.title),
          ask.body === void 0 ? null : React.createElement("p", { className: `${PREFIX3}-dialog-body` }, ask.body),
          ask.lines === void 0 || ask.lines.length === 0 ? null : React.createElement(
            "ul",
            { className: `${PREFIX3}-dialog-list` },
            ...ask.lines.map((line) => React.createElement("li", { key: line }, line))
          ),
          ask.warning === void 0 ? null : React.createElement("p", { className: `${PREFIX3}-dialog-warning` }, ask.warning),
          typed ? React.createElement("input", {
            type: "text",
            className: `${PREFIX3}-dialog-input`,
            "data-git-dialog-input": "",
            value: draft,
            spellCheck: false,
            autoFocus: true,
            onChange: (event) => {
              setDraft(event.target.value);
            },
            onKeyDown: (event) => {
              if (event.key === "Enter") confirm();
              if (event.key === "Escape") cancel();
            }
          }) : null,
          React.createElement(
            "div",
            { className: `${PREFIX3}-dialog-actions` },
            React.createElement("button", {
              type: "button",
              className: `${PREFIX3}-dialog-confirm`,
              "data-git-dialog-confirm": "",
              "data-danger": ask.danger === true ? "" : void 0,
              disabled: typed && draft.trim() === "",
              autoFocus: !typed,
              onClick: confirm
            }, ask.confirm),
            ask.cancel === "" ? null : React.createElement("button", {
              type: "button",
              className: `${PREFIX3}-dialog-cancel`,
              "data-git-dialog-cancel": "",
              onClick: cancel
            }, ask.cancel)
          )
        )
      );
    };
  }

  // src/client/dialog.ts
  function nameFiles(t, paths) {
    const first = paths[0] ?? "";
    if (paths.length <= 1) return first === "" ? [] : [first];
    if (paths.length <= 5) return paths;
    return [t("dialog.filesMany", { first, count: paths.length })];
  }
  function discardAsk(t, prompt) {
    return {
      title: t("dialog.discard.title"),
      body: t("dialog.discard.body"),
      lines: nameFiles(t, prompt.files),
      ...prompt.untracked.length === 0 ? {} : { warning: `${t("dialog.discard.untracked")}
${prompt.untracked.join("\n")}` },
      danger: true,
      confirm: t("dialog.confirm"),
      cancel: t("dialog.cancel")
    };
  }
  function confirmDiscard(t, prompt) {
    return askConfirm(discardAsk(t, prompt));
  }
  function confirmStash(t, prompt) {
    const popping = prompt.action === "pop";
    return askConfirm({
      title: t(popping ? "dialog.stash.popTitle" : "dialog.stash.dropTitle"),
      body: t(popping ? "dialog.stash.popBody" : "dialog.stash.dropBody"),
      lines: [`stash@{${prompt.index}}  ${prompt.subject}`],
      danger: !popping,
      confirm: t("dialog.confirm"),
      cancel: t("dialog.cancel")
    });
  }
  function confirmSync(t, action, upstream) {
    const name = upstream ?? t("sync.noUpstream");
    const pulling = action === "pull";
    return askConfirm({
      title: t(pulling ? "dialog.pull.title" : "dialog.push.title"),
      body: t(pulling ? "dialog.pull.body" : "dialog.push.body", { name }),
      confirm: t("dialog.confirm"),
      cancel: t("dialog.cancel")
    });
  }
  function confirmAbort(t, operation) {
    return askConfirm({
      title: t("dialog.abort.title"),
      body: t("dialog.abort", { operation }),
      danger: true,
      confirm: t("dialog.confirm"),
      cancel: t("dialog.cancel")
    });
  }
  function confirmDeleteBranch(t, branch) {
    return askConfirm({
      title: t("dialog.deleteBranch.title"),
      body: t("dialog.deleteBranch", { branch }),
      danger: true,
      confirm: t("dialog.confirm"),
      cancel: t("dialog.cancel")
    });
  }
  function confirmForceDelete(t, branch) {
    return askConfirm({
      title: t("dialog.forceDeleteBranch.title"),
      body: t("dialog.forceDeleteBranch", { branch }),
      danger: true,
      confirm: t("dialog.confirm"),
      cancel: t("dialog.cancel")
    });
  }
  function confirmMerge(t, branch, current) {
    return askConfirm({
      title: t("dialog.merge.title"),
      body: t("dialog.merge", { branch, current: current ?? "" }),
      confirm: t("dialog.confirm"),
      cancel: t("dialog.cancel")
    });
  }
  function confirmDetach(t, short) {
    return askConfirm({
      title: t("dialog.detach.title"),
      body: t("dialog.detach", { short }),
      confirm: t("dialog.confirm"),
      cancel: t("dialog.cancel")
    });
  }
  function askBranchName(t, short) {
    return askText({
      title: t("dialog.branchFrom.title"),
      body: t("dialog.branchFrom", { short }),
      input: "",
      confirm: t("dialog.confirm"),
      cancel: t("dialog.cancel")
    });
  }
  function confirmPreviewCheckout(t, preview, current) {
    return askConfirm({
      title: t("dialog.previewCheckout.title"),
      body: t("dialog.previewCheckout.body", { preview, current: current ?? "" }),
      confirm: t("dialog.previewCheckout.confirm"),
      cancel: t("dialog.cancel")
    });
  }
  function notify(t, message) {
    return showNotice({
      title: t("dialog.refused.title"),
      body: message,
      confirm: t("dialog.ok"),
      // A notice has one answer, so the second button is left out entirely rather
      // than repeating the same word twice.
      cancel: ""
    });
  }

  // src/client/graph-model.ts
  function layoutGraph(commits) {
    let lanes = [];
    const rows2 = [];
    const seen = /* @__PURE__ */ new Set();
    let widest = 0;
    for (const commit of commits) {
      if (seen.has(commit.sha)) continue;
      seen.add(commit.sha);
      const input = lanes;
      const found = input.findIndex((lane2) => lane2.id === commit.sha);
      const waited = input[found];
      const lane = waited === void 0 ? input.length : found;
      const firstParent = commit.parents[0];
      const extraParents = commit.parents.slice(1);
      const strokes = [];
      const output = [];
      if (firstParent === void 0) {
        input.forEach((swimlane, index) => {
          strokes.push({ prior: index, kind: "join", color: swimlane.color });
        });
      } else {
        input.forEach((swimlane, index) => {
          if (swimlane.id === commit.sha) {
            if (index === lane) output.push({ id: firstParent, color: swimlane.color });
            strokes.push({ prior: index, kind: "join", color: swimlane.color });
            return;
          }
          const next = output.length;
          output.push({ id: swimlane.id, color: swimlane.color });
          const kind = next === index ? "through" : "bend";
          strokes.push({ prior: index, next, kind, color: swimlane.color });
        });
        if (waited === void 0) output.push({ id: firstParent, color: lane });
        const parent = output[lane];
        if (parent !== void 0) {
          strokes.push({ prior: void 0, next: lane, kind: "branch", color: parent.color });
        }
        for (const extra of extraParents) {
          const next = output.length;
          output.push({ id: extra, color: next });
          strokes.push({ prior: void 0, next, kind: "branch", color: next });
        }
      }
      widest = Math.max(widest, output.length, lane + 1);
      rows2.push({
        sha: commit.sha,
        lane,
        color: waited === void 0 ? lane : waited.color,
        merged: extraParents.length > 0,
        strokes
      });
      lanes = output;
    }
    return { rows: rows2, lanes: widest };
  }

  // src/client/progress.ts
  var LONG_RUNNING_MS = 1e4;
  var DONE_MS = 200;
  function makeProgress(React) {
    return function Progress(props) {
      const [phase, setPhase] = React.useState(props.active ? "active" : "off");
      const [longRunning, setLongRunning] = React.useState(false);
      const [flow] = React.useState({ running: props.active });
      React.useEffect(() => {
        if (!props.active) {
          if (!flow.running) return void 0;
          flow.running = false;
          setPhase("done");
          const cleared = setTimeout(() => {
            setPhase("off");
            setLongRunning(false);
          }, DONE_MS);
          return () => {
            clearTimeout(cleared);
          };
        }
        flow.running = true;
        setPhase("active");
        setLongRunning(false);
        const slow = setTimeout(() => {
          setLongRunning(true);
        }, LONG_RUNNING_MS);
        return () => {
          clearTimeout(slow);
        };
      }, [props.active]);
      const sweeping = phase !== "off";
      return React.createElement(
        "div",
        {
          className: `${PREFIX3}-progress`,
          "data-git-progress": "",
          "data-active": sweeping ? "" : void 0,
          "data-infinite": sweeping ? "" : void 0,
          "data-long-running": sweeping && longRunning ? "" : void 0,
          "data-done": phase === "done" ? "" : void 0,
          "aria-hidden": "true"
        },
        React.createElement("div", {
          className: `${PREFIX3}-progress-bit`,
          "data-git-progress-bit": "",
          // VS Code fades the bit in place on `done()` rather than stopping the
          // animation, so the bar's last frame is what dims out.
          style: { opacity: phase === "done" ? 0 : 1 }
        })
      );
    };
  }

  // src/client/history.ts
  var PAGE = 20;
  var MENU_W3 = 190;
  var LANE_W = 14;
  var ROW_H = 26;
  var HISTORY_CHROME_H = 75;
  var NODE_R = 4;
  var MERGE_NODE_R = 6;
  var TURN_R = 5;
  var NODE_RING = "var(--dsw-alias-bg-layer-1)";
  var ROW_SELECTOR = "[data-git-history-row]";
  var LANE_COLORS = [
    "var(--dsw-alias-brand-primary)",
    "var(--dsw-alias-state-warn-primary)",
    "var(--dsw-alias-state-success-primary)",
    "color-mix(in srgb, var(--dsw-alias-state-business-primary) 50%, var(--dsw-alias-state-error-primary))",
    "var(--dsw-alias-state-business-primary)",
    "color-mix(in srgb, var(--dsw-alias-state-success-primary) 50%, var(--dsw-alias-state-warn-primary))",
    "var(--dsw-alias-state-error-primary)",
    "color-mix(in srgb, var(--dsw-alias-state-business-primary) 60%, var(--dsw-alias-state-success-primary))"
  ];
  function makeHistory(React) {
    const Progress = makeProgress(React);
    return function History(props) {
      const { t, open: open2 } = props;
      const [commits, setCommits] = React.useState(props.initial?.commits ?? []);
      const [hasMore, setHasMore] = React.useState(props.initial?.hasMore ?? false);
      const [total, setTotal] = React.useState(props.initial?.total ?? 0);
      const [loading, setLoading] = React.useState(false);
      const [failed, setFailed] = React.useState(false);
      const [gate] = React.useState({ reading: false });
      const [armed] = React.useState({ read: props.initial === void 0 });
      const asked = commits.length;
      const read = React.useCallback((skip) => {
        if (gate.reading) return;
        gate.reading = true;
        setLoading(true);
        setFailed(false);
        void props.load(PAGE, skip).then((page) => {
          setCommits((previous) => {
            const next = skip === 0 ? page.commits : [...previous, ...page.commits];
            props.remember?.({ commits: next, hasMore: page.hasMore, total: page.total });
            return next;
          });
          setHasMore(page.hasMore);
          setTotal(page.total);
          setLoading(false);
        }).catch(() => {
          setFailed(true);
          setLoading(false);
        }).then(() => {
          gate.reading = false;
        });
      }, []);
      React.useEffect(() => {
        if (!open2) return;
        if (!armed.read) {
          armed.read = true;
          return;
        }
        read(0);
      }, [open2, props.revision]);
      const more = () => {
        if (loading || !hasMore) return;
        read(asked);
      };
      const onScroll = (event) => {
        const node = event.currentTarget;
        if (node.scrollTop + node.clientHeight < node.scrollHeight - 24) return;
        more();
      };
      const onKeyDown = (event) => {
        moveRowFocus(event);
      };
      const [menu2, setMenu] = React.useState(null);
      const openMenu = (sha, node) => {
        if (node === null) return;
        const box = node.getBoundingClientRect();
        setMenu({ sha, top: box.bottom + 4, left: Math.max(8, box.right - MENU_W3) });
      };
      const closeMenu = () => {
        setMenu(null);
      };
      const layout = layoutGraph(commits.map((commit) => ({
        sha: commit.sha,
        parents: commit.parents ?? []
      })));
      const rows2 = new Map(layout.rows.map((row) => [row.sha, row]));
      const lanes = Math.max(1, layout.lanes);
      const body2 = {
        commits,
        rows: rows2,
        lanes,
        hasMore,
        loading,
        failed,
        more,
        onScroll,
        onKeyDown,
        menu: menu2,
        openMenu,
        closeMenu
      };
      return React.createElement(
        "section",
        {
          className: `${PREFIX3}-history`,
          "data-git-history": "",
          "data-open": open2 ? "" : void 0
        },
        React.createElement(
          "div",
          { className: `${PREFIX3}-history-head` },
          React.createElement(
            "button",
            {
              type: "button",
              className: `${PREFIX3}-history-title`,
              "data-git-history-toggle": "",
              "aria-expanded": open2 ? "true" : "false",
              title: t(open2 ? "history.collapse" : "history.expand"),
              onClick: props.onToggle
            },
            Icon(React, open2 ? "expand" : "chevron", { size: 16 }),
            React.createElement("h3", { className: `${PREFIX3}-group-title` }, t("history.title"))
          ),
          // The branch a previewed log belongs to sits beside the toggle rather than
          // inside it: the title is one button, and a badge nested in it would be
          // read as part of the control's own label.
          props.branch === void 0 || props.branch === null ? null : React.createElement("span", {
            className: `${PREFIX3}-history-branch`,
            "data-git-history-branch": props.branch,
            title: t("history.previewBranch", { branch: props.branch })
          }, props.branch),
          commits.length === 0 ? null : React.createElement(
            "span",
            { className: `${PREFIX3}-history-count` },
            t("history.count", { count: total > 0 ? total : commits.length })
          ),
          props.onRefresh === void 0 ? null : React.createElement("button", {
            type: "button",
            className: `${PREFIX3}-tool ${PREFIX3}-history-refresh`,
            "data-git-history-refresh": "",
            title: t("refresh"),
            "aria-label": t("refresh"),
            onClick: props.onRefresh
          }, Icon(React, "refresh"))
        ),
        open2 ? React.createElement(Progress, { active: loading }) : null,
        open2 ? historyBody(React, props, body2) : null,
        menu2 === null ? null : commitMenu(React, props, menu2, closeMenu)
      );
    };
  }
  function historyBody(React, props, view) {
    const { t, tab } = props;
    if (view.failed) {
      return React.createElement("p", { className: `${PREFIX3}-history-note`, role: "status" }, t("history.failed"));
    }
    if (view.commits.length === 0) {
      return React.createElement(
        "p",
        { className: `${PREFIX3}-history-note`, role: "status" },
        view.loading ? t("history.loading") : t("history.empty")
      );
    }
    return React.createElement(
      "div",
      { className: `${PREFIX3}-history-body`, onScroll: view.onScroll },
      React.createElement(
        "div",
        {
          className: `${PREFIX3}-graph`,
          "data-git-graph": "",
          "data-lanes": String(view.lanes)
        },
        React.createElement(
          "ul",
          { className: `${PREFIX3}-commits`, onKeyDown: view.onKeyDown },
          ...view.commits.map((commit) => commitRow(React, t, tab, commit, view))
        )
      ),
      view.hasMore ? React.createElement("button", {
        type: "button",
        className: `${PREFIX3}-history-more`,
        "data-git-history-more": "",
        disabled: view.loading,
        onClick: view.more
      }, view.loading ? t("history.loading") : t("history.more")) : React.createElement(
        "p",
        { className: `${PREFIX3}-history-end`, "data-git-history-end": "" },
        t("history.end")
      )
    );
  }
  function commitRow(React, t, tab, commit, view) {
    const open2 = () => {
      if (tab === void 0) return;
      tab.actions.openResource(commitDiffAddress(commit.sha), { kind: DIFF_TAB_KIND });
    };
    const row = view.rows.get(commit.sha) ?? { sha: commit.sha, lane: 0, color: 0, merged: false, strokes: [] };
    return React.createElement(
      "li",
      { key: commit.sha, className: `${PREFIX3}-commit-row` },
      React.createElement(
        "button",
        {
          type: "button",
          className: `${PREFIX3}-commit-open`,
          "data-git-history-row": commit.sha,
          title: `${commit.short} ${commit.subject}`,
          onClick: open2
        },
        graphSlice(React, row, view.lanes),
        React.createElement("span", { className: `${PREFIX3}-sha`, title: commit.sha }, commit.short),
        React.createElement("span", { className: `${PREFIX3}-subject` }, commit.subject),
        commit.refs.length === 0 ? null : React.createElement(
          "span",
          { className: `${PREFIX3}-refs` },
          ...commit.refs.map((ref) => refTag(React, ref))
        ),
        React.createElement(
          "span",
          { className: `${PREFIX3}-commit-meta` },
          React.createElement("span", {
            className: `${PREFIX3}-author`,
            title: `${commit.author} <${commit.email}>`
          }, commit.author),
          React.createElement(
            "span",
            { className: `${PREFIX3}-when`, title: commit.when },
            relativeTime(t, commit.when)
          )
        )
      ),
      // The menu button is the row's second control, so it sits beside the row
      // rather than inside it: a button cannot nest in a button, and hovering the
      // row is what reveals it.
      React.createElement("button", {
        type: "button",
        className: `${PREFIX3}-commit-more`,
        "data-git-commit-more": commit.sha,
        title: t("commit.more"),
        "aria-label": t("commit.more"),
        "aria-haspopup": "menu",
        "aria-expanded": view.menu?.sha === commit.sha ? "true" : "false",
        onClick: (event) => {
          event.stopPropagation();
          if (view.menu?.sha === commit.sha) {
            view.closeMenu();
            return;
          }
          view.openMenu(commit.sha, event.currentTarget);
        }
      }, Icon(React, "more"))
    );
  }
  function commitMenu(React, props, menu2, close) {
    const { t } = props;
    const entry = (id, label, run) => {
      if (run === void 0) return null;
      return React.createElement("button", {
        key: id,
        type: "button",
        className: `${PREFIX3}-commit-menu-item`,
        role: "menuitem",
        "data-git-commit-action": id,
        onClick: () => {
          close();
          run();
        }
      }, label);
    };
    return React.createElement(
      "div",
      { key: "commit-menu" },
      React.createElement("div", { className: `${PREFIX3}-backdrop`, "data-git-dismiss": "", onClick: close }),
      React.createElement(
        "div",
        {
          className: `${PREFIX3}-commit-menu`,
          "data-git-commit-menu": menu2.sha,
          role: "menu",
          style: { top: `${menu2.top}px`, left: `${menu2.left}px` }
        },
        entry("checkout", t("commit.checkout"), props.onCheckout === void 0 ? void 0 : () => {
          props.onCheckout?.(menu2.sha);
        }),
        entry("branch", t("commit.branchFrom"), props.onBranchFrom === void 0 ? void 0 : () => {
          props.onBranchFrom?.(menu2.sha);
        }),
        entry("copy", t("commit.copySha"), props.onCopy === void 0 ? void 0 : () => {
          props.onCopy?.(menu2.sha);
        })
      )
    );
  }
  function refTag(React, decoration) {
    const ref = normalizeRef(decoration);
    return React.createElement("span", {
      key: `${ref.kind}:${ref.name}`,
      className: `${PREFIX3}-ref`,
      "data-git-ref-kind": ref.kind,
      // The earlier two-ink split, kept so a query written before the four kinds
      // existed still finds the tag it was looking for.
      "data-ref": ref.kind === "tag" ? "tag" : "branch",
      title: ref.name
    }, ref.name);
  }
  function normalizeRef(decoration) {
    if (typeof decoration !== "string") return decoration;
    const tag = "tag: ";
    if (decoration.startsWith(tag)) return { name: decoration.slice(tag.length), kind: "tag" };
    return { name: decoration, kind: decoration.includes("/") ? "remote" : "local" };
  }
  var DRAW_ORDER = ["passing", "arc", "upper", "lower"];
  function phaseOf(stroke, rowLane) {
    if (stroke.kind === "through" || stroke.kind === "bend") return "passing";
    if (stroke.kind === "join") return stroke.prior === rowLane ? "upper" : "passing";
    return stroke.next === rowLane ? "lower" : "arc";
  }
  function graphSlice(React, row, lanes) {
    const width = laneX(lanes);
    const nodeX = laneX(row.lane);
    const shapes = [];
    for (const phase of DRAW_ORDER) {
      row.strokes.forEach((stroke, index) => {
        if (phaseOf(stroke, row.lane) !== phase) return;
        shapes.push(React.createElement("path", {
          key: `${index}:${stroke.kind}`,
          className: `${PREFIX3}-graph-line`,
          "data-git-graph-line": "",
          "data-git-graph-kind": stroke.kind,
          d: strokePath(stroke, nodeX),
          style: { stroke: slotColor(stroke.color) }
        }));
      });
    }
    shapes.push(React.createElement("circle", {
      key: "node",
      className: `${PREFIX3}-graph-node`,
      "data-git-graph-node": "",
      "data-git-graph-merged": row.merged ? "" : void 0,
      cx: nodeX,
      cy: ROW_H / 2,
      r: row.merged ? MERGE_NODE_R : NODE_R,
      // The node takes its column's ink and is ringed with the row's own ground, so
      // a line running behind it reads as interrupted rather than crossed.
      style: { fill: slotColor(row.color), stroke: NODE_RING, strokeWidth: 2 }
    }));
    return React.createElement("svg", {
      className: `${PREFIX3}-graph-row`,
      "data-git-graph-row": row.sha,
      "data-lane": String(row.lane),
      width,
      height: ROW_H,
      viewBox: `0 0 ${width} ${ROW_H}`,
      "aria-hidden": true,
      focusable: false
    }, ...shapes);
  }
  function strokePath(stroke, nodeX) {
    const from = stroke.prior === void 0 ? nodeX : laneX(stroke.prior);
    const to = stroke.next === void 0 ? nodeX : laneX(stroke.next);
    if (stroke.prior === void 0) return branchPath(from, to);
    if (stroke.next === void 0) return joinPath(from, to);
    if (from === to) return `M${from} 0V${ROW_H}`;
    return stepPath(from, to);
  }
  function stepPath(from, to) {
    const middle = ROW_H / 2;
    if (to < from) {
      return `M${from} 0V${middle - TURN_R}A${TURN_R} ${TURN_R} 0 0 1 ${from - TURN_R} ${middle}H${to + TURN_R}A${TURN_R} ${TURN_R} 0 0 0 ${to} ${middle + TURN_R}V${ROW_H}`;
    }
    return `M${from} 0V${middle - TURN_R}A${TURN_R} ${TURN_R} 0 0 0 ${from + TURN_R} ${middle}H${to - TURN_R}A${TURN_R} ${TURN_R} 0 0 1 ${to} ${middle + TURN_R}V${ROW_H}`;
  }
  function joinPath(from, nodeX) {
    const middle = ROW_H / 2;
    if (from === nodeX) return `M${from} 0V${middle}`;
    if (from > nodeX) {
      return `M${from} 0V${middle - TURN_R}A${TURN_R} ${TURN_R} 0 0 1 ${from - TURN_R} ${middle}H${nodeX}`;
    }
    return `M${from} 0V${middle - TURN_R}A${TURN_R} ${TURN_R} 0 0 0 ${from + TURN_R} ${middle}H${nodeX}`;
  }
  function branchPath(nodeX, to) {
    const middle = ROW_H / 2;
    if (nodeX === to) return `M${nodeX} ${middle}V${ROW_H}`;
    if (to > nodeX) {
      return `M${nodeX} ${middle}H${to - TURN_R}A${TURN_R} ${TURN_R} 0 0 1 ${to} ${middle + TURN_R}V${ROW_H}`;
    }
    return `M${nodeX} ${middle}H${to + TURN_R}A${TURN_R} ${TURN_R} 0 0 0 ${to} ${middle + TURN_R}V${ROW_H}`;
  }
  function laneX(lane) {
    return LANE_W * (lane + 1);
  }
  function slotColor(slot) {
    const size = LANE_COLORS.length;
    return LANE_COLORS[(slot % size + size) % size] ?? "currentColor";
  }
  function moveRowFocus(event) {
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    const target = event.target;
    if (target === null || target === void 0) return;
    if (typeof target.closest !== "function") return;
    const row = target.closest("li");
    if (row === null) return;
    event.preventDefault?.();
    const neighbour = step > 0 ? row.nextElementSibling : row.previousElementSibling;
    neighbour?.querySelector(ROW_SELECTOR)?.focus();
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
  function labelOf3(t, entry) {
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
      const label = labelOf3(t, entry);
      return React.createElement(
        "li",
        {
          className: `${PREFIX3}-row`,
          "data-git-row": entry.path,
          "data-status": entry.status,
          "data-selected": props.selected === true ? "" : void 0,
          "aria-selected": props.selected === true ? "true" : void 0
        },
        props.onPick === void 0 ? null : pickBox(React, props),
        React.createElement(
          "button",
          {
            type: "button",
            className: `${PREFIX3}-open`,
            title: label.title,
            "aria-label": label.title,
            onClick: (event) => {
              if (event.shiftKey || event.metaKey || event.ctrlKey) {
                props.onSelect?.(event);
                return;
              }
              const open2 = actions.find((action) => action.id === "resolve") ?? actions.find((action) => action.id === "diff");
              if (open2 !== void 0) open2.run();
            }
          },
          React.createElement("span", {
            className: `${PREFIX3}-letter`,
            "data-status": entry.status,
            "aria-hidden": true
          }, LETTERS[entry.status]),
          shortened(React, `${PREFIX3}-name`, label.name),
          label.directory === "" ? null : shortened(React, `${PREFIX3}-dir`, label.directory)
        ),
        React.createElement(
          "span",
          { className: `${PREFIX3}-actions` },
          ...actions.map((action) => actionButton2(React, action))
        )
      );
    };
  }
  function pickBox(React, props) {
    const label = props.t("row.pick", { path: props.entry.path });
    return React.createElement("input", {
      type: "checkbox",
      className: `${PREFIX3}-pick`,
      "data-git-pick": props.entry.path,
      "aria-label": label,
      title: label,
      checked: props.picked === true,
      onChange: (event) => {
        props.onPick?.(event.target.checked);
      },
      onClick: (event) => {
        event.stopPropagation();
      }
    });
  }
  function shortened(React, className, text) {
    const parts = shortenPath(text);
    return React.createElement(
      "span",
      { className },
      React.createElement("span", { className: `${PREFIX3}-head` }, parts.head),
      parts.tail === "" ? null : React.createElement("span", { className: `${PREFIX3}-tail` }, parts.tail)
    );
  }
  function actionButton2(React, action) {
    return React.createElement("button", {
      key: action.id,
      type: "button",
      className: `${PREFIX3}-action`,
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
          className: `${PREFIX3}-row ${PREFIX3}-stash-row`,
          "data-git-stash-row": String(entry.index)
        },
        React.createElement(
          "span",
          { className: `${PREFIX3}-stash-open`, title: entry.subject },
          React.createElement("span", { className: `${PREFIX3}-sha` }, `stash@{${entry.index}}`),
          React.createElement("span", { className: `${PREFIX3}-stash-subject` }, entry.subject)
        ),
        React.createElement(
          "span",
          { className: `${PREFIX3}-actions` },
          ...actions.map((action) => React.createElement("button", {
            key: action.id,
            type: "button",
            className: `${PREFIX3}-action`,
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
      const { entries: entries2, canStash, busy, t } = props;
      if (entries2.length === 0 && !canStash) return null;
      const store = React.createElement("button", {
        type: "button",
        className: `${PREFIX3}-action`,
        "aria-label": t("stash.current"),
        title: canStash ? t("stash.current") : t("stash.currentDisabled"),
        "data-action": "stash-current",
        "data-git-action": "stash-current",
        "data-git-stash-current": "",
        disabled: busy || !canStash,
        onClick: props.stash
      }, Icon(React, "stash"));
      return React.createElement(
        "section",
        {
          className: `${PREFIX3}-group ${PREFIX3}-stash-group`,
          "data-git-stash": "",
          "data-count": entries2.length
        },
        props.headless === true ? React.createElement(
          "div",
          { className: `${PREFIX3}-group-head ${PREFIX3}-group-head-actions` },
          React.createElement("span", { className: `${PREFIX3}-group-actions` }, store)
        ) : React.createElement(
          "div",
          { className: `${PREFIX3}-group-head` },
          React.createElement("h3", { className: `${PREFIX3}-group-title` }, t("stash.group")),
          React.createElement("span", { className: `${PREFIX3}-count` }, String(entries2.length)),
          React.createElement("span", { className: `${PREFIX3}-group-actions` }, store)
        ),
        entries2.length === 0 ? React.createElement("p", { className: `${PREFIX3}-group-note`, role: "status" }, t("stash.empty")) : React.createElement(
          "ul",
          { className: `${PREFIX3}-list` },
          ...entries2.map((entry) => React.createElement(StashRow, {
            key: `${entry.index}:${entry.subject}`,
            entry,
            ...props
          }))
        )
      );
    }
    return StashGroup;
  }

  // src/client/panes.ts
  var PANE_DEFAULTS = { changes: 200, commit: 224, history: 231 };
  var PANES_EXPANDED = { changes: false, commit: false, history: false };
  var PANE_MIN = 120;
  var PANE_FLOOR = { changes: 64, commit: 172, history: 120 };
  var PANE_MAX = 900;
  var PANE_STEP = 16;
  function snapPaneSize(id, size, rowHeight, chrome = 0) {
    if (id !== "history") return size;
    const rows2 = Math.max(3, Math.floor((size - chrome) / rowHeight));
    return chrome + rows2 * rowHeight;
  }
  var DRAGGING_CLASS = `${PREFIX3}-dragging`;
  function clampPaneSize(size) {
    return Math.max(PANE_MIN, Math.min(PANE_MAX, Math.round(size)));
  }
  function resizePaneSize(size, delta) {
    return clampPaneSize(size + delta);
  }
  function paneKeySize(id, size, key, step = PANE_STEP) {
    if (key === "ArrowUp") return resizePaneSize(size, step);
    if (key === "ArrowDown") return resizePaneSize(size, -step);
    if (key === "Home") return PANE_DEFAULTS[id];
    return void 0;
  }
  function startPaneDrag(options) {
    const { size, startY, onSize } = options;
    const host = options.window;
    let ended = false;
    const move = (event) => {
      onSize(resizePaneSize(size, startY - event.clientY));
    };
    const stop = () => {
      if (ended) return;
      ended = true;
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerup", stop);
      host.removeEventListener("pointercancel", stop);
      setDragging(false);
    };
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerup", stop);
    host.addEventListener("pointercancel", stop);
    setDragging(true);
    return stop;
  }
  function setDragging(on) {
    if (typeof document === "undefined" || document.body === null) return;
    if (on) document.body.classList.add(DRAGGING_CLASS);
    else document.body.classList.remove(DRAGGING_CLASS);
  }
  function gitPane(React, props) {
    const { id, size, collapsed, t } = props;
    return React.createElement(
      "section",
      {
        className: `${PREFIX3}-pane`,
        "data-git-pane": id,
        "data-git-pane-size": String(size),
        "data-collapsed": collapsed ? "" : void 0,
        style: collapsed ? void 0 : {
          flexGrow: props.grow === true ? 1 : 0,
          flexShrink: 0,
          flexBasis: `${size}px`
        }
      },
      React.createElement("div", {
        className: `${PREFIX3}-pane-resize`,
        "data-git-pane-handle": id,
        role: "separator",
        "aria-orientation": "horizontal",
        "aria-label": t("pane.resize"),
        "aria-valuenow": String(size),
        "aria-valuemin": String(PANE_MIN),
        "aria-valuemax": String(PANE_MAX),
        tabIndex: 0,
        onPointerDown: props.onResizeStart,
        onKeyDown: props.onResizeKey
      }),
      React.createElement(
        "div",
        { className: `${PREFIX3}-pane-head` },
        React.createElement(
          "button",
          {
            type: "button",
            className: `${PREFIX3}-pane-toggle`,
            "data-git-pane-toggle": id,
            "aria-expanded": collapsed ? "false" : "true",
            title: t(collapsed ? "pane.expand" : "pane.collapse"),
            onClick: props.onToggle
          },
          Icon(React, collapsed ? "chevron" : "expand", { size: 16 }),
          React.createElement("h3", { className: `${PREFIX3}-group-title` }, props.title)
        )
      ),
      React.createElement(
        "div",
        { className: `${PREFIX3}-pane-body` },
        collapsed ? null : props.content
      )
    );
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
          className: `${PREFIX3}-conflict-region`,
          "data-git-conflict-region": String(index),
          "data-choice": choice
        },
        React.createElement(
          "div",
          { className: `${PREFIX3}-conflict-side`, "data-side": "ours" },
          React.createElement(
            "span",
            { className: `${PREFIX3}-conflict-label` },
            segment.oursLabel === "" ? t("conflict.ours") : segment.oursLabel
          ),
          React.createElement("pre", { className: `${PREFIX3}-conflict-text` }, segment.ours.join("\n"))
        ),
        React.createElement(
          "div",
          { className: `${PREFIX3}-conflict-side`, "data-side": "theirs" },
          React.createElement(
            "span",
            { className: `${PREFIX3}-conflict-label` },
            segment.theirsLabel === "" ? t("conflict.theirs") : segment.theirsLabel
          ),
          React.createElement("pre", { className: `${PREFIX3}-conflict-text` }, segment.theirs.join("\n"))
        ),
        React.createElement(
          "div",
          { className: `${PREFIX3}-conflict-choices` },
          ...CHOICES.map((entry) => React.createElement("button", {
            key: entry.id,
            type: "button",
            className: `${PREFIX3}-conflict-choice`,
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
      const head3 = React.createElement(
        "div",
        { className: `${PREFIX3}-conflict-head` },
        React.createElement("span", { className: `${PREFIX3}-conflict-path`, title: path }, path),
        React.createElement("button", {
          type: "button",
          className: `${PREFIX3}-tool`,
          "aria-label": t("conflict.close"),
          title: t("conflict.close"),
          onClick: props.close
        }, Icon(React, "chevron", { size: 14 }))
      );
      if (content2 === void 0) {
        return React.createElement(
          "section",
          { className: `${PREFIX3}-conflict`, "data-git-conflict": path },
          head3,
          React.createElement("p", { className: `${PREFIX3}-state-line`, role: "status" }, t("conflict.loading"))
        );
      }
      if (content2.kind === "error") {
        return React.createElement(
          "section",
          { className: `${PREFIX3}-conflict`, "data-git-conflict": path },
          head3,
          React.createElement("p", { className: `${PREFIX3}-state-line`, role: "alert" }, content2.message)
        );
      }
      if (content2.kind === "resolved") {
        return React.createElement(
          "section",
          { className: `${PREFIX3}-conflict`, "data-git-conflict": path },
          head3,
          React.createElement("p", { className: `${PREFIX3}-state-line`, role: "status" }, t("conflict.clean")),
          React.createElement(
            "div",
            { className: `${PREFIX3}-conflict-actions` },
            React.createElement("button", {
              type: "button",
              className: `${PREFIX3}-commit-submit`,
              "data-git-conflict-submit": "",
              disabled: busy,
              onClick: props.submit
            }, t("conflict.markResolved"))
          )
        );
      }
      return React.createElement(
        "section",
        { className: `${PREFIX3}-conflict`, "data-git-conflict": path },
        head3,
        React.createElement(
          "div",
          { className: `${PREFIX3}-conflict-list` },
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
          { className: `${PREFIX3}-conflict-actions` },
          React.createElement("button", {
            type: "button",
            className: `${PREFIX3}-commit-submit`,
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

  // src/client/list-model.ts
  function selectionKey(group, path) {
    return `${group}:${path}`;
  }
  function togglePick(picks, path, picked) {
    if (!picked) return picks.filter((existing) => existing !== path);
    return picks.includes(path) ? [...picks] : [...picks, path];
  }
  function rangeBetween(entries2, anchor, target) {
    if (anchor === null) return [target];
    const paths = entries2.map((entry) => entry.path);
    const from = paths.indexOf(anchor);
    const to = paths.indexOf(target);
    if (from < 0 || to < 0) return [target];
    const [start, end] = from <= to ? [from, to] : [to, from];
    return paths.slice(start, end + 1);
  }

  // src/client/panel-cache.ts
  function createPanelCache() {
    return { status: /* @__PURE__ */ new Map(), stashes: /* @__PURE__ */ new Map(), history: /* @__PURE__ */ new Map() };
  }
  function invalidateSession(cache, sessionId) {
    cache.status.delete(sessionId);
    cache.stashes.delete(sessionId);
    cache.history.delete(sessionId);
  }
  function invalidateAll(cache) {
    cache.status.clear();
    cache.stashes.clear();
    cache.history.clear();
  }
  function rememberStatus(cache, sessionId, snapshot) {
    cache.status.set(sessionId, snapshot);
  }
  function rememberStashes(cache, sessionId, entries2) {
    cache.stashes.set(sessionId, entries2);
  }
  function forgetHistory(cache, sessionId) {
    cache.history.delete(sessionId);
  }
  function appendHistory(cache, sessionId, page) {
    cache.history.set(sessionId, page);
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
  var EMPTY_PAGE = { commits: [], hasMore: false, total: 0 };
  var EMPTY_REPOS = {
    scanRoot: "",
    depth: 0,
    selected: null,
    entries: [],
    truncated: false,
    warnings: []
  };
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
    const RepoBar = makeRepoBar(React);
    const StashGroup = makeStashGroup(React);
    const History = makeHistory(React);
    const Progress = makeProgress(React);
    const DialogHost = makeDialogHost(React);
    const cache = runtime.cache ?? createPanelCache();
    function GitPanel(props) {
      const sessionId = props.sessionId ?? "";
      const cachedStatus = cache.status.get(sessionId);
      const cachedStashes = cache.stashes.get(sessionId);
      const [snapshot, setSnapshot] = React.useState(cachedStatus);
      const [loading, setLoading] = React.useState(cachedStatus === void 0);
      const [busy, setBusy] = React.useState(false);
      const [refreshing, setRefreshing] = React.useState(false);
      const [message, setMessage] = React.useState("");
      const [amend, setAmend] = React.useState(false);
      const [recentOpen, setRecentOpen] = React.useState(false);
      const [drafting, setDrafting] = React.useState(false);
      const [recent, setRecent] = React.useState(subjectsOf(cache.history.get(sessionId)));
      const [notice, setNotice] = React.useState("");
      const [stashes, setStashes] = React.useState(cachedStashes ?? []);
      const [paneSizes, setPaneSizes] = React.useState(PANE_DEFAULTS);
      const [collapsedPanes, setCollapsedPanes] = React.useState(PANES_EXPANDED);
      const [drag] = React.useState({ stop: void 0 });
      const [conflict, setConflict] = React.useState(null);
      const [filter, setFilter] = React.useState("");
      const [section, setSection] = React.useState("unstaged");
      const [selected, setSelected] = React.useState([]);
      const [anchor, setAnchor] = React.useState(null);
      const [picked, setPicked] = React.useState([]);
      const [preview, setPreview] = React.useState(null);
      const [cacheState] = React.useState(cachedStatus === void 0 ? "miss" : "hit");
      const [historyRevision, setHistoryRevision] = React.useState("");
      const load = React.useCallback(async (force = false) => {
        if (sessionId === "") {
          setLoading(false);
          return;
        }
        const cached = force ? void 0 : cache.status.get(sessionId);
        if (cached !== void 0) {
          setSnapshot(cached);
          setLoading(false);
          return;
        }
        setLoading(true);
        await runtime.api.ready.then((api) => api.status(sessionId)).catch((error) => unavailableSnapshot(messageOf(error), "failed")).then((next) => {
          rememberStatus(cache, sessionId, next);
          setSnapshot(next);
          setLoading(false);
        });
      }, [sessionId]);
      React.useEffect(() => {
        void load();
      }, [load]);
      const loadStashes = React.useCallback(async (force = false) => {
        if (sessionId === "") return;
        const cached = force ? void 0 : cache.stashes.get(sessionId);
        if (cached !== void 0) {
          setStashes(cached);
          return;
        }
        await runtime.api.ready.then((api) => api.stashes(sessionId)).catch(() => []).then((entries2) => {
          rememberStashes(cache, sessionId, entries2);
          setStashes(entries2);
        });
      }, [sessionId]);
      React.useEffect(() => {
        void loadStashes();
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
        createBranch: (name, from) => runtime.api.ready.then((api) => api.createBranch(sessionId, name, from)),
        stash: () => runtime.api.ready.then((api) => api.stash(sessionId)),
        stashApply: (index, drop) => runtime.api.ready.then((api) => api.stashApply(sessionId, index, drop)),
        stashDrop: (index) => runtime.api.ready.then((api) => api.stashDrop(sessionId, index)),
        sync: (action) => runtime.api.ready.then((api) => api.sync(sessionId, action)),
        generateMessage: (staged) => runtime.api.ready.then((api) => api.generateMessage(sessionId, staged)),
        history: (limit, skip, branch) => runtime.api.ready.then((api) => api.history(sessionId, limit, skip, branch)).catch(() => EMPTY_PAGE),
        repositories: () => runtime.api.ready.then((api) => api.repositories(sessionId)).catch(() => EMPTY_REPOS),
        selectRepository: (root) => runtime.api.ready.then((api) => api.selectRepository(sessionId, root)).catch(failedSelect)
      };
      const readHistory = (limit, skip) => {
        if (preview !== null) return calls.history(limit, skip, preview);
        const cached = cache.history.get(sessionId);
        if (cached !== void 0 && skip === 0) return Promise.resolve(cached);
        return calls.history(limit, skip).then((page) => {
          if (skip === 0) {
            appendHistory(cache, sessionId, { commits: page.commits, hasMore: page.hasMore, total: page.total });
            return page;
          }
          appendHistory(cache, sessionId, {
            commits: [...cached?.commits ?? [], ...page.commits],
            hasMore: page.hasMore,
            total: page.total
          });
          return page;
        });
      };
      const dropHistory = () => {
        forgetHistory(cache, sessionId);
        setHistoryRevision(`${Date.now()}:${Math.random()}`);
      };
      const write = (action, failure, effect = void 0, after) => {
        setNotice("");
        setBusy(true);
        void action().catch((error) => ({ ok: false, problem: "failed", message: messageOf(error) })).then((outcome) => {
          setBusy(false);
          if (outcome.ok) {
            rememberStatus(cache, sessionId, outcome.snapshot);
            setSnapshot(outcome.snapshot);
            if (effect === "stashes" || effect === "both") loadStashes(true);
            if (effect === "log" || effect === "both") dropHistory();
            after?.();
            return;
          }
          const text = refusalText(t, outcome.problem, outcome.message, failure);
          setNotice(text);
          if (REFUSAL_ALERTS.has(outcome.problem)) void notify(t, text);
        });
      };
      const refresh = () => {
        setNotice("");
        setRefreshing(true);
        invalidateSession(cache, sessionId);
        runtime.clearDiffCache?.();
        dropHistory();
        void Promise.all([load(true), loadStashes(true)]).finally(() => {
          setRefreshing(false);
        });
      };
      const previewBranch = (branch) => {
        setNotice("");
        setPreview(branch);
        setConflict(null);
        clearSelection();
      };
      const exitPreview = () => {
        setNotice("");
        setPreview(null);
      };
      const checkoutAndThen = (branch, then) => {
        write(() => calls.checkout(branch), t("notice.checkoutFailed"), "log", () => {
          setPreview(null);
          then?.();
        });
      };
      const onPreviewed = (action) => {
        const branch = preview;
        if (branch === null) {
          action();
          return;
        }
        void confirmPreviewCheckout(t, branch, current().branch ?? null).then((agreed) => {
          if (!agreed) return;
          checkoutAndThen(branch, action);
        });
      };
      const switchRepository = (root) => {
        setNotice("");
        setBusy(true);
        setRefreshing(true);
        void calls.selectRepository(root).then((outcome) => {
          setBusy(false);
          setRefreshing(false);
          if (!outcome.ok) {
            setNotice(refusalText(t, outcome.problem, outcome.message, t("notice.switchFailed")));
            return;
          }
          invalidateSession(cache, sessionId);
          rememberStatus(cache, sessionId, outcome.snapshot);
          setSnapshot(outcome.snapshot);
          setStashes([]);
          rememberStashes(cache, sessionId, []);
          setConflict(null);
          setPreview(null);
          clearSelection();
          setPicked([]);
          runtime.clearDiffCache?.();
          dropHistory();
          void loadStashes(true);
        });
      };
      const stagePaths = (paths) => {
        const wanted = paths.length > 0 ? [...paths] : current().unstaged.map((entry) => entry.path);
        if (wanted.length === 0) return;
        clearSelection();
        write(() => calls.stage(wanted), t("notice.stageFailed"));
      };
      const unstagePaths = (paths) => {
        const wanted = paths.length > 0 ? [...paths] : current().staged.map((entry) => entry.path);
        if (wanted.length === 0) return;
        clearSelection();
        write(() => calls.unstage(wanted), t("notice.unstageFailed"));
      };
      const discardPaths = (paths) => {
        const entries2 = current().unstaged.filter((entry) => paths.includes(entry.path));
        if (entries2.length === 0) return;
        const files = entries2.map((entry) => entry.path);
        const untracked = entries2.filter((entry) => entry.status === "untracked").map((entry) => entry.path);
        void confirmDiscard(t, { files, untracked }).then((agreed) => {
          if (!agreed) return;
          clearSelection();
          write(() => calls.discard(files, untracked.length > 0), t("notice.discardFailed"));
        });
      };
      const discardStaged = () => {
        const files = current().staged.map((entry) => entry.path);
        if (files.length === 0) return;
        void confirmDiscard(t, { files, untracked: [] }).then((agreed) => {
          if (!agreed) return;
          write(() => calls.discard(files, false), t("notice.discardFailed"));
        });
      };
      const stashCurrent = () => {
        write(() => calls.stash(), t("notice.stashFailed"), "both");
      };
      const stashApply = (index) => {
        write(() => calls.stashApply(index, false), t("notice.stashApplyFailed"), "both");
      };
      const stashPop = (index) => {
        write(() => calls.stashApply(index, true), t("notice.stashPopFailed"), "both");
      };
      const stashDrop = (index) => {
        write(() => calls.stashDrop(index), t("notice.stashDropFailed"), "stashes");
      };
      const checkout = (branch) => {
        checkoutAndThen(branch);
      };
      const createBranch = (name) => {
        onPreviewed(() => {
          write(() => calls.createBranch(name), t("notice.createBranchFailed"), "log", () => {
            setPreview(null);
          });
        });
      };
      const checkoutCommit = (sha) => {
        onPreviewed(() => {
          void confirmDetach(t, sha.slice(0, 7)).then((agreed) => {
            if (!agreed) return;
            write(() => calls.checkout(sha), t("notice.checkoutFailed"), "log");
          });
        });
      };
      const branchFromCommit = (sha) => {
        onPreviewed(() => {
          void askBranchName(t, sha.slice(0, 7)).then((name) => {
            if (name === null) return;
            write(() => calls.createBranch(name, sha), t("notice.createBranchFailed"), "log", () => {
              setPreview(null);
            });
          });
        });
      };
      const copyCommit = (sha) => {
        const clipboard = navigator.clipboard;
        if (clipboard === void 0) {
          void notify(t, t("notice.copyFailed"));
          return;
        }
        void clipboard.writeText(sha).then(() => {
          setNotice(t("notice.copied", { short: sha.slice(0, 7) }));
        }).catch(() => {
          void notify(t, t("notice.copyFailed"));
        });
      };
      const draftMessage = () => {
        setNotice("");
        setDrafting(true);
        void calls.generateMessage(current().staged.length > 0).catch((error) => ({
          ok: false,
          problem: "failed",
          message: messageOf(error)
        })).then((draft) => {
          setDrafting(false);
          if (!draft.ok) {
            setNotice(draftRefusal(t, draft.problem, draft.message));
            return;
          }
          setMessage(draft.message);
        });
      };
      const sync = (action) => {
        if (action === "fetch") {
          runSync(action);
          return;
        }
        if (preview !== null) {
          onPreviewed(() => {
            runSync(action);
          });
          return;
        }
        void confirmSync(t, action, current().upstream?.name ?? null).then((agreed) => {
          if (!agreed) return;
          runSync(action);
        });
      };
      const runSync = (action) => {
        setNotice("");
        setBusy(true);
        void calls.sync(action).catch((error) => ({ ok: false, problem: "failed", message: messageOf(error) })).then((outcome) => {
          setBusy(false);
          if (outcome.ok) {
            rememberStatus(cache, sessionId, outcome.snapshot);
            setSnapshot(outcome.snapshot);
            setNotice(t("notice.syncDone", { action: t(`sync.${action}`) }));
            dropHistory();
            return;
          }
          setNotice(refusalText(t, outcome.problem, outcome.message, t("notice.syncFailed")));
        });
      };
      const openConflict = (path) => {
        setConflict({ path, content: void 0, choices: [] });
        void runtime.api.ready.then((api) => api.conflict(sessionId, path)).catch((error) => ({ kind: "error", message: messageOf(error) })).then((content2) => {
          setConflict((open2) => open2 === null || open2.path !== path ? open2 : { path, content: content2, choices: defaultChoices(content2) });
        });
      };
      const chooseRegion = (index, choice) => {
        setConflict((open2) => {
          if (open2 === null) return open2;
          const choices = [...open2.choices];
          choices[index] = choice;
          return { ...open2, choices };
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
          if (outcome.ok) {
            rememberStatus(cache, sessionId, outcome.snapshot);
            setSnapshot(outcome.snapshot);
          }
          setConflict(null);
        });
      };
      const abortOperation = () => {
        if (current().operation === null || current().operation === void 0) return;
        void confirmAbort(t, String(current().operation)).then((agreed) => {
          if (!agreed) return;
          write(() => runtime.api.ready.then((api) => api.abortOperation(sessionId)), t("notice.abortFailed"));
        });
      };
      const deleteBranch = (branch) => {
        void confirmDeleteBranch(t, branch).then((agreed) => {
          if (agreed) removeBranch(branch);
        });
      };
      const removeBranch = (branch) => {
        setBusy(true);
        setNotice("");
        void runtime.api.ready.then((api) => api.deleteBranch(sessionId, branch, false)).catch((error) => ({ ok: false, problem: "failed", message: messageOf(error) })).then(async (outcome) => {
          if (outcome.ok) {
            setBusy(false);
            rememberStatus(cache, sessionId, outcome.snapshot);
            setSnapshot(outcome.snapshot);
            if (branch === preview) setPreview(null);
            dropHistory();
            return;
          }
          if (outcome.problem !== "unmerged") {
            setBusy(false);
            const text = refusalText(t, outcome.problem, outcome.message, t("notice.deleteFailed"));
            setNotice(text);
            return;
          }
          setBusy(false);
          void confirmForceDelete(t, branch).then((forced) => {
            if (!forced) return;
            write(
              () => runtime.api.ready.then((api) => api.deleteBranch(sessionId, branch, true)),
              t("notice.deleteFailed")
            );
          });
        });
      };
      const merge = (branch) => {
        if (preview !== null) {
          onPreviewed(() => {
            mergeInto(branch);
          });
          return;
        }
        void confirmMerge(t, branch, current().branch ?? null).then((agreed) => {
          if (!agreed) return;
          mergeInto(branch);
        });
      };
      const mergeInto = (branch) => {
        write(
          () => runtime.api.ready.then((api) => api.mergeBranch(sessionId, branch)),
          t("notice.mergeFailed"),
          "log"
        );
      };
      const commitWith = (stageAll) => {
        const text = message.trim();
        if (text === "") return;
        setNotice("");
        setBusy(true);
        const paths = stageAll || picked.length === 0 ? void 0 : [...picked];
        const options = paths === void 0 ? { amend, stageAll } : { amend, stageAll, paths };
        void calls.commit(text, options).catch((error) => ({ ok: false, problem: "failed", message: messageOf(error) })).then((outcome) => {
          setBusy(false);
          if (!outcome.ok) {
            setNotice(outcome.message);
            return;
          }
          rememberStatus(cache, sessionId, outcome.snapshot);
          setSnapshot(outcome.snapshot);
          setMessage("");
          setAmend(false);
          setPicked([]);
          dropHistory();
        });
      };
      const commitAndPush = (stageAll) => {
        const text = message.trim();
        if (text === "") return;
        void confirmSync(t, "push", current().upstream?.name ?? null).then((agreed) => {
          if (!agreed) return;
          pushAfterCommit(text, stageAll);
        });
      };
      const pushAfterCommit = (text, stageAll) => {
        setNotice("");
        setBusy(true);
        const paths = stageAll || picked.length === 0 ? void 0 : [...picked];
        const options = paths === void 0 ? { amend, stageAll } : { amend, stageAll, paths };
        void calls.commit(text, options).catch((error) => ({ ok: false, problem: "failed", message: messageOf(error) })).then((outcome) => {
          if (!outcome.ok) {
            setBusy(false);
            setNotice(outcome.message);
            return;
          }
          rememberStatus(cache, sessionId, outcome.snapshot);
          setSnapshot(outcome.snapshot);
          setMessage("");
          setAmend(false);
          setPicked([]);
          dropHistory();
          return calls.sync("push").catch((error) => ({ ok: false, problem: "failed", message: messageOf(error) })).then((pushed) => {
            setBusy(false);
            if (pushed.ok) {
              rememberStatus(cache, sessionId, pushed.snapshot);
              setSnapshot(pushed.snapshot);
              setNotice(t("notice.commitPushed"));
              return;
            }
            setNotice(refusalText(t, pushed.problem, pushed.message, t("notice.syncFailed")));
          });
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
          void confirmDiscard(t, { files: [entry.path], untracked: untracked ? [entry.path] : [] }).then((agreed) => {
            if (!agreed) return;
            write(() => calls.discard([entry.path], untracked), t("notice.discardFailed"));
          });
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
          icon: "undo",
          label: t("row.discard"),
          danger: true,
          run: discard
        }, diffAction];
      };
      const historyOpen = !collapsedPanes.history;
      const aboveOf = (id) => id === "history" ? ["commit", "changes"] : id === "commit" ? ["changes"] : [];
      const slackOf = () => {
        if (typeof document === "undefined" || typeof document.querySelector !== "function") return 0;
        const grown = document.querySelector(`[data-git-pane='changes']`);
        if (grown === null) return 0;
        return Math.max(0, Math.round(grown.getBoundingClientRect().height - paneSizes.changes));
      };
      const sizePane = (id, size) => {
        const slack = slackOf();
        setPaneSizes((previous) => {
          const wanted = snapPaneSize(id, clampPaneSize(size), ROW_H, HISTORY_CHROME_H);
          const delta = wanted - previous[id];
          if (delta === 0) return previous;
          let remaining = delta > 0 ? delta - Math.min(delta, slack) : delta;
          const next = { ...previous, [id]: wanted };
          for (const other of aboveOf(id)) {
            if (remaining <= 0) break;
            const room = next[other] - PANE_FLOOR[other];
            const taken = Math.min(remaining, room);
            next[other] = next[other] - taken;
            remaining -= taken;
          }
          next[id] = aboveOf(id).length === 0 ? wanted : wanted - Math.max(0, remaining);
          return next;
        });
      };
      const togglePane = (id) => {
        setCollapsedPanes((previous) => ({ ...previous, [id]: !previous[id] }));
      };
      const startResize = (id, event) => {
        event.preventDefault?.();
        if (typeof window === "undefined") return;
        drag.stop?.();
        drag.stop = startPaneDrag({
          size: paneSizes[id],
          startY: event.clientY,
          window,
          onSize: (size) => {
            sizePane(id, size);
          }
        });
      };
      const resizeByKey = (id, event) => {
        const next = paneKeySize(id, paneSizes[id], event.key, id === "history" ? ROW_H : void 0);
        if (next === void 0) return;
        event.preventDefault?.();
        sizePane(id, next);
      };
      React.useEffect(() => () => {
        drag.stop?.();
        drag.stop = void 0;
      }, []);
      const pane = (id, title, content2) => gitPane(React, {
        id,
        title,
        size: paneSizes[id],
        collapsed: collapsedPanes[id],
        // The change list is the region that can always use more room, so it takes
        // whatever the other two leave: folding the history hands its height back to
        // the list instead of leaving a band of nothing under the last region.
        grow: id === "changes",
        t,
        content: content2,
        onToggle: () => {
          togglePane(id);
        },
        onResizeStart: (event) => {
          startResize(id, event);
        },
        onResizeKey: (event) => {
          resizeByKey(id, event);
        }
      });
      const panes = (...regions) => React.createElement("div", { className: `${PREFIX3}-panes`, "data-git-panes": "" }, ...regions);
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
        abort: abortOperation,
        deleteBranch,
        mergeBranch: merge,
        preview,
        previewBranch,
        exitPreview,
        repo: React.createElement(RepoBar, {
          root: snapshot?.root,
          loading,
          busy,
          enabled: sessionId !== "",
          t,
          list: calls.repositories,
          select: switchRepository
        })
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
      const commitBox = (clean) => {
        const now = current();
        return CommitBox(React, {
          message,
          stagedCount: clean ? 0 : now.staged.length,
          unstagedCount: clean ? 0 : now.unstaged.length,
          pickedCount: picked.length,
          clean,
          identityMissing: isIdentityMissing(now.identity),
          busy,
          canAmend: now.commit !== null && now.commit !== void 0,
          amend,
          recent,
          recentOpen,
          drafting,
          onDraft: draftMessage,
          onRecentToggle: () => {
            setRecentOpen(!recentOpen);
          },
          t,
          onChange: setMessage,
          onAmendChange: setAmend,
          onSubmit: commitWith,
          onSubmitAndPush: commitAndPush
        });
      };
      const historyElement = () => React.createElement(History, {
        // A preview changes the ref the list reads, and the list's own reads close
        // over the props of the mount that made them, so the branch is part of the
        // identity: a new preview gets a component that reads from zero.
        key: preview ?? "head",
        open: historyOpen,
        t,
        load: readHistory,
        tab,
        // A commit changes the newest entry, and the cached page was dropped when
        // that happened, so the revision is only what the head shows: the list
        // itself reads from the cache until a write invalidates it.
        revision: historyRevision,
        // The branch the list is showing when it is not the checkout, so the head
        // can say whose log this is.
        branch: preview,
        // The history's own title button and the region's head fold the same
        // state, so the two can never disagree about whether the list is open.
        onToggle: () => {
          togglePane("history");
        },
        // The history head keeps the panel's own refresh, so a reader reading the
        // graph can ask for a new snapshot without scrolling back up.
        onRefresh: refresh,
        // The cached page this Session already read: a reopened tab draws these
        // rows on its first render instead of asking the Host again. A preview
        // reads past the cache, so it neither seeds nor fills it.
        initial: preview === null ? cache.history.get(sessionId) : void 0,
        remember: preview === null ? (page) => {
          appendHistory(cache, sessionId, page);
          setRecent(subjectsOf(page));
        } : void 0,
        onCheckout: checkoutCommit,
        onBranchFrom: branchFromCommit,
        onCopy: copyCommit
      });
      const ConflictView = makeConflictView(React);
      const visible = (entries2, staged) => {
        void staged;
        const needle = filter.trim().toLowerCase();
        if (needle === "") return [...entries2];
        return entries2.filter((entry) => entry.path.toLowerCase().includes(needle));
      };
      const pathsFor = (group, fallback) => {
        const picked2 = selected.filter((key) => key.startsWith(`${group}:`)).map((key) => key.slice(group.length + 1));
        return picked2.length > 0 ? picked2 : [...fallback];
      };
      const clearSelection = () => {
        setSelected([]);
        setAnchor(null);
      };
      const pickFile = (path, on) => {
        setPicked((current2) => togglePick(current2, path, on));
      };
      const selectRow = (group, entries2, path, range) => {
        const key = selectionKey(group, path);
        if (range) {
          const span = rangeBetween(entries2, anchor, path).map((picked2) => selectionKey(group, picked2));
          setSelected([.../* @__PURE__ */ new Set([...selected, ...span])]);
          return;
        }
        setAnchor(path);
        setSelected(selected.includes(key) ? selected.filter((existing) => existing !== key) : [...selected, key]);
      };
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
        const sectionActions = section === "staged" ? [{
          id: "unstage-all",
          label: t("group.unstageAll"),
          icon: "unstage",
          disabled: busy || snapshotNow.staged.length === 0,
          run: () => {
            unstagePaths(pathsFor("staged", snapshotNow.staged.map((entry) => entry.path)));
          }
        }, {
          id: "discard-staged",
          label: t("group.discardStaged"),
          icon: "undo",
          danger: true,
          disabled: busy || snapshotNow.staged.length === 0,
          run: () => {
            discardPaths(pathsFor("staged", snapshotNow.staged.map((entry) => entry.path)));
          }
        }] : section === "unstaged" ? [{
          id: "stage-all",
          label: t("group.stageAll"),
          icon: "stage",
          disabled: busy || snapshotNow.unstaged.length === 0,
          run: () => {
            stagePaths(pathsFor("unstaged", snapshotNow.unstaged.map((entry) => entry.path)));
          }
        }, {
          id: "discard-all",
          label: t("group.discardAll"),
          icon: "undo",
          danger: true,
          disabled: busy || snapshotNow.unstaged.length === 0,
          run: () => {
            discardPaths(pathsFor("unstaged", snapshotNow.unstaged.map((entry) => entry.path)));
          }
        }] : [];
        return React.createElement(
          "div",
          { className: `${PREFIX3}-body` },
          notice === "" ? null : React.createElement("p", { className: `${PREFIX3}-notice`, role: "alert" }, notice),
          sectionTabs(React, t, section, {
            unstaged: snapshotNow.unstaged.length,
            staged: snapshotNow.staged.length,
            stashes: stashes.length
          }, setSection),
          sectionToolbar(React, t, {
            filter: section === "stashes" ? void 0 : filter,
            onFilter: setFilter,
            actions: sectionActions
          }),
          // Conflicts stay above the tabs: an unmerged path blocks every other
          // action, so it must not be hidden behind a tab the reader is not on.
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
          section !== "staged" ? null : changeGroup(React, {
            title: t("group.staged"),
            group: "staged",
            headless: true,
            count: snapshotNow.staged.length,
            rows: visible(snapshotNow.staged, true).map((entry) => React.createElement(FileRow, {
              key: `staged:${entry.path}`,
              entry,
              actions: rowActions(entry, true, false),
              t,
              selected: selected.includes(selectionKey("staged", entry.path)),
              picked: picked.includes(entry.path),
              onPick: (on) => {
                pickFile(entry.path, on);
              },
              onSelect: (event) => {
                selectRow("staged", visible(snapshotNow.staged, true), entry.path, event.shiftKey);
              }
            })),
            actions: []
          }),
          section !== "unstaged" ? null : changeGroup(React, {
            title: t("group.changes"),
            group: "unstaged",
            headless: true,
            count: snapshotNow.unstaged.length,
            rows: visible(snapshotNow.unstaged, false).map((entry) => React.createElement(FileRow, {
              key: `changes:${entry.path}`,
              entry,
              actions: rowActions(entry, false, false),
              t,
              selected: selected.includes(selectionKey("unstaged", entry.path)),
              picked: picked.includes(entry.path),
              onPick: (on) => {
                pickFile(entry.path, on);
              },
              onSelect: (event) => {
                selectRow("unstaged", visible(snapshotNow.unstaged, false), entry.path, event.shiftKey);
              }
            })),
            actions: []
          }),
          selected.length === 0 ? null : React.createElement(
            "p",
            {
              className: `${PREFIX3}-selection`,
              "data-git-selection": String(selected.length),
              role: "status"
            },
            t("list.selected", { count: selected.length }),
            React.createElement("button", {
              type: "button",
              className: `${PREFIX3}-selection-clear`,
              "data-git-selection-clear": "",
              onClick: clearSelection
            }, t("list.clear"))
          ),
          section !== "stashes" ? null : React.createElement(StashGroup, { ...stashProps(), headless: true })
        );
      };
      if (snapshot === void 0) {
        return React.createElement(
          "section",
          {
            className: `${PREFIX3}-root`,
            "data-git-panel": "",
            "data-git-cache": cacheState,
            ...busy ? { "data-git-busy": "" } : {}
          },
          React.createElement(Progress, { active: loading || refreshing }),
          React.createElement(BranchHeader, headerProps()),
          sessionId === "" ? stateBlock(React, t("state.noSession.title"), t("state.noSession.body")) : skeleton3(React),
          React.createElement(DialogHost, null)
        );
      }
      if (snapshot.kind === "unavailable") {
        const problem = snapshot.problem ?? "failed";
        return React.createElement(
          "section",
          {
            className: `${PREFIX3}-root`,
            "data-git-panel": "",
            "data-git-cache": cacheState,
            "data-problem": problem
          },
          React.createElement(Progress, { active: loading || refreshing }),
          React.createElement(BranchHeader, headerProps()),
          stateBlock(React, t(`state.${problem}.title`), t(`state.${problem}.body`), snapshot.message),
          panes(pane("history", t("history.title"), historyElement())),
          React.createElement(DialogHost, null)
        );
      }
      const total = snapshot.staged.length + snapshot.unstaged.length + snapshot.conflicts.length;
      if (total === 0 && conflict === null) {
        return React.createElement(
          "section",
          {
            className: `${PREFIX3}-root`,
            "data-git-panel": "",
            "data-git-cache": cacheState,
            ...busy ? { "data-git-busy": "" } : {}
          },
          React.createElement(Progress, { active: loading || refreshing }),
          React.createElement(BranchHeader, headerProps()),
          notice === "" ? null : React.createElement("p", { className: `${PREFIX3}-notice`, role: "alert" }, notice),
          // The changes region keeps its head even when the tree is clean: the reader
          // still resizes and folds it, and a column that silently loses one of its
          // three regions would move the other two under the pointer.
          panes(
            pane("changes", t("group.changes"), React.createElement(
              "div",
              null,
              stateBlock(React, t("state.clean.title"), t("state.clean.body")),
              React.createElement(StashGroup, stashProps())
            )),
            pane("commit", t("pane.commit"), commitBox(true)),
            pane("history", t("history.title"), historyElement())
          ),
          React.createElement(DialogHost, null)
        );
      }
      return React.createElement(
        "section",
        {
          className: `${PREFIX3}-root`,
          "data-git-panel": "",
          "data-git-cache": cacheState,
          ...busy ? { "data-git-busy": "" } : {}
        },
        React.createElement(Progress, { active: loading || refreshing }),
        React.createElement(BranchHeader, headerProps()),
        panes(
          pane("changes", t("group.changes"), bodyElement(snapshot)),
          pane("commit", t("pane.commit"), commitBox(false)),
          pane("history", t("history.title"), historyElement())
        ),
        React.createElement(DialogHost, null)
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
    if (problem === "stale") return t("notice.stale");
    return message === "" ? fallback : message;
  }
  function failedSelect(error) {
    return { ok: false, problem: "failed", message: messageOf(error) };
  }
  function draftRefusal(t, problem, message) {
    if (problem === "no-changes") return t("notice.draftEmpty");
    if (problem === "not-configured") return t("notice.draftUnconfigured");
    return message === "" ? t("notice.draftFailed") : message;
  }
  function changeGroup(React, props) {
    const { title, count, rows: rows2, actions, tone } = props;
    return React.createElement(
      "section",
      {
        className: `${PREFIX3}-group`,
        "data-git-group": props.group,
        "data-tone": tone,
        "data-count": count
      },
      props.headless === true ? actions.length === 0 ? null : React.createElement(
        "div",
        { className: `${PREFIX3}-group-head ${PREFIX3}-group-head-actions` },
        React.createElement(
          "span",
          { className: `${PREFIX3}-group-actions` },
          ...actions.map((action) => groupButton(React, action))
        )
      ) : React.createElement(
        "div",
        { className: `${PREFIX3}-group-head` },
        React.createElement("h3", { className: `${PREFIX3}-group-title` }, title),
        React.createElement("span", { className: `${PREFIX3}-count` }, String(count)),
        React.createElement(
          "span",
          { className: `${PREFIX3}-group-actions` },
          ...actions.map((action) => groupButton(React, action))
        )
      ),
      rows2.length === 0 ? null : React.createElement("ul", { className: `${PREFIX3}-list` }, ...rows2)
    );
  }
  function sectionTabs(React, t, current, counts, pick) {
    const tabs = [
      { id: "unstaged", label: t("group.changes"), count: counts.unstaged },
      { id: "staged", label: t("group.staged"), count: counts.staged },
      { id: "stashes", label: t("stash.group"), count: counts.stashes }
    ];
    return React.createElement(
      "div",
      {
        className: `${PREFIX3}-tabs`,
        "data-git-tabs": "",
        role: "tablist"
      },
      ...tabs.map((tab) => React.createElement(
        "button",
        {
          key: tab.id,
          type: "button",
          className: `${PREFIX3}-tab`,
          role: "tab",
          "data-git-tab": tab.id,
          "data-active": tab.id === current ? "" : void 0,
          "aria-selected": tab.id === current ? "true" : "false",
          onClick: () => {
            pick(tab.id);
          }
        },
        React.createElement("span", { className: `${PREFIX3}-tab-label` }, tab.label),
        React.createElement("span", { className: `${PREFIX3}-count` }, String(tab.count))
      ))
    );
  }
  function sectionToolbar(React, t, view) {
    return React.createElement(
      "div",
      { className: `${PREFIX3}-toolbar` },
      view.filter === void 0 ? React.createElement("span", { className: `${PREFIX3}-toolbar-fill` }) : React.createElement("input", {
        type: "search",
        className: `${PREFIX3}-filter`,
        "data-git-filter": "",
        value: view.filter,
        placeholder: t("list.filter"),
        "aria-label": t("list.filter"),
        spellCheck: false,
        onChange: (event) => {
          view.onFilter(event.target.value);
        }
      }),
      React.createElement(
        "span",
        { className: `${PREFIX3}-group-actions` },
        ...view.actions.map((action) => groupButton(React, action))
      )
    );
  }
  function groupButton(React, action) {
    return React.createElement("button", {
      key: action.id,
      type: "button",
      className: `${PREFIX3}-action`,
      "aria-label": action.label,
      title: action.label,
      "data-action": action.id,
      "data-git-action": action.id,
      ...action.danger === true ? { "data-danger": "" } : {},
      ...action.disabled === true ? { disabled: true } : {},
      onClick: action.run
    }, Icon(React, action.icon));
  }
  function stateBlock(React, title, body2, detail) {
    const text = detail ?? "";
    return React.createElement(
      "div",
      { className: `${PREFIX3}-state`, role: "status" },
      React.createElement("p", { className: `${PREFIX3}-state-title` }, title),
      React.createElement("p", { className: `${PREFIX3}-state-line` }, body2),
      text === "" ? null : React.createElement("p", { className: `${PREFIX3}-state-line` }, text)
    );
  }
  var RECENT_LIMIT = 5;
  function subjectsOf(page) {
    if (page === void 0) return [];
    const seen = /* @__PURE__ */ new Set();
    const subjects = [];
    for (const commit of page.commits) {
      const subject = commit.subject.trim();
      if (subject === "" || seen.has(subject)) continue;
      seen.add(subject);
      subjects.push(subject);
      if (subjects.length === RECENT_LIMIT) break;
    }
    return subjects;
  }
  function skeleton3(React) {
    const widths = [46, 70, 58, 34];
    return React.createElement(
      "div",
      { className: `${PREFIX3}-skeleton`, "aria-busy": "true" },
      ...widths.map((width, index) => React.createElement("div", {
        key: index,
        className: `${PREFIX3}-skeleton-bar`,
        style: { width: `${width}%` }
      }))
    );
  }

  // src/client/tool-card.ts
  var opened = /* @__PURE__ */ new Set();
  var MAX_CLAIMS = 200;
  function makeGitToolRow(React, deps, kind) {
    return function GitToolRow(props) {
      const { t, openPanel } = deps;
      React.useEffect(() => {
        if (kind !== "open" || props.phase !== "result") return;
        if (opened.has(props.callId)) return;
        if (!openPanel()) return;
        if (opened.size >= MAX_CLAIMS) opened.clear();
        opened.add(props.callId);
      }, [props.callId, props.phase]);
      const settled = props.phase === "result";
      const title = kind === "open" ? t("gitTool.open.title") : t("gitTool.list.title");
      const summary = settled ? resultText(props.block) : t("gitTool.running");
      return React.createElement(
        "div",
        {
          className: `${PREFIX3}-tool-row`,
          "data-git-tool-row": props.toolName,
          "data-git-tool-call": props.callId,
          "data-git-tool-phase": props.phase
        },
        Icon(React, kind === "open" ? "repo" : "merge", { size: 16 }),
        React.createElement(
          "div",
          { className: `${PREFIX3}-tool-body` },
          React.createElement("span", { className: `${PREFIX3}-tool-title` }, title),
          React.createElement("span", { className: `${PREFIX3}-tool-summary` }, summary)
        ),
        kind !== "open" ? null : React.createElement("button", {
          type: "button",
          className: `${PREFIX3}-tool-open`,
          "data-git-tool-open": "",
          disabled: !settled,
          title: t("gitTool.open.action"),
          onClick: openPanel
        }, t("gitTool.open.action"))
      );
    };
  }
  function resultText(block) {
    for (const item of block?.result?.content ?? []) {
      const text = item?.text;
      if (typeof text === "string" && text.length > 0) return text;
    }
    return "";
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
      "branch.delete": "\u5220\u9664\u5206\u652F",
      "branch.create": "\u521B\u5EFA",
      "branch.mergeInto": "\u5408\u5E76\u5230\u5F53\u524D\u5206\u652F",
      "branch.checkout": "\u7B7E\u51FA",
      "branch.preview": "\u9884\u89C8",
      "branch.previewBadge": "\u9884\u89C8",
      "branch.previewHint": "\u9884\u89C8\u4E2D\uFF1B\u5B9E\u9645\u7B7E\u51FA\u7684\u662F {current}",
      "branch.previewBar": "\u9884\u89C8 {branch}\uFF1A\u66F4\u6539\u3001\u6682\u5B58\u4E0E\u63D0\u4EA4\u4ECD\u4F5C\u7528\u4E8E\u5B9E\u9645\u7B7E\u51FA\u7684 {current}",
      "branch.previewExit": "\u9000\u51FA\u9884\u89C8",
      "branch.remove": "\u5220\u9664",
      "history.previewBranch": "{branch} \u7684\u5386\u53F2",
      "repo.selector": "\u5207\u6362\u4ED3\u5E93",
      "repo.loading": "\u6B63\u5728\u626B\u63CF\u5B50\u76EE\u5F55\u2026",
      "repo.empty": "\u6CA1\u6709\u626B\u63CF\u5230 Git \u4ED3\u5E93",
      "repo.none": "\u9009\u62E9\u4ED3\u5E93",
      "repo.submodule": "\u5B50\u6A21\u5757",
      "repo.worktree": "\u5DE5\u4F5C\u6811",
      "repo.scanned": "\u626B\u63CF\u5230 {count} \u4E2A\u4ED3\u5E93\uFF0C\u6700\u5927\u6DF1\u5EA6 {depth}",
      "repo.truncated": "\u626B\u63CF\u5DF2\u8FBE\u76EE\u5F55\u4E0A\u9650\uFF0C\u7ED3\u679C\u53EF\u80FD\u4E0D\u5B8C\u6574",
      "repo.warnings": "\u6709 {count} \u6761\u6392\u9664\u89C4\u5219\u65E0\u6CD5\u89E3\u6790",
      "repo.reset": "\u56DE\u5230\u5DE5\u4F5C\u76EE\u5F55",
      "repo.failed": "\u626B\u63CF\u4ED3\u5E93\u5931\u8D25",
      "notice.switchFailed": "\u5207\u6362\u4ED3\u5E93\u5931\u8D25",
      "gitTool.open.title": "\u5728 Git \u9762\u677F\u4E2D\u6253\u5F00\u4ED3\u5E93",
      "gitTool.list.title": "\u626B\u63CF\u5230\u7684 Git \u4ED3\u5E93",
      "gitTool.open.action": "\u6253\u5F00 Git \u9762\u677F",
      "gitTool.running": "\u6B63\u5728\u5904\u7406\u2026",
      "notice.deleteFailed": "\u5220\u9664\u5206\u652F\u5931\u8D25",
      "notice.mergeFailed": "\u5408\u5E76\u5931\u8D25",
      "dialog.deleteBranch": "\u5220\u9664\u5206\u652F {branch}\uFF1F",
      "dialog.forceDeleteBranch": "{branch} \u4E0A\u6709\u672A\u5408\u5E76\u7684\u63D0\u4EA4\uFF0C\u5F3A\u5236\u5220\u9664\u4F1A\u4E22\u5931\u8FD9\u4E9B\u63D0\u4EA4\u3002\u7EE7\u7EED\uFF1F",
      "dialog.merge": "\u628A {branch} \u5408\u5E76\u5230 {current}\uFF1F",
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
      "history.count": "{count} \u4E2A\u63D0\u4EA4",
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
      "list.filter": "\u8FC7\u6EE4\u6587\u4EF6",
      "list.selected": "\u5DF2\u9009\u62E9 {count} \u4E2A\u6587\u4EF6",
      "list.clear": "\u53D6\u6D88\u9009\u62E9",
      "group.conflicts": "\u51B2\u7A81",
      "group.stageAll": "\u5168\u90E8\u6682\u5B58",
      "group.unstageAll": "\u5168\u90E8\u53D6\u6D88\u6682\u5B58",
      "group.discardAll": "\u64A4\u9500\u5168\u90E8\u66F4\u6539",
      "group.discardStaged": "\u64A4\u9500\u5168\u90E8\u6682\u5B58",
      "row.stage": "\u6682\u5B58",
      "row.unstage": "\u53D6\u6D88\u6682\u5B58",
      "row.discard": "\u64A4\u9500\u66F4\u6539",
      "row.diff": "\u67E5\u770B\u5DEE\u5F02",
      "row.pick": "\u52FE\u9009 {path} \u7528\u4E8E\u63D0\u4EA4",
      "row.resolve": "\u89E3\u51B3\u51B2\u7A81",
      "row.renamed": "{from} \u2192 {path}",
      "commit.placeholder": "\u63D0\u4EA4\u4FE1\u606F\uFF08Ctrl+Enter \u63D0\u4EA4\uFF09",
      "commit.submit": "\u63D0\u4EA4",
      "commit.hint": "\u5DF2\u6682\u5B58 {count} \u4E2A\u6587\u4EF6",
      "commit.pickedHint": "\u5DF2\u9009 {count} \u4E2A\u6587\u4EF6",
      "commit.busy": "\u6B63\u5728\u5904\u7406\u2026",
      "commit.identityMissing": "\u672A\u914D\u7F6E Git \u7528\u6237\u8EAB\u4EFD\uFF0C\u8BF7\u5148\u8BBE\u7F6E user.name \u4E0E user.email",
      "commit.nothingStaged": "\u6682\u5B58\u533A\u4E3A\u7A7A\uFF0C\u8BF7\u5148\u6682\u5B58\u8981\u63D0\u4EA4\u7684\u66F4\u6539",
      "commit.noPick": "\u5148\u52FE\u9009\u8981\u63D0\u4EA4\u7684\u6587\u4EF6",
      "commit.emptyMessage": "\u8BF7\u5148\u586B\u5199\u63D0\u4EA4\u4FE1\u606F",
      "commit.clean": "\u5DE5\u4F5C\u533A\u6CA1\u6709\u6539\u52A8\uFF1B\u53EF\u52FE\u9009\u300C\u6539\u5199\u4E0A\u6B21\u63D0\u4EA4\u300D\u4FEE\u6539\u63D0\u4EA4\u4FE1\u606F",
      "commit.amend": "\u6539\u5199\u4E0A\u6B21\u63D0\u4EA4",
      "commit.amendHint": "\u5C06\u6539\u5199\u4E0A\u4E00\u6B21\u63D0\u4EA4",
      "commit.stageAllHint": "\u63D0\u4EA4\u65F6\u4F1A\u5148\u6682\u5B58 {count} \u4E2A\u6587\u4EF6",
      "commit.stageAllSubmit": "\u6682\u5B58\u5168\u90E8\u5E76\u63D0\u4EA4",
      "commit.recent": "\u6700\u8FD1\u63D0\u4EA4\u4FE1\u606F",
      "commit.draft": "\u751F\u6210\u63D0\u4EA4\u4FE1\u606F",
      "notice.draftEmpty": "\u6CA1\u6709\u53EF\u63CF\u8FF0\u7684\u6539\u52A8",
      "notice.draftUnconfigured": "\u672A\u914D\u7F6E\u7528\u4E8E\u751F\u6210\u63D0\u4EA4\u4FE1\u606F\u7684\u6A21\u578B\uFF0C\u8BF7\u8BBE\u7F6E draftProvider \u4E0E draftModel",
      "notice.draftFailed": "\u751F\u6210\u63D0\u4EA4\u4FE1\u606F\u5931\u8D25",
      "commit.more": "\u66F4\u591A\u64CD\u4F5C",
      "commit.checkout": "\u7B7E\u51FA\u6B64\u63D0\u4EA4",
      "commit.branchFrom": "\u4ECE\u6B64\u63D0\u4EA4\u65B0\u5EFA\u5206\u652F",
      "commit.copySha": "\u590D\u5236\u63D0\u4EA4 SHA",
      "dialog.detach": "\u5C06\u7B7E\u51FA\u63D0\u4EA4 {short}\uFF0C\u8FDB\u5165\u5206\u79BB HEAD \u72B6\u6001\u3002\u7EE7\u7EED\uFF1F",
      "dialog.branchFrom": "\u8F93\u5165\u65B0\u5206\u652F\u540D\u79F0\uFF08\u4ECE\u63D0\u4EA4 {short} \u5F00\u59CB\uFF09\uFF1A",
      "notice.copied": "\u5DF2\u590D\u5236 {short}",
      "notice.copyFailed": "\u590D\u5236\u5931\u8D25",
      "commit.push": "\u63D0\u4EA4\u5E76\u63A8\u9001",
      "commit.pushTitle": "\u63D0\u4EA4\u540E\u7ACB\u5373\u63A8\u9001\u5F53\u524D\u5206\u652F",
      "pane.commit": "\u63D0\u4EA4\u4FE1\u606F",
      "pane.collapse": "\u6536\u8D77",
      "pane.expand": "\u5C55\u5F00",
      "pane.resize": "\u62D6\u52A8\u8C03\u6574\u9AD8\u5EA6\uFF08\u2191/\u2193 \u5FAE\u8C03\uFF0CHome \u590D\u4F4D\uFF09",
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
      "notice.commitPushed": "\u5DF2\u63D0\u4EA4\u5E76\u63A8\u9001",
      "notice.dirty": "\u6709\u672A\u63D0\u4EA4\u7684\u6539\u52A8\uFF0C\u65E0\u6CD5\u5207\u6362\u5206\u652F",
      "notice.exists": "\u540C\u540D\u5206\u652F\u5DF2\u5B58\u5728",
      "notice.invalidName": "\u8FD9\u4E2A\u540D\u79F0\u4E0D\u662F\u6709\u6548\u7684\u5206\u652F\u540D",
      "notice.stale": "\u5DEE\u5F02\u5DF2\u53D8\u5316\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5",
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
      "dialog.confirm": "\u786E\u5B9A",
      "dialog.cancel": "\u53D6\u6D88",
      "dialog.ok": "\u77E5\u9053\u4E86",
      "dialog.abort.title": "\u4E2D\u6B62\u5F53\u524D\u64CD\u4F5C\uFF1F",
      "dialog.deleteBranch.title": "\u5220\u9664\u8FD9\u4E2A\u5206\u652F\uFF1F",
      "dialog.forceDeleteBranch.title": "\u5F3A\u5236\u5220\u9664\u8FD9\u4E2A\u5206\u652F\uFF1F",
      "dialog.merge.title": "\u5408\u5E76\u5230\u8FD9\u4E2A\u5206\u652F\uFF1F",
      "dialog.detach.title": "\u7B7E\u51FA\u8FD9\u4E2A\u63D0\u4EA4\uFF1F",
      "dialog.branchFrom.title": "\u65B0\u5EFA\u5206\u652F",
      "dialog.refused.title": "Git \u62D2\u7EDD\u4E86\u8FD9\u6B21\u64CD\u4F5C",
      "dialog.filesMany": "{first} \u7B49 {count} \u4E2A\u6587\u4EF6",
      "dialog.stash.popTitle": "\u5F39\u51FA\u8FD9\u6761\u50A8\u85CF\uFF1F",
      "dialog.stash.popBody": "\u6539\u52A8\u4F1A\u56DE\u5230\u5DE5\u4F5C\u533A\uFF0C\u50A8\u85CF\u8BB0\u5F55\u5C06\u88AB\u5220\u9664\u3002",
      "dialog.stash.dropTitle": "\u5220\u9664\u8FD9\u6761\u50A8\u85CF\uFF1F",
      "dialog.stash.dropBody": "\u50A8\u85CF\u8BB0\u5F55\u5C06\u88AB\u5220\u9664\uFF0C\u5176\u4E2D\u7684\u6539\u52A8\u4E0D\u4F1A\u518D\u56DE\u5230\u5DE5\u4F5C\u533A\u3002",
      "dialog.pull.title": "\u62C9\u53D6\u8FDC\u7AEF\uFF1F",
      "dialog.pull.body": "\u4F1A\u628A {name} \u5408\u5165\u5F53\u524D\u5206\u652F\uFF0C\u53EF\u80FD\u4EA7\u751F\u51B2\u7A81\u6216\u6539\u5199\u5DE5\u4F5C\u533A\u3002",
      "dialog.push.title": "\u63A8\u9001\u5230\u8FDC\u7AEF\uFF1F",
      "dialog.push.body": "\u4F1A\u628A\u5F53\u524D\u5206\u652F\u7684\u63D0\u4EA4\u63A8\u9001\u5230 {name}\uFF0C\u5176\u4ED6\u4EBA\u4F1A\u770B\u5230\u8FD9\u4E9B\u63D0\u4EA4\u3002",
      "dialog.previewCheckout.title": "\u7B7E\u51FA\u6B63\u5728\u9884\u89C8\u7684\u5206\u652F\uFF1F",
      "dialog.previewCheckout.body": "\u5F53\u524D\u9884\u89C8\u7684\u662F {preview}\uFF0C\u8FD9\u4E2A\u64CD\u4F5C\u9700\u8981\u5728\u5B83\u4E0A\u9762\u6267\u884C\uFF1B\u5B9E\u9645\u7B7E\u51FA\u7684\u662F {current}\u3002\u7EE7\u7EED\u4F1A\u5148\u7B7E\u51FA {preview}\u3002",
      "dialog.previewCheckout.confirm": "\u7B7E\u51FA\u5E76\u7EE7\u7EED"
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
      "branch.delete": "Delete branch",
      "branch.mergeInto": "Merge into the current branch",
      "branch.checkout": "Checkout",
      "branch.preview": "Preview",
      "branch.previewBadge": "preview",
      "branch.previewHint": "Previewing; the checkout is {current}",
      "branch.previewBar": "Previewing {branch}: changes, staging and commits still act on {current}",
      "branch.previewExit": "Exit preview",
      "branch.remove": "Delete",
      "history.previewBranch": "History of {branch}",
      "repo.selector": "Switch repository",
      "repo.loading": "Scanning subdirectories\u2026",
      "repo.empty": "No Git repository found",
      "repo.none": "Choose a repository",
      "repo.submodule": "submodule",
      "repo.worktree": "worktree",
      "repo.scanned": "{count} repositories found, depth {depth}",
      "repo.truncated": "The scan reached its directory limit, so the list may be incomplete",
      "repo.warnings": "{count} exclude rule(s) could not be parsed",
      "repo.reset": "Back to the working directory",
      "repo.failed": "Could not scan for repositories",
      "notice.switchFailed": "Could not switch the repository",
      "gitTool.open.title": "Repository opened in the Git panel",
      "gitTool.list.title": "Git repositories found",
      "gitTool.open.action": "Open the Git panel",
      "gitTool.running": "Working\u2026",
      "notice.deleteFailed": "Could not delete the branch",
      "notice.mergeFailed": "Could not merge the branch",
      "dialog.deleteBranch": "Delete the branch {branch}?",
      "dialog.forceDeleteBranch": "{branch} holds unmerged commits; forcing the delete loses them. Continue?",
      "dialog.merge": "Merge {branch} into {current}?",
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
      "history.count": "{count} commits",
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
      "list.filter": "Filter files",
      "list.selected": "{count} file(s) selected",
      "list.clear": "Clear",
      "group.conflicts": "Conflicts",
      "group.stageAll": "Stage all",
      "group.unstageAll": "Unstage all",
      "group.discardAll": "Undo all changes",
      "group.discardStaged": "Undo all staged",
      "row.stage": "Stage",
      "row.unstage": "Unstage",
      "row.discard": "Undo changes",
      "row.diff": "View diff",
      "row.pick": "Pick {path} for the commit",
      "row.resolve": "Resolve conflict",
      "row.renamed": "{from} \u2192 {path}",
      "commit.placeholder": "Commit message (Ctrl+Enter to commit)",
      "commit.submit": "Commit",
      "commit.hint": "{count} file(s) staged",
      "commit.pickedHint": "{count} file(s) picked",
      "commit.busy": "Working\u2026",
      "commit.identityMissing": "No Git author is configured; set user.name and user.email first",
      "commit.nothingStaged": "Nothing is staged; stage the changes to commit",
      "commit.noPick": "Tick the files to commit first",
      "commit.emptyMessage": "Write a commit message first",
      "commit.clean": "The tree is clean; tick Amend to rewrite the message",
      "commit.amend": "Amend the last commit",
      "commit.amendHint": "The last commit is rewritten",
      "commit.stageAllHint": "Committing stages {count} file(s) first",
      "commit.stageAllSubmit": "Stage all and commit",
      "commit.recent": "Recent messages",
      "commit.draft": "Generate commit message",
      "notice.draftEmpty": "There is nothing to describe",
      "notice.draftUnconfigured": "No model is configured for drafts; set draftProvider and draftModel",
      "notice.draftFailed": "Could not generate a commit message",
      "commit.more": "More actions",
      "commit.checkout": "Check out this commit",
      "commit.branchFrom": "New branch from this commit",
      "commit.copySha": "Copy commit SHA",
      "dialog.detach": "Check out commit {short} on a detached head?",
      "dialog.branchFrom": "Name for the new branch starting at {short}:",
      "notice.copied": "Copied {short}",
      "notice.copyFailed": "Could not copy",
      "commit.push": "Commit and Push",
      "commit.pushTitle": "Commit, then push the current branch",
      "pane.commit": "Commit message",
      "pane.collapse": "Collapse",
      "pane.expand": "Expand",
      "pane.resize": "Drag to resize (Arrow keys nudge, Home resets)",
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
      "notice.commitPushed": "Committed and pushed",
      "notice.dirty": "The working tree has uncommitted changes, so the branch was not switched",
      "notice.exists": "A branch with that name already exists",
      "notice.invalidName": "That is not a valid branch name",
      "notice.stale": "The diff changed; refresh and try again",
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
      "dialog.confirm": "Confirm",
      "dialog.cancel": "Cancel",
      "dialog.ok": "OK",
      "dialog.abort.title": "Abort the operation?",
      "dialog.deleteBranch.title": "Delete this branch?",
      "dialog.forceDeleteBranch.title": "Force-delete this branch?",
      "dialog.merge.title": "Merge into this branch?",
      "dialog.detach.title": "Check out this commit?",
      "dialog.branchFrom.title": "New branch",
      "dialog.refused.title": "Git refused the request",
      "dialog.filesMany": "{first} and {count} files in all",
      "dialog.stash.popTitle": "Pop this stash entry?",
      "dialog.stash.popBody": "The changes return to the working tree and the entry is removed.",
      "dialog.stash.dropTitle": "Drop this stash entry?",
      "dialog.stash.dropBody": "The entry is removed and its changes never return to the working tree.",
      "dialog.pull.title": "Pull from the upstream?",
      "dialog.pull.body": "Brings {name} into the current branch, which can conflict or rewrite the working tree.",
      "dialog.push.title": "Push to the upstream?",
      "dialog.push.body": "Publishes this branch\u2019s commits to {name}, where other people will see them.",
      "dialog.previewCheckout.title": "Check the previewed branch out?",
      "dialog.previewCheckout.body": "The panel is previewing {preview}, and this action has to run on it; the checkout is {current}. Continuing checks {preview} out first.",
      "dialog.previewCheckout.confirm": "Check out and continue"
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
    return (args) => {
      const address = diffAddress(args.path, args.staged);
      const cached = readDiffCache(address);
      if (cached !== void 0) return Promise.resolve(cached);
      return remote.ready.then((api) => api.requestDiff(args)).then((payload) => {
        if (payload.kind !== "error") writeDiffCache(address, payload);
        return payload;
      });
    };
  }
  function commitReader(remote) {
    return (args) => {
      const address = commitDiffAddress(args.sha);
      const cached = readDiffCache(address);
      if (cached !== void 0) return Promise.resolve(cached);
      return remote.ready.then((api) => api.requestCommit(args)).then((payload) => {
        if (payload.kind !== "error") writeDiffCache(address, payload);
        return payload;
      });
    };
  }
  function sidesReader(remote) {
    return (args) => remote.ready.then((api) => api.requestSides(args)).catch((error) => ({ kind: "error", message: messageOf(error) }));
  }
  function commitFilesReader(remote) {
    return (args) => remote.ready.then((api) => api.requestCommitFiles(args)).catch((error) => ({ kind: "error", message: messageOf(error) }));
  }
  function commitSidesReader(remote) {
    return (args) => remote.ready.then((api) => api.requestCommitSides(args)).catch((error) => ({ kind: "error", message: messageOf(error) }));
  }
  function editorService(ctx) {
    let warned = false;
    const report = (reason) => {
      if (warned) return void 0;
      warned = true;
      console.warn("git-sidebar: %s; diffs stay textual", reason);
      return void 0;
    };
    return () => {
      let service;
      try {
        service = ctx.get("monacoEditor");
      } catch (error) {
        return report(`the monacoEditor service could not be read (${error instanceof Error ? error.message : String(error)})`);
      }
      if (service === void 0) return void 0;
      if (typeof service !== "object" || service === null) {
        return report("the monacoEditor service is not an object");
      }
      const candidate = service;
      if (typeof candidate.version !== "number" || typeof candidate.ready !== "object") {
        return report("the monacoEditor service does not match version 1");
      }
      return candidate;
    };
  }
  loader.load({
    id: SOURCE,
    factory(requireModule) {
      const React = requireModule("react");
      const zod = resolveZod(requireModule("zod"));
      const GuideIcon = GitGuideIcon(React);
      return {
        inject: ["remote", "slots", "locale", "sidebarRightTabs", "sidebarRight"],
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
          const panelCache = createPanelCache();
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
            tab: (props) => props.useTabInfo === void 0 ? void 0 : props.useTabInfo().tab,
            // One cache per activation: closing the panel tab unmounts its body,
            // and the next mount is what has to read this instead of the Host.
            cache: panelCache,
            clearDiffCache
          });
          ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
            name: "sidebar.right.pane.tab",
            key: PANEL_TAB_ID,
            locale: NS
          }, Panel)), "git-sidebar: panel body");
          const DiffBody = makeDiffBody(React, {
            requestDiff: diffReader(remote),
            requestCommit: commitReader(remote),
            requestSides: sidesReader(remote),
            requestCommitFiles: commitFilesReader(remote),
            requestCommitSides: commitSidesReader(remote),
            moveHunk: (args, direction) => remote.ready.then((api) => direction === "unstage" ? api.unstageHunk(args) : api.stageHunk(args)),
            discardHunk: (args) => remote.ready.then((api) => api.discardHunk(args)),
            editor: editorService(ctx),
            onThemeChange: (listener) => ctx.on("theme/change", () => {
              listener();
            }),
            t: ctx.locale.bind(DIFF_LOCALE_NS),
            stylesInstalled: true
          });
          ctx.effect(() => ctx.sidebarRightTabs.register(DIFF_TAB_DEFINITION), "git-sidebar: diff tab type");
          ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
            name: "sidebar.right.pane.tab",
            key: DIFF_TAB_ID,
            locale: DIFF_LOCALE_NS
          }, DiffBody)), "git-sidebar: diff body");
          const openPanel = () => {
            try {
              invalidateAll(panelCache);
              ctx.sidebarRight.openTab(PANEL_TAB_KIND);
              return true;
            } catch {
              return false;
            }
          };
          const toolDeps = { t, openPanel };
          const OpenRow = makeGitToolRow(React, toolDeps, "open");
          const ListRow = makeGitToolRow(React, toolDeps, "list");
          ctx.effect(() => ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
            name: "tool.call.toolview",
            key: GIT_TOOL_NAMES.open,
            locale: NS
          }, OpenRow)), "git-sidebar: open tool row");
          ctx.effect(() => ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
            name: "tool.call.toolview",
            key: GIT_TOOL_NAMES.list,
            locale: NS
          }, ListRow)), "git-sidebar: list tool row");
        }
      };
    }
  });
})();
