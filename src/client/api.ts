/**
 * The client half's bridge to the Host Remote.
 *
 * Three things live here and nowhere else in this bundle: the `$mount` of the
 * hand-authored namespace, the typed call surface every panel action goes
 * through, and the unwrapping that turns a failed Remote result into the shape
 * the panel renders. The loader's React face and the translate signature are
 * declared here too, so each module that draws reads them from one place.
 *
 * No Harness Client package is imported: React arrives from the loader's module
 * table, and zod from the same table through the entry's `require`.
 */

import type {
  BranchList, CommitDetailArgs, CommitOutcome, ConflictChoice, ConflictContent, DiffArgs, DiffPayload, HistoryPage, HunkArgs,
  MessageDraft, RepositoriesArgs, RepositoryList, SelectOutcome, SelectRepositoryArgs, SnapshotProblem, StashEntry,
  StatusSnapshot, SyncAction, WriteOutcome,
} from '../shared.ts'
import { REMOTE_NAMESPACE } from '../shared.ts'
import { gitSidebarContribution, type RemoteContribution, type ZodLike } from '../remote-descriptor.ts'

/** One localized lookup, read against the active locale at call time. */
export type Translate = (key: string, params?: Record<string, unknown>) => string

/** The hooks this bundle calls; the loader's React is cast to it once. */
export interface ReactLike {
  createElement(type: unknown, props?: unknown, ...children: unknown[]): unknown
  /** Present on the loader's React; the guide artwork keys its gradient ids by it. */
  useId?(): string
  useState<T>(initial: T): [T, (value: T | ((previous: T) => T)) => void]
  useEffect(effect: () => (() => void) | void, dependencies: readonly unknown[]): void
  useCallback<T>(callback: T, dependencies: readonly unknown[]): T
}

/** The share of a tab's live information a body reads. */
export interface TabActions {
  openResource(address: string, options?: { readonly kind?: string }): void
  openTab(kind: string, options?: { readonly params?: unknown }): void
}

/** Live information the Sidebar hands a tab body. */
export interface TabInfo {
  readonly tab: {
    readonly actions: TabActions
  }
}

/** Props the slot framework passes every `sidebar.right.pane.tab` body. */
export interface TabBodyProps {
  readonly sessionId?: string
  readonly useTabInfo?: () => TabInfo
}

/** One Start-page entry contributed by a tab type. */
export interface GuideEntry {
  readonly id: string
  readonly order: number
  title(): string
  description?(): string
  readonly icon?: unknown
}

/** The tab type declaration this bundle registers. */
export interface TabDefinition {
  readonly id: string
  readonly kind: string
  /** Each open is its own content; omitted keeps one page per kind in each pane. */
  readonly multiple?: boolean
  title(address?: string): string
  readonly guide?: readonly GuideEntry[]
}

/** Options of one keyed `sidebar.right.pane.tab` registration. */
export interface SlotRegistration {
  readonly name: string
  readonly key?: string
  readonly id?: string
  readonly order?: number
  readonly locale?: string
}

/** Restricted Cordis context face of a dynamic client bundle. */
export interface GitClientContext {
  effect(setup: () => (() => void) | void, label?: string): () => void
  locale: {
    register(ns: string, dicts: Record<string, Record<string, string>>): () => void
    bind(ns: string): Translate
  }
  sidebarRightTabs: {
    register(definition: TabDefinition): () => void
  }
  slots: {
    inject(key: string, callback: () => (() => void) | Iterable<() => void>): () => void
    register(options: SlotRegistration, component: unknown): () => void
  }
  remote: {
    $mount(contribution: RemoteContribution): Promise<() => Promise<void>>
  }
  get(name: string): unknown
}

/** One endpoint's failure branch, as the Remote carrier reports it. */
export interface RemoteFailure {
  readonly code: string
  readonly message: string
}

/** Every Remote result: the value, or the reason there is none. */
export type RemoteResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: RemoteFailure }

