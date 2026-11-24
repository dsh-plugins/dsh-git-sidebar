window.__ModuleLoader__.load({
	id: "@dsh-plugin/dsh-git-sidebar",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _dsh_plugin_dsh_loader_client = require("@dsh-plugin/dsh-loader/client");
		// src/shared.ts
		/** Model-facing names of the tools this bundle registers. */
		const GIT_TOOL_NAMES = {
			/** List the checkouts the panel's scan finds. */
			list: "git_repositories",
			/** Select one checkout and present its panel. */
			open: "git_open_repository"
		};
		/** Namespace the Host service binds and the client mounts under. */
		const REMOTE_NAMESPACE = "gitSidebar";
		/** Package identity carried on every descriptor and on the client bundle. */
		const PACKAGE_NAME = "@dsh-plugin/dsh-git-sidebar";
		/** Tab id of the panel, also the key its body registers under. */
		const PANEL_TAB_ID = "@dsh-plugin/dsh-git-sidebar";
		/** Tab kind the Start page opens for the panel. */
		const PANEL_TAB_KIND = "git-panel";
		/** Tab id of the diff viewer, also the key its body registers under. */
		const DIFF_TAB_ID = "@dsh-plugin/dsh-git-sidebar/diff";
		/** Tab kind the panel opens for one file's diff. */
		const DIFF_TAB_KIND = "git-diff";
		/**
		* Address prefix identifying a diff tab's content.
		*
		* The Sidebar's resource controller accepts `dsh-resource://` addresses only,
		* so the diff address uses that scheme with this package's own type segment.
		* That keeps one tab per file and lets the tab chip name the file.
		*/
		const DIFF_ADDRESS_PREFIX = "dsh-resource://git-diff/";
		/**
		* Compose a diff tab address.
		* @param path - repository-relative path.
		* @param staged - which side of the index the diff describes.
		* @returns the address the tab system uses as content identity.
		*/
		function diffAddress(path, staged) {
			return `${DIFF_ADDRESS_PREFIX}${staged ? "staged" : "worktree"}/${encodeURIComponent(path)}`;
		}
		/**
		* Compose the address of one commit's diff tab.
		* @param sha - the commit's object name.
		* @returns the address the tab system uses as content identity.
		*/
		function commitDiffAddress(sha) {
			return `${DIFF_ADDRESS_PREFIX}commit/${encodeURIComponent(sha)}`;
		}
		/**
		* Read back the commit of a diff address.
		* @param address - an address produced by {@link commitDiffAddress}.
		* @returns the commit name, or undefined when the address names a file instead.
		*/
		function parseCommitDiffAddress(address) {
			const prefix = `${DIFF_ADDRESS_PREFIX}commit/`;
			if (!address.startsWith(prefix)) return void 0;
			const raw = address.slice(prefix.length);
			if (raw.length === 0) return void 0;
			try {
				return decodeURIComponent(raw);
			} catch {
				return;
			}
		}
		/**
		* Read back a diff tab address.
		* @param address - an address produced by {@link diffAddress}.
		* @returns the path and staging side, or undefined when the address is foreign.
		*/
		function parseDiffAddress(address) {
			if (!address.startsWith("dsh-resource://git-diff/")) return void 0;
			const rest = address.slice(24);
			const slash = rest.indexOf("/");
			if (slash < 0) return void 0;
			const side = rest.slice(0, slash);
			if (side !== "staged" && side !== "worktree") return void 0;
			try {
				return {
					path: decodeURIComponent(rest.slice(slash + 1)),
					staged: side === "staged"
				};
			} catch {
				return;
			}
		}
		// src/remote-descriptor.ts
		/**
		* Hand-authored Remote descriptors for the Git panel.
		*
		* A static client bundle cannot import the generated `/remote` artifact the
		* Typert pipeline would produce, so the method table is written here by hand in
		* the same shape the generated one has. The Host half marks its service methods
		* with the matching direct-invocation table, so a method renamed on one side
		* fails the `run/contract.mjs` check instead of failing at call time.
		*
		* Only the browser half uses this module; the Host imports `shared.ts` types
		* alone.
		*/
		/**
		* Build the contribution for this package.
		*
		* Every endpoint takes exactly one named-argument object. The result codec is
		* intentionally permissive: results are values the Host produced, and the
		* client re-validates the fields it reads.
		* @param zod - the shell's zod seed.
		* @returns the contribution to mount.
		*/
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
					descriptor("diff", () => ({
						sessionId: zod.string(),
						path: zod.string(),
						staged: zod.boolean()
					})),
					descriptor("fileSides", () => ({
						sessionId: zod.string(),
						path: zod.string(),
						staged: zod.boolean()
					})),
					descriptor("stage", () => ({
						sessionId: zod.string(),
						paths: strings()
					})),
					descriptor("unstage", () => ({
						sessionId: zod.string(),
						paths: strings()
					})),
					descriptor("discard", () => ({
						sessionId: zod.string(),
						paths: strings(),
						includeUntracked: zod.boolean()
					})),
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
					descriptor("commitDetail", () => ({
						sessionId: zod.string(),
						sha: zod.string()
					})),
					descriptor("commitFiles", () => ({
						sessionId: zod.string(),
						sha: zod.string()
					})),
					descriptor("commitSides", () => ({
						sessionId: zod.string(),
						sha: zod.string(),
						path: zod.string()
					})),
					descriptor("branches", () => ({ sessionId: zod.string() })),
					descriptor("checkout", () => ({
						sessionId: zod.string(),
						branch: zod.string()
					})),
					descriptor("createBranch", () => ({
						sessionId: zod.string(),
						name: zod.string(),
						from: zod.string().optional()
					})),
					descriptor("stashes", () => ({ sessionId: zod.string() })),
					descriptor("stash", () => ({
						sessionId: zod.string(),
						message: zod.string().optional()
					})),
					descriptor("stashApply", () => ({
						sessionId: zod.string(),
						index: zod.number(),
						drop: zod.boolean()
					})),
					descriptor("stashDrop", () => ({
						sessionId: zod.string(),
						index: zod.number()
					})),
					descriptor("sync", () => ({
						sessionId: zod.string(),
						action: zod.string()
					})),
					descriptor("conflict", () => ({
						sessionId: zod.string(),
						path: zod.string()
					})),
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
					descriptor("deleteBranch", () => ({
						sessionId: zod.string(),
						branch: zod.string(),
						force: zod.boolean()
					})),
					descriptor("mergeBranch", () => ({
						sessionId: zod.string(),
						branch: zod.string()
					})),
					descriptor("generateMessage", () => ({
						sessionId: zod.string(),
						staged: zod.boolean()
					})),
					descriptor("repositories", () => ({ sessionId: zod.string() })),
					descriptor("selectRepository", () => ({
						sessionId: zod.string(),
						root: zod.string().optional()
					}))
				]
			};
		}
		// src/client/api.ts
		/** A snapshot the panel can draw without inventing data. */
		function unavailableSnapshot(message, problem) {
			return {
				kind: "unavailable",
				problem,
				staged: [],
				unstaged: [],
				conflicts: [],
				identity: {
					name: null,
					email: null
				},
				...message === "" ? {} : { message }
			};
		}
		/**
		* Read a thrown value as one line worth showing.
		* @param error - what a promise rejected with, or an Error.
		* @returns its message, without the class name, or an empty string.
		*/
		function messageOf$2(error) {
			if (error instanceof Error) return error.message;
			return typeof error === "string" ? error : "";
		}
		/**
		* Pick the zod face the Remote descriptors need out of the loader's module.
		* @param module - `require('zod')`, a namespace or a namespace with a default.
		* @returns the codec factory, or undefined when the module is not zod.
		*/
		function resolveZod(module) {
			if (typeof module !== "object" || module === null) return void 0;
			const candidate = module;
			if (typeof candidate.object === "function") return module;
			const fallback = candidate.default;
			if (typeof fallback !== "object" || fallback === null) return void 0;
			if (typeof fallback.object !== "function") return void 0;
			return fallback;
		}
		/**
		* Mount the `gitSidebar` namespace and hand back its typed surface.
		*
		* `$mount` registers its own effect on the caller's context, so the namespace
		* leaves with the plugin and needs no disposer here. The rejection is retained
		* on the handle for the body to render, and a sink is attached so a panel that
		* never draws cannot turn a mount failure into an unhandled rejection.
		* @param ctx - the bundle's restricted context.
		* @param zod - the loader's zod.
		* @returns the handle whose `ready` resolves to the api.
		*/
		function mountGitRemote(ctx, zod) {
			const ready = mountNamespace(ctx, zod);
			ready.catch(() => void 0);
			return { ready };
		}
		async function mountNamespace(ctx, zod) {
			await ctx.remote.$mount(gitSidebarContribution(zod));
			const namespace = ctx.get(`remote.${REMOTE_NAMESPACE}`);
			if (typeof namespace !== "object" || namespace === null) throw new Error(`git-sidebar: the Remote namespace "${REMOTE_NAMESPACE}" did not mount`);
			return createApi(namespace);
		}
		/**
		* Wrap the mounted namespace in the folding surface the panel calls.
		* @param remote - the mounted method table.
		* @returns the api.
		*/
		function createApi(remote) {
			return {
				async status(sessionId) {
					try {
						const result = await remote.status({ sessionId });
						if (result.ok) return result.value;
						return unavailableSnapshot(result.error.message, "failed");
					} catch (error) {
						return unavailableSnapshot(messageOf$2(error), "failed");
					}
				},
				stage(sessionId, paths) {
					return foldWrite(() => remote.stage({
						sessionId,
						paths
					}));
				},
				unstage(sessionId, paths) {
					return foldWrite(() => remote.unstage({
						sessionId,
						paths
					}));
				},
				discard(sessionId, paths, includeUntracked) {
					return foldWrite(() => remote.discard({
						sessionId,
						paths,
						includeUntracked
					}));
				},
				async commit(sessionId, message, options) {
					try {
						const result = await remote.commit({
							sessionId,
							message,
							...options
						});
						if (result.ok) return result.value;
						return {
							ok: false,
							problem: "failed",
							message: result.error.message
						};
					} catch (error) {
						return {
							ok: false,
							problem: "failed",
							message: messageOf$2(error)
						};
					}
				},
				async requestDiff(args, signal) {
					try {
						const result = await remote.diff(args);
						if (result.ok) return result.value;
						return {
							kind: "error",
							message: result.error.message
						};
					} catch (error) {
						return {
							kind: "error",
							message: messageOf$2(error)
						};
					}
				},
				async requestSides(args, signal) {
					try {
						const result = await remote.fileSides(args);
						if (result.ok) return result.value;
						return {
							kind: "error",
							message: result.error.message
						};
					} catch (error) {
						return {
							kind: "error",
							message: messageOf$2(error)
						};
					}
				},
				async requestCommitFiles(args, signal) {
					try {
						const result = await remote.commitFiles(args);
						if (result.ok) return result.value;
						return {
							kind: "error",
							message: result.error.message
						};
					} catch (error) {
						return {
							kind: "error",
							message: messageOf$2(error)
						};
					}
				},
				async requestCommitSides(args, signal) {
					try {
						const result = await remote.commitSides(args);
						if (result.ok) return result.value;
						return {
							kind: "error",
							message: result.error.message
						};
					} catch (error) {
						return {
							kind: "error",
							message: messageOf$2(error)
						};
					}
				},
				discardHunk(args) {
					return foldWrite(() => remote.discardHunk(args));
				},
				async history(sessionId, limit, skip, branch) {
					try {
						const args = branch === void 0 ? {
							sessionId,
							limit,
							skip
						} : {
							sessionId,
							limit,
							skip,
							branch
						};
						const result = await remote.history(args);
						if (result.ok) return result.value;
						return {
							commits: [],
							hasMore: false,
							total: 0
						};
					} catch {
						return {
							commits: [],
							hasMore: false,
							total: 0
						};
					}
				},
				async requestCommit(args, signal) {
					try {
						const result = await remote.commitDetail(args);
						if (result.ok) return result.value;
						return {
							kind: "error",
							message: result.error.message
						};
					} catch (error) {
						return {
							kind: "error",
							message: messageOf$2(error)
						};
					}
				},
				async branches(sessionId) {
					try {
						const result = await remote.branches({ sessionId });
						if (result.ok) return result.value;
						return EMPTY_BRANCHES$1;
					} catch {
						return EMPTY_BRANCHES$1;
					}
				},
				checkout(sessionId, branch) {
					return foldWrite(() => remote.checkout({
						sessionId,
						branch
					}));
				},
				createBranch(sessionId, name, from) {
					return foldWrite(() => remote.createBranch({
						sessionId,
						name
					}));
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
					return foldWrite(() => remote.stash(message === void 0 ? { sessionId } : {
						sessionId,
						message
					}));
				},
				stashApply(sessionId, index, drop) {
					return foldWrite(() => remote.stashApply({
						sessionId,
						index,
						drop
					}));
				},
				stashDrop(sessionId, index) {
					return foldWrite(() => remote.stashDrop({
						sessionId,
						index
					}));
				},
				sync(sessionId, action) {
					return foldWrite(() => remote.sync({
						sessionId,
						action
					}));
				},
				async conflict(sessionId, path) {
					try {
						const result = await remote.conflict({
							sessionId,
							path
						});
						if (!result.ok) return {
							kind: "error",
							message: result.error.message
						};
						return result.value;
					} catch (error) {
						return {
							kind: "error",
							message: messageOf$2(error)
						};
					}
				},
				resolveConflict(sessionId, path, choices) {
					return foldWrite(() => remote.resolveConflict({
						sessionId,
						path,
						choices
					}));
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
					return foldWrite(() => remote.deleteBranch({
						sessionId,
						branch,
						force
					}));
				},
				mergeBranch(sessionId, branch) {
					return foldWrite(() => remote.mergeBranch({
						sessionId,
						branch
					}));
				},
				async generateMessage(sessionId, staged) {
					const result = await remote.generateMessage({
						sessionId,
						staged
					});
					if (result.ok) return result.value;
					return {
						ok: false,
						problem: "failed",
						message: result.error.message
					};
				},
				async repositories(sessionId) {
					try {
						const result = await remote.repositories({ sessionId });
						if (result.ok) return result.value;
						return {
							...EMPTY_REPOSITORIES,
							error: result.error.message
						};
					} catch (error) {
						return {
							...EMPTY_REPOSITORIES,
							error: messageOf$2(error)
						};
					}
				},
				async selectRepository(sessionId, root) {
					try {
						const result = await remote.selectRepository(root === void 0 ? { sessionId } : {
							sessionId,
							root
						});
						if (result.ok) return result.value;
						return {
							ok: false,
							problem: "failed",
							message: result.error.message
						};
					} catch (error) {
						return {
							ok: false,
							problem: "failed",
							message: messageOf$2(error)
						};
					}
				}
			};
		}
		/** What the repository picker shows when the scan could not run at all. */
		const EMPTY_REPOSITORIES = {
			scanRoot: "",
			depth: 0,
			selected: null,
			entries: [],
			truncated: false,
			warnings: []
		};
		/** What the branch picker shows when the listing could not be read at all. */
		const EMPTY_BRANCHES$1 = {
			current: null,
			local: [],
			remote: []
		};
		async function foldWrite(call) {
			try {
				const result = await call();
				if (result.ok) return result.value;
				return {
					ok: false,
					problem: "failed",
					message: result.error.message
				};
			} catch (error) {
				return {
					ok: false,
					problem: "failed",
					message: messageOf$2(error)
				};
			}
		}
		// src/client/diff-cache.ts
		/** Most payloads the cache keeps before dropping the least recently used. */
		const LIMIT = 50;
		/** One address's payload, oldest first in insertion order. */
		const entries = /* @__PURE__ */ new Map();
		/**
		* Read one cached payload, marking it as the most recently used.
		* @param address - the tab address.
		* @returns the payload, or undefined when nothing is cached for that address.
		*/
		function readDiffCache(address) {
			const payload = entries.get(address);
			if (payload === void 0) return void 0;
			entries.delete(address);
			entries.set(address, payload);
			return payload;
		}
		/**
		* Store one payload, dropping the least recently used when the cache is full.
		* @param address - the tab address.
		* @param payload - what the Host answered.
		*/
		function writeDiffCache(address, payload) {
			entries.delete(address);
			entries.set(address, payload);
			while (entries.size > LIMIT) {
				const oldest = entries.keys().next();
				if (oldest.done === true) return;
				entries.delete(oldest.value);
			}
		}
		/**
		* Forget every payload.
		*
		* A write and a refresh both call this: each is the reader saying the
		* repository moved, and a stored patch is a statement about a tree that no
		* longer exists.
		*/
		function clearDiffCache() {
			entries.clear();
		}
		// src/client/diff-parse.ts
		/** The `@@ -a,b +c,d @@` prefix; a range without `,n` means one line. */
		const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
		/**
		* The ranges of a hunk header.
		* @param header - the `@@` line as Git wrote it.
		* @returns both ranges, or undefined when the line is not a hunk header.
		*/
		function parseHunkHeader(header) {
			const match = HUNK_HEADER.exec(header);
			if (match === null) return void 0;
			const oldStart = Number(match[1]);
			const oldLines = match[2] === void 0 ? 1 : Number(match[2]);
			const newStart = Number(match[3]);
			const newLines = match[4] === void 0 ? 1 : Number(match[4]);
			if (![
				oldStart,
				oldLines,
				newStart,
				newLines
			].every(Number.isFinite)) return void 0;
			return {
				oldStart,
				oldLines,
				newStart,
				newLines
			};
		}
		/**
		* Number every line of the given hunks, header rows included.
		*
		* A block whose header cannot be read still draws, without line numbers, so a
		* malformed payload never blanks the viewer.
		* @param hunks - hunks as the Host parsed them.
		* @returns rows in patch order.
		*/
		function toRows(hunks) {
			const rows = [];
			let current;
			for (const hunk of hunks) {
				if (hunk.path !== void 0 && hunk.path !== current) {
					current = hunk.path;
					rows.push({
						kind: "file",
						text: hunk.path
					});
				}
				rows.push({
					kind: "hunk-header",
					text: drawn(hunk.header)
				});
				const section = hunk.section?.trim() ?? "";
				if (section !== "") rows.push({
					kind: "meta",
					text: section
				});
				const range = parseHunkHeader(hunk.header);
				let oldNo = range?.oldStart;
				let newNo = range?.newStart;
				for (const line of hunk.lines) {
					const text = drawn(line.text);
					if (line.kind === "added") {
						rows.push({
							kind: "added",
							text,
							newNo
						});
						if (newNo !== void 0) newNo += 1;
						continue;
					}
					if (line.kind === "removed") {
						rows.push({
							kind: "removed",
							text,
							oldNo
						});
						if (oldNo !== void 0) oldNo += 1;
						continue;
					}
					rows.push({
						kind: "context",
						text,
						oldNo,
						newNo
					});
					if (oldNo !== void 0) oldNo += 1;
					if (newNo !== void 0) newNo += 1;
				}
			}
			return rows;
		}
		/** The last path segment of a repository-relative path. */
		function basenameOf(path) {
			const name = path.slice(path.lastIndexOf("/") + 1);
			return name === "" ? path : name;
		}
		/** A line without the carriage return of a CRLF ending. */
		function drawn(text) {
			return text.endsWith("\r") ? text.slice(0, -1) : text;
		}
		// src/client/icons.ts
		/** Material Symbols grid the paths below are authored on. */
		const VIEW_BOX = "0 -960 960 960";
		/**
		* The panel's glyphs, keyed by what they mean rather than by their Material
		* name: refresh, stage (add), unstage (undo), discard (delete), diff, and the
		* marks the P1 surfaces added — more, chevron, expand, check, stash, apply,
		* pop, sync, pull, and push.
		*/
		const ICONS = {
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
		/**
		* Draw one glyph in the current text colour.
		*
		* 20px is the panel's default action size; `currentColor` lets the button's own
		* ink decide, which is how a destructive action turns red on hover.
		* @param React - the loader's React.
		* @param name - which glyph to draw.
		* @param props - optional size override and accessible name.
		* @returns the SVG element.
		*/
		function Icon(React, name, props = {}) {
			const labelled = props.label !== void 0;
			return React.createElement("svg", {
				viewBox: VIEW_BOX,
				width: props.size ?? 20,
				height: props.size ?? 20,
				fill: "currentColor",
				focusable: false,
				...labelled ? {
					role: "img",
					"aria-label": props.label
				} : { "aria-hidden": true }
			}, React.createElement("path", { d: ICONS[name] }));
		}
		/**
		* One gradient of the Start-page mark, on the mark's own 36-unit coordinates.
		* @param React - the loader's React.
		* @param id - gradient id, referenced by the shape that paints with it.
		* @param from - top or left stop colour.
		* @param to - bottom or right stop colour.
		* @param axis - start and end points of the ramp.
		* @returns the `linearGradient` element.
		*/
		function markGradient(React, id, from, to, axis) {
			const [x1, y1, x2, y2] = axis;
			return React.createElement("linearGradient", {
				id,
				x1,
				y1,
				x2,
				y2,
				gradientUnits: "userSpaceOnUse"
			}, React.createElement("stop", { stopColor: from }), React.createElement("stop", {
				offset: 1,
				stopColor: to
			}));
		}
		/**
		* Draw the plugin's Start-page mark: a two-line Git fork with commit nodes.
		*
		* Geometry and colours match `icon.svg`, which Plugin Manager shows in its own
		* rows, so the Start-page button and the plugin inventory draw the same mark.
		* The main line's two commits sit on the light-to-deep brand blue, and the
		* branch that merges into it carries the teal accent. The ink spans roughly
		* 18×24 of the 36-unit box; at the Start page's 26px it lands near the optical
		* size of the neighbouring folder and terminal glyphs.
		* @param React - the loader's React.
		* @returns the Start-page icon component.
		*/
		function GitGuideIcon(React) {
			return function GitGuideArtwork(props) {
				const size = props.size ?? 26;
				const unique = React.useId?.().replaceAll(":", "");
				const uid = unique === void 0 ? "git-sidebar-guide" : `git-sidebar-guide-${unique}`;
				const ink = `url(#${uid}-ink)`;
				return React.createElement("svg", {
					viewBox: "0 0 36 36",
					width: size,
					height: size,
					className: props.className,
					fill: "none",
					"aria-hidden": true,
					style: { display: "block" }
				}, React.createElement("path", {
					d: "M13 10V26",
					stroke: ink,
					strokeWidth: 3.4,
					strokeLinecap: "round"
				}), React.createElement("path", {
					d: "M23 10V14.6C23 17.5 20.9 19.8 17.8 19.8H14.7",
					stroke: `url(#${uid}-branch)`,
					strokeWidth: 3.4,
					strokeLinecap: "round",
					strokeLinejoin: "round"
				}), React.createElement("circle", {
					cx: 13,
					cy: 10,
					r: 3.8,
					fill: ink
				}), React.createElement("circle", {
					cx: 23,
					cy: 10,
					r: 3.8,
					fill: `url(#${uid}-side)`
				}), React.createElement("circle", {
					cx: 13,
					cy: 26,
					r: 3.8,
					fill: ink
				}), React.createElement("defs", null, markGradient(React, `${uid}-ink`, "#69B9FF", "#324DE2", [
					13,
					6.2,
					13,
					29.8
				]), markGradient(React, `${uid}-branch`, "#51CFDB", "#497BEE", [
					23,
					10,
					14.7,
					19.8
				]), markGradient(React, `${uid}-side`, "#51CFDB", "#108792", [
					19.8,
					6.2,
					26.2,
					13.8
				])));
			};
		}
		// src/client/language-match.ts
		/**
		* Pick the language one path belongs to.
		* @param languages - the declarations to match, oldest first.
		* @param path - the file path, with either separator.
		* @returns the language id, or undefined when no declaration claims the file.
		*/
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
					if (best === void 0 || suffix.length > best.length) best = {
						id: declared.id,
						length: suffix.length
					};
				}
			}
			if (best !== void 0) return best.id;
			for (let index = languages.length - 1; index >= 0; index -= 1) for (const pattern of languages[index]?.filenamePatterns ?? []) if (matches(pattern, normalized.slice(normalized.lastIndexOf("/") + 1))) return languages[index]?.id;
		}
		/**
		* Test one filename pattern, reporting a malformed one instead of failing the read.
		*
		* Matching ignores case: a naming convention such as `CMakeLists.txt` is the
		* same file however the path was spelled, and a pattern that spelled it out in
		* capitals would otherwise only match one spelling of it.
		* @param pattern - the regular expression source a language declared.
		* @param name - the basename to test, as the path spelled it.
		* @returns whether the pattern matches.
		*/
		function matches(pattern, name) {
			try {
				return new RegExp(pattern, "iu").test(name);
			} catch (error) {
				console.warn("git-sidebar: a language declared an unreadable filenamePattern \"%s\": %s", pattern, error instanceof Error ? error.message : String(error));
				return false;
			}
		}
		// src/client/diff-monaco.ts
		/** Narrower than this, two panes would leave too little text on each side. */
		const SIDE_BY_SIDE_MIN_WIDTH = 640;
		/** Glyph size inside one action button. */
		const ACTION_ICON = 13;
		/** Line height assumed before the panes have one to measure. */
		const LINE_HEIGHT_FALLBACK = 20;
		/** Fallback code font when the appearance variables are not on the page. */
		const FONT_FALLBACK = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
		/** Appearance variables the editor follows. */
		const CODE_FAMILY = "--ds-font-family-code";
		/** Platform font stack, used when the code font variable is not declared. */
		const CODE_FAMILY_FALLBACK = "--dsw-font-family";
		/** Code font size taken from the appearance settings. */
		const CODE_SIZE = "--dsh-code-font-size";
		/** SVG namespace every inline glyph is built in. */
		const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
		/** Keeps two models of the same path from sharing one URI. */
		let modelStamp = 0;
		/**
		* Read the code font DSH's appearance settings produce.
		*
		* The declared value is usually another variable or a composed stack, and
		* Monaco wants a resolved font list, so the value is handed to a temporary
		* element and read back from the browser's own computed style.
		* @returns the font family list and, when it resolves, the size in pixels.
		*/
		function readCodeFont() {
			const family = resolvedFamily(CODE_FAMILY) ?? resolvedFamily(CODE_FAMILY_FALLBACK) ?? FONT_FALLBACK;
			const host = document.body ?? document.documentElement;
			const raw = host === null ? "" : getComputedStyle(host).getPropertyValue(CODE_SIZE).trim();
			const size = raw === "" ? NaN : Number.parseFloat(raw);
			return Number.isFinite(size) && size > 0 ? {
				family,
				size
			} : { family };
		}
		/**
		* Resolve one CSS variable to the font list the browser computed for it.
		* @param variable - the variable name, leading `--` included.
		* @returns the resolved list, or undefined when the page does not declare it.
		*/
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
		/**
		* Pick the language a path belongs to.
		* @param api - the Monaco namespace, which carries the declared languages.
		* @param path - repository-relative path.
		* @returns the language id, or `plaintext` when nothing claims the file.
		*/
		function languageIdFor(api, path) {
			return languageForPath(api.languages.getLanguages(), path) ?? "plaintext";
		}
		/**
		* Compose a document identity no other editor shares.
		* @param api - the Monaco namespace.
		* @param path - the file the document describes.
		* @param side - which side of the change it is.
		* @returns the URI to create the model with.
		*/
		function modelUri(api, path, side) {
			modelStamp += 1;
			const name = path.replaceAll("\\", "/").split("/").pop() ?? "file";
			return api.Uri.parse(`inmemory://git-diff/${side}/${modelStamp}/${encodeURIComponent(name)}`);
		}
		/**
		* Build the editor options one mount needs.
		* @param mode - how the two panes are laid out.
		* @param font - the resolved code font.
		* @param label - the accessible name of the editor.
		* @returns the options to construct the editor with.
		*/
		function constructionOptions(mode, font, label) {
			return {
				readOnly: true,
				originalEditable: false,
				renderSideBySide: mode === "side",
				useInlineViewWhenSpaceIsLimited: false,
				renderOverviewRuler: false,
				renderMarginRevertIcon: false,
				renderIndicators: true,
				glyphMargin: true,
				scrollBeyondLastLine: false,
				diffWordWrap: "off",
				automaticLayout: false,
				fontFamily: font.family,
				...font.size === void 0 ? {} : { fontSize: font.size },
				ariaLabel: label
			};
		}
		/**
		* Split the hunks the Host rendered into the blocks the actions act on.
		*
		* Git puts every change within three lines of context into one hunk, so one
		* hunk can hold several separate changes. Those blocks are the unit VS Code's
		* own change actions work on, and splitting here keeps a reader's click on one
		* block from moving its neighbour.
		* @param hunks - the patch's hunks, in order.
		* @returns one anchor per changed block, in patch order.
		*/
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
							blocks.push({
								hunk,
								region,
								...block
							});
							block = void 0;
						}
						line += 1;
						continue;
					}
					if (block === void 0) {
						region += 1;
						block = {
							line,
							added: 0,
							removed: 0
						};
					}
					if (inner.kind === "added") {
						block.added += 1;
						line += 1;
					} else block.removed += 1;
				}
				if (block !== void 0) blocks.push({
					hunk,
					region,
					...block
				});
			}
			return blocks;
		}
		/**
		* Create the live editor and its widget layer.
		* @param api - the Monaco namespace.
		* @param host - the element the editor fills.
		* @param path - the file being compared.
		* @param texts - the two documents.
		* @param prefix - the class prefix of the diff viewer.
		* @param mode - the layout to start in.
		* @param font - the resolved code font.
		* @param label - the accessible name of the editor.
		* @returns the engine the component drives.
		*/
		function createEngine(api, host, path, texts, prefix, mode, font, label) {
			const language = languageIdFor(api, path);
			const editor = api.editor.createDiffEditor(host, constructionOptions(mode, font, label));
			const original = api.editor.createModel(texts.oldText, language, modelUri(api, path, "old"));
			const modifiedModel = api.editor.createModel(texts.newText, language, modelUri(api, path, "new"));
			editor.setModel({
				original,
				modified: modifiedModel
			});
			const modifiedEditor = editor.getModifiedEditor();
			const layer = document.createElement("div");
			layer.className = `${prefix}-monaco-actions`;
			host.appendChild(layer);
			const tags = /* @__PURE__ */ new Map();
			let current;
			let layout = mode;
			let codeFont = font;
			/** The model's last line, which is where the gutter's arithmetic stops. */
			const lastLine = () => modifiedEditor.getModel()?.getLineCount() ?? 1;
			/** Drop every widget of the previous placement. */
			const clearWidgets = () => {
				for (const node of tags.values()) node.remove();
				tags.clear();
			};
			/**
			* The line height the panes are laid out with.
			*
			* View zones make two arbitrary line tops differ by more than one line, so the
			* smallest gap over the first lines is the one every other gap is built on.
			* @returns the measured line height, or the editor default when nothing could be measured.
			*/
			const measureLineHeight = () => {
				const last = lastLine();
				let smallest = Number.POSITIVE_INFINITY;
				for (let line = 1; line < Math.min(last, 20); line += 1) {
					const gap = modifiedEditor.getTopForLineNumber(line + 1) - modifiedEditor.getTopForLineNumber(line);
					if (gap > 0 && gap < smallest) smallest = gap;
				}
				return Number.isFinite(smallest) ? smallest : LINE_HEIGHT_FALLBACK;
			};
			/**
			* Place one tagged block per changed run in the gutter column.
			*
			* The column is where VS Code puts a change's actions: left of the line
			* numbers. Side by side that is the modified pane's gutter, which is the seam
			* between the two panes; inline, the modified pane sits after the collapsed
			* original one, so the tag moves to the host's left edge and the original
			* pane's numbers line up behind it. Each block draws the rule that shows how
			* tall it is, with its actions centred on that rule.
			* @param config - the hunks and the actions they carry.
			*/
			const placeGutter = (config) => {
				const hostRect = host.getBoundingClientRect();
				const left = (layout === "side" ? modifiedEditor : editor.getOriginalEditor()).getDomNode().getBoundingClientRect().left - hostRect.left;
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
			/**
			* What a widget set is drawn from, besides the callbacks that build it.
			*
			* A re-render hands over fresh closures every time, but the widgets only have
			* to be rebuilt when what they show changes; comparing this keeps a plain
			* re-render from tearing the stacks down.
			* @param config - the configuration a placement pass uses.
			* @returns a string that changes exactly when the drawn widgets must.
			*/
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
					editor.layout({
						width,
						height
					});
					if (current !== void 0) placeGutter(current);
				},
				update(config) {
					current = config;
					if (config.mode !== layout) {
						layout = config.mode;
						editor.updateOptions({ renderSideBySide: layout === "side" });
						editor.layout({
							width: host.clientWidth,
							height: host.clientHeight
						});
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
					editor.updateOptions({
						fontFamily: codeFont.family,
						...codeFont.size === void 0 ? {} : { fontSize: codeFont.size }
					});
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
		/**
		* Build the tag of one changed block: its height rule and its actions.
		*
		* The rule spans the block, so a reader can see which lines one action covers,
		* and the buttons sit centred on it — the arrangement VS Code draws in the same
		* column.
		* @param prefix - the class prefix of the diff viewer.
		* @param config - the actions and their copy.
		* @param block - the block the tag belongs to.
		* @returns the element to position in the gutter.
		*/
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
			for (const button of actionsOf(prefix, config, block)) stack.appendChild(button);
			node.appendChild(stack);
			return node;
		}
		/**
		* Build the buttons one block offers on this side of the index.
		* @param prefix - the class prefix of the diff viewer.
		* @param config - the actions and their copy.
		* @param block - the block the buttons act on.
		* @returns the buttons in stack order; empty for a commit.
		*/
		function actionsOf(prefix, config, block) {
			if (config.side === "commit") return [];
			if (config.side === "staged") return [actionButton$1(prefix, config, block, "unstage", config.t("hunk.unstage"))];
			const buttons = [actionButton$1(prefix, config, block, "stage", config.t("hunk.stage"))];
			if (config.discard !== void 0) buttons.unshift(actionButton$1(prefix, config, block, "discard", config.t("hunk.discard")));
			return buttons;
		}
		/**
		* Build one action button.
		*
		* The explanation is the button's `title`: the platform draws tooltips itself,
		* and a second bubble drawn by this stylesheet would stack on top of it.
		* @param prefix - the class prefix of the diff viewer.
		* @param config - the actions and their copy.
		* @param block - the block the button acts on.
		* @param action - which action it performs.
		* @param label - its accessible name and tooltip.
		* @returns the button element.
		*/
		function actionButton$1(prefix, config, block, action, label) {
			const button = document.createElement("button");
			button.type = "button";
			button.className = `${prefix}-monaco-action`;
			button.dataset.gitHunkAction = action;
			button.dataset.gitHunk = String(block.hunk);
			button.dataset.gitRegion = String(block.region);
			button.disabled = config.busy;
			button.title = label;
			button.setAttribute("aria-label", label);
			button.appendChild(glyph(action === "discard" ? "undo" : action));
			button.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				if (action === "discard") config.discard?.(block.hunk, block.region);
				else config.move(block.hunk, block.region, action);
			});
			return button;
		}
		/**
		* Build one inline glyph.
		* @param name - which glyph to draw.
		* @returns the SVG element.
		*/
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
		/**
		* Resolve the editor namespace once per mount.
		*
		* The namespace lives behind dsh-monaco's ready promise, so the first render of
		* a tab has none. A tab draws the patch until the promise settles; a failure is
		* a real state rather than an endless wait, because a broken editor must not
		* hold a diff hostage.
		* @param R - the loader's React hooks.
		* @param resolve - the namespace loader; pass the same reference every render.
		* @returns the current state of the namespace.
		*/
		function useMonacoApiState(R, resolve) {
			const [state, setState] = R.useState({ status: "loading" });
			R.useEffect(() => {
				let live = true;
				resolve().then((api) => {
					if (!live) return;
					setState(api === void 0 ? { status: "failed" } : {
						status: "ready",
						api
					});
				}, (error) => {
					console.warn("git-sidebar: the diff editor namespace failed to resolve (%s); diffs stay textual", error instanceof Error ? error.message : String(error));
					if (live) setState({ status: "failed" });
				});
				return () => {
					live = false;
				};
			}, [resolve]);
			return state;
		}
		/**
		* Describe one placement pass from the props on screen.
		* @param props - the documents and the actions they carry.
		* @param mode - how the panes are laid out right now.
		* @returns the configuration the engine places widgets from.
		*/
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
		/**
		* Build the component that holds one Monaco diff editor.
		* @param React - the loader's React.
		* @param prefix - the class prefix of the diff viewer.
		* @returns a component taking the documents and the hunk actions.
		*/
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
						engine = createEngine(props.api, host, props.path, props, prefix, mode, readCodeFont(), props.t("editor.label"));
					} catch (error) {
						console.warn("git-sidebar: the Monaco diff editor could not be created (%s)", error instanceof Error ? error.message : String(error));
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
				}, [
					props.api,
					props.path,
					props.oldText,
					props.newText
				]);
				R.useEffect(() => {
					const config = widgetConfig(props, mode);
					configRef.current = config;
					engineRef.current?.update(config);
				}, [
					mode,
					props.hunks,
					props.side,
					props.busy,
					props.t,
					props.move,
					props.discard
				]);
				R.useEffect(() => {
					if (props.onThemeChange === void 0) return;
					return props.onThemeChange(() => {
						engineRef.current?.updateFont(readCodeFont());
					});
				}, [props.onThemeChange]);
				if (broken) return R.createElement("div", {
					className: `${prefix}-note`,
					role: "status"
				}, R.createElement("p", { className: `${prefix}-line-note` }, props.t("editor.unavailable")));
				return R.createElement("div", {
					className: `${prefix}-monaco`,
					ref: hostRef
				});
			};
		}
		// src/client/diff-commit.ts
		/** Class prefix shared with the diff viewer. */
		const PREFIX$1 = "dsh-gsd";
		/** The status letter the picker prefixes a path with. */
		const STATUS_LETTERS = {
			added: "A",
			modified: "M",
			deleted: "D",
			renamed: "R",
			untracked: "?",
			conflicted: "U"
		};
		/**
		* Build the commit body the diff tab draws when the editor is available.
		* @param React - the loader's React.
		* @param runtime - the readers, the Monaco view, and copy.
		* @returns a component taking the commit identity.
		*/
		function makeCommitDiffBody(React, runtime) {
			const R = React;
			/** One commit: its file list, the chosen file, and that file's two sides. */
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
					runtime.requestFiles({
						sessionId,
						sha: props.sha
					}, props.signal).then((payload) => {
						if (!live) return;
						if (payload.kind === "error") setFiles({
							status: "failed",
							message: payload.message
						});
						else setFiles({
							status: "files",
							files: payload.files,
							merge: payload.merge === true
						});
					}, (error) => {
						if (live) setFiles({
							status: "failed",
							message: messageOf$1(error)
						});
					});
					return () => {
						live = false;
					};
				}, [
					sessionId,
					props.sha,
					props.revision,
					props.signal
				]);
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
					runtime.requestSides({
						sessionId,
						sha: props.sha,
						path: entry.path
					}, props.signal).then((payload) => {
						if (live) setSides({
							status: "ready",
							sides: payload
						});
					}, (error) => {
						if (live) setSides({
							status: "failed",
							message: messageOf$1(error)
						});
					});
					return () => {
						live = false;
					};
				}, [
					sessionId,
					props.sha,
					props.revision,
					props.signal,
					entry?.path,
					entry?.binary
				]);
				return R.createElement("div", {
					className: PREFIX$1,
					"data-git-diff": props.sha,
					"data-git-diff-commit": props.sha
				}, head$1(R, t, props.sha, entry), files.status === "files" && files.merge ? R.createElement("p", {
					className: `${PREFIX$1}-truncated`,
					role: "status"
				}, t("commit.merge")) : null, picker$1(R, t, listed, selected, (path) => {
					setSelected(path);
				}), body(R, t, {
					files,
					entry,
					sides,
					path: selected ?? props.sha,
					runtime,
					api
				}));
			};
		}
		/** The pane's head: the commit, and the selected file's line counts. */
		function head$1(React, t, sha, entry) {
			return React.createElement("div", { className: `${PREFIX$1}-head` }, React.createElement("span", {
				className: `${PREFIX$1}-path`,
				title: sha
			}, sha), React.createElement("span", { className: `${PREFIX$1}-side` }, t("commit")), entry === void 0 ? null : React.createElement("span", { className: `${PREFIX$1}-counts` }, React.createElement("span", { className: `${PREFIX$1}-tally ${PREFIX$1}-up` }, `+${entry.added}`), React.createElement("span", { className: `${PREFIX$1}-tally ${PREFIX$1}-down` }, `-${entry.removed}`)));
		}
		/** The file picker: one row above the editor, naming every file the commit changes. */
		function picker$1(React, t, files, selected, choose) {
			if (files === void 0) return null;
			if (files.length <= 1) return React.createElement("div", { className: `${PREFIX$1}-files` }, React.createElement("span", { className: `${PREFIX$1}-files-label` }, t("commit.files"), ` ${files.length}`));
			return React.createElement("div", { className: `${PREFIX$1}-files` }, React.createElement("label", { className: `${PREFIX$1}-files-label` }, t("commit.files")), React.createElement("select", {
				className: `${PREFIX$1}-files-select`,
				"data-git-diff-file-select": "",
				value: selected ?? "",
				onChange: (event) => {
					choose(event.target.value);
				}
			}, ...files.map((file) => React.createElement("option", {
				key: file.path,
				value: file.path
			}, `${STATUS_LETTERS[file.status] ?? "?"} ${file.path}`))));
		}
		/** The editor area: the selected file's two sides, or why they cannot be shown. */
		function body(React, t, state) {
			if (state.files.status === "loading") return skeleton$2(React);
			if (state.files.status === "failed") return note$1(React, t("commitFailed"), state.files.message);
			if (state.files.files.length === 0) return note$1(React, t("empty"));
			if (state.entry === void 0) return skeleton$2(React);
			if (state.entry.binary) return note$1(React, t("binary"), state.entry.path);
			if (state.sides.status === "loading") return skeleton$2(React);
			if (state.sides.status === "failed") return note$1(React, t("failed"), state.sides.message);
			const sides = state.sides.sides;
			if (sides.kind === "binary") return note$1(React, t("binary"), state.path);
			if (sides.kind === "too-large") return note$1(React, t("editor.tooLarge"), bytesOf(sides.bytes));
			if (sides.kind === "error") return note$1(React, t("failed"), sides.message);
			if (state.api.status === "failed") return note$1(React, t("editor.unavailable"));
			if (state.api.status === "loading") return skeleton$2(React);
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
		/** The placeholder shown while a read runs. */
		function skeleton$2(React) {
			return React.createElement("div", {
				className: `${PREFIX$1}-body`,
				"aria-busy": "true"
			}, ...[
				62,
				40,
				74,
				51,
				33,
				68,
				45
			].map((width, index) => React.createElement("div", {
				key: index,
				className: `${PREFIX$1}-skeleton`,
				style: { width: `${width}%` }
			})));
		}
		/** A line of explanation, with an optional detail under it. */
		function note$1(React, message, detail) {
			const repeat = detail === void 0 || detail === "" || detail === message;
			return React.createElement("div", {
				className: `${PREFIX$1}-note`,
				role: "status"
			}, React.createElement("p", { className: `${PREFIX$1}-line-note` }, message), repeat ? null : React.createElement("p", { className: `${PREFIX$1}-detail` }, detail ?? ""));
		}
		/**
		* Read one byte count as a size a person reads at a glance.
		* @param bytes - the measured size.
		* @returns a decimal size such as `2.1 MiB`.
		*/
		function bytesOf(bytes) {
			const units = [
				"B",
				"KiB",
				"MiB",
				"GiB"
			];
			let value = bytes;
			let unit = 0;
			while (value >= 1024 && unit < units.length - 1) {
				value /= 1024;
				unit += 1;
			}
			return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit] ?? "B"}`;
		}
		/**
		* Narrow a thrown value to one line worth showing.
		* @param error - what a promise rejected with.
		* @returns the message, or the value's own text.
		*/
		function messageOf$1(error) {
			if (error instanceof Error && error.message !== "") return error.message;
			return String(error);
		}
		// src/client/hunk-controls.ts
		/**
		* Render the buttons for one hunk header.
		* @param React - the loader's React.
		* @param controls - the side, the busy flag, copy, and the actions.
		* @param index - the hunk's position in the file's patch.
		* @param prefix - the diff viewer's class prefix.
		* @returns the buttons, or null when this side has none.
		*/
		function hunkButtons(React, controls, index, prefix) {
			if (controls === void 0 || controls.side === "commit") return null;
			const staging = controls.side === "worktree";
			return React.createElement("span", { className: `${prefix}-hunk-actions` }, button(React, prefix, controls, index, staging ? "stage" : "unstage", staging ? "hunk.stage" : "hunk.unstage"), staging && controls.discard !== void 0 ? button(React, prefix, controls, index, "discard", "hunk.discard") : null);
		}
		/**
		* One hunk action.
		* @param React - the loader's React.
		* @param prefix - the diff viewer's class prefix.
		* @param controls - the side, the busy flag, copy, and the actions.
		* @param index - the hunk's position in the file's patch.
		* @param action - which action this button performs.
		* @param label - the copy key naming it.
		* @returns the button element.
		*/
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
		/** Locale namespace the diff copy belongs to. */
		const DIFF_LOCALE_NS = "git-sidebar-diff";
		/** The chip text used where no address names a file or commit. */
		const DEFAULT_TITLE = "Diff";
		/** Copy of the diff surfaces, in the two shipped languages. */
		const DIFF_DICTS = {
			zh: {
				"title": "差异",
				"staged": "已暂存",
				"worktree": "工作区",
				"commit": "提交",
				"empty": "没有差异",
				"binary": "二进制文件",
				"truncated": "差异过大，已截断",
				"failed": "无法读取这个差异",
				"commitFailed": "无法读取这个提交的差异",
				"commitUnavailable": "这个提交的差异暂不可用",
				"unknownTarget": "这个差异标签页没有对应到文件或提交",
				"unavailable": "差异服务不可用",
				"commit.files": "文件",
				"commit.merge": "合并提交：逐文件比较的是第一父提交",
				"editor.label": "差异编辑器",
				"editor.tooLarge": "文件过大，差异编辑器显示不了，已退回补丁视图",
				"editor.unavailable": "差异编辑器不可用，已退回补丁视图",
				"hunk.stage": "暂存此块",
				"hunk.unstage": "取消暂存此块",
				"hunk.discard": "回滚此块（撤销工作区里的这部分改动）"
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
				"commitFailed": "Could not read this commit’s diff",
				"commitUnavailable": "This commit’s diff is unavailable",
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
		/** Characters of a commit name a chip shows. */
		const SHORT_SHA = 7;
		/** Class prefix of every element and rule this module owns. */
		const PREFIX = "dsh-gsd";
		/**
		* The diff tab's registry definition.
		*
		* A page type opened by kind declares no resource patterns, but this one claims
		* the package's own scheme: a diff then opens as a resource tab, which is what
		* gives it a per-file identity and a chip naming the file or commit. The Start
		* page offers no entry for it. Each open is its own content, so two files (or two
		* commits) never share one tab.
		*/
		const DIFF_TAB_DEFINITION = {
			id: DIFF_TAB_ID,
			kind: DIFF_TAB_KIND,
			multiple: true,
			patterns: [`${DIFF_ADDRESS_PREFIX}**`],
			title: (address) => {
				const target = address === void 0 ? void 0 : addressTarget(address);
				return target === void 0 ? DEFAULT_TITLE : labelOf$2(target);
			}
		};
		/**
		* Build the body the Sidebar registers under {@link DIFF_TAB_ID}.
		* @param React - the loader's React.
		* @param runtime - the Remote readers, copy, the editor service, and style status; injected props win over it.
		* @returns a component taking the slot framework's props.
		*/
		function makeDiffBody(React, runtime) {
			const R = React;
			const MonacoDiff = makeMonacoDiffView(React, PREFIX);
			const CommitBody = runtime?.requestCommitFiles === void 0 || runtime.requestCommitSides === void 0 ? void 0 : makeCommitDiffBody(React, {
				requestFiles: runtime.requestCommitFiles,
				requestSides: runtime.requestCommitSides,
				diffView: (props) => MonacoDiff(props),
				resolveApi,
				t: translator(runtime?.t),
				...runtime.onThemeChange === void 0 ? {} : { onThemeChange: runtime.onThemeChange }
			});
			/**
			* Resolve the editor namespace once, reporting why it is not there.
			*
			* Everything about the editor rendering hangs off this: without a namespace
			* the tab draws the patch, and a missing or failed service is one line in the
			* console rather than a broken tab.
			* @returns the Monaco namespace, or undefined when the editor cannot be used.
			*/
			async function resolveApi() {
				const service = runtime?.editor?.();
				if (service === void 0) return void 0;
				if (service.version !== 1) {
					console.warn("git-sidebar: the Monaco editor service is version %s, not 1; diffs stay textual", service.version);
					return;
				}
				try {
					await service.ready;
				} catch (error) {
					console.warn("git-sidebar: the Monaco editor failed to load (%s); diffs stay textual", messageOf(error));
					return;
				}
				const api = service.monaco;
				if (api === void 0) {
					console.warn("git-sidebar: the Monaco editor reported readiness without a namespace; diffs stay textual");
					return;
				}
				return api;
			}
			/** The pane: one request per target, cancelled when the tab navigates or leaves. */
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
					const sidesPending = wantsSides && requestSides !== void 0 && target.kind === "file" ? requestSides({
						sessionId,
						path: target.path,
						staged: target.staged
					}, controller.signal) : void 0;
					let pending;
					if (target.kind === "commit") {
						if (requestCommit === void 0) return;
						pending = requestCommit({
							sessionId,
							sha: target.sha
						}, controller.signal);
					} else {
						if (requestDiff === void 0) return;
						pending = requestDiff({
							sessionId,
							path: target.path,
							staged: target.staged
						}, controller.signal);
					}
					const outer = info?.tab.signal;
					let live = true;
					const stop = () => {
						live = false;
					};
					if (outer !== void 0) outer.addEventListener("abort", stop);
					setState({ status: "loading" });
					pending.then(async (payload) => {
						const sides = sidesPending === void 0 || payload.kind !== "text" || payload.hunks.length === 0 ? void 0 : await sidesPending;
						if (!live) return;
						setState({
							status: "ready",
							payload,
							...sides === void 0 ? {} : { sides }
						});
					}, (error) => {
						if (live) setState({
							status: "failed",
							message: messageOf(error)
						});
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
				/** A call that never reached a verdict: the reader still pressed a button. */
				const refused = (error) => {
					setMoving(null);
					setMoveNotice(messageOf(error));
				};
				const controls = (moveHunk !== void 0 || discardHunk !== void 0) && target?.kind === "file" && sessionId !== void 0 ? {
					side,
					busy: moving !== null,
					t,
					move: (hunk, region, direction) => {
						if (moveHunk === void 0 || target?.kind !== "file" || sessionId === void 0) return;
						setMoving(hunk);
						moveHunk({
							sessionId,
							path: target.path,
							hunk,
							...region === void 0 ? {} : { region }
						}, direction).then(settled, refused);
					},
					...discardHunk === void 0 ? {} : { discard: (hunk, region) => {
						if (target?.kind !== "file" || sessionId === void 0) return;
						setMoving(hunk);
						discardHunk({
							sessionId,
							path: target.path,
							hunk,
							...region === void 0 ? {} : { region }
						}).then(settled, refused);
					} }
				} : void 0;
				if (commitEditor && target?.kind === "commit") return R.createElement(CommitBody, {
					...sessionId === void 0 ? {} : { sessionId },
					sha: target.sha,
					revision,
					...info?.tab.signal === void 0 ? {} : { signal: info.tab.signal },
					t
				});
				const truncated = state.status === "ready" && state.payload.kind === "text" && state.payload.truncated === true;
				const fallback = state.status === "ready" ? fallbackNote(t, state.sides) : void 0;
				const failedEditor = editorFailed ? t("editor.unavailable") : void 0;
				return R.createElement("div", {
					className: PREFIX,
					...identityOf(target)
				}, runtime?.stylesInstalled === true ? null : styleElement(R), head(R, t, target, state), moveNotice === "" ? null : banner(R, moveNotice), truncated ? banner(R, t("truncated")) : null, failedEditor === void 0 ? null : banner(R, failedEditor), fallback === void 0 ? null : banner(R, fallback), content(R, {
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
				}));
			}
			/** Shown when the pane cannot be wired at all: a wiring fault, stated rather than hidden. */
			function DiffUnavailable(props) {
				const t = translator(props.t ?? runtime?.t);
				return R.createElement("div", { className: PREFIX }, runtime?.stylesInstalled === true ? null : styleElement(R), note(R, t("unavailable")));
			}
			return function DiffBody(props) {
				const typed = props ?? {};
				const reads = typed.requestDiff !== void 0 || typed.requestCommit !== void 0 || runtime?.requestDiff !== void 0 || runtime?.requestCommit !== void 0;
				const usable = typeof typed.useTabInfo === "function" && typeof typed.sessionId === "string" && reads;
				return R.createElement(usable ? DiffPanel : DiffUnavailable, typed);
			};
		}
		/** The pane's row: the target, which side it describes, and its line counts. */
		function head(React, t, target, state) {
			const counts = state.status === "ready" && state.payload.kind === "text" ? countOf(state.payload.hunks) : void 0;
			const named = target === void 0 ? "" : target.kind === "file" ? target.path : target.sha;
			const name = named === "" ? t("title") : named;
			return React.createElement("div", { className: `${PREFIX}-head` }, React.createElement("span", {
				className: `${PREFIX}-path`,
				title: name
			}, name), target === void 0 ? null : React.createElement("span", { className: `${PREFIX}-side` }, sideOf(t, target)), counts === void 0 ? null : React.createElement("span", { className: `${PREFIX}-counts` }, React.createElement("span", { className: `${PREFIX}-tally ${PREFIX}-up` }, `+${counts.added}`), React.createElement("span", { className: `${PREFIX}-tally ${PREFIX}-down` }, `-${counts.removed}`)));
		}
		/** The scrolling body: the diff editor, rows, a note, or the skeleton while the request runs. */
		function content(React, options) {
			const { target, state, t, missingReader } = options;
			if (target === void 0) return note(React, t("unknownTarget"));
			if (missingReader) return note(React, t(target.kind === "commit" ? "commitUnavailable" : "unavailable"));
			if (state.status === "loading") return skeleton$1(React);
			const failed = target.kind === "commit" ? t("commitFailed") : t("failed");
			if (state.status === "failed") return note(React, failed, state.message);
			const payload = state.payload;
			if (payload.kind === "error") return note(React, failed, payload.message);
			if (payload.kind === "binary") return note(React, t("binary"), target.kind === "file" ? target.path : target.sha);
			if (payload.hunks.length === 0) return note(React, t("empty"));
			const edited = montage(React, options, payload);
			if (edited !== void 0) return edited;
			return rows(React, payload.hunks, options.controls, options.revision);
		}
		/**
		* Draw the two whole documents in the Monaco diff editor when it can.
		* @param React - the loader's React.
		* @param options - the target, the state, and the editor namespace.
		* @param payload - the textual payload, whose hunks anchor the actions.
		* @returns the editor element, or undefined when the textual view has to draw.
		*/
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
		/**
		* Draw the patch as numbered rows, which is the whole rendering without an editor.
		* @param React - the loader's React.
		* @param hunks - the Host's hunks.
		* @param controls - the actions a hunk header carries, when the side has any.
		* @param revision - bumped after each block write, so the rows rebuild.
		* @returns the scrolling rows.
		*/
		function rows(React, hunks, controls, revision) {
			const drawn = toRows(hunks);
			let hunk = -1;
			return React.createElement("div", {
				className: `${PREFIX}-body`,
				"data-git-diff-revision": String(revision)
			}, React.createElement("div", { className: `${PREFIX}-rows` }, ...drawn.map((row, index) => {
				if (row.kind === "hunk-header") hunk += 1;
				return drawnRow(React, row, index, row.kind === "hunk-header" ? hunkButtons(React, controls, hunk, PREFIX) : null);
			})));
		}
		/** One drawn row: its two numbers, its sign, and its text. */
		function drawnRow(React, row, key, extra) {
			if (row.kind === "file") return React.createElement("div", {
				key,
				className: `${PREFIX}-file`,
				"data-git-diff-file": row.text,
				title: row.text
			}, row.text);
			if (row.kind === "hunk-header") return React.createElement("div", {
				key,
				className: `${PREFIX}-hunk`
			}, row.text, extra);
			if (row.kind === "meta") return React.createElement("div", {
				key,
				className: `${PREFIX}-meta`
			}, row.text);
			return React.createElement("div", {
				key,
				className: `${PREFIX}-row ${PREFIX}-${row.kind}`,
				"data-git-diff-row": row.kind
			}, React.createElement("span", { className: `${PREFIX}-no` }, row.oldNo ?? ""), React.createElement("span", { className: `${PREFIX}-no` }, row.newNo ?? ""), React.createElement("span", { className: `${PREFIX}-sign` }, signOf(row.kind)), React.createElement("span", { className: `${PREFIX}-text` }, row.text));
		}
		/** The sign column of a drawn row. */
		function signOf(kind) {
			if (kind === "added") return "+";
			if (kind === "removed") return "-";
			return " ";
		}
		/** A line of explanation, with an optional detail under it. */
		function note(React, message, detail) {
			const repeat = detail === void 0 || detail === "" || detail === message;
			return React.createElement("div", {
				className: `${PREFIX}-note`,
				role: "status"
			}, React.createElement("p", { className: `${PREFIX}-line-note` }, message), repeat ? null : React.createElement("p", { className: `${PREFIX}-detail` }, detail ?? ""));
		}
		/**
		* Say why the editor gave way to the patch view.
		* @param t - copy lookup.
		* @param sides - what the Host answered for the two documents, if it was asked.
		* @returns the sentence to show above the rows, or undefined when nothing gave way.
		*/
		function fallbackNote(t, sides) {
			if (sides === void 0 || sides.kind === "text") return void 0;
			if (sides.kind === "too-large") return `${t("editor.tooLarge")} (${bytesOf(sides.bytes)})`;
			const reason = sides.kind === "error" ? sides.message : "";
			return reason === "" ? t("editor.unavailable") : `${t("editor.unavailable")}: ${reason}`;
		}
		/** The bar above the rows when the Host cut the diff short, or a read refused. */
		function banner(React, text) {
			return React.createElement("p", {
				className: `${PREFIX}-truncated`,
				role: "status"
			}, text);
		}
		/** The placeholder shown while the request runs: bars at about the height the rows will take. */
		function skeleton$1(React) {
			return React.createElement("div", {
				className: `${PREFIX}-body`,
				"aria-busy": "true"
			}, ...[
				62,
				40,
				74,
				51,
				33,
				68,
				45
			].map((width, index) => React.createElement("div", {
				key: index,
				className: `${PREFIX}-skeleton`,
				style: { width: `${width}%` }
			})));
		}
		/** The body's stylesheet, rendered with the body when the entry did not inject it. */
		function styleElement(React) {
			return React.createElement("style", { "data-dsh-git-sidebar-diff": "" }, DIFF_STYLES);
		}
		/** Added and removed line counts of a diff. */
		function countOf(hunks) {
			let added = 0;
			let removed = 0;
			for (const hunk of hunks) for (const line of hunk.lines) if (line.kind === "added") added += 1;
			else if (line.kind === "removed") removed += 1;
			return {
				added,
				removed
			};
		}
		/**
		* Read the target a tab describes.
		*
		* A commit address wins over a file address, which wins over the navigation
		* parameters a page open carries; the order matters because a page open records
		* `sidebar://<kind>` and can therefore name only the parameters.
		* @param address - the tab's live address.
		* @param params - the navigation parameters the open carried.
		* @returns the target, or undefined when neither shape names one.
		*/
		function targetOf(address, params) {
			const fromAddress = addressTarget(address);
			if (fromAddress !== void 0) return fromAddress;
			if (typeof params !== "object" || params === null) return void 0;
			const record = params;
			const sha = shaOf(record.sha);
			if (sha !== void 0) return {
				kind: "commit",
				sha
			};
			if (typeof record.path !== "string" || record.path === "") return void 0;
			return {
				kind: "file",
				path: record.path,
				staged: record.staged === true
			};
		}
		/**
		* Read the target an address names.
		* @param address - a diff resource address.
		* @returns the target, or undefined when the address is foreign.
		*/
		function addressTarget(address) {
			const sha = parseCommitDiffAddress(address);
			if (sha !== void 0) return {
				kind: "commit",
				sha
			};
			const parsed = parseDiffAddress(address);
			if (parsed === void 0) return void 0;
			return {
				kind: "file",
				path: parsed.path,
				staged: parsed.staged
			};
		}
		/** A commit name worth reading, or undefined for anything else. */
		function shaOf(value) {
			return typeof value === "string" && value.trim() !== "" ? value.trim() : void 0;
		}
		/** The identity of a target, used to decide whether a read is still current. */
		function targetKey(target) {
			return target.kind === "commit" ? `commit:${target.sha}` : `file:${target.staged ? "staged" : "worktree"}:${target.path}`;
		}
		/**
		* The data attributes a diff is located by.
		*
		* `data-git-diff` stays the target's own name — a file's path, or a commit's
		* object name — which is the value the pane carried before commits existed; the
		* narrowing attribute beside it says which of the two it is.
		* @param target - what the pane shows, when it shows anything.
		* @returns the attribute map for the root element.
		*/
		function identityOf(target) {
			if (target === void 0) return { "data-git-diff": "" };
			if (target.kind === "commit") return {
				"data-git-diff": target.sha,
				"data-git-diff-commit": target.sha
			};
			return {
				"data-git-diff": target.path,
				"data-git-diff-file": target.path
			};
		}
		/** The chip and row text of a target: a file's basename, or a commit's short name. */
		function labelOf$2(target) {
			return target.kind === "commit" ? shortSha(target.sha) : basenameOf(target.path);
		}
		/** The first {@link SHORT_SHA} characters of a commit name. */
		function shortSha(sha) {
			return sha.slice(0, SHORT_SHA);
		}
		/** The pill beside the target: which side of the index a file diff reads, or that this is a commit. */
		function sideOf(t, target) {
			if (target.kind === "commit") return t("commit");
			return t(target.staged ? "staged" : "worktree");
		}
		/** Narrow a rejection to a line worth showing. */
		function messageOf(error) {
			if (error instanceof Error && error.message !== "") return error.message;
			return typeof error === "string" ? error : "";
		}
		/** Copy lookup: the entry's translator first, then this module's English fallback. */
		function translator(t) {
			return (key) => {
				if (t !== void 0) {
					const text = t(key);
					if (text !== key) return text;
				}
				return DIFF_DICTS.en?.[key] ?? key;
			};
		}
		/** The body's rules: only `--dsw-*` / `--dsh-*` tokens, monospace for the patch itself. */
		const DIFF_STYLES = `
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
.${PREFIX}-files {
  display: flex;
  flex: none;
  gap: 8px;
  align-items: center;
  box-sizing: border-box;
  padding: 4px 12px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l3);
}
.${PREFIX}-files-label {
  flex: none;
  color: var(--dsw-alias-label-secondary);
}
.${PREFIX}-files-select {
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
.${PREFIX}-monaco {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
.${PREFIX}-monaco-actions {
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
}
.${PREFIX}-monaco-block {
  position: absolute;
  top: 0;
  left: 0;
  width: 16px;
  pointer-events: none;
}
.${PREFIX}-monaco-rule {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 7px;
  width: 1px;
  background: var(--dsw-alias-border-l2);
}
.${PREFIX}-monaco-stack {
  position: absolute;
  top: 50%;
  left: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  transform: translateY(-50%);
  pointer-events: none;
}
.${PREFIX}-monaco-action {
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
.${PREFIX}-monaco-action:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}
.${PREFIX}-monaco-action:disabled {
  color: var(--dsw-alias-label-dimmed);
  cursor: default;
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
.${PREFIX}-file {
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
.${PREFIX}-hunk {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 2px 12px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-1);
  white-space: pre;
  font-family: var(--dsh-font-family-code, ui-monospace, monospace);
}
.${PREFIX}-hunk-actions {
  display: flex;
  flex: none;
  gap: 2px;
  margin-left: auto;
  font-family: var(--dsh-content-font-family, inherit);
}
.${PREFIX}-hunk-action {
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
.${PREFIX}-hunk-action svg {
  width: 16px;
  height: 16px;
}
.${PREFIX}-hunk-action:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}
.${PREFIX}-hunk-action:disabled {
  color: var(--dsw-alias-label-dimmed);
  cursor: default;
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
		// src/client/styles.ts
		/** The panel's stylesheet. */
		const PANEL_STYLES = `
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
		/**
		* The branches the operations menu offers to merge.
		*
		* The checked-out branch is left out: merging a branch into itself is a no-op
		* Git reports as "Already up to date", which would read as a broken control.
		* @param branches - the listing the picker loaded, when it has loaded.
		* @returns the local branch names worth offering.
		*/
		function mergeable(branches) {
			if (branches === void 0) return [];
			return branches.local.filter((name) => name !== branches.current);
		}
		/** Width a menu reserves when it is placed, used to keep it inside the window. */
		const MENU_W$2 = 340;
		/**
		* Where a menu hangs: under the control that opened it, and never past the
		* window's right edge.
		*
		* The header spans the whole panel, so anchoring to it — which is what a plain
		* `right: 6px` does — puts a dropdown from a left-hand control at the far right.
		* Measuring the control is what keeps the menu beside the thing it belongs to.
		* @param node - the button that opened the menu.
		* @returns the fixed position to draw at.
		*/
		function anchorUnder$1(node) {
			const box = node.getBoundingClientRect();
			const widest = window.innerWidth - MENU_W$2 - 8;
			return {
				top: box.bottom + 4,
				left: Math.max(8, Math.min(box.left, widest))
			};
		}
		/**
		* Build the branch header.
		* @param React - the loader's React.
		* @returns the component the panel draws above the change groups.
		*/
		function makeBranchHeader(React) {
			return function BranchHeader(props) {
				const { snapshot, loading, busy, t } = props;
				const [menu, setMenu] = React.useState("none");
				const [menuAt, setMenuAt] = React.useState(null);
				const [branches, setBranches] = React.useState(void 0);
				const [draft, setDraft] = React.useState("");
				React.useEffect(() => {
					if (menu === "none") return;
					let live = true;
					setBranches(void 0);
					props.listBranches().then((list) => {
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
				/**
				* Open a menu under the control that asked for it, or close the open one.
				* @param kind - which menu.
				* @param node - the button, measured to place the menu.
				*/
				const openMenu = (kind, node) => {
					if (menu === kind) {
						setMenu("none");
						return;
					}
					setMenuAt(anchorUnder$1(node));
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
				return React.createElement("div", { className: `gs-header-wrap` }, React.createElement("div", { className: `gs-header` }, snapshot === void 0 || !usable ? React.createElement("span", {
					className: `gs-branch`,
					"data-git-branch": "",
					"data-git-branch-button": "",
					"data-unusable": "",
					"aria-busy": "true"
				}, snapshot === void 0 ? loading ? "…" : "" : label) : React.createElement("button", {
					type: "button",
					className: `gs-branch gs-branch-btn`,
					"data-git-branch": "",
					"data-git-branch-button": "",
					"data-detached": detached ? "" : void 0,
					"data-git-preview": preview === null ? void 0 : "",
					"aria-haspopup": "menu",
					"aria-expanded": menu === "branch" ? "true" : "false",
					title: headerTitle(t, label, preview, checkedOut, root),
					onClick: (event) => {
						openMenu("branch", event.currentTarget);
					}
				}, React.createElement("span", { className: `gs-branch-name` }, label), preview === null ? null : React.createElement("span", {
					className: `gs-preview-badge`,
					"data-git-preview-badge": ""
				}, t("branch.previewBadge")), Icon(React, "chevron", { size: 14 })), upstreamSits(React, t, upstream), props.repo ?? null, React.createElement("button", {
					type: "button",
					className: `gs-tool`,
					"aria-label": t("more.actions"),
					title: t("more.actions"),
					"data-git-more": "",
					"aria-haspopup": "menu",
					"aria-expanded": menu === "more" ? "true" : "false",
					disabled: !usable || busy,
					onClick: (event) => {
						openMenu("more", event.currentTarget);
					}
				}, Icon(React, "more")), React.createElement("button", {
					type: "button",
					className: `gs-tool`,
					"aria-label": t("refresh"),
					title: t("refresh"),
					"data-git-refresh": "",
					"data-turning": loading ? "" : void 0,
					disabled: loading,
					onClick: props.refresh
				}, Icon(React, "refresh")), menu === "none" ? null : React.createElement("div", {
					className: `gs-backdrop`,
					"data-git-dismiss": "",
					onClick: close
				}), menu === "branch" ? picker(React, props, branches, draft, setDraft, create, pick, busy, close, menuAt) : null, menu === "more" ? operations(React, props, usable, busy, () => {
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
				}, menuAt) : null), preview === null ? null : previewBar(React, t, preview, checkedOut, props.exitPreview), operation === null ? null : operationBar(React, t, operation, busy, props.abort));
			};
		}
		/**
		* The tooltip of the branch button, which has up to three facts to state.
		*
		* A preview is the case that needs all three: the branch the panel describes,
		* the branch Git actually has checked out, and the checkout's path.
		* @param t - the panel's translator.
		* @param label - the name the button shows.
		* @param preview - the previewed branch, or null when the header describes HEAD.
		* @param checkedOut - the branch or commit HEAD names.
		* @param root - the checkout's top level, when it has one.
		* @returns the tooltip text.
		*/
		function headerTitle(t, label, preview, checkedOut, root) {
			const lines = [label];
			if (preview !== null) lines.push(t("branch.previewHint", { current: checkedOut ?? "" }));
			if (root !== void 0) lines.push(root);
			return lines.join("\n");
		}
		/**
		* The bar a preview shows under the header.
		*
		* The point of the bar is the contradiction a preview creates: the branch name
		* and the log describe another branch, while everything that writes — staging,
		* stashing, committing — still happens on the checkout. Saying so where the
		* reader is looking beats leaving it to a tooltip.
		* @param React - the loader's React.
		* @param t - the panel's translator.
		* @param preview - the branch being previewed.
		* @param checkedOut - the branch or commit HEAD names.
		* @param exit - the handler that goes back to describing the checkout.
		* @returns the bar.
		*/
		function previewBar(React, t, preview, checkedOut, exit) {
			return React.createElement("div", {
				className: `gs-preview-bar`,
				"data-git-preview-bar": preview,
				role: "status"
			}, React.createElement("span", {
				className: `gs-preview-text`,
				title: t("branch.previewBar", {
					branch: preview,
					current: checkedOut ?? ""
				})
			}, t("branch.previewBar", {
				branch: preview,
				current: checkedOut ?? ""
			})), React.createElement("button", {
				type: "button",
				className: `gs-preview-exit`,
				"data-git-preview-exit": "",
				title: t("branch.previewExit"),
				onClick: exit
			}, t("branch.previewExit")));
		}
		/** The `↑n ↓m` reading, or nothing when the branch tracks no upstream or has nothing to report. */
		function upstreamSits(React, t, upstream) {
			if (upstream === null || upstream === void 0) return null;
			if (upstream.ahead === 0 && upstream.behind === 0) return null;
			return React.createElement("span", {
				className: `gs-upstream`,
				"data-git-upstream": "",
				title: t("upstream.title", { name: upstream.name })
			}, upstream.ahead === 0 ? null : React.createElement("span", {
				className: `gs-ahead`,
				"data-count": "ahead"
			}, `↑${upstream.ahead}`), upstream.behind === 0 ? null : React.createElement("span", {
				className: `gs-behind`,
				"data-count": "behind"
			}, `↓${upstream.behind}`));
		}
		/** The bar a checkout in the middle of a merge or a rebase shows under the header. */
		function operationBar(React, t, operation, busy, abort) {
			return React.createElement("div", {
				className: `gs-operation`,
				"data-git-operation": operation
			}, React.createElement("span", { className: `gs-operation-text` }, t(`operation.${operation}`, { operation })), React.createElement("button", {
				type: "button",
				className: `gs-operation-abort`,
				"data-git-abort": "",
				disabled: busy,
				title: t("operation.abort"),
				onClick: abort
			}, t("operation.abort")));
		}
		/** The branch picker: local branches, then the new-branch row. */
		function picker(React, props, branches, draft, setDraft, create, pick, busy, close, at) {
			const { t } = props;
			const current = branches?.current ?? null;
			const local = branches?.local ?? [];
			const preview = props.preview;
			return React.createElement("div", {
				className: `gs-menu gs-branch-menu`,
				"data-git-branch-menu": "",
				role: "menu",
				style: at === null ? void 0 : {
					top: `${at.top}px`,
					left: `${at.left}px`
				}
			}, React.createElement("p", { className: `gs-menu-title` }, t("branch.selector")), branches === void 0 ? React.createElement("p", {
				className: `gs-menu-note`,
				role: "status"
			}, t("branch.loading")) : local.length === 0 ? React.createElement("p", {
				className: `gs-menu-note`,
				role: "status"
			}, t("branch.empty")) : React.createElement("ul", { className: `gs-branch-list` }, ...local.map((name) => branchRow(React, props, name, current, preview, busy, pick, (branch) => {
				close();
				props.previewBranch(branch);
			}))), preview === null ? null : React.createElement("button", {
				type: "button",
				className: `gs-menu-item`,
				"data-git-preview-clear": "",
				role: "menuitem",
				title: t("branch.previewExit"),
				onClick: () => {
					close();
					props.exitPreview();
				}
			}, Icon(React, "eye"), React.createElement("span", null, t("branch.previewExit"))), React.createElement("div", { className: `gs-new-branch` }, React.createElement("input", {
				type: "text",
				className: `gs-new-branch-input`,
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
			}), React.createElement("button", {
				type: "button",
				className: `gs-new-branch-create`,
				"data-git-create-branch": "",
				disabled: busy || draft.trim() === "",
				title: t("branch.create"),
				onClick: create
			}, t("branch.create"))));
		}
		/**
		* One branch in the picker: what it is called, and the two things to do with it.
		*
		* The name button checks the branch out, which is what the picker did before the
		* preview existed; preview sits beside it as its own control, because changing
		* what the panel describes must not be mistaken for changing the checkout.
		* @param React - the loader's React.
		* @param props - the header's callbacks.
		* @param name - the branch.
		* @param current - the checked-out branch, when Git reports one.
		* @param preview - the branch the panel describes without checking it out.
		* @param busy - whether a write is running.
		* @param pick - the checkout handler.
		* @returns the row.
		*/
		function branchRow(React, props, name, current, preview, busy, pick, previewPick) {
			const { t } = props;
			const checkedOut = name === current;
			const previewing = name === preview;
			return React.createElement("li", {
				key: name,
				className: `gs-branch-item`,
				"data-current": checkedOut ? "" : void 0,
				"data-previewed": previewing ? "" : void 0
			}, React.createElement("span", { className: `gs-branch-space` }, checkedOut ? Icon(React, "check", { size: 16 }) : previewing ? Icon(React, "eye", { size: 16 }) : null), React.createElement("span", {
				className: `gs-branch-option-name`,
				"data-git-branch-name": name,
				title: name
			}, name), React.createElement("button", {
				type: "button",
				className: `gs-branch-act`,
				"data-act": "checkout",
				"data-git-branch-option": name,
				"data-git-branch-checkout": name,
				role: "menuitem",
				disabled: busy || checkedOut,
				title: `${t("branch.checkout")} ${name}`,
				onClick: () => {
					pick(name);
				}
			}, t("branch.checkout")), React.createElement("button", {
				type: "button",
				className: `gs-branch-act`,
				"data-act": "preview",
				"data-git-branch-preview": name,
				"data-active": previewing ? "" : void 0,
				role: "menuitem",
				disabled: busy || checkedOut || previewing,
				title: `${t("branch.preview")} ${name}`,
				onClick: () => {
					previewPick(name);
				}
			}, t("branch.preview")), checkedOut ? null : React.createElement("button", {
				type: "button",
				className: `gs-branch-act`,
				"data-act": "delete",
				"data-git-branch-delete": name,
				role: "menuitem",
				disabled: busy,
				title: t("branch.delete"),
				onClick: () => {
					props.deleteBranch(name);
				}
			}, t("branch.remove")));
		}
		/** The operations menu: fetch, pull, push, one stash, and merges. */
		function operations(React, props, usable, busy, fetch, sync, stash, localBranches, merge, at) {
			const { t } = props;
			const items = [
				{
					id: "fetch",
					icon: "sync",
					label: t("sync.fetch"),
					run: fetch
				},
				{
					id: "pull",
					icon: "pull",
					label: t("sync.pull"),
					run: () => {
						sync("pull");
					}
				},
				{
					id: "push",
					icon: "push",
					label: t("sync.push"),
					run: () => {
						sync("push");
					}
				}
			];
			return React.createElement("div", {
				className: `gs-menu gs-more-menu`,
				"data-git-more-menu": "",
				role: "menu",
				style: at === null ? void 0 : {
					top: `${at.top}px`,
					left: `${at.left}px`
				}
			}, ...items.map((item) => React.createElement("button", {
				key: item.id,
				type: "button",
				className: `gs-menu-item`,
				"data-git-sync": item.id,
				role: "menuitem",
				disabled: busy || !usable,
				onClick: item.run
			}, Icon(React, item.icon), React.createElement("span", null, item.label))), React.createElement("span", {
				className: `gs-menu-sep`,
				role: "separator"
			}), React.createElement("button", {
				type: "button",
				className: `gs-menu-item`,
				"data-git-stash-new": "",
				role: "menuitem",
				disabled: busy || !usable,
				onClick: stash
			}, Icon(React, "stash"), React.createElement("span", null, t("stash.current"))), React.createElement("span", {
				className: `gs-menu-sep`,
				role: "separator"
			}), ...localBranches.length === 0 ? [] : [React.createElement("p", {
				key: "merge-label",
				className: `gs-menu-title`
			}, t("branch.mergeInto"))], ...localBranches.map((name) => React.createElement("button", {
				key: `merge:${name}`,
				type: "button",
				className: `gs-menu-item`,
				"data-git-merge": name,
				role: "menuitem",
				disabled: busy || !usable,
				onClick: () => {
					merge(name);
				}
			}, Icon(React, "merge"), React.createElement("span", null, name))));
		}
		// src/client/repo-picker.ts
		/** Width the menu reserves when it is placed, used to keep it inside the window. */
		const MENU_W$1 = 260;
		/**
		* Where the menu hangs: under the button that opened it, and never past the
		* window's right edge. The header spans the panel, so measuring the button is
		* what keeps the menu beside it.
		* @param node - the button that opened the menu.
		* @returns the fixed position to draw at.
		*/
		function anchorUnder(node) {
			const box = node.getBoundingClientRect();
			const widest = window.innerWidth - MENU_W$1 - 8;
			return {
				top: box.bottom + 4,
				left: Math.max(8, Math.min(box.left, widest))
			};
		}
		/** The last segment of a filesystem path, for the narrow label. */
		function lastSegment(path) {
			const trimmed = path.replace(/[\\/]+$/, "");
			const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
			return cut < 0 ? trimmed : trimmed.slice(cut + 1);
		}
		/** The badge a checkout kind carries; an ordinary checkout needs none. */
		const KIND_KEY = {
			repository: "",
			submodule: "repo.submodule",
			worktree: "repo.worktree"
		};
		/**
		* The label one checkout carries.
		*
		* A path relative to the Session directory is what tells two checkouts apart, but
		* the working directory's own checkout would read as a bare dot; its directory
		* name says the same thing and is what a reader recognises.
		* @param entry - the checkout to label.
		* @returns its relative path, or its name when it is the working directory.
		*/
		function labelOf$1(entry) {
			return entry.relative === "." ? entry.name : entry.relative;
		}
		/**
		* Build the repository button and its menu.
		* @param React - the loader's React.
		* @returns the control the panel draws at the head of its header row.
		*/
		function makeRepoBar(React) {
			return function RepoBar(props) {
				const { t, root, busy, enabled } = props;
				const [open, setOpen] = React.useState(false);
				const [at, setAt] = React.useState(null);
				const [list, setList] = React.useState(void 0);
				React.useEffect(() => {
					if (!open) return;
					let live = true;
					setList(void 0);
					props.list().then((next) => {
						if (live) setList(next);
					}).catch(() => {
						if (live) setList(void 0);
					});
					return () => {
						live = false;
					};
				}, [open]);
				/**
				* Open the menu under the button, or close it when it is already open.
				* @param node - the button, measured to place the menu.
				*/
				const toggle = (node) => {
					if (open) {
						setOpen(false);
						return;
					}
					setAt(anchorUnder(node));
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
				const label = root === void 0 ? props.loading ? "…" : t("repo.none") : known === void 0 ? lastSegment(root) : labelOf$1(known);
				return React.createElement("div", { className: `gs-repo-wrap` }, React.createElement("button", {
					type: "button",
					className: `gs-repo`,
					"data-git-repo": "",
					"data-git-repo-button": "",
					"data-git-repo-root": root ?? "",
					"aria-haspopup": "menu",
					"aria-expanded": open ? "true" : "false",
					"aria-label": t("repo.selector"),
					title: root === void 0 ? t("repo.selector") : `${t("repo.selector")}\n${root}`,
					disabled: !enabled || busy,
					onClick: (event) => {
						toggle(event.currentTarget);
					}
				}, Icon(React, "repo", { size: 14 }), React.createElement("span", { className: `gs-repo-name` }, label), Icon(React, "chevron", { size: 14 })), open ? React.createElement("div", {
					className: `gs-backdrop`,
					"data-git-dismiss": "",
					onClick: close
				}) : null, open ? menu(React, t, list, root, at, busy, pick, close) : null);
			};
		}
		/**
		* The menu: every checkout the scan found, the current one marked.
		* @param React - the loader's React.
		* @param t - the copy lookup.
		* @param list - the scan result, or undefined while it runs.
		* @param root - the checkout the panel is reading.
		* @param at - where to draw the menu.
		* @param busy - whether a write or a switch is running.
		* @param pick - the handler for one checkout, or for the working directory.
		* @param close - the handler that dismisses the menu.
		* @returns the menu element.
		*/
		function menu(React, t, list, root, at, busy, pick, close) {
			const entries = list?.entries ?? [];
			return React.createElement("div", {
				className: `gs-menu gs-repo-menu`,
				"data-git-repo-menu": "",
				role: "menu",
				style: at === null ? void 0 : {
					top: `${at.top}px`,
					left: `${at.left}px`
				}
			}, React.createElement("p", { className: `gs-menu-title` }, t("repo.selector")), list === void 0 ? React.createElement("p", {
				className: `gs-menu-note`,
				role: "status"
			}, t("repo.loading")) : list.error !== void 0 ? React.createElement("p", {
				className: `gs-menu-note`,
				role: "status"
			}, `${t("repo.failed")}: ${list.error}`) : entries.length === 0 ? React.createElement("p", {
				className: `gs-menu-note`,
				role: "status"
			}, t("repo.empty")) : React.createElement("ul", { className: `gs-repo-list` }, ...entries.map((entry) => React.createElement("li", { key: entry.root }, React.createElement("button", {
				type: "button",
				className: `gs-repo-option`,
				"data-git-repo-option": entry.root,
				"data-current": entry.root === root ? "" : void 0,
				role: "menuitemradio",
				"aria-checked": entry.root === root ? "true" : "false",
				disabled: busy,
				title: entry.root,
				onClick: () => {
					pick(entry.root);
				}
			}, React.createElement("span", { className: `gs-branch-space` }, entry.root === root ? Icon(React, "check", { size: 16 }) : null), React.createElement("span", { className: `gs-repo-path` }, labelOf$1(entry)), KIND_KEY[entry.kind] === "" ? null : React.createElement("span", {
				className: `gs-repo-badge`,
				"data-kind": entry.kind
			}, t(KIND_KEY[entry.kind])))))), React.createElement("span", {
				className: `gs-menu-sep`,
				role: "separator"
			}), ...footer(React, t, list, pick, close));
		}
		/**
		* The notes under the list: how far the scan went, what it could not read, and
		* the way back to the working directory's own checkout.
		* @param React - the loader's React.
		* @param t - the copy lookup.
		* @param list - the scan result, or undefined while it runs.
		* @param pick - the handler for the working directory.
		* @param close - the handler that dismisses the menu.
		* @returns the footer elements.
		*/
		function footer(React, t, list, pick, close) {
			if (list === void 0) return [];
			const parts = [React.createElement("p", {
				key: "scanned",
				className: `gs-menu-note`
			}, t("repo.scanned", {
				count: list.entries.length,
				depth: list.depth
			}))];
			if (list.truncated) parts.push(React.createElement("p", {
				key: "truncated",
				className: `gs-menu-note`
			}, t("repo.truncated")));
			if (list.warnings.length > 0) parts.push(React.createElement("p", {
				key: "warnings",
				className: `gs-menu-note`
			}, t("repo.warnings", { count: list.warnings.length })));
			if (list.selected !== null) parts.push(React.createElement("button", {
				key: "reset",
				type: "button",
				className: `gs-menu-item`,
				"data-git-repo-reset": "",
				role: "menuitem",
				title: list.scanRoot,
				onClick: () => {
					close();
					pick(void 0);
				}
			}, Icon(React, "undo"), React.createElement("span", null, t("repo.reset"))));
			return parts;
		}
		// src/client/commit-box.ts
		/**
		* The reason the commit button is unavailable, or `undefined` while it can run.
		* @param props - the commit panel's facts.
		* @returns the catalogue key of the explanation, or undefined.
		*/
		function blockedReasonKey(props) {
			if (props.busy) return "commit.busy";
			if (props.clean && !props.amend) return "commit.clean";
			if (props.stagedCount === 0 && !props.amend && props.unstagedCount === 0) return "commit.nothingStaged";
			if (props.pickedCount === 0 && !props.amend && props.stagedCount > 0) return "commit.noPick";
			if (props.message.trim() === "") return "commit.emptyMessage";
		}
		/**
		* The text beside the buttons: the reason they are off, the missing author's
		* instruction, or how much is ready to go.
		*
		* A missing author does not disable the buttons: the Host decides whether a
		* commit can run, and a repository may name its author through a config file or
		* the environment that a snapshot read did not see.
		* @param props - the commit panel's facts.
		* @returns the sentence to show.
		*/
		function hintOf(props) {
			const blocked = blockedReasonKey(props);
			if (blocked !== void 0) return props.t(blocked);
			if (props.identityMissing) return props.t("commit.identityMissing");
			if (props.pickedCount > 0) return props.t("commit.pickedHint", { count: props.pickedCount });
			if (props.amend) return props.t("commit.amendHint");
			if (props.stagedCount === 0) return props.t("commit.stageAllHint", { count: props.unstagedCount });
			return props.t("commit.hint", { count: props.stagedCount });
		}
		/**
		* Render the commit panel.
		*
		* A plain function rather than a component: the panel calls it inside its own
		* render, so it must not hold hooks. The one piece of state it shows — whether
		* the recent-messages menu is open — is owned above and passed in.
		* @param React - the loader's React.
		* @param props - the message, the index size, and the actions.
		* @returns the panel.
		*/
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
			return React.createElement("div", { className: `gs-commit` }, React.createElement("div", { className: `gs-commit-head` }, canAmend ? React.createElement("label", { className: `gs-commit-amend` }, React.createElement("input", {
				type: "checkbox",
				"data-git-amend": "",
				checked: props.amend,
				disabled: busy,
				onChange: (event) => {
					props.onAmendChange(event.target.checked);
				}
			}), React.createElement("span", null, t("commit.amend"))) : null, canAmend && recent.length > 0 ? React.createElement("button", {
				type: "button",
				className: `gs-commit-recent`,
				"data-git-recent": "",
				"aria-haspopup": "menu",
				"aria-expanded": recentOpen ? "true" : "false",
				title: t("commit.recent"),
				"aria-label": t("commit.recent"),
				disabled: busy,
				onClick: () => {
					props.onRecentToggle();
				}
			}, Icon(React, "clock", { size: 14 })) : null, React.createElement("button", {
				type: "button",
				className: `gs-commit-draft`,
				"data-git-draft": "",
				"data-turning": props.drafting ? "" : void 0,
				title: t("commit.draft"),
				"aria-label": t("commit.draft"),
				disabled: busy || props.drafting,
				onClick: () => {
					props.onDraft();
				}
			}, Icon(React, "spark", { size: 14 })), recentOpen && recent.length > 0 ? React.createElement("div", {
				className: `gs-commit-recent-menu`,
				"data-git-recent-menu": "",
				role: "menu"
			}, ...recent.map((subject) => React.createElement("button", {
				key: subject,
				type: "button",
				className: `gs-commit-recent-item`,
				role: "menuitem",
				title: subject,
				onClick: () => {
					props.onChange(subject);
					props.onRecentToggle();
				}
			}, subject))) : null), React.createElement("textarea", {
				className: `gs-commit-input`,
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
			}), React.createElement("div", { className: `gs-commit-foot` }, React.createElement("button", {
				type: "button",
				className: `gs-commit-submit`,
				"data-git-commit": "",
				disabled: blocked !== void 0,
				title: stageAll ? t("commit.stageAllSubmit") : t("commit.submit"),
				onClick: submit
			}, stageAll ? t("commit.stageAllSubmit") : t("commit.submit")), React.createElement("button", {
				type: "button",
				className: `gs-commit-push`,
				"data-git-commit-push": "",
				disabled: blocked !== void 0,
				title: t("commit.pushTitle"),
				onClick: submitAndPush
			}, t("commit.push")), React.createElement("p", {
				className: `gs-commit-hint`,
				"data-warn": identityMissing ? "" : void 0,
				role: blocked === void 0 ? void 0 : "status"
			}, hintOf(props))));
		}
		// src/client/dialog-host.ts
		let pending = null;
		const listeners = /* @__PURE__ */ new Set();
		/** Tell every mounted host that the question changed. */
		function announce() {
			for (const listener of listeners) listener();
		}
		/**
		* Open a question and wait for its answer.
		* @param ask - what to ask.
		* @returns the reader's answer; a cancelled question answers null.
		*/
		function open(ask) {
			pending?.settle(null);
			return new Promise((settle) => {
				pending = {
					ask,
					settle
				};
				announce();
			});
		}
		/**
		* The question on screen, for a host that has to draw it.
		* @returns the open question, or null when nothing is being asked.
		*/
		function currentAsk() {
			return pending?.ask ?? null;
		}
		/**
		* Subscribe to the open question changing.
		* @param listener - called after every open, answer, and dismissal.
		* @returns the unsubscribe.
		*/
		function watchDialogs(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		}
		/**
		* Answer the open question.
		* @param answer - the decision, or the typed line.
		*/
		function settleDialog(answer) {
			const asking = pending;
			if (asking === null) return;
			pending = null;
			announce();
			asking.settle(answer);
		}
		/**
		* Ask a yes-or-no question.
		* @param ask - what to ask.
		* @returns whether the reader agreed.
		*/
		function askConfirm(ask) {
			return open(ask).then((answer) => answer === true);
		}
		/**
		* Ask for a line of text.
		* @param ask - what to ask; `input` seeds the field.
		* @returns the trimmed answer, or null when the reader cancelled or typed nothing.
		*/
		function askText(ask) {
			return open(ask).then((answer) => {
				if (typeof answer !== "string") return null;
				const text = answer.trim();
				return text === "" ? null : text;
			});
		}
		/**
		* Report something the reader asked for that could not be done.
		* @param ask - the sentence, plus the one button that dismisses it.
		* @returns a promise that settles when the reader dismissed it.
		*/
		function showNotice(ask) {
			return open(ask).then(() => void 0);
		}
		/**
		* Build the modal.
		* @param React - the loader's React.
		* @returns the component the panel draws at its root.
		*/
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
				return React.createElement("div", {
					className: `gs-dialog-layer`,
					"data-git-dialog": "",
					role: "dialog",
					"aria-modal": "true",
					"aria-label": ask.title
				}, React.createElement("div", {
					className: `gs-dialog-backdrop`,
					"data-git-dialog-dismiss": "",
					onClick: cancel
				}), React.createElement("div", { className: `gs-dialog` }, React.createElement("h2", { className: `gs-dialog-title` }, ask.title), ask.body === void 0 ? null : React.createElement("p", { className: `gs-dialog-body` }, ask.body), ask.lines === void 0 || ask.lines.length === 0 ? null : React.createElement("ul", { className: `gs-dialog-list` }, ...ask.lines.map((line) => React.createElement("li", { key: line }, line))), ask.warning === void 0 ? null : React.createElement("p", { className: `gs-dialog-warning` }, ask.warning), typed ? React.createElement("input", {
					type: "text",
					className: `gs-dialog-input`,
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
				}) : null, React.createElement("div", { className: `gs-dialog-actions` }, React.createElement("button", {
					type: "button",
					className: `gs-dialog-confirm`,
					"data-git-dialog-confirm": "",
					"data-danger": ask.danger === true ? "" : void 0,
					disabled: typed && draft.trim() === "",
					autoFocus: !typed,
					onClick: confirm
				}, ask.confirm), ask.cancel === "" ? null : React.createElement("button", {
					type: "button",
					className: `gs-dialog-cancel`,
					"data-git-dialog-cancel": "",
					onClick: cancel
				}, ask.cancel))));
			};
		}
		// src/client/dialog.ts
		/**
		* Name a set of paths: one path verbatim, two to five all of them, and more
		* than five the first and the total.
		* @param t - the panel's translator.
		* @param paths - the paths to name.
		* @returns the paths to draw as a list.
		*/
		function nameFiles(t, paths) {
			const first = paths[0] ?? "";
			if (paths.length <= 1) return first === "" ? [] : [first];
			if (paths.length <= 5) return paths;
			return [t("dialog.filesMany", {
				first,
				count: paths.length
			})];
		}
		/**
		* Compose the discard question.
		*
		* Untracked files get their own sentence because restoring them is impossible,
		* unlike a tracked file whose content survives in the object database.
		* @param t - the panel's translator.
		* @param prompt - the paths, and which of them are untracked.
		* @returns the question.
		*/
		function discardAsk(t, prompt) {
			return {
				title: t("dialog.discard.title"),
				body: t("dialog.discard.body"),
				lines: nameFiles(t, prompt.files),
				...prompt.untracked.length === 0 ? {} : { warning: `${t("dialog.discard.untracked")}\n${prompt.untracked.join("\n")}` },
				danger: true,
				confirm: t("dialog.confirm"),
				cancel: t("dialog.cancel")
			};
		}
		/**
		* Ask before discarding.
		* @param t - the panel's translator.
		* @param prompt - the paths, and which of them are untracked.
		* @returns whether the reader agreed.
		*/
		function confirmDiscard(t, prompt) {
			return askConfirm(discardAsk(t, prompt));
		}
		/**
		* Ask before a stash entry is removed.
		* @param t - the panel's translator.
		* @param prompt - the entry and the action.
		* @returns whether the reader agreed.
		*/
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
		/**
		* Ask before a network operation that writes to the remote.
		*
		* A fetch only reads, so it never asks. A pull moves the local branch and a push
		* publishes commits other people can see, and both are worth naming the upstream
		* they touch.
		* @param t - the panel's translator.
		* @param action - which operation is being confirmed.
		* @param upstream - the tracked ref, when the branch has one.
		* @returns whether the reader agreed.
		*/
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
		/**
		* Ask before undoing a merge or a rebase.
		*
		* Aborting discards the resolution of every conflict in the operation, so the
		* question states what it throws away rather than asking a bare confirmation.
		* @param t - the panel's translator.
		* @param operation - the operation being aborted.
		* @returns whether the reader agreed.
		*/
		function confirmAbort(t, operation) {
			return askConfirm({
				title: t("dialog.abort.title"),
				body: t("dialog.abort", { operation }),
				danger: true,
				confirm: t("dialog.confirm"),
				cancel: t("dialog.cancel")
			});
		}
		/**
		* Ask before deleting a local branch.
		* @param t - the panel's translator.
		* @param branch - the branch to delete.
		* @returns whether the reader agreed.
		*/
		function confirmDeleteBranch(t, branch) {
			return askConfirm({
				title: t("dialog.deleteBranch.title"),
				body: t("dialog.deleteBranch", { branch }),
				danger: true,
				confirm: t("dialog.confirm"),
				cancel: t("dialog.cancel")
			});
		}
		/**
		* Ask again when the branch holds commits that are in no other branch.
		* @param t - the panel's translator.
		* @param branch - the unmerged branch.
		* @returns whether the reader agreed to lose those commits.
		*/
		function confirmForceDelete(t, branch) {
			return askConfirm({
				title: t("dialog.forceDeleteBranch.title"),
				body: t("dialog.forceDeleteBranch", { branch }),
				danger: true,
				confirm: t("dialog.confirm"),
				cancel: t("dialog.cancel")
			});
		}
		/**
		* Ask before merging one branch into the checked-out one.
		* @param t - the panel's translator.
		* @param branch - the branch being merged in.
		* @param current - the branch receiving the merge, when there is one.
		* @returns whether the reader agreed.
		*/
		function confirmMerge(t, branch, current) {
			return askConfirm({
				title: t("dialog.merge.title"),
				body: t("dialog.merge", {
					branch,
					current: current ?? ""
				}),
				confirm: t("dialog.confirm"),
				cancel: t("dialog.cancel")
			});
		}
		/**
		* Ask before leaving the branch to look at one commit.
		*
		* A detached head is the one checkout a reader can land in without noticing: the
		* header still names a commit, but a commit made there belongs to no branch.
		* @param t - the panel's translator.
		* @param short - the abbreviated object name being checked out.
		* @returns whether the reader agreed.
		*/
		function confirmDetach(t, short) {
			return askConfirm({
				title: t("dialog.detach.title"),
				body: t("dialog.detach", { short }),
				confirm: t("dialog.confirm"),
				cancel: t("dialog.cancel")
			});
		}
		/**
		* Ask for the name of a branch that starts at one commit.
		* @param t - the panel's translator.
		* @param short - the abbreviated object name the branch starts at.
		* @returns the name, or null when the reader cancelled.
		*/
		function askBranchName(t, short) {
			return askText({
				title: t("dialog.branchFrom.title"),
				body: t("dialog.branchFrom", { short }),
				input: "",
				confirm: t("dialog.confirm"),
				cancel: t("dialog.cancel")
			});
		}
		/**
		* Ask before acting on a branch the panel is only previewing.
		*
		* A preview moves nothing: the branch name and the log change, the checkout does
		* not. An operation that names the previewed branch therefore cannot run as it
		* stands, so the question is the step that turns the preview into a real
		* checkout — and the labels say so instead of asking a bare confirmation.
		* @param t - the panel's translator.
		* @param preview - the branch being previewed.
		* @param current - the branch actually checked out, when Git reports one.
		* @returns whether the reader agreed to check the previewed branch out.
		*/
		function confirmPreviewCheckout(t, preview, current) {
			return askConfirm({
				title: t("dialog.previewCheckout.title"),
				body: t("dialog.previewCheckout.body", {
					preview,
					current: current ?? ""
				}),
				confirm: t("dialog.previewCheckout.confirm"),
				cancel: t("dialog.cancel")
			});
		}
		/**
		* Report a refusal the reader asked for and Git declined.
		*
		* Switching branches over a dirty tree is the case this exists for: the request
		* looked reasonable, so silence would read as a bug.
		* @param t - the panel's translator.
		* @param message - the sentence to show.
		* @returns a promise that settles when the reader dismissed it.
		*/
		function notify(t, message) {
			return showNotice({
				title: t("dialog.refused.title"),
				body: message,
				confirm: t("dialog.ok"),
				cancel: ""
			});
		}
		// src/client/graph-model.ts
		/**
		* Lay out one page of history.
		* @param commits - commits newest first, as Git prints them.
		* @returns one row per distinct commit, plus the column count.
		*/
		function layoutGraph(commits) {
			/** The commit each lane waits for, indexed by the column it is drawn in. */
			let lanes = [];
			const rows = [];
			const seen = /* @__PURE__ */ new Set();
			let widest = 0;
			for (const commit of commits) {
				if (seen.has(commit.sha)) continue;
				seen.add(commit.sha);
				const input = lanes;
				const found = input.findIndex((lane) => lane.id === commit.sha);
				const waited = input[found];
				const lane = waited === void 0 ? input.length : found;
				const firstParent = commit.parents[0];
				const extraParents = commit.parents.slice(1);
				const strokes = [];
				const output = [];
				if (firstParent === void 0) input.forEach((swimlane, index) => {
					strokes.push({
						prior: index,
						kind: "join",
						color: swimlane.color
					});
				});
				else {
					input.forEach((swimlane, index) => {
						if (swimlane.id === commit.sha) {
							if (index === lane) output.push({
								id: firstParent,
								color: swimlane.color
							});
							strokes.push({
								prior: index,
								kind: "join",
								color: swimlane.color
							});
							return;
						}
						const next = output.length;
						output.push({
							id: swimlane.id,
							color: swimlane.color
						});
						const kind = next === index ? "through" : "bend";
						strokes.push({
							prior: index,
							next,
							kind,
							color: swimlane.color
						});
					});
					if (waited === void 0) output.push({
						id: firstParent,
						color: lane
					});
					const parent = output[lane];
					if (parent !== void 0) strokes.push({
						prior: void 0,
						next: lane,
						kind: "branch",
						color: parent.color
					});
					for (const extra of extraParents) {
						const next = output.length;
						output.push({
							id: extra,
							color: next
						});
						strokes.push({
							prior: void 0,
							next,
							kind: "branch",
							color: next
						});
					}
				}
				widest = Math.max(widest, output.length, lane + 1);
				rows.push({
					sha: commit.sha,
					lane,
					color: waited === void 0 ? lane : waited.color,
					merged: extraParents.length > 0,
					strokes
				});
				lanes = output;
			}
			return {
				rows,
				lanes: widest
			};
		}
		// src/client/progress.ts
		/** How long a run must last before the animation drops to one frame per step. */
		const LONG_RUNNING_MS = 1e4;
		/** The pause `done()` keeps before the bar is cleared. */
		const DONE_MS = 200;
		/**
		* Build the progress bar.
		* @param React - the loader's React.
		* @returns the component the panel draws above its header.
		*/
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
				return React.createElement("div", {
					className: `gs-progress`,
					"data-git-progress": "",
					"data-active": sweeping ? "" : void 0,
					"data-infinite": sweeping ? "" : void 0,
					"data-long-running": sweeping && longRunning ? "" : void 0,
					"data-done": phase === "done" ? "" : void 0,
					"aria-hidden": "true"
				}, React.createElement("div", {
					className: `gs-progress-bit`,
					"data-git-progress-bit": "",
					style: { opacity: phase === "done" ? 0 : 1 }
				}));
			};
		}
		// src/client/history.ts
		/** Commits one page carries. */
		const PAGE = 20;
		/** Width the commit menu reserves, used to keep it inside the viewport. */
		const MENU_W = 190;
		/** Width of one lane, and so the gutter's unit of measure. */
		const LANE_W = 14;
		/** Radius of the node a commit is drawn as, and of a merge's wider node. */
		const NODE_R = 4;
		const MERGE_NODE_R = 6;
		/** Radius of the quarter turns that join a line's vertical runs. */
		const TURN_R = 5;
		/** Ring around a node, in the colour of the ground it sits on, so lines break there. */
		const NODE_RING = "var(--dsw-alias-bg-layer-1)";
		/** The selector a row control is found by, for the arrow keys. */
		const ROW_SELECTOR = "[data-git-history-row]";
		/**
		* The lane palette.
		*
		* Eight inks mixed from the shell's own tokens rather than written as hex, so
		* both themes keep their contrast: the severities are tuned per theme already,
		* and a mix of two of them stays inside the same gamut.
		*
		* The first entry is deliberately the brand ink, which reads as near-white in
		* the dark theme and as near-black in the light one. That is the lane the
		* checked-out branch sits in, and a neutral line is what makes the coloured
		* branches beside it legible — a coloured trunk would compete with them.
		*
		* The rest are ordered for hue separation rather than for convenience: amber,
		* green, magenta, blue, yellow-green, red, teal. Mixing two neighbouring
		* severities covers the gaps the five token inks leave, so no two lanes land on
		* the same hue.
		*/
		const LANE_COLORS = [
			"var(--dsw-alias-brand-primary)",
			"var(--dsw-alias-state-warn-primary)",
			"var(--dsw-alias-state-success-primary)",
			"color-mix(in srgb, var(--dsw-alias-state-business-primary) 50%, var(--dsw-alias-state-error-primary))",
			"var(--dsw-alias-state-business-primary)",
			"color-mix(in srgb, var(--dsw-alias-state-success-primary) 50%, var(--dsw-alias-state-warn-primary))",
			"var(--dsw-alias-state-error-primary)",
			"color-mix(in srgb, var(--dsw-alias-state-business-primary) 60%, var(--dsw-alias-state-success-primary))"
		];
		/**
		* Build the history section.
		* @param React - the loader's React.
		* @returns the component the panel draws in its lower half.
		*/
		function makeHistory(React) {
			const Progress = makeProgress(React);
			return function History(props) {
				const { t, open } = props;
				const [commits, setCommits] = React.useState(props.initial?.commits ?? []);
				const [hasMore, setHasMore] = React.useState(props.initial?.hasMore ?? false);
				const [total, setTotal] = React.useState(props.initial?.total ?? 0);
				const [loading, setLoading] = React.useState(false);
				const [failed, setFailed] = React.useState(false);
				const [gate] = React.useState({ reading: false });
				/**
				* Whether this mount has read anything yet.
				*
				* A cached page makes the first render complete, so the effect below must
				* not read again on mount — that is exactly the request the cache exists to
				* avoid. A refresh clears the cache and bumps the revision, which is what
				* re-arms this cell.
				*/
				const [armed] = React.useState({ read: props.initial === void 0 });
				const asked = commits.length;
				const read = React.useCallback((skip) => {
					if (gate.reading) return;
					gate.reading = true;
					setLoading(true);
					setFailed(false);
					props.load(PAGE, skip).then((page) => {
						setCommits((previous) => {
							const next = skip === 0 ? page.commits : [...previous, ...page.commits];
							props.remember?.({
								commits: next,
								hasMore: page.hasMore,
								total: page.total
							});
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
					if (!open) return;
					if (!armed.read) {
						armed.read = true;
						return;
					}
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
				const onKeyDown = (event) => {
					moveRowFocus(event);
				};
				/**
				* Which commit's menu is open, and where it was asked for.
				*
				* The menu is positioned rather than nested: the list scrolls, so a menu
				* drawn inside a row would be clipped by the scroller. Keeping the anchor
				* in state is what lets the menu render outside it.
				*/
				const [menu, setMenu] = React.useState(null);
				const openMenu = (sha, node) => {
					if (node === null) return;
					const box = node.getBoundingClientRect();
					setMenu({
						sha,
						top: box.bottom + 4,
						left: Math.max(8, box.right - MENU_W)
					});
				};
				const closeMenu = () => {
					setMenu(null);
				};
				const layout = layoutGraph(commits.map((commit) => ({
					sha: commit.sha,
					parents: commit.parents ?? []
				})));
				const body = {
					commits,
					rows: new Map(layout.rows.map((row) => [row.sha, row])),
					lanes: Math.max(1, layout.lanes),
					hasMore,
					loading,
					failed,
					more,
					onScroll,
					onKeyDown,
					menu,
					openMenu,
					closeMenu
				};
				return React.createElement("section", {
					className: `gs-history`,
					"data-git-history": "",
					"data-open": open ? "" : void 0
				}, React.createElement("div", { className: `gs-history-head` }, React.createElement("button", {
					type: "button",
					className: `gs-history-title`,
					"data-git-history-toggle": "",
					"aria-expanded": open ? "true" : "false",
					title: t(open ? "history.collapse" : "history.expand"),
					onClick: props.onToggle
				}, Icon(React, open ? "expand" : "chevron", { size: 16 }), React.createElement("h3", { className: `gs-group-title` }, t("history.title"))), props.branch === void 0 || props.branch === null ? null : React.createElement("span", {
					className: `gs-history-branch`,
					"data-git-history-branch": props.branch,
					title: t("history.previewBranch", { branch: props.branch })
				}, props.branch), commits.length === 0 ? null : React.createElement("span", { className: `gs-history-count` }, t("history.count", { count: total > 0 ? total : commits.length })), props.onRefresh === void 0 ? null : React.createElement("button", {
					type: "button",
					className: `gs-tool gs-history-refresh`,
					"data-git-history-refresh": "",
					title: t("refresh"),
					"aria-label": t("refresh"),
					onClick: props.onRefresh
				}, Icon(React, "refresh"))), open ? React.createElement(Progress, { active: loading }) : null, open ? historyBody(React, props, body) : null, menu === null ? null : commitMenu(React, props, menu, closeMenu));
			};
		}
		/** The scrolling graph, or the sentence that replaces it. */
		function historyBody(React, props, view) {
			const { t, tab } = props;
			if (view.failed) return React.createElement("p", {
				className: `gs-history-note`,
				role: "status"
			}, t("history.failed"));
			if (view.commits.length === 0) return React.createElement("p", {
				className: `gs-history-note`,
				role: "status"
			}, view.loading ? t("history.loading") : t("history.empty"));
			return React.createElement("div", {
				className: `gs-history-body`,
				onScroll: view.onScroll
			}, React.createElement("div", {
				className: `gs-graph`,
				"data-git-graph": "",
				"data-lanes": String(view.lanes)
			}, React.createElement("ul", {
				className: `gs-commits`,
				onKeyDown: view.onKeyDown
			}, ...view.commits.map((commit) => commitRow(React, t, tab, commit, view)))), view.hasMore ? React.createElement("button", {
				type: "button",
				className: `gs-history-more`,
				"data-git-history-more": "",
				disabled: view.loading,
				onClick: view.more
			}, view.loading ? t("history.loading") : t("history.more")) : React.createElement("p", {
				className: `gs-history-end`,
				"data-git-history-end": ""
			}, t("history.end")));
		}
		/** One commit: its slice of the graph, its short name, its subject, refs, author, and age. */
		function commitRow(React, t, tab, commit, view) {
			const open = () => {
				if (tab === void 0) return;
				tab.actions.openResource(commitDiffAddress(commit.sha), { kind: DIFF_TAB_KIND });
			};
			const row = view.rows.get(commit.sha) ?? {
				sha: commit.sha,
				lane: 0,
				color: 0,
				merged: false,
				strokes: []
			};
			return React.createElement("li", {
				key: commit.sha,
				className: `gs-commit-row`
			}, React.createElement("button", {
				type: "button",
				className: `gs-commit-open`,
				"data-git-history-row": commit.sha,
				title: `${commit.short} ${commit.subject}`,
				onClick: open
			}, graphSlice(React, row, view.lanes), React.createElement("span", {
				className: `gs-sha`,
				title: commit.sha
			}, commit.short), React.createElement("span", { className: `gs-subject` }, commit.subject), commit.refs.length === 0 ? null : React.createElement("span", { className: `gs-refs` }, ...commit.refs.map((ref) => refTag(React, ref))), React.createElement("span", { className: `gs-commit-meta` }, React.createElement("span", {
				className: `gs-author`,
				title: `${commit.author} <${commit.email}>`
			}, commit.author), React.createElement("span", {
				className: `gs-when`,
				title: commit.when
			}, relativeTime(t, commit.when)))), React.createElement("button", {
				type: "button",
				className: `gs-commit-more`,
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
			}, Icon(React, "more")));
		}
		/**
		* The menu one commit offers.
		*
		* It hangs in a fixed layer rather than inside the row, because the list it
		* belongs to scrolls and would clip it. A full-window backdrop closes it, which
		* is the same dismissal the branch menus use and needs no document listener.
		* @param React - the loader's React.
		* @param props - the panel's callbacks.
		* @param menu - the commit whose menu is open, and where.
		* @param close - dismissal for every entry and for the backdrop.
		* @returns the backdrop and the menu.
		*/
		function commitMenu(React, props, menu, close) {
			const { t } = props;
			const entry = (id, label, run) => {
				if (run === void 0) return null;
				return React.createElement("button", {
					key: id,
					type: "button",
					className: `gs-commit-menu-item`,
					role: "menuitem",
					"data-git-commit-action": id,
					onClick: () => {
						close();
						run();
					}
				}, label);
			};
			return React.createElement("div", { key: "commit-menu" }, React.createElement("div", {
				className: `gs-backdrop`,
				"data-git-dismiss": "",
				onClick: close
			}), React.createElement("div", {
				className: `gs-commit-menu`,
				"data-git-commit-menu": menu.sha,
				role: "menu",
				style: {
					top: `${menu.top}px`,
					left: `${menu.left}px`
				}
			}, entry("checkout", t("commit.checkout"), props.onCheckout === void 0 ? void 0 : () => {
				props.onCheckout?.(menu.sha);
			}), entry("branch", t("commit.branchFrom"), props.onBranchFrom === void 0 ? void 0 : () => {
				props.onBranchFrom?.(menu.sha);
			}), entry("copy", t("commit.copySha"), props.onCopy === void 0 ? void 0 : () => {
				props.onCopy?.(menu.sha);
			})));
		}
		/** One decoration as a capsule, inked by what it names. */
		function refTag(React, decoration) {
			const ref = normalizeRef(decoration);
			return React.createElement("span", {
				key: `${ref.kind}:${ref.name}`,
				className: `gs-ref`,
				"data-git-ref-kind": ref.kind,
				"data-ref": ref.kind === "tag" ? "tag" : "branch",
				title: ref.name
			}, ref.name);
		}
		/**
		* Read one decoration, whichever shape it arrived in.
		*
		* A Host built before the typed refs sent `%D` entries as strings, and the two
		* shapes mean the same thing: `tag: ` marks a tag, a slash marks a remote, and
		* anything else is a local branch.
		* @param decoration - one entry of a commit's decoration list.
		* @returns the typed ref.
		*/
		function normalizeRef(decoration) {
			if (typeof decoration !== "string") return decoration;
			if (decoration.startsWith("tag: ")) return {
				name: decoration.slice(5),
				kind: "tag"
			};
			return {
				name: decoration,
				kind: decoration.includes("/") ? "remote" : "local"
			};
		}
		/** The drawing passes, in the order the shapes of one row are added. */
		const DRAW_ORDER = [
			"passing",
			"arc",
			"upper",
			"lower"
		];
		/**
		* Which pass draws one line.
		*
		* A line that enters at the top edge and leaves at the bottom one belongs to the
		* first pass. A merge's arc leaves the node, so it goes over those; the node's own
		* two halves go over both, which is what makes the join with its first parent
		* look like one line through the dot rather than three.
		* @param stroke - one line of the row.
		* @param rowLane - the column the row's node sits in.
		* @returns the pass that draws it.
		*/
		function phaseOf(stroke, rowLane) {
			if (stroke.kind === "through" || stroke.kind === "bend") return "passing";
			if (stroke.kind === "join") return stroke.prior === rowLane ? "upper" : "passing";
			return stroke.next === rowLane ? "lower" : "arc";
		}
		/**
		* One row's slice of the graph.
		*
		* The slice is as wide as the whole graph, so every gutter lines up, and every
		* line it draws stays inside `ROW_H`, which is what lets the rows stack without a
		* seam: a row leaves a line at its bottom edge exactly where the next row picks
		* it up at the top edge.
		*
		* The order the shapes are added in is the whole drawing: the lines that cross
		* the row first, then a merge's arcs over them, then the node's own two halves,
		* and the node last, so its ring cuts whatever ran behind it.
		* @param React - the loader's React.
		* @param row - the row the layout produced.
		* @param lanes - the graph's total width in columns.
		* @returns the SVG element.
		*/
		function graphSlice(React, row, lanes) {
			const width = laneX(lanes);
			const nodeX = laneX(row.lane);
			const shapes = [];
			for (const phase of DRAW_ORDER) row.strokes.forEach((stroke, index) => {
				if (phaseOf(stroke, row.lane) !== phase) return;
				shapes.push(React.createElement("path", {
					key: `${index}:${stroke.kind}`,
					className: `gs-graph-line`,
					"data-git-graph-line": "",
					"data-git-graph-kind": stroke.kind,
					d: strokePath(stroke, nodeX),
					style: { stroke: slotColor(stroke.color) }
				}));
			});
			shapes.push(React.createElement("circle", {
				key: "node",
				className: `gs-graph-node`,
				"data-git-graph-node": "",
				"data-git-graph-merged": row.merged ? "" : void 0,
				cx: nodeX,
				cy: 13,
				r: row.merged ? MERGE_NODE_R : NODE_R,
				style: {
					fill: slotColor(row.color),
					stroke: NODE_RING,
					strokeWidth: 2
				}
			}));
			return React.createElement("svg", {
				className: `gs-graph-row`,
				"data-git-graph-row": row.sha,
				"data-lane": String(row.lane),
				width,
				height: 26,
				viewBox: `0 0 ${width} 26`,
				"aria-hidden": true,
				focusable: false
			}, ...shapes);
		}
		/**
		* The path of one line.
		*
		* A line that reaches an edge runs from that edge to the other; one that starts or
		* ends at the node runs only half the row, because the node itself covers the
		* rest. A sideways move happens at the node's height, as a step with rounded
		* corners rather than a diagonal, which is what keeps two lines side by side
		* readable while they cross.
		* @param stroke - one line of the row.
		* @param nodeX - the x of this row's node, which is where an open end attaches.
		* @returns the `d` attribute.
		*/
		function strokePath(stroke, nodeX) {
			const from = stroke.prior === void 0 ? nodeX : laneX(stroke.prior);
			const to = stroke.next === void 0 ? nodeX : laneX(stroke.next);
			if (stroke.prior === void 0) return branchPath(from, to);
			if (stroke.next === void 0) return joinPath(from, to);
			if (from === to) return `M${from} 0V26`;
			return stepPath(from, to);
		}
		/** A full row: a vertical run, a rounded step at the node's height, a second run. */
		function stepPath(from, to) {
			const middle = 13;
			if (to < from) return `M${from} 0V8A${TURN_R} ${TURN_R} 0 0 1 ${from - TURN_R} ${middle}H${to + TURN_R}A${TURN_R} ${TURN_R} 0 0 0 ${to} 18V26`;
			return `M${from} 0V8A${TURN_R} ${TURN_R} 0 0 0 ${from + TURN_R} ${middle}H${to - TURN_R}A${TURN_R} ${TURN_R} 0 0 1 ${to} 18V26`;
		}
		/** The top half: a run down from the edge, then a rounded turn into the node. */
		function joinPath(from, nodeX) {
			const middle = 13;
			if (from === nodeX) return `M${from} 0V${middle}`;
			if (from > nodeX) return `M${from} 0V8A${TURN_R} ${TURN_R} 0 0 1 ${from - TURN_R} ${middle}H${nodeX}`;
			return `M${from} 0V8A${TURN_R} ${TURN_R} 0 0 0 ${from + TURN_R} ${middle}H${nodeX}`;
		}
		/** The bottom half: a rounded turn out of the node, then a run to the edge. */
		function branchPath(nodeX, to) {
			const middle = 13;
			if (nodeX === to) return `M${nodeX} ${middle}V26`;
			if (to > nodeX) return `M${nodeX} ${middle}H${to - TURN_R}A${TURN_R} ${TURN_R} 0 0 1 ${to} 18V26`;
			return `M${nodeX} ${middle}H${to + TURN_R}A${TURN_R} ${TURN_R} 0 0 0 ${to} 18V26`;
		}
		/**
		* The x of one column's centre.
		*
		* The drawing keeps one column of padding on the left, so the outermost line of a
		* graph that starts at the head's column is never cut by the gutter's edge; the
		* right side gets the same padding from the width.
		* @param lane - the column, counted from zero.
		* @returns the x in pixels.
		*/
		function laneX(lane) {
			return LANE_W * (lane + 1);
		}
		/** The ink of one palette slot, wrapped around the palette so any depth gets a colour. */
		function slotColor(slot) {
			const size = LANE_COLORS.length;
			return LANE_COLORS[(slot % size + size) % size] ?? "currentColor";
		}
		/**
		* Move the focus to the row below or above the focused one.
		*
		* Rows are ordinary buttons, so Tab already reaches every one of them; the arrow
		* keys only shorten the walk down a long history. Home and End are left to the
		* browser, which knows where the list starts and stops.
		* @param event - the key event the list saw.
		*/
		function moveRowFocus(event) {
			const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
			if (step === 0) return;
			const target = event.target;
			if (target === null || target === void 0) return;
			if (typeof target.closest !== "function") return;
			const row = target.closest("li");
			if (row === null) return;
			event.preventDefault?.();
			(step > 0 ? row.nextElementSibling : row.previousElementSibling)?.querySelector(ROW_SELECTOR)?.focus();
		}
		/** How far in the past a commit is, in the largest unit that still says something. */
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
		/** The one-character mark of each change state. */
		const LETTERS = {
			added: "A",
			modified: "M",
			deleted: "D",
			renamed: "R",
			untracked: "U",
			conflicted: "U"
		};
		/**
		* Split a path so the middle is what gets lost when the row is narrow.
		* @param path - the text to split.
		* @returns the head and the kept tail; the tail is empty for a short path.
		*/
		function shortenPath(path) {
			const characters = Array.from(path);
			if (characters.length <= 20) return {
				head: path,
				tail: ""
			};
			return {
				head: characters.slice(0, -12).join(""),
				tail: characters.slice(-12).join("")
			};
		}
		/**
		* Split a repository-relative path at its last separator.
		* @param path - the path.
		* @returns its directory and its file name.
		*/
		function pathParts(path) {
			const slash = path.lastIndexOf("/");
			if (slash < 0) return {
				directory: "",
				name: path
			};
			return {
				directory: path.slice(0, slash),
				name: path.slice(slash + 1)
			};
		}
		/**
		* The row's text: the file's name, the directory after it in smaller subdued
		* type, and a rename's full origin folded into the name.
		* @param t - the panel's translator.
		* @param entry - the change.
		* @returns the name, the directory, and the tooltip.
		*/
		function labelOf(t, entry) {
			const from = entry.from;
			if (entry.status === "renamed" && from !== void 0) return {
				name: `${from} → ${entry.path}`,
				directory: "",
				title: t("row.renamed", {
					from,
					path: entry.path
				})
			};
			const parts = pathParts(entry.path);
			return {
				name: parts.name,
				directory: parts.directory,
				title: entry.path
			};
		}
		/**
		* Build the row component.
		* @param React - the loader's React.
		* @returns the component the panel lists.
		*/
		function makeFileRow(React) {
			return function FileRow(props) {
				const { entry, actions, t } = props;
				const label = labelOf(t, entry);
				return React.createElement("li", {
					className: `gs-row`,
					"data-git-row": entry.path,
					"data-status": entry.status,
					"data-selected": props.selected === true ? "" : void 0,
					"aria-selected": props.selected === true ? "true" : void 0
				}, props.onPick === void 0 ? null : pickBox(React, props), React.createElement("button", {
					type: "button",
					className: `gs-open`,
					title: label.title,
					"aria-label": label.title,
					onClick: (event) => {
						if (event.shiftKey || event.metaKey || event.ctrlKey) {
							props.onSelect?.(event);
							return;
						}
						const open = actions.find((action) => action.id === "resolve") ?? actions.find((action) => action.id === "diff");
						if (open !== void 0) open.run();
					}
				}, React.createElement("span", {
					className: `gs-letter`,
					"data-status": entry.status,
					"aria-hidden": true
				}, LETTERS[entry.status]), shortened(React, `gs-name`, label.name), label.directory === "" ? null : shortened(React, `gs-dir`, label.directory)), React.createElement("span", { className: `gs-actions` }, ...actions.map((action) => actionButton(React, action))));
			};
		}
		/**
		* The commit box that sits at the start of a row.
		*
		* Ticking is about the next commit, not about the row: the click must not reach
		* the button it sits beside, which would open the file's diff.
		* @param React - the loader's React.
		* @param props - the row, whose path names the box and whose handler records it.
		* @returns the checkbox.
		*/
		function pickBox(React, props) {
			const label = props.t("row.pick", { path: props.entry.path });
			return React.createElement("input", {
				type: "checkbox",
				className: `gs-pick`,
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
		/** One text whose middle gives way: an overflowing head, then a whole tail. */
		function shortened(React, className, text) {
			const parts = shortenPath(text);
			return React.createElement("span", { className }, React.createElement("span", { className: `gs-head` }, parts.head), parts.tail === "" ? null : React.createElement("span", { className: `gs-tail` }, parts.tail));
		}
		/** One row action as an icon button, labelled for pointer and assistive technology. */
		function actionButton(React, action) {
			return React.createElement("button", {
				key: action.id,
				type: "button",
				className: `gs-action`,
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
		/**
		* Build the stash group.
		* @param React - the loader's React.
		* @returns the component the panel draws under the change groups.
		*/
		function makeStashGroup(React) {
			/** One stash entry as a row, with the three actions that apply to it. */
			function StashRow(props) {
				const { entry, t, busy } = props;
				const ask = (prompt, run) => {
					if (!confirmStash(t, prompt)) return;
					run();
				};
				const actions = [
					{
						id: "apply",
						icon: "apply",
						label: t("stash.apply"),
						run: () => {
							props.apply(entry.index);
						}
					},
					{
						id: "pop",
						icon: "pop",
						label: t("stash.pop"),
						run: () => {
							ask({
								action: "pop",
								subject: entry.subject,
								index: entry.index
							}, () => {
								props.pop(entry.index);
							});
						}
					},
					{
						id: "drop",
						icon: "discard",
						label: t("stash.drop"),
						danger: true,
						run: () => {
							ask({
								action: "drop",
								subject: entry.subject,
								index: entry.index
							}, () => {
								props.drop(entry.index);
							});
						}
					}
				];
				return React.createElement("li", {
					className: `gs-row gs-stash-row`,
					"data-git-stash-row": String(entry.index)
				}, React.createElement("span", {
					className: `gs-stash-open`,
					title: entry.subject
				}, React.createElement("span", { className: `gs-sha` }, `stash@{${entry.index}}`), React.createElement("span", { className: `gs-stash-subject` }, entry.subject)), React.createElement("span", { className: `gs-actions` }, ...actions.map((action) => React.createElement("button", {
					key: action.id,
					type: "button",
					className: `gs-action`,
					"aria-label": action.label,
					title: action.label,
					"data-git-stash-action": action.id,
					...action.danger === true ? { "data-danger": "" } : {},
					disabled: busy,
					onClick: action.run
				}, Icon(React, action.icon)))));
			}
			/** The group: its head, its store button, and the entries. */
			function StashGroup(props) {
				const { entries, canStash, busy, t } = props;
				if (entries.length === 0 && !canStash) return null;
				const store = React.createElement("button", {
					type: "button",
					className: `gs-action`,
					"aria-label": t("stash.current"),
					title: canStash ? t("stash.current") : t("stash.currentDisabled"),
					"data-action": "stash-current",
					"data-git-action": "stash-current",
					"data-git-stash-current": "",
					disabled: busy || !canStash,
					onClick: props.stash
				}, Icon(React, "stash"));
				return React.createElement("section", {
					className: `gs-group gs-stash-group`,
					"data-git-stash": "",
					"data-count": entries.length
				}, props.headless === true ? React.createElement("div", { className: `gs-group-head gs-group-head-actions` }, React.createElement("span", { className: `gs-group-actions` }, store)) : React.createElement("div", { className: `gs-group-head` }, React.createElement("h3", { className: `gs-group-title` }, t("stash.group")), React.createElement("span", { className: `gs-count` }, String(entries.length)), React.createElement("span", { className: `gs-group-actions` }, store)), entries.length === 0 ? React.createElement("p", {
					className: `gs-group-note`,
					role: "status"
				}, t("stash.empty")) : React.createElement("ul", { className: `gs-list` }, ...entries.map((entry) => React.createElement(StashRow, {
					key: `${entry.index}:${entry.subject}`,
					entry,
					...props
				}))));
			}
			return StashGroup;
		}
		// src/client/panes.ts
		/**
		* The height each region starts at, and returns to when its handle is told Home.
		*
		* The commit region is the tallest of the three because its message field is a
		* fixed block: a region shorter than the box clips the field's last line, and the
		* reader has to scroll a region that looks like it should simply fit. The three
		* together still leave room inside the several hundred pixels a sidebar gives the
		* panel with the branch header above them.
		*/
		const PANE_DEFAULTS = {
			changes: 200,
			commit: 224,
			history: 231
		};
		/** Every region expanded: what a fresh panel starts with. */
		const PANES_EXPANDED = {
			changes: false,
			commit: false,
			history: false
		};
		/**
		* How small each region may get, which is what its content can survive.
		*
		* The change list keeps its tab row and lets the list scroll under it; the commit
		* box keeps its amend row, a single line of message, and its buttons; the history
		* keeps its head and a couple of rows. A shared floor would either cut the commit
		* box's buttons off or stop the list from ever giving its room away.
		*/
		const PANE_FLOOR = {
			changes: 64,
			commit: 172,
			history: 120
		};
		/**
		* Round one region's height down to a whole number of rows.
		*
		* The history draws rows of a fixed height, so a region whose content box is not
		* a multiple of that height always cuts its last row in half — the one thing a
		* reader notices immediately, because it looks like the list is broken rather
		* than scrollable. Rounding the height instead keeps every row whole, and the
		* cost is at most one row of empty space.
		* @param id - the region being sized.
		* @param size - the height asked for.
		* @param rowHeight - the height of one row of that region's content.
		* @param chrome - what the region spends above its rows.
		* @returns the height to use, snapped when the region has fixed rows.
		*/
		function snapPaneSize(id, size, rowHeight, chrome = 0) {
			if (id !== "history") return size;
			return chrome + Math.max(3, Math.floor((size - chrome) / rowHeight)) * rowHeight;
		}
		/** The class a drag puts on `body`, which is what keeps it from selecting text. */
		const DRAGGING_CLASS = `gs-dragging`;
		/**
		* Hold one height inside the range every region shares.
		* @param size - the height asked for.
		* @returns the height a region can actually take.
		*/
		function clampPaneSize(size) {
			return Math.max(120, Math.min(900, Math.round(size)));
		}
		/**
		* The height one drag produces.
		* @param size - the height the drag started from.
		* @param delta - how far the pointer moved, positive for taller.
		* @returns the clamped height.
		*/
		function resizePaneSize(size, delta) {
			return clampPaneSize(size + delta);
		}
		/**
		* The height one key press produces.
		*
		* The handle sits on the region's top edge, so up is taller for it as well.
		* A key the handle does not own returns nothing, which is how the panel knows
		* to leave the event alone.
		* @param id - the region whose handle was pressed.
		* @param size - the region's height now.
		* @param key - the key the handle received.
		* @param step - how far one press moves it, which a row-based region rounds up.
		* @returns the new height, or undefined for a key the handle ignores.
		*/
		function paneKeySize(id, size, key, step = 16) {
			if (key === "ArrowUp") return resizePaneSize(size, step);
			if (key === "ArrowDown") return resizePaneSize(size, -step);
			if (key === "Home") return PANE_DEFAULTS[id];
		}
		/**
		* Follow one pointer until it is released.
		*
		* The listeners are on the window rather than on the handle: a pointer that
		* leaves the six-pixel strip mid-drag must keep resizing, which is the whole
		* reason the strip exists. The returned function removes them, and the panel
		* calls it from the cleanup of the effect that owns the drag, so a panel closed
		* mid-drag leaves nothing listening.
		* @param options - the starting height, the starting pointer, and the callback.
		* @returns the function that ends the drag.
		*/
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
		/**
		* Turn the no-select treatment on or off while a drag runs.
		*
		* Without it a drag across the list selects every row label it passes over,
		* which the reader then has to clear by hand.
		* @param on - whether a drag is running.
		*/
		function setDragging(on) {
			if (typeof document === "undefined" || document.body === null) return;
			if (on) document.body.classList.add(DRAGGING_CLASS);
			else document.body.classList.remove(DRAGGING_CLASS);
		}
		/**
		* Draw one region: its resize strip, its title, and what it holds.
		*
		* A plain function rather than a component: the panel owns the heights and the
		* collapsed flags, so this must not hold hooks of its own.
		* @param React - the loader's React.
		* @param props - the region's facts and the callbacks its controls fire.
		* @returns the region.
		*/
		function gitPane(React, props) {
			const { id, size, collapsed, t } = props;
			return React.createElement("section", {
				className: `gs-pane`,
				"data-git-pane": id,
				"data-git-pane-size": String(size),
				"data-collapsed": collapsed ? "" : void 0,
				style: collapsed ? void 0 : {
					flexGrow: props.grow === true ? 1 : 0,
					flexShrink: 0,
					flexBasis: `${size}px`
				}
			}, React.createElement("div", {
				className: `gs-pane-resize`,
				"data-git-pane-handle": id,
				role: "separator",
				"aria-orientation": "horizontal",
				"aria-label": t("pane.resize"),
				"aria-valuenow": String(size),
				"aria-valuemin": String(120),
				"aria-valuemax": String(900),
				tabIndex: 0,
				onPointerDown: props.onResizeStart,
				onKeyDown: props.onResizeKey
			}), React.createElement("div", { className: `gs-pane-head` }, React.createElement("button", {
				type: "button",
				className: `gs-pane-toggle`,
				"data-git-pane-toggle": id,
				"aria-expanded": collapsed ? "false" : "true",
				title: t(collapsed ? "pane.expand" : "pane.collapse"),
				onClick: props.onToggle
			}, Icon(React, collapsed ? "chevron" : "expand", { size: 16 }), React.createElement("h3", { className: `gs-group-title` }, props.title))), React.createElement("div", { className: `gs-pane-body` }, collapsed ? null : props.content));
		}
		// src/client/conflict-view.ts
		/** The three ways one region can be resolved. */
		const CHOICES = [
			{
				id: "ours",
				key: "conflict.ours"
			},
			{
				id: "theirs",
				key: "conflict.theirs"
			},
			{
				id: "both",
				key: "conflict.both"
			}
		];
		/**
		* Build the conflict view.
		* @param React - the loader's React.
		* @returns the component the panel draws in place of the change list.
		*/
		function makeConflictView(React) {
			/** One conflict region: both sides, and the three buttons that pick one. */
			function Region(props) {
				const { segment, index, choice, busy, t } = props;
				return React.createElement("div", {
					className: `gs-conflict-region`,
					"data-git-conflict-region": String(index),
					"data-choice": choice
				}, React.createElement("div", {
					className: `gs-conflict-side`,
					"data-side": "ours"
				}, React.createElement("span", { className: `gs-conflict-label` }, segment.oursLabel === "" ? t("conflict.ours") : segment.oursLabel), React.createElement("pre", { className: `gs-conflict-text` }, segment.ours.join("\n"))), React.createElement("div", {
					className: `gs-conflict-side`,
					"data-side": "theirs"
				}, React.createElement("span", { className: `gs-conflict-label` }, segment.theirsLabel === "" ? t("conflict.theirs") : segment.theirsLabel), React.createElement("pre", { className: `gs-conflict-text` }, segment.theirs.join("\n"))), React.createElement("div", { className: `gs-conflict-choices` }, ...CHOICES.map((entry) => React.createElement("button", {
					key: entry.id,
					type: "button",
					className: `gs-conflict-choice`,
					"data-git-conflict-choice": entry.id,
					"aria-pressed": choice === entry.id ? "true" : "false",
					"data-active": choice === entry.id ? "" : void 0,
					disabled: busy,
					onClick: () => {
						props.choose(index, entry.id);
					}
				}, t(entry.key)))));
			}
			/** The view: the path, each region, and the controls that finish the file. */
			return function ConflictView(props) {
				const { path, content, busy, t, choices } = props;
				const regions = content !== void 0 && content.kind === "marked" ? content.segments.filter((segment) => segment.kind === "conflict") : [];
				const head = React.createElement("div", { className: `gs-conflict-head` }, React.createElement("span", {
					className: `gs-conflict-path`,
					title: path
				}, path), React.createElement("button", {
					type: "button",
					className: `gs-tool`,
					"aria-label": t("conflict.close"),
					title: t("conflict.close"),
					onClick: props.close
				}, Icon(React, "chevron", { size: 14 })));
				if (content === void 0) return React.createElement("section", {
					className: `gs-conflict`,
					"data-git-conflict": path
				}, head, React.createElement("p", {
					className: `gs-state-line`,
					role: "status"
				}, t("conflict.loading")));
				if (content.kind === "error") return React.createElement("section", {
					className: `gs-conflict`,
					"data-git-conflict": path
				}, head, React.createElement("p", {
					className: `gs-state-line`,
					role: "alert"
				}, content.message));
				if (content.kind === "resolved") return React.createElement("section", {
					className: `gs-conflict`,
					"data-git-conflict": path
				}, head, React.createElement("p", {
					className: `gs-state-line`,
					role: "status"
				}, t("conflict.clean")), React.createElement("div", { className: `gs-conflict-actions` }, React.createElement("button", {
					type: "button",
					className: `gs-commit-submit`,
					"data-git-conflict-submit": "",
					disabled: busy,
					onClick: props.submit
				}, t("conflict.markResolved"))));
				return React.createElement("section", {
					className: `gs-conflict`,
					"data-git-conflict": path
				}, head, React.createElement("div", { className: `gs-conflict-list` }, ...regions.map((segment, index) => React.createElement(Region, {
					key: index,
					segment,
					index,
					choice: regionChoice(choices, index),
					busy,
					t,
					choose: props.choose
				}))), React.createElement("div", { className: `gs-conflict-actions` }, React.createElement("button", {
					type: "button",
					className: `gs-commit-submit`,
					"data-git-conflict-submit": "",
					disabled: busy,
					onClick: props.submit
				}, t("conflict.markResolved"))));
			};
		}
		/**
		* The choice made for one region, defaulting to keeping both sides.
		* @param choices - the recorded choices.
		* @param index - the region's position.
		* @returns the choice in force.
		*/
		function regionChoice(choices, index) {
			return choices[index] ?? "both";
		}
		/**
		* Fold one resolved file's outcome into the notice the panel shows.
		* @param outcome - what the Host answered.
		* @param t - the panel's translator.
		* @returns the sentence to show, or the empty string when it succeeded.
		*/
		function conflictNotice(outcome, t) {
			return outcome.ok ? "" : outcome.message === "" ? t("notice.resolveFailed") : outcome.message;
		}
		// src/client/list-model.ts
		/**
		* Compose the key one row is selected under.
		* @param group - which group the row belongs to.
		* @param path - the repository-relative path.
		* @returns the key.
		*/
		function selectionKey(group, path) {
			return `${group}:${path}`;
		}
		/**
		* Add or remove one path from the commit picks.
		*
		* The picks are one set across both groups: the same path may appear in the
		* staged list and the changes list, and ticking either ticked it for the commit.
		* @param picks - the paths picked so far.
		* @param path - the path whose box changed.
		* @param picked - whether the box is now ticked.
		* @returns the new set of paths.
		*/
		function togglePick(picks, path, picked) {
			if (!picked) return picks.filter((existing) => existing !== path);
			return picks.includes(path) ? [...picks] : [...picks, path];
		}
		/**
		* The entries a range selection covers, in list order.
		*
		* Shift-click means "everything between the two clicks", which requires the
		* order the list draws; an anchor that the filter has hidden yields just the
		* clicked entry rather than a surprise span.
		* @param entries - the entries as the list draws them.
		* @param anchor - the path the range starts at.
		* @param target - the path the reader just clicked.
		* @returns the paths the range selects, or only the target when the anchor is gone.
		*/
		function rangeBetween(entries, anchor, target) {
			if (anchor === null) return [target];
			const paths = entries.map((entry) => entry.path);
			const from = paths.indexOf(anchor);
			const to = paths.indexOf(target);
			if (from < 0 || to < 0) return [target];
			const [start, end] = from <= to ? [from, to] : [to, from];
			return paths.slice(start, end + 1);
		}
		// src/client/panel-cache.ts
		/**
		* Create an empty cache.
		*
		* One instance is created per plugin activation and handed to every panel body,
		* so closing the panel tab and opening it again reads what the previous mount
		* already asked for.
		* @returns the cache.
		*/
		function createPanelCache() {
			return {
				status: /* @__PURE__ */ new Map(),
				stashes: /* @__PURE__ */ new Map(),
				history: /* @__PURE__ */ new Map()
			};
		}
		/**
		* Forget everything cached for one Session.
		*
		* This is the refresh path, and the only one: writes do not call it, because a
		* write answers with the new snapshot and clearing first would make the panel
		* ask for the data it is about to be handed.
		* @param cache - the cache to clear.
		* @param sessionId - the Session whose entries go.
		*/
		function invalidateSession(cache, sessionId) {
			cache.status.delete(sessionId);
			cache.stashes.delete(sessionId);
			cache.history.delete(sessionId);
		}
		/**
		* Forget every Session's entries.
		*
		* The agent tools change the checkout a Session reads without the panel seeing a
		* write, so the next mount must not paint a snapshot that belongs to the
		* repository the reader just left. Clearing all Sessions is enough and needs no
		* Session identity, which a tool card does not carry.
		* @param cache - the cache to clear.
		*/
		function invalidateAll(cache) {
			cache.status.clear();
			cache.stashes.clear();
			cache.history.clear();
		}
		/**
		* Replace what is cached for one Session with a page that has just arrived.
		* @param cache - the cache to update.
		* @param sessionId - the Session the page belongs to.
		* @param snapshot - the snapshot the Host answered with.
		*/
		function rememberStatus(cache, sessionId, snapshot) {
			cache.status.set(sessionId, snapshot);
		}
		/**
		* Replace the cached stash list for one Session.
		* @param cache - the cache to update.
		* @param sessionId - the Session the list belongs to.
		* @param entries - the entries the Host answered with.
		*/
		function rememberStashes(cache, sessionId, entries) {
			cache.stashes.set(sessionId, entries);
		}
		/**
		* Drop the cached history for one Session, keeping its snapshot and stashes.
		*
		* A commit, a checkout, a merge, or a stash changes the newest rows of the log
		* but leaves the working tree snapshot the write already reported; only the
		* history has to be read again, and only when the panel draws it.
		* @param cache - the cache to update.
		* @param sessionId - the Session whose history goes.
		*/
		function forgetHistory(cache, sessionId) {
			cache.history.delete(sessionId);
		}
		/**
		* Append one page to the cached history.
		*
		* A page that starts at zero replaces what is stored, which is what a Session
		* switch or a first read does; any later page extends it. The stored page then
		* covers exactly the rows the list is showing, so reopening the panel renders
		* them without a request.
		* @param cache - the cache to update.
		* @param sessionId - the Session the page belongs to.
		* @param page - the commits and whether more follow.
		*/
		function appendHistory(cache, sessionId, page) {
			cache.history.set(sessionId, page);
		}
		// src/client/panel.ts
		/** A snapshot to read while nothing has arrived yet. */
		const EMPTY_SNAPSHOT = {
			kind: "repository",
			staged: [],
			unstaged: [],
			conflicts: [],
			identity: {
				name: null,
				email: null
			}
		};
		/** What the branch picker shows when the listing could not be read at all. */
		const EMPTY_BRANCHES = {
			current: null,
			local: [],
			remote: []
		};
		/** What the history shows when the page could not be read at all. */
		const EMPTY_PAGE = {
			commits: [],
			hasMore: false,
			total: 0
		};
		/** What the repository picker shows when the scan could not run at all. */
		const EMPTY_REPOS = {
			scanRoot: "",
			depth: 0,
			selected: null,
			entries: [],
			truncated: false,
			warnings: []
		};
		/**
		* Refusals the reader is told about where they are looking, not only in the
		* notice line: each of them answers a branch action with a repository fact the
		* reader cannot see from the panel's own state.
		*/
		const REFUSAL_ALERTS = /* @__PURE__ */ new Set([
			"dirty",
			"exists",
			"invalid-name"
		]);
		/**
		* The first choice per region: keep both sides.
		*
		* Keeping both never discards a line, so the default is the one a reader cannot
		* regret; picking a side is the deliberate narrowing that follows.
		* @param content - what the Host read.
		* @returns one choice per region.
		*/
		function defaultChoices(content) {
			if (content.kind !== "marked") return [];
			return content.segments.filter((segment) => segment.kind === "conflict").map(() => "both");
		}
		/**
		* Build the panel body.
		* @param React - the loader's React.
		* @param runtime - the Remote handle, copy, and the tab accessor.
		* @returns the component the Sidebar registers under the panel's id.
		*/
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
			/** The panel: one snapshot, one message, and the writes that change them. */
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
				/**
				* What the history list compares to decide whether to read again.
				*
				* It starts at whatever the last write produced, and every invalidating
				* action bumps it, so the list reads a dropped cache exactly once instead of
				* on every render of the panel.
				*/
				const [historyRevision, setHistoryRevision] = React.useState("");
				/**
				* Read the snapshot, through the cache when it is there.
				*
				* A hit paints at once and stops: a cache that still asked the Host would
				* save nothing, since the wait is what the reader notices, not the parse.
				* @param force - ignore the cache and read the Host.
				* @returns a promise that settles when the snapshot on screen is current.
				*/
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
					await runtime.api.ready.then((api) => api.status(sessionId)).catch((error) => unavailableSnapshot(messageOf$2(error), "failed")).then((next) => {
						rememberStatus(cache, sessionId, next);
						setSnapshot(next);
						setLoading(false);
					});
				}, [sessionId]);
				React.useEffect(() => {
					load();
				}, [load]);
				/**
				* Read the stash entries, through the cache when it is there.
				* @param force - ignore the cache and read the Host.
				* @returns a promise that settles when the list on screen is current.
				*/
				const loadStashes = React.useCallback(async (force = false) => {
					if (sessionId === "") return;
					const cached = force ? void 0 : cache.stashes.get(sessionId);
					if (cached !== void 0) {
						setStashes(cached);
						return;
					}
					await runtime.api.ready.then((api) => api.stashes(sessionId)).catch(() => []).then((entries) => {
						rememberStashes(cache, sessionId, entries);
						setStashes(entries);
					});
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
					branches: () => runtime.api.ready.then((api) => api.branches(sessionId)).catch(() => EMPTY_BRANCHES),
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
				/**
				* Read the history page, caching the first one and extending it after that.
				*
				* The page a reader already saw is the page they expect to see again, and a
				* commit invalidates it explicitly, so nothing here has to guess when the
				* log moved.
				*
				* A preview reads past the cache on purpose: the page belongs to a ref the
				* reader is only looking at, and storing it under the Session would make the
				* checkout's own first page wrong as soon as the preview ends.
				*/
				const readHistory = (limit, skip) => {
					if (preview !== null) return calls.history(limit, skip, preview);
					const cached = cache.history.get(sessionId);
					if (cached !== void 0 && skip === 0) return Promise.resolve(cached);
					return calls.history(limit, skip).then((page) => {
						if (skip === 0) {
							appendHistory(cache, sessionId, {
								commits: page.commits,
								hasMore: page.hasMore,
								total: page.total
							});
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
				/**
				* Drop the cached history and make the list read it once more.
				*
				* A commit moves the head, a checkout moves the branch, and a stash moves
				* work out of the tree: all three change the newest rows of the log, so the
				* page the list is showing is wrong for exactly as long as it takes the
				* reader to scroll it. The revision is what the list watches.
				*/
				const dropHistory = () => {
					forgetHistory(cache, sessionId);
					setHistoryRevision(`${Date.now()}:${Math.random()}`);
				};
				/**
				* Run one write and settle the panel from its reply.
				* @param action - the Host call.
				* @param failure - the sentence to show when the Host gives no reason.
				* @param effect - what else the write left stale: the log's newest rows, the
				* stash list, or neither. The snapshot never needs this, because every
				* success already carries the new one.
				* @param after - what follows a success, such as the action a confirmed
				* preview checkout was asked for.
				*/
				const write = (action, failure, effect = void 0, after) => {
					setNotice("");
					setBusy(true);
					action().catch((error) => ({
						ok: false,
						problem: "failed",
						message: messageOf$2(error)
					})).then((outcome) => {
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
						if (REFUSAL_ALERTS.has(outcome.problem)) notify(t, text);
					});
				};
				/**
				* Throw the Session's cache away and read everything again.
				*
				* This is the one forced read: every other path either has a fresh answer in
				* hand (a write) or is content with what the cache holds.
				*/
				const refresh = () => {
					setNotice("");
					setRefreshing(true);
					invalidateSession(cache, sessionId);
					runtime.clearDiffCache?.();
					dropHistory();
					Promise.all([load(true), loadStashes(true)]).finally(() => {
						setRefreshing(false);
					});
				};
				/**
				* Describe another branch without moving the checkout.
				*
				* Only the header and the history change: the working tree, the index, the
				* stashes and the commit box still belong to the checkout, which is what the
				* bar under the header states.
				* @param branch - the local branch to read.
				*/
				const previewBranch = (branch) => {
					setNotice("");
					setPreview(branch);
					setConflict(null);
					clearSelection();
				};
				/** Go back to describing the checkout; the cached page brings it back. */
				const exitPreview = () => {
					setNotice("");
					setPreview(null);
				};
				/**
				* Check a branch out, then run what asked for the checkout.
				*
				* A confirmed preview stops describing another branch and starts describing
				* the checkout, so the preview is cleared here rather than in every caller.
				* @param branch - the branch to check out.
				* @param then - what to run once the checkout landed; skipped on refusal.
				*/
				const checkoutAndThen = (branch, then) => {
					write(() => calls.checkout(branch), t("notice.checkoutFailed"), "log", () => {
						setPreview(null);
						then?.();
					});
				};
				/**
				* Run one action that belongs to the branch being previewed.
				*
				* A preview moves nothing, so an action that acts on the previewed branch
				* cannot run as it stands: the reader is asked, and a confirmed answer checks
				* the branch out before the action runs. Without a preview the action is
				* simply run.
				* @param action - what to do once the branch is the checkout.
				*/
				const onPreviewed = (action) => {
					const branch = preview;
					if (branch === null) {
						action();
						return;
					}
					confirmPreviewCheckout(t, branch, current().branch ?? null).then((agreed) => {
						if (!agreed) return;
						checkoutAndThen(branch, action);
					});
				};
				/**
				* Read another checkout of the Session's directory tree.
				*
				* Everything the panel remembers belongs to the checkout it was read from, so
				* a successful switch drops all of it: the snapshot, the stashes, the history
				* page, and the patches. The Host answers with the new checkout's snapshot,
				* which is what the list paints from, so the switch costs no second read.
				* @param root - the checkout to read; undefined returns to the working directory.
				*/
				const switchRepository = (root) => {
					setNotice("");
					setBusy(true);
					setRefreshing(true);
					calls.selectRepository(root).then((outcome) => {
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
						loadStashes(true);
					});
				};
				/**
				* Stage the given paths, or the whole unstaged group when none are given.
				* @param paths - the paths the group action applies to.
				*/
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
				/**
				* Discard the given paths, asking first and naming what is untracked.
				* @param paths - the paths the group action applies to.
				*/
				const discardPaths = (paths) => {
					const entries = current().unstaged.filter((entry) => paths.includes(entry.path));
					if (entries.length === 0) return;
					const files = entries.map((entry) => entry.path);
					const untracked = entries.filter((entry) => entry.status === "untracked").map((entry) => entry.path);
					confirmDiscard(t, {
						files,
						untracked
					}).then((agreed) => {
						if (!agreed) return;
						clearSelection();
						write(() => calls.discard(files, untracked.length > 0), t("notice.discardFailed"));
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
				/**
				* Check out one commit rather than a branch.
				*
				* Git accepts an object name wherever it accepts a ref, so this is the same
				* call the branch picker makes; what differs is that it leaves a detached
				* head, which is why the reader is asked first.
				* @param sha - the commit to check out.
				*/
				const checkoutCommit = (sha) => {
					onPreviewed(() => {
						confirmDetach(t, sha.slice(0, 7)).then((agreed) => {
							if (!agreed) return;
							write(() => calls.checkout(sha), t("notice.checkoutFailed"), "log");
						});
					});
				};
				/**
				* Start a branch at one commit and move onto it.
				*
				* The Host creates it with `checkout -b`, so this both names the branch and
				* switches to it — the same thing the header's new-branch field does, only
				* from an older commit instead of the current head.
				* @param sha - the commit the branch starts at.
				*/
				const branchFromCommit = (sha) => {
					onPreviewed(() => {
						askBranchName(t, sha.slice(0, 7)).then((name) => {
							if (name === null) return;
							write(() => calls.createBranch(name, sha), t("notice.createBranchFailed"), "log", () => {
								setPreview(null);
							});
						});
					});
				};
				/**
				* Put one commit's object name on the clipboard.
				*
				* The full name rather than the abbreviation, because the reason to copy it
				* is to paste it somewhere that resolves it.
				* @param sha - the commit whose name is copied.
				*/
				const copyCommit = (sha) => {
					const clipboard = navigator.clipboard;
					if (clipboard === void 0) {
						notify(t, t("notice.copyFailed"));
						return;
					}
					clipboard.writeText(sha).then(() => {
						setNotice(t("notice.copied", { short: sha.slice(0, 7) }));
					}).catch(() => {
						notify(t, t("notice.copyFailed"));
					});
				};
				/**
				* Ask the model for a commit message and put it in the field.
				*
				* The draft describes the index when anything is staged, because that is
				* what the commit will actually contain; otherwise it describes the working
				* tree, which is what the buttons would stage.
				*/
				const draftMessage = () => {
					setNotice("");
					setDrafting(true);
					calls.generateMessage(current().staged.length > 0).catch((error) => ({
						ok: false,
						problem: "failed",
						message: messageOf$2(error)
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
					confirmSync(t, action, current().upstream?.name ?? null).then((agreed) => {
						if (!agreed) return;
						runSync(action);
					});
				};
				/** The read the confirmation guards: a sync the reader agreed to. */
				const runSync = (action) => {
					setNotice("");
					setBusy(true);
					calls.sync(action).catch((error) => ({
						ok: false,
						problem: "failed",
						message: messageOf$2(error)
					})).then((outcome) => {
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
				/** Open one conflicted file: read its regions and clear the previous choice. */
				const openConflict = (path) => {
					setConflict({
						path,
						content: void 0,
						choices: []
					});
					runtime.api.ready.then((api) => api.conflict(sessionId, path)).catch((error) => ({
						kind: "error",
						message: messageOf$2(error)
					})).then((content) => {
						setConflict((open) => open === null || open.path !== path ? open : {
							path,
							content,
							choices: defaultChoices(content)
						});
					});
				};
				/** Record one region's choice, leaving the others alone. */
				const chooseRegion = (index, choice) => {
					setConflict((open) => {
						if (open === null) return open;
						const choices = [...open.choices];
						choices[index] = choice;
						return {
							...open,
							choices
						};
					});
				};
				const resolveOpenConflict = () => {
					if (conflict === null) return;
					const { path, choices } = conflict;
					setBusy(true);
					setNotice("");
					runtime.api.ready.then((api) => api.resolveConflict(sessionId, path, choices)).catch((error) => ({
						ok: false,
						problem: "failed",
						message: messageOf$2(error)
					})).then((outcome) => {
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
					confirmAbort(t, String(current().operation)).then((agreed) => {
						if (!agreed) return;
						write(() => runtime.api.ready.then((api) => api.abortOperation(sessionId)), t("notice.abortFailed"));
					});
				};
				/** Delete one branch; an unmerged branch asks again before forcing it. */
				const deleteBranch = (branch) => {
					confirmDeleteBranch(t, branch).then((agreed) => {
						if (agreed) removeBranch(branch);
					});
				};
				/** The delete the confirmation guards. */
				const removeBranch = (branch) => {
					setBusy(true);
					setNotice("");
					runtime.api.ready.then((api) => api.deleteBranch(sessionId, branch, false)).catch((error) => ({
						ok: false,
						problem: "failed",
						message: messageOf$2(error)
					})).then(async (outcome) => {
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
						confirmForceDelete(t, branch).then((forced) => {
							if (!forced) return;
							write(() => runtime.api.ready.then((api) => api.deleteBranch(sessionId, branch, true)), t("notice.deleteFailed"));
						});
					});
				};
				/** Merge one branch; a conflict leaves the merge in progress for the conflict view. */
				const merge = (branch) => {
					if (preview !== null) {
						onPreviewed(() => {
							mergeInto(branch);
						});
						return;
					}
					confirmMerge(t, branch, current().branch ?? null).then((agreed) => {
						if (!agreed) return;
						mergeInto(branch);
					});
				};
				/** The merge the questions guard. */
				const mergeInto = (branch) => {
					write(() => runtime.api.ready.then((api) => api.mergeBranch(sessionId, branch)), t("notice.mergeFailed"), "log");
				};
				/**
				* Commit the written message, amending or staging everything when asked.
				*
				* Ticked paths narrow the commit to those files; a stage-all commit decides
				* its own content, so the ticks do not apply to it.
				* @param stageAll - stage every tracked change first, for a commit with an
				* empty index.
				*/
				const commitWith = (stageAll) => {
					const text = message.trim();
					if (text === "") return;
					setNotice("");
					setBusy(true);
					const paths = stageAll || picked.length === 0 ? void 0 : [...picked];
					const options = paths === void 0 ? {
						amend,
						stageAll
					} : {
						amend,
						stageAll,
						paths
					};
					calls.commit(text, options).catch((error) => ({
						ok: false,
						problem: "failed",
						message: messageOf$2(error)
					})).then((outcome) => {
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
				/**
				* Commit, then push the branch.
				*
				* The push is the second half of one gesture, so it runs only when the
				* commit succeeded: a failed commit leaves nothing new to send, and asking
				* about a push for a write that never happened would be a question about
				* nothing.
				* @param stageAll - whether to stage every tracked change first.
				*/
				const commitAndPush = (stageAll) => {
					const text = message.trim();
					if (text === "") return;
					confirmSync(t, "push", current().upstream?.name ?? null).then((agreed) => {
						if (!agreed) return;
						pushAfterCommit(text, stageAll);
					});
				};
				/** The write the confirmation guards: a commit followed by its push. */
				const pushAfterCommit = (text, stageAll) => {
					setNotice("");
					setBusy(true);
					const paths = stageAll || picked.length === 0 ? void 0 : [...picked];
					const options = paths === void 0 ? {
						amend,
						stageAll
					} : {
						amend,
						stageAll,
						paths
					};
					calls.commit(text, options).catch((error) => ({
						ok: false,
						problem: "failed",
						message: messageOf$2(error)
					})).then((outcome) => {
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
						return calls.sync("push").catch((error) => ({
							ok: false,
							problem: "failed",
							message: messageOf$2(error)
						})).then((pushed) => {
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
					const diffAction = {
						id: "diff",
						icon: "diff",
						label: t("row.diff"),
						run: openDiff
					};
					if (conflicted) return [{
						id: "resolve",
						icon: "merge",
						label: t("row.resolve"),
						run: () => {
							openConflict(entry.path);
						}
					}, diffAction];
					if (staged) return [{
						id: "unstage",
						icon: "unstage",
						label: t("row.unstage"),
						run: () => {
							write(() => calls.unstage([entry.path]), t("notice.unstageFailed"));
						}
					}, diffAction];
					const discard = () => {
						const untracked = entry.status === "untracked";
						confirmDiscard(t, {
							files: [entry.path],
							untracked: untracked ? [entry.path] : []
						}).then((agreed) => {
							if (!agreed) return;
							write(() => calls.discard([entry.path], untracked), t("notice.discardFailed"));
						});
					};
					return [
						{
							id: "stage",
							icon: "stage",
							label: t("row.stage"),
							run: () => {
								write(() => calls.stage([entry.path]), t("notice.stageFailed"));
							}
						},
						{
							id: "discard",
							icon: "undo",
							label: t("row.discard"),
							danger: true,
							run: discard
						},
						diffAction
					];
				};
				/** The history section is open exactly while its region is expanded. */
				const historyOpen = !collapsedPanes.history;
				/**
				* The region above one region, which lends it the room its handle takes.
				*
				* The three regions fill the body, so one of them cannot grow without another
				* giving way: without that trade the column simply gets taller than the body
				* and scrolls, and a drag looks like the content sliding rather than a region
				* changing size.
				* @param id - the region whose handle moved.
				* @returns the region above it, or undefined for the topmost one.
				*/
				const aboveOf = (id) => id === "history" ? ["commit", "changes"] : id === "commit" ? ["changes"] : [];
				/**
				* Set one region's height, taking the difference from the regions above it.
				*
				* A region cannot grow without another giving way, or the column would get
				* taller than the body and scroll. The room comes from the nearest region
				* above first and then from the ones further up, each down to its own floor:
				* dragging the history taller shrinks the commit box to its single line before
				* it starts taking the change list's room, which is the order a reader expects
				* from the way the regions are stacked. Shrinking gives the room back the same
				* way.
				* @param id - the region.
				* @param size - the height it should take.
				*/
				/**
				* The height the growing region has beyond the height the reader gave it.
				*
				* The change list grows into whatever the other regions leave, so part of what
				* it draws is not its own: a drag has to spend that surplus before it can ask
				* another region to give anything up, which is what makes the blank disappear
				* first and the regions above start moving only after it is gone.
				* @returns the surplus height in pixels, or zero outside a browser.
				*/
				const slackOf = () => {
					if (typeof document === "undefined" || typeof document.querySelector !== "function") return 0;
					const grown = document.querySelector(`[data-git-pane='changes']`);
					if (grown === null) return 0;
					return Math.max(0, Math.round(grown.getBoundingClientRect().height - paneSizes.changes));
				};
				const sizePane = (id, size) => {
					const slack = slackOf();
					setPaneSizes((previous) => {
						const wanted = snapPaneSize(id, clampPaneSize(size), 26, 75);
						const delta = wanted - previous[id];
						if (delta === 0) return previous;
						let remaining = delta > 0 ? delta - Math.min(delta, slack) : delta;
						const next = {
							...previous,
							[id]: wanted
						};
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
				/**
				* Fold one region to its title, or unfold it at the height it had.
				* @param id - the region.
				*/
				const togglePane = (id) => {
					setCollapsedPanes((previous) => ({
						...previous,
						[id]: !previous[id]
					}));
				};
				/**
				* Follow a pointer press on one region's handle until it is released.
				* @param id - the region.
				* @param event - the press, whose height the drag measures against.
				*/
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
				/**
				* Move one region's handle from the keyboard.
				* @param id - the region.
				* @param event - the key, which is only acted on when the handle owns it.
				*/
				const resizeByKey = (id, event) => {
					const next = paneKeySize(id, paneSizes[id], event.key, id === "history" ? 26 : void 0);
					if (next === void 0) return;
					event.preventDefault?.();
					sizePane(id, next);
				};
				React.useEffect(() => () => {
					drag.stop?.();
					drag.stop = void 0;
				}, []);
				/**
				* One region of the body: its handle, its title, and what it holds.
				* @param id - the region.
				* @param title - what the region is called.
				* @param content - what it holds while it is expanded.
				* @returns the region.
				*/
				const pane = (id, title, content) => gitPane(React, {
					id,
					title,
					size: paneSizes[id],
					collapsed: collapsedPanes[id],
					grow: id === "changes",
					t,
					content,
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
				/** The regions as one column, which is what scrolls when their heights do not fit. */
				const panes = (...regions) => React.createElement("div", {
					className: `gs-panes`,
					"data-git-panes": ""
				}, ...regions);
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
				/**
				* The commit box, which a clean tree and a dirty one both draw.
				*
				* A clean tree keeps it because amending the previous message is a
				* legitimate clean-tree operation, and the counts it shows are zero because
				* there is nothing to commit either way.
				* @param clean - whether the working tree and the index both match HEAD.
				* @returns the box.
				*/
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
				/**
				* The messages worth offering back: the newest subjects the cache holds.
				*
				* A reader who commits the same kind of change repeatedly wants the wording
				* they used last time, and the history page already carries it.
				*/
				const historyElement = () => React.createElement(History, {
					key: preview ?? "head",
					open: historyOpen,
					t,
					load: readHistory,
					tab,
					revision: historyRevision,
					branch: preview,
					onToggle: () => {
						togglePane("history");
					},
					onRefresh: refresh,
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
				/**
				* The entries the list draws, in the order the filter leaves them.
				*
				* The filter narrows the drawing only: the group actions keep using the
				* snapshot, because a hidden file the reader meant to keep must not become
				* the victim of "stage all" being told a shorter list.
				* @param entries - the group's entries.
				* @param staged - which group the entries come from, for the count.
				* @returns the entries to render.
				*/
				const visible = (entries, staged) => {
					const needle = filter.trim().toLowerCase();
					if (needle === "") return [...entries];
					return entries.filter((entry) => entry.path.toLowerCase().includes(needle));
				};
				/**
				* Act on the selection when one exists, otherwise on the whole group.
				* @param group - which group the clicked action belongs to.
				* @param fallback - the group's full path list.
				* @returns the paths the action applies to.
				*/
				const pathsFor = (group, fallback) => {
					const picked = selected.filter((key) => key.startsWith(`${group}:`)).map((key) => key.slice(group.length + 1));
					return picked.length > 0 ? picked : [...fallback];
				};
				const clearSelection = () => {
					setSelected([]);
					setAnchor(null);
				};
				/**
				* Record one commit box as ticked or unticked.
				*
				* Both groups feed one set, so a path staged and changed at once is ticked
				* by either row and appears once in the commit.
				* @param path - the row's repository-relative path.
				* @param on - whether the box is now ticked.
				*/
				const pickFile = (path, on) => {
					setPicked((current) => togglePick(current, path, on));
				};
				/**
				* Record one row click as a selection change.
				*
				* A plain modified click toggles one row; a shift click extends from the
				* last row clicked. Selection is per group, because the same path can be
				* staged and changed at once and the two rows act differently.
				* @param group - which group the row belongs to.
				* @param entries - the group's entries as the list draws them.
				* @param path - the clicked path.
				* @param range - whether shift was held.
				*/
				const selectRow = (group, entries, path, range) => {
					const key = selectionKey(group, path);
					if (range) {
						const span = rangeBetween(entries, anchor, path).map((picked) => selectionKey(group, picked));
						setSelected([.../* @__PURE__ */ new Set([...selected, ...span])]);
						return;
					}
					setAnchor(path);
					setSelected(selected.includes(key) ? selected.filter((existing) => existing !== key) : [...selected, key]);
				};
				/**
				* The change list, replaced by the conflict view while a conflicted file is
				* open: resolving one region needs its two sides on screen, which the list
				* has no room for.
				*/
				const bodyElement = (snapshotNow) => {
					if (conflict !== null) return React.createElement(ConflictView, {
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
					/**
					* The actions the current list offers, drawn beside the filter.
					*
					* They live here rather than on the group so the toolbar and the list
					* share one row: the group used to draw its own action row under the
					* filter, which cost a whole line for two buttons.
					*/
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
					return React.createElement("div", { className: `gs-body` }, notice === "" ? null : React.createElement("p", {
						className: `gs-notice`,
						role: "alert"
					}, notice), sectionTabs(React, t, section, {
						unstaged: snapshotNow.unstaged.length,
						staged: snapshotNow.staged.length,
						stashes: stashes.length
					}, setSection), sectionToolbar(React, t, {
						filter: section === "stashes" ? void 0 : filter,
						onFilter: setFilter,
						actions: sectionActions
					}), snapshotNow.conflicts.length === 0 ? null : changeGroup(React, {
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
					}), section !== "staged" ? null : changeGroup(React, {
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
					}), section !== "unstaged" ? null : changeGroup(React, {
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
					}), selected.length === 0 ? null : React.createElement("p", {
						className: `gs-selection`,
						"data-git-selection": String(selected.length),
						role: "status"
					}, t("list.selected", { count: selected.length }), React.createElement("button", {
						type: "button",
						className: `gs-selection-clear`,
						"data-git-selection-clear": "",
						onClick: clearSelection
					}, t("list.clear"))), section !== "stashes" ? null : React.createElement(StashGroup, {
						...stashProps(),
						headless: true
					}));
				};
				if (snapshot === void 0) return React.createElement("section", {
					className: `gs-root`,
					"data-git-panel": "",
					"data-git-cache": cacheState,
					...busy ? { "data-git-busy": "" } : {}
				}, React.createElement(Progress, { active: loading || refreshing }), React.createElement(BranchHeader, headerProps()), sessionId === "" ? stateBlock(React, t("state.noSession.title"), t("state.noSession.body")) : skeleton(React), React.createElement(DialogHost, null));
				if (snapshot.kind === "unavailable") {
					const problem = snapshot.problem ?? "failed";
					return React.createElement("section", {
						className: `gs-root`,
						"data-git-panel": "",
						"data-git-cache": cacheState,
						"data-problem": problem
					}, React.createElement(Progress, { active: loading || refreshing }), React.createElement(BranchHeader, headerProps()), stateBlock(React, t(`state.${problem}.title`), t(`state.${problem}.body`), snapshot.message), panes(pane("history", t("history.title"), historyElement())), React.createElement(DialogHost, null));
				}
				if (snapshot.staged.length + snapshot.unstaged.length + snapshot.conflicts.length === 0 && conflict === null) return React.createElement("section", {
					className: `gs-root`,
					"data-git-panel": "",
					"data-git-cache": cacheState,
					...busy ? { "data-git-busy": "" } : {}
				}, React.createElement(Progress, { active: loading || refreshing }), React.createElement(BranchHeader, headerProps()), notice === "" ? null : React.createElement("p", {
					className: `gs-notice`,
					role: "alert"
				}, notice), panes(pane("changes", t("group.changes"), React.createElement("div", null, stateBlock(React, t("state.clean.title"), t("state.clean.body")), React.createElement(StashGroup, stashProps()))), pane("commit", t("pane.commit"), commitBox(true)), pane("history", t("history.title"), historyElement())), React.createElement(DialogHost, null));
				return React.createElement("section", {
					className: `gs-root`,
					"data-git-panel": "",
					"data-git-cache": cacheState,
					...busy ? { "data-git-busy": "" } : {}
				}, React.createElement(Progress, { active: loading || refreshing }), React.createElement(BranchHeader, headerProps()), panes(pane("changes", t("group.changes"), bodyElement(snapshot)), pane("commit", t("pane.commit"), commitBox(false)), pane("history", t("history.title"), historyElement())), React.createElement(DialogHost, null));
			}
			return GitPanel;
		}
		/**
		* Open one file's diff as its own tab.
		*
		* A diff address uses the `dsh-resource://` scheme with this package's type
		* segment, so the Sidebar's resource controller accepts it: each file gets its
		* own tab, and repeated opens of the same file focus the existing one.
		* @param tab - the panel's own tab.
		* @param path - the changed file.
		* @param staged - which side of the index to read.
		*/
		function openFileDiff(tab, path, staged) {
			if (tab === void 0) return;
			tab.actions.openResource(diffAddress(path, staged), { kind: DIFF_TAB_KIND });
		}
		/**
		* Whether the repository has no author to commit with. A Host that could not
		* read the identity answers with both fields null, which a commit reports
		* precisely; the panel warns before that happens.
		* @param identity - what the snapshot carried.
		* @returns true when a commit is expected to be refused for a missing author.
		*/
		function isIdentityMissing(identity) {
			return identity.name === null || identity.email === null;
		}
		/**
		* The sentence a refused write shows.
		*
		* Three refusals say something about the repository that Git's own wording
		* states too technically: a dirty tree is the reason a checkout was declined,
		* an existing name is the reason a branch was not created, and an invalid name
		* is the reason Git rejected the spelling.
		* @param t - the panel's translator.
		* @param problem - the refusal code the Host returned.
		* @param message - the Host's own detail.
		* @param fallback - the panel's sentence for an unclassified failure.
		* @returns the text to show.
		*/
		function refusalText(t, problem, message, fallback) {
			if (problem === "dirty") return t("notice.dirty");
			if (problem === "exists") return t("notice.exists");
			if (problem === "invalid-name") return t("notice.invalidName");
			if (problem === "stale") return t("notice.stale");
			return message === "" ? fallback : message;
		}
		/** A repository switch that never reached the Host, folded into the refusal shape. */
		function failedSelect(error) {
			return {
				ok: false,
				problem: "failed",
				message: messageOf$2(error)
			};
		}
		/**
		* The sentence a failed draft shows.
		*
		* Two of the four reasons are actionable and get their own wording: nothing to
		* describe, and no model to ask. The other two carry the Host's own message,
		* which is more specific than anything the panel could compose.
		* @param t - the panel's translator.
		* @param problem - why the draft could not be written.
		* @param message - the Host's explanation.
		* @returns the sentence to show.
		*/
		function draftRefusal(t, problem, message) {
			if (problem === "no-changes") return t("notice.draftEmpty");
			if (problem === "not-configured") return t("notice.draftUnconfigured");
			return message === "" ? t("notice.draftFailed") : message;
		}
		/** One group: its title, its count, its group-level actions, and its rows. */
		function changeGroup(React, props) {
			const { title, count, rows, actions, tone } = props;
			return React.createElement("section", {
				className: `gs-group`,
				"data-git-group": props.group,
				"data-tone": tone,
				"data-count": count
			}, props.headless === true ? actions.length === 0 ? null : React.createElement("div", { className: `gs-group-head gs-group-head-actions` }, React.createElement("span", { className: `gs-group-actions` }, ...actions.map((action) => groupButton(React, action)))) : React.createElement("div", { className: `gs-group-head` }, React.createElement("h3", { className: `gs-group-title` }, title), React.createElement("span", { className: `gs-count` }, String(count)), React.createElement("span", { className: `gs-group-actions` }, ...actions.map((action) => groupButton(React, action)))), rows.length === 0 ? null : React.createElement("ul", { className: `gs-list` }, ...rows));
		}
		/**
		* The three lists as a tab strip.
		*
		* A count of zero is still worth a tab: it is what tells a reader the index is
		* empty without making them switch to look.
		* @param React - the loader's React.
		* @param t - the panel's translator.
		* @param current - the list on screen.
		* @param counts - how many entries each list holds.
		* @param pick - called with the tab the reader chose.
		* @returns the strip.
		*/
		function sectionTabs(React, t, current, counts, pick) {
			const tabs = [
				{
					id: "unstaged",
					label: t("group.changes"),
					count: counts.unstaged
				},
				{
					id: "staged",
					label: t("group.staged"),
					count: counts.staged
				},
				{
					id: "stashes",
					label: t("stash.group"),
					count: counts.stashes
				}
			];
			return React.createElement("div", {
				className: `gs-tabs`,
				"data-git-tabs": "",
				role: "tablist"
			}, ...tabs.map((tab) => React.createElement("button", {
				key: tab.id,
				type: "button",
				className: `gs-tab`,
				role: "tab",
				"data-git-tab": tab.id,
				"data-active": tab.id === current ? "" : void 0,
				"aria-selected": tab.id === current ? "true" : "false",
				onClick: () => {
					pick(tab.id);
				}
			}, React.createElement("span", { className: `gs-tab-label` }, tab.label), React.createElement("span", { className: `gs-count` }, String(tab.count)))));
		}
		/**
		* The strip under the tabs: the filter, and the actions the current list offers.
		*
		* One row rather than two. The actions belong to the list the filter narrows, so
		* a reader who types a filter and then stages everything does both in the same
		* place instead of looking down a line for the second half of the same job.
		* @param React - the loader's React.
		* @param t - the panel's translator.
		* @param view - the filter's value and setter, and the actions to draw.
		* @returns the strip.
		*/
		function sectionToolbar(React, t, view) {
			return React.createElement("div", { className: `gs-toolbar` }, view.filter === void 0 ? React.createElement("span", { className: `gs-toolbar-fill` }) : React.createElement("input", {
				type: "search",
				className: `gs-filter`,
				"data-git-filter": "",
				value: view.filter,
				placeholder: t("list.filter"),
				"aria-label": t("list.filter"),
				spellCheck: false,
				onChange: (event) => {
					view.onFilter(event.target.value);
				}
			}), React.createElement("span", { className: `gs-group-actions` }, ...view.actions.map((action) => groupButton(React, action))));
		}
		/** One group-level action as an icon button, labelled for pointer and assistive technology. */
		function groupButton(React, action) {
			return React.createElement("button", {
				key: action.id,
				type: "button",
				className: `gs-action`,
				"aria-label": action.label,
				title: action.label,
				"data-action": action.id,
				"data-git-action": action.id,
				...action.danger === true ? { "data-danger": "" } : {},
				...action.disabled === true ? { disabled: true } : {},
				onClick: action.run
			}, Icon(React, action.icon));
		}
		/** A headline, the next step under it, and the Host's own message when it has one. */
		function stateBlock(React, title, body, detail) {
			const text = detail ?? "";
			return React.createElement("div", {
				className: `gs-state`,
				role: "status"
			}, React.createElement("p", { className: `gs-state-title` }, title), React.createElement("p", { className: `gs-state-line` }, body), text === "" ? null : React.createElement("p", { className: `gs-state-line` }, text));
		}
		/** Bars at about the height the branch and the first group will take. */
		/** How many past messages the commit panel offers back. */
		const RECENT_LIMIT = 5;
		/**
		* The newest distinct subjects of one page, offered as one-click messages.
		*
		* A reader who commits the same kind of change repeatedly wants the wording they
		* used last time, and the history page already carries it. Duplicates are
		* dropped so five repeats of one message do not fill the menu.
		* @param page - the cached history page, when there is one.
		* @returns up to {@link RECENT_LIMIT} subjects, newest first.
		*/
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
		function skeleton(React) {
			return React.createElement("div", {
				className: `gs-skeleton`,
				"aria-busy": "true"
			}, ...[
				46,
				70,
				58,
				34
			].map((width, index) => React.createElement("div", {
				key: index,
				className: `gs-skeleton-bar`,
				style: { width: `${width}%` }
			})));
		}
		// src/client/tool-card.ts
		/** Call ids whose panel has already been opened, so a replay does not open it again. */
		const opened = /* @__PURE__ */ new Set();
		/** How many call ids the claim set remembers before it is emptied. */
		const MAX_CLAIMS = 200;
		/**
		* Build the row for one tool name.
		* @param React - the loader's React.
		* @param deps - the panel opener and the copy lookup.
		* @param kind - which tool the row belongs to.
		* @returns the component the Tool view slot renders.
		*/
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
				return React.createElement("div", {
					className: `gs-tool-row`,
					"data-git-tool-row": props.toolName,
					"data-git-tool-call": props.callId,
					"data-git-tool-phase": props.phase
				}, Icon(React, kind === "open" ? "repo" : "merge", { size: 16 }), React.createElement("div", { className: `gs-tool-body` }, React.createElement("span", { className: `gs-tool-title` }, title), React.createElement("span", { className: `gs-tool-summary` }, summary)), kind !== "open" ? null : React.createElement("button", {
					type: "button",
					className: `gs-tool-open`,
					"data-git-tool-open": "",
					disabled: !settled,
					title: t("gitTool.open.action"),
					onClick: openPanel
				}, t("gitTool.open.action")));
			};
		}
		/**
		* Read the first text block of a settled call's recorded result.
		* @param block - the call's stage data.
		* @returns the text, or the failure sentence when the call carries none.
		*/
		function resultText(block) {
			for (const item of block?.result?.content ?? []) {
				const text = item?.text;
				if (typeof text === "string" && text.length > 0) return text;
			}
			return "";
		}
		// src/client.ts
		/**
		* Client half of the Git sidebar bundle.
		*
		* Three extension points, all in the right Sidebar:
		*
		* - `sidebarRightTabs.register` declares the panel's tab type: a page type (no
		*   resource patterns), opened by kind, whose `guide` entry is the button on the
		*   Start page. `order` 12 places it directly below Workspace files (10) and
		*   above Code review (15). No command id is set, so the button carries no
		*   shortcut.
		* - `sidebar.right.pane.tab`, keyed by the type's id, draws the panel body; the
		*   diff viewer's type and body register the same way under their own id.
		* - The `gitSidebar` Remote namespace is mounted here, so every body reads the
		*   same typed surface.
		*
		* No Harness Client package is loaded as a module. React arrives from the
		* shell's module table, zod arrives the same way for the Remote descriptors, and
		* each stylesheet is injected as a `<style>` element the plugin's effect owns.
		*/
		/** This package's identity in the loader's module table and on the Remote contribution. */
		const SOURCE = "@dsh-plugin/dsh-git-sidebar";
		/** Copy namespace of the panel. */
		const NS = "gitSidebar";
		/** Every string the panel and its dialogs show, in the two shipped languages. */
		const DICTS = {
			zh: {
				"panel.label": "Git",
				"guide.title": "Git 面板",
				"guide.description": "查看分支、工作区状态与提交",
				"refresh": "刷新",
				"more.actions": "更多操作",
				"branch.unknown": "未知分支",
				"branch.selector": "切换分支",
				"branch.loading": "正在读取分支…",
				"branch.empty": "没有本地分支",
				"branch.newPlaceholder": "新建分支",
				"branch.delete": "删除分支",
				"branch.create": "创建",
				"branch.mergeInto": "合并到当前分支",
				"branch.checkout": "签出",
				"branch.preview": "预览",
				"branch.previewBadge": "预览",
				"branch.previewHint": "预览中；实际签出的是 {current}",
				"branch.previewBar": "预览 {branch}：更改、暂存与提交仍作用于实际签出的 {current}",
				"branch.previewExit": "退出预览",
				"branch.remove": "删除",
				"history.previewBranch": "{branch} 的历史",
				"repo.selector": "切换仓库",
				"repo.loading": "正在扫描子目录…",
				"repo.empty": "没有扫描到 Git 仓库",
				"repo.none": "选择仓库",
				"repo.submodule": "子模块",
				"repo.worktree": "工作树",
				"repo.scanned": "扫描到 {count} 个仓库，最大深度 {depth}",
				"repo.truncated": "扫描已达目录上限，结果可能不完整",
				"repo.warnings": "有 {count} 条排除规则无法解析",
				"repo.reset": "回到工作目录",
				"repo.failed": "扫描仓库失败",
				"notice.switchFailed": "切换仓库失败",
				"gitTool.open.title": "在 Git 面板中打开仓库",
				"gitTool.list.title": "扫描到的 Git 仓库",
				"gitTool.open.action": "打开 Git 面板",
				"gitTool.running": "正在处理…",
				"notice.deleteFailed": "删除分支失败",
				"notice.mergeFailed": "合并失败",
				"dialog.deleteBranch": "删除分支 {branch}？",
				"dialog.forceDeleteBranch": "{branch} 上有未合并的提交，强制删除会丢失这些提交。继续？",
				"dialog.merge": "把 {branch} 合并到 {current}？",
				"upstream.title": "上游 {name}",
				"operation.merge": "正在进行合并（merge）",
				"operation.rebase": "正在进行变基（rebase）",
				"operation.cherry-pick": "正在挑选提交（cherry-pick）",
				"operation.abort": "中止",
				"operation.abortLater": "中止操作将在下一版本提供",
				"sync.fetch": "获取（fetch）",
				"sync.pull": "拉取（pull）",
				"sync.push": "推送（push）",
				"sync.noUpstream": "当前分支没有上游",
				"history.title": "历史",
				"history.count": "{count} 个提交",
				"history.empty": "还没有提交",
				"history.loading": "正在加载…",
				"history.more": "加载更多",
				"history.end": "已到最早一条",
				"history.failed": "无法读取提交历史",
				"history.expand": "展开历史",
				"history.collapse": "收起历史",
				"history.justNow": "刚刚",
				"history.minutesAgo": "{count} 分钟前",
				"history.hoursAgo": "{count} 小时前",
				"history.daysAgo": "{count} 天前",
				"history.monthsAgo": "{count} 个月前",
				"history.yearsAgo": "{count} 年前",
				"stash.group": "储藏",
				"stash.empty": "没有储藏",
				"stash.current": "储藏当前改动",
				"stash.currentDisabled": "工作区干净，没有可储藏的改动",
				"stash.apply": "应用",
				"stash.pop": "弹出",
				"stash.drop": "删除",
				"group.staged": "暂存更改",
				"group.changes": "更改",
				"list.filter": "过滤文件",
				"list.selected": "已选择 {count} 个文件",
				"list.clear": "取消选择",
				"group.conflicts": "冲突",
				"group.stageAll": "全部暂存",
				"group.unstageAll": "全部取消暂存",
				"group.discardAll": "撤销全部更改",
				"group.discardStaged": "撤销全部暂存",
				"row.stage": "暂存",
				"row.unstage": "取消暂存",
				"row.discard": "撤销更改",
				"row.diff": "查看差异",
				"row.pick": "勾选 {path} 用于提交",
				"row.resolve": "解决冲突",
				"row.renamed": "{from} → {path}",
				"commit.placeholder": "提交信息（Ctrl+Enter 提交）",
				"commit.submit": "提交",
				"commit.hint": "已暂存 {count} 个文件",
				"commit.pickedHint": "已选 {count} 个文件",
				"commit.busy": "正在处理…",
				"commit.identityMissing": "未配置 Git 用户身份，请先设置 user.name 与 user.email",
				"commit.nothingStaged": "暂存区为空，请先暂存要提交的更改",
				"commit.noPick": "先勾选要提交的文件",
				"commit.emptyMessage": "请先填写提交信息",
				"commit.clean": "工作区没有改动；可勾选「改写上次提交」修改提交信息",
				"commit.amend": "改写上次提交",
				"commit.amendHint": "将改写上一次提交",
				"commit.stageAllHint": "提交时会先暂存 {count} 个文件",
				"commit.stageAllSubmit": "暂存全部并提交",
				"commit.recent": "最近提交信息",
				"commit.draft": "生成提交信息",
				"notice.draftEmpty": "没有可描述的改动",
				"notice.draftUnconfigured": "未配置用于生成提交信息的模型，请设置 draftProvider 与 draftModel",
				"notice.draftFailed": "生成提交信息失败",
				"commit.more": "更多操作",
				"commit.checkout": "签出此提交",
				"commit.branchFrom": "从此提交新建分支",
				"commit.copySha": "复制提交 SHA",
				"dialog.detach": "将签出提交 {short}，进入分离 HEAD 状态。继续？",
				"dialog.branchFrom": "输入新分支名称（从提交 {short} 开始）：",
				"notice.copied": "已复制 {short}",
				"notice.copyFailed": "复制失败",
				"commit.push": "提交并推送",
				"commit.pushTitle": "提交后立即推送当前分支",
				"pane.commit": "提交信息",
				"pane.collapse": "收起",
				"pane.expand": "展开",
				"pane.resize": "拖动调整高度（↑/↓ 微调，Home 复位）",
				"notice.stageFailed": "暂存失败",
				"notice.unstageFailed": "取消暂存失败",
				"notice.discardFailed": "放弃更改失败",
				"notice.checkoutFailed": "切换分支失败",
				"notice.createBranchFailed": "创建分支失败",
				"notice.stashFailed": "储藏失败",
				"notice.stashApplyFailed": "应用储藏失败",
				"notice.stashPopFailed": "弹出储藏失败",
				"notice.stashDropFailed": "删除储藏失败",
				"notice.syncFailed": "同步失败",
				"notice.resolveFailed": "解决冲突失败",
				"notice.abortFailed": "中止操作失败",
				"conflict.ours": "保留当前",
				"conflict.theirs": "保留传入",
				"conflict.both": "两者都保留",
				"conflict.loading": "正在读取冲突内容…",
				"conflict.clean": "这个文件已没有冲突标记；标记为已解决即可暂存。",
				"conflict.markResolved": "标记为已解决",
				"conflict.close": "关闭",
				"dialog.abort": "中止正在进行的 {operation}？已解决的冲突会全部丢失。",
				"notice.syncDone": "{action} 完成",
				"notice.commitPushed": "已提交并推送",
				"notice.dirty": "有未提交的改动，无法切换分支",
				"notice.exists": "同名分支已存在",
				"notice.invalidName": "这个名称不是有效的分支名",
				"notice.stale": "差异已变化，请刷新后重试",
				"state.noSession.title": "没有可用的会话",
				"state.noSession.body": "打开一个会话后，这里会显示该会话工作目录的 Git 状态。",
				"state.clean.title": "没有未提交的更改",
				"state.clean.body": "工作区与暂存区都与当前提交一致。",
				"state.no-repository.title": "这里不是 Git 仓库",
				"state.no-repository.body": "可以在该目录的终端里执行 git init 创建一个仓库，或切换到其他工作目录。",
				"state.no-directory.title": "没有可用的工作目录",
				"state.no-directory.body": "请为会话选择一个工作目录，再回到这里。",
				"state.git-missing.title": "找不到 git",
				"state.git-missing.body": "请安装 Git 并确保它位于 PATH 中，然后刷新。",
				"state.failed.title": "无法读取仓库状态",
				"state.failed.body": "读取 Git 状态时失败，下一条信息是具体原因。",
				"dialog.discard.title": "放弃这些更改？",
				"dialog.discard.body": "未暂存的内容将被还原到最近一次提交，此操作无法撤销。",
				"dialog.discard.untracked": "其中包含未跟踪的文件：它们会被直接删除，无法恢复。",
				"dialog.confirm": "确定",
				"dialog.cancel": "取消",
				"dialog.ok": "知道了",
				"dialog.abort.title": "中止当前操作？",
				"dialog.deleteBranch.title": "删除这个分支？",
				"dialog.forceDeleteBranch.title": "强制删除这个分支？",
				"dialog.merge.title": "合并到这个分支？",
				"dialog.detach.title": "签出这个提交？",
				"dialog.branchFrom.title": "新建分支",
				"dialog.refused.title": "Git 拒绝了这次操作",
				"dialog.filesMany": "{first} 等 {count} 个文件",
				"dialog.stash.popTitle": "弹出这条储藏？",
				"dialog.stash.popBody": "改动会回到工作区，储藏记录将被删除。",
				"dialog.stash.dropTitle": "删除这条储藏？",
				"dialog.stash.dropBody": "储藏记录将被删除，其中的改动不会再回到工作区。",
				"dialog.pull.title": "拉取远端？",
				"dialog.pull.body": "会把 {name} 合入当前分支，可能产生冲突或改写工作区。",
				"dialog.push.title": "推送到远端？",
				"dialog.push.body": "会把当前分支的提交推送到 {name}，其他人会看到这些提交。",
				"dialog.previewCheckout.title": "签出正在预览的分支？",
				"dialog.previewCheckout.body": "当前预览的是 {preview}，这个操作需要在它上面执行；实际签出的是 {current}。继续会先签出 {preview}。",
				"dialog.previewCheckout.confirm": "签出并继续"
			},
			en: {
				"panel.label": "Git",
				"guide.title": "Git panel",
				"guide.description": "Inspect branches, working-tree status and commits",
				"refresh": "Refresh",
				"more.actions": "More actions",
				"branch.unknown": "Unknown branch",
				"branch.selector": "Switch branch",
				"branch.loading": "Reading branches…",
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
				"repo.loading": "Scanning subdirectories…",
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
				"gitTool.running": "Working…",
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
				"history.loading": "Loading…",
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
				"row.renamed": "{from} → {path}",
				"commit.placeholder": "Commit message (Ctrl+Enter to commit)",
				"commit.submit": "Commit",
				"commit.hint": "{count} file(s) staged",
				"commit.pickedHint": "{count} file(s) picked",
				"commit.busy": "Working…",
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
				"conflict.loading": "Reading the conflict…",
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
				"dialog.push.body": "Publishes this branch’s commits to {name}, where other people will see them.",
				"dialog.previewCheckout.title": "Check the previewed branch out?",
				"dialog.previewCheckout.body": "The panel is previewing {preview}, and this action has to run on it; the checkout is {current}. Continuing checks {preview} out first.",
				"dialog.previewCheckout.confirm": "Check out and continue"
			}
		};
		/**
		* Read one file's diff, through the cache when that address has been read.
		*
		* The cache is keyed by the address rather than by the arguments, so the same
		* key the tab system uses is the key the payload is stored under: reopening a
		* closed tab asks for the address it already had, and the cache answers.
		* @param remote - the mounted namespace, wrapped for the panel.
		* @returns the reader the diff body is given.
		*/
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
		/**
		* Read one commit's own patch, through the same cache.
		* @param remote - the mounted namespace, wrapped for the panel.
		* @returns the reader the diff body is given for a `commit/` address.
		*/
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
		/**
		* Read one file's two whole documents for the diff editor.
		*
		* Nothing is cached: the working-tree side is the file on disk, and a tab left
		* open across an edit elsewhere must read what is there now.
		* @param remote - the mounted namespace.
		* @returns the reader the editor rendering is given.
		*/
		function sidesReader(remote) {
			return (args) => remote.ready.then((api) => api.requestSides(args)).catch((error) => ({
				kind: "error",
				message: messageOf$2(error)
			}));
		}
		/**
		* Read the files one commit changes, for the editor's picker.
		* @param remote - the mounted namespace.
		* @returns the reader the commit body is given.
		*/
		function commitFilesReader(remote) {
			return (args) => remote.ready.then((api) => api.requestCommitFiles(args)).catch((error) => ({
				kind: "error",
				message: messageOf$2(error)
			}));
		}
		/**
		* Read both sides of one file inside one commit.
		* @param remote - the mounted namespace.
		* @returns the reader the commit body is given for the picked file.
		*/
		function commitSidesReader(remote) {
			return (args) => remote.ready.then((api) => api.requestCommitSides(args)).catch((error) => ({
				kind: "error",
				message: messageOf$2(error)
			}));
		}
		/**
		* Read the service dsh-monaco publishes, when it is there.
		*
		* The service belongs to another plugin, so its absence is the ordinary case
		* (the tab then draws the patch) and an incompatible shape is stated once
		* rather than retried on every render.
		* @param ctx - the bundle's context.
		* @returns a getter the diff body calls per mount.
		*/
		function editorService(ctx) {
			let warned = false;
			const report = (reason) => {
				if (warned) return void 0;
				warned = true;
				console.warn("git-sidebar: %s; diffs stay textual", reason);
			};
			return () => {
				let service;
				try {
					service = ctx.get("monacoEditor");
				} catch (error) {
					return report(`the monacoEditor service could not be read (${error instanceof Error ? error.message : String(error)})`);
				}
				if (service === void 0) return void 0;
				if (typeof service !== "object" || service === null) return report("the monacoEditor service is not an object");
				const candidate = service;
				if (typeof candidate.version !== "number" || typeof candidate.ready !== "object") return report("the monacoEditor service does not match version 1");
				return candidate;
			};
		}
		const name = SOURCE;
		const inject = [
			_dsh_plugin_dsh_loader_client.UI_SERVICE,
			"remote",
			"slots",
			"locale",
			"sidebarRightTabs",
			"sidebarRight"
		];
		/** 注册 Git 页签、工具卡和远程接口，所有注册随插件卸载。 */
		function apply(ctx) {
			const React = require("react");
			const zod = resolveZod(require("zod"));
			const GuideIcon = GitGuideIcon(React);
			ctx.effect(() => ctx.locale.register(NS, DICTS), "git-sidebar: dictionaries");
			ctx.effect(() => ctx.locale.register(DIFF_LOCALE_NS, DIFF_DICTS), "git-sidebar: diff dictionaries");
			const t = ctx.locale.bind(NS);
			ctx.effect(() => (0, _dsh_plugin_dsh_loader_client.injectStyle)(SOURCE, "panel.css", PANEL_STYLES), "git-sidebar: panel styles");
			ctx.effect(() => (0, _dsh_plugin_dsh_loader_client.injectStyle)(SOURCE, "diff.css", DIFF_STYLES), "git-sidebar: diff styles");
			if (zod === void 0) console.error(`git-sidebar: the loader module table has no zod; ${SOURCE} mounts no Remote`);
			const remote = zod === void 0 ? { ready: Promise.reject(/* @__PURE__ */ new Error("git-sidebar: zod is unavailable")) } : mountGitRemote(ctx, zod);
			remote.ready.catch(() => void 0);
			const panelCache = createPanelCache();
			ctx.effect(() => ctx.sidebarRightTabs.register({
				id: PANEL_TAB_ID,
				kind: PANEL_TAB_KIND,
				title: () => t("panel.label"),
				guide: [{
					id: "open",
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
			const toolDeps = {
				t,
				openPanel
			};
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
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