/** The mounted `gitSidebar` namespace, typed by the frozen contract in `shared.ts`. */
export interface GitSidebarRemote {
  status(args: { readonly sessionId: string }): Promise<RemoteResult<StatusSnapshot>>
  diff(args: DiffArgs): Promise<RemoteResult<DiffPayload>>
  stage(args: { readonly sessionId: string; readonly paths: readonly string[] }): Promise<RemoteResult<WriteOutcome>>
  unstage(args: { readonly sessionId: string; readonly paths: readonly string[] }): Promise<RemoteResult<WriteOutcome>>
  discard(args: {
    readonly sessionId: string
    readonly paths: readonly string[]
    readonly includeUntracked: boolean
  }): Promise<RemoteResult<WriteOutcome>>
  commit(args: { readonly sessionId: string; readonly message: string }): Promise<RemoteResult<CommitOutcome>>
  history(args: {
    readonly sessionId: string
    readonly limit: number
    readonly skip: number
  }): Promise<RemoteResult<HistoryPage>>
  commitDetail(args: CommitDetailArgs): Promise<RemoteResult<DiffPayload>>
  branches(args: { readonly sessionId: string }): Promise<RemoteResult<BranchList>>
  checkout(args: { readonly sessionId: string; readonly branch: string }): Promise<RemoteResult<WriteOutcome>>
  createBranch(args: {
    readonly sessionId: string
    readonly name: string
    readonly from?: string
  }): Promise<RemoteResult<WriteOutcome>>
  stashes(args: { readonly sessionId: string }): Promise<RemoteResult<readonly StashEntry[]>>
  stash(args: {
    readonly sessionId: string
    readonly message?: string
  }): Promise<RemoteResult<WriteOutcome>>
  stashApply(args: {
    readonly sessionId: string
    readonly index: number
    readonly drop: boolean
  }): Promise<RemoteResult<WriteOutcome>>
  stashDrop(args: { readonly sessionId: string; readonly index: number }): Promise<RemoteResult<WriteOutcome>>
  sync(args: {
    readonly sessionId: string
    readonly action: SyncAction
  }): Promise<RemoteResult<WriteOutcome>>
  conflict(args: { readonly sessionId: string; readonly path: string }): Promise<RemoteResult<ConflictContent>>
  resolveConflict(args: {
    readonly sessionId: string
    readonly path: string
    readonly choices: readonly ConflictChoice[]
  }): Promise<RemoteResult<WriteOutcome>>
  abortOperation(args: { readonly sessionId: string }): Promise<RemoteResult<WriteOutcome>>
  stageHunk(args: HunkArgs): Promise<RemoteResult<WriteOutcome>>
  unstageHunk(args: HunkArgs): Promise<RemoteResult<WriteOutcome>>
  deleteBranch(args: {
    readonly sessionId: string
    readonly branch: string
    readonly force: boolean
  }): Promise<RemoteResult<WriteOutcome>>
  mergeBranch(args: { readonly sessionId: string; readonly branch: string }): Promise<RemoteResult<WriteOutcome>>
  generateMessage(args: {
    readonly sessionId: string
    readonly staged: boolean
  }): Promise<RemoteResult<MessageDraft>>
  repositories(args: RepositoriesArgs): Promise<RemoteResult<RepositoryList>>
  selectRepository(args: SelectRepositoryArgs): Promise<RemoteResult<SelectOutcome>>
}

/**
 * What the panel and the diff tab call: same endpoints, with the failure branch
 * folded into the business result so every caller renders a value, never a throw.
 */
export interface GitSidebarApi {
  status(sessionId: string): Promise<StatusSnapshot>
  stage(sessionId: string, paths: readonly string[]): Promise<WriteOutcome>
  unstage(sessionId: string, paths: readonly string[]): Promise<WriteOutcome>
  discard(sessionId: string, paths: readonly string[], includeUntracked: boolean): Promise<WriteOutcome>
  commit(sessionId: string, message: string, options?: { amend?: boolean; stageAll?: boolean }): Promise<CommitOutcome>
  requestDiff(args: DiffArgs, signal?: AbortSignal): Promise<DiffPayload>
  history(sessionId: string, limit: number, skip: number): Promise<HistoryPage>
  requestCommit(args: CommitDetailArgs, signal?: AbortSignal): Promise<DiffPayload>
  branches(sessionId: string): Promise<BranchList>
  checkout(sessionId: string, branch: string): Promise<WriteOutcome>
  createBranch(sessionId: string, name: string, from?: string): Promise<WriteOutcome>
  stashes(sessionId: string): Promise<readonly StashEntry[]>
  stash(sessionId: string, message?: string): Promise<WriteOutcome>
  stashApply(sessionId: string, index: number, drop: boolean): Promise<WriteOutcome>
  stashDrop(sessionId: string, index: number): Promise<WriteOutcome>
  sync(sessionId: string, action: SyncAction): Promise<WriteOutcome>
  conflict(sessionId: string, path: string): Promise<ConflictContent>
  resolveConflict(sessionId: string, path: string, choices: readonly ConflictChoice[]): Promise<WriteOutcome>
  abortOperation(sessionId: string): Promise<WriteOutcome>
  stageHunk(args: HunkArgs): Promise<WriteOutcome>
  unstageHunk(args: HunkArgs): Promise<WriteOutcome>
  deleteBranch(sessionId: string, branch: string, force: boolean): Promise<WriteOutcome>
  mergeBranch(sessionId: string, branch: string): Promise<WriteOutcome>
  generateMessage(sessionId: string, staged: boolean): Promise<MessageDraft>
  repositories(sessionId: string): Promise<RepositoryList>
  selectRepository(sessionId: string, root?: string): Promise<SelectOutcome>
}

/** The namespace mount, started at apply time and awaited by the first body that draws. */
export interface GitRemoteHandle {
  readonly ready: Promise<GitSidebarApi>
}

/** A snapshot the panel can draw without inventing data. */
export function unavailableSnapshot(message: string, problem: SnapshotProblem): StatusSnapshot {
  return {
    kind: 'unavailable',
    problem,
    staged: [],
    unstaged: [],
    conflicts: [],
    identity: { name: null, email: null },
    ...message === '' ? {} : { message },
  }
}

/**
 * Read a thrown value as one line worth showing.
 * @param error - what a promise rejected with, or an Error.
 * @returns its message, without the class name, or an empty string.
 */
export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : ''
}

/**
 * Pick the zod face the Remote descriptors need out of the loader's module.
 * @param module - `require('zod')`, a namespace or a namespace with a default.
 * @returns the codec factory, or undefined when the module is not zod.
 */
export function resolveZod(module: unknown): ZodLike | undefined {
  if (typeof module !== 'object' || module === null) return undefined
  const candidate = module as { readonly object?: unknown; readonly default?: unknown }
  if (typeof candidate.object === 'function') return module as ZodLike
  const fallback = candidate.default
  if (typeof fallback !== 'object' || fallback === null) return undefined
  if (typeof (fallback as { readonly object?: unknown }).object !== 'function') return undefined
  return fallback as ZodLike
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
export function mountGitRemote(ctx: GitClientContext, zod: ZodLike): GitRemoteHandle {
  const ready = mountNamespace(ctx, zod)
  void ready.catch(() => undefined)
  return { ready }
}

async function mountNamespace(ctx: GitClientContext, zod: ZodLike): Promise<GitSidebarApi> {
  await ctx.remote.$mount(gitSidebarContribution(zod))
  const namespace = ctx.get(`remote.${REMOTE_NAMESPACE}`)
  if (typeof namespace !== 'object' || namespace === null) {
    throw new Error(`git-sidebar: the Remote namespace "${REMOTE_NAMESPACE}" did not mount`)
  }
  return createApi(namespace as unknown as GitSidebarRemote)
}

/**
 * Wrap the mounted namespace in the folding surface the panel calls.
 * @param remote - the mounted method table.
 * @returns the api.
 */
function createApi(remote: GitSidebarRemote): GitSidebarApi {
  return {
    async status(sessionId: string): Promise<StatusSnapshot> {
      try {
        const result = await remote.status({ sessionId })
        if (result.ok) return result.value
        return unavailableSnapshot(result.error.message, 'failed')
      } catch (error) {
        return unavailableSnapshot(messageOf(error), 'failed')
      }
    },
    stage(sessionId: string, paths: readonly string[]): Promise<WriteOutcome> {
      return foldWrite(() => remote.stage({ sessionId, paths }))
    },
    unstage(sessionId: string, paths: readonly string[]): Promise<WriteOutcome> {
      return foldWrite(() => remote.unstage({ sessionId, paths }))
    },
    discard(sessionId: string, paths: readonly string[], includeUntracked: boolean): Promise<WriteOutcome> {
      return foldWrite(() => remote.discard({ sessionId, paths, includeUntracked }))
    },
    async commit(
      sessionId: string,
      message: string,
      options?: { amend?: boolean; stageAll?: boolean },
    ): Promise<CommitOutcome> {
      try {
        const result = await remote.commit({ sessionId, message, ...options })
        if (result.ok) return result.value
        return { ok: false, problem: 'failed', message: result.error.message }
      } catch (error) {
        return { ok: false, problem: 'failed', message: messageOf(error) }
      }
    },
    async requestDiff(args: DiffArgs, signal?: AbortSignal): Promise<DiffPayload> {
      void signal
      try {
        const result = await remote.diff(args)
        if (result.ok) return result.value
        return { kind: 'error', message: result.error.message }
      } catch (error) {
        return { kind: 'error', message: messageOf(error) }
      }
    },
    async history(sessionId: string, limit: number, skip: number): Promise<HistoryPage> {
      try {
        const result = await remote.history({ sessionId, limit, skip })
        if (result.ok) return result.value
        return { commits: [], hasMore: false }
      } catch {
        return { commits: [], hasMore: false }
      }
    },
    async requestCommit(args: CommitDetailArgs, signal?: AbortSignal): Promise<DiffPayload> {
      void signal
      try {
        const result = await remote.commitDetail(args)
        if (result.ok) return result.value
        return { kind: 'error', message: result.error.message }
      } catch (error) {
        return { kind: 'error', message: messageOf(error) }
      }
    },
    async branches(sessionId: string): Promise<BranchList> {
      try {
        const result = await remote.branches({ sessionId })
        if (result.ok) return result.value
        return EMPTY_BRANCHES
      } catch {
        return EMPTY_BRANCHES
      }
    },
    checkout(sessionId: string, branch: string): Promise<WriteOutcome> {
      return foldWrite(() => remote.checkout({ sessionId, branch }))
    },
    createBranch(sessionId: string, name: string, from?: string): Promise<WriteOutcome> {
      return foldWrite(() => remote.createBranch({ sessionId, name }))
    },
    async stashes(sessionId: string): Promise<readonly StashEntry[]> {
      try {
        const result = await remote.stashes({ sessionId })
        return result.ok ? result.value : []
      } catch {
        return []
      }
    },
    stash(sessionId: string, message?: string): Promise<WriteOutcome> {
      return foldWrite(() => remote.stash(message === undefined ? { sessionId } : { sessionId, message }))
    },
    stashApply(sessionId: string, index: number, drop: boolean): Promise<WriteOutcome> {
      return foldWrite(() => remote.stashApply({ sessionId, index, drop }))
    },
    stashDrop(sessionId: string, index: number): Promise<WriteOutcome> {
      return foldWrite(() => remote.stashDrop({ sessionId, index }))
    },
    sync(sessionId: string, action: SyncAction): Promise<WriteOutcome> {
      return foldWrite(() => remote.sync({ sessionId, action }))
    },
    async conflict(sessionId: string, path: string): Promise<ConflictContent> {
      try {
        const result = await remote.conflict({ sessionId, path })
        if (!result.ok) return { kind: 'error', message: result.error.message }
        return result.value
      } catch (error) {
        return { kind: 'error', message: messageOf(error) }
      }
    },
    resolveConflict(sessionId: string, path: string, choices: readonly ConflictChoice[]): Promise<WriteOutcome> {
      return foldWrite(() => remote.resolveConflict({ sessionId, path, choices }))
    },
    abortOperation(sessionId: string): Promise<WriteOutcome> {
      return foldWrite(() => remote.abortOperation({ sessionId }))
    },
    stageHunk(args: HunkArgs): Promise<WriteOutcome> {
      return foldWrite(() => remote.stageHunk(args))
    },
    unstageHunk(args: HunkArgs): Promise<WriteOutcome> {
      return foldWrite(() => remote.unstageHunk(args))
    },
    deleteBranch(sessionId: string, branch: string, force: boolean): Promise<WriteOutcome> {
      return foldWrite(() => remote.deleteBranch({ sessionId, branch, force }))
    },
    mergeBranch(sessionId: string, branch: string): Promise<WriteOutcome> {
      return foldWrite(() => remote.mergeBranch({ sessionId, branch }))
    },
    async generateMessage(sessionId: string, staged: boolean): Promise<MessageDraft> {
      const result = await remote.generateMessage({ sessionId, staged })
      if (result.ok) return result.value
      return { ok: false, problem: 'failed', message: result.error.message }
    },
    async repositories(sessionId: string): Promise<RepositoryList> {
      try {
        const result = await remote.repositories({ sessionId })
        if (result.ok) return result.value
        return { ...EMPTY_REPOSITORIES, error: result.error.message }
      } catch (error) {
        return { ...EMPTY_REPOSITORIES, error: messageOf(error) }
      }
    },
    async selectRepository(sessionId: string, root?: string): Promise<SelectOutcome> {
      try {
        const result = await remote.selectRepository(root === undefined ? { sessionId } : { sessionId, root })
        if (result.ok) return result.value
        return { ok: false, problem: 'failed', message: result.error.message }
      } catch (error) {
        return { ok: false, problem: 'failed', message: messageOf(error) }
      }
    },
  }
}

/** What the repository picker shows when the scan could not run at all. */
const EMPTY_REPOSITORIES: RepositoryList = {
  scanRoot: '',
  depth: 0,
  selected: null,
  entries: [],
  truncated: false,
  warnings: [],
}

/** What the branch picker shows when the listing could not be read at all. */
const EMPTY_BRANCHES: BranchList = { current: null, local: [], remote: [] }

async function foldWrite(call: () => Promise<RemoteResult<WriteOutcome>>): Promise<WriteOutcome> {
  try {
    const result = await call()
    if (result.ok) return result.value
    return { ok: false, problem: 'failed', message: result.error.message }
  } catch (error) {
    return { ok: false, problem: 'failed', message: messageOf(error) }
  }
}
