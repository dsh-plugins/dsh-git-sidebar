/**
 * Wire contract shared by the Host and the browser half of the Git panel.
 *
 * Both sides compile against this file and nothing else, so the shape of every
 * Remote call is stated exactly once. The matching method table lives in
 * `remote-descriptor.ts`; a rename on either side is caught by `run/contract.mjs`.
 */

/** A file's change state, as the panel presents it. */
export type ChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'conflicted'

/** One changed path in either staging area. */
export interface ChangeEntry {
  /** Path relative to the repository root, always forward-slashed. */
  readonly path: string
  readonly status: ChangeStatus
  /** Original path of a rename or copy; absent otherwise. */
  readonly from?: string
}

/** Git identity configured for the repository, if any. */
export interface GitIdentity {
  readonly name: string | null
  readonly email: string | null
}

/** The upstream a branch tracks, and how far apart the two sides are. */
export interface Upstream {
  /** The tracked ref, such as `origin/main`. */
  readonly name: string
  /** Commits the local branch has that the upstream does not. */
  readonly ahead: number
  /** Commits the upstream has that the local branch does not. */
  readonly behind: number
}

/**
 * A Git operation in progress. Only one can be, and a panel that knows which
 * one can explain a dirty tree the user did not produce.
 */
export type OperationKind = 'merge' | 'rebase' | 'cherry-pick' | 'revert'

/** Why a snapshot carries no usable changes. */
export type SnapshotProblem = 'no-repository' | 'no-directory' | 'git-missing' | 'failed'

/** Everything the panel renders from. */
export interface StatusSnapshot {
  /** `repository` when the panel can show changes; otherwise the reason it cannot. */
  readonly kind: 'repository' | 'unavailable'
  /** Absent for `no-repository`, `no-directory`, `git-missing`, and `failed`. */
  readonly problem?: SnapshotProblem
  /** Checked-out branch; null when HEAD is detached, undefined when unknown. */
  readonly branch?: string | null
  /** Abbreviated HEAD commit; null for an unborn branch. */
  readonly commit?: string | null
  /** Repository root, so the client can show which checkout it describes. */
  readonly root?: string
  readonly staged: readonly ChangeEntry[]
  readonly unstaged: readonly ChangeEntry[]
  readonly conflicts: readonly ChangeEntry[]
  readonly identity: GitIdentity
  /** The tracked upstream, or null when the branch tracks none. */
  readonly upstream?: Upstream | null
  /** The operation the repository is in the middle of, or null. */
  readonly operation?: OperationKind | null
  /** Human-readable reason for `unavailable`; never a raw multi-line dump. */
  readonly message?: string
}

/** One line inside a hunk. */
export interface DiffLine {
  readonly kind: 'context' | 'added' | 'removed'
  readonly text: string
}

/** One contiguous change region, header lines included. */
export interface DiffHunk {
  /** The `@@ -a,b +c,d @@` line, verbatim. */
  readonly header: string
  /** Optional section heading Git appends after the second `@@`. */
  readonly section?: string
  /**
   * The path this hunk belongs to, when the patch named one.
   *
   * A single file's diff has no need for it; a commit's patch spans several
   * files, and the viewer groups by this to say which file a hunk changes.
   */
  readonly path?: string
  readonly lines: readonly DiffLine[]
}

/** The result of asking for one file's diff. */
export type DiffPayload =
  | { readonly kind: 'text'; readonly hunks: readonly DiffHunk[]; readonly truncated?: boolean }
  | { readonly kind: 'binary' }
  | { readonly kind: 'error'; readonly message: string }

/** Why a write refused, in terms the client can act on. */
export type CommitProblem = 'identity-missing' | 'nothing-staged' | 'empty-message' | 'failed'

/** The result of a commit attempt. */
export type CommitOutcome =
  | { readonly ok: true; readonly commit: string | null; readonly snapshot: StatusSnapshot }
  | { readonly ok: false; readonly problem: CommitProblem; readonly message: string }

/** Why a staging or discard request refused. */
export type WriteProblem =
  | 'no-paths'
  | 'failed'
  | 'dirty'
  | 'invalid-name'
  | 'exists'
  | 'stale'
  | 'current-branch'
  | 'unmerged'

/** The result of a staging or discard request; every success returns the new snapshot. */
export type WriteOutcome =
  | { readonly ok: true; readonly snapshot: StatusSnapshot }
  | { readonly ok: false; readonly problem: WriteProblem; readonly message: string }

/** Arguments of every Remote method, one interface per endpoint. */
export interface StatusArgs {
  readonly sessionId: string
}

export interface DiffArgs {
  readonly sessionId: string
  readonly path: string
  /** True reads HEAD..index; false reads index..worktree. */
  readonly staged: boolean
}

export interface PathsArgs {
  readonly sessionId: string
  readonly paths: readonly string[]
}

export interface DiscardArgs extends PathsArgs {
  /** Also remove untracked files; the client confirms this separately. */
  readonly includeUntracked: boolean
}

export interface CommitArgs {
  readonly sessionId: string
  readonly message: string
  /** Rewrite the previous commit instead of adding one. */
  readonly amend?: boolean
  /** Stage every tracked change before committing. */
  readonly stageAll?: boolean
}

/** What a decoration on a commit names. */
export type RefKind =
  /** A local branch that is currently checked out. */
  | 'head'
  /** A local branch that is not checked out. */
  | 'local'
  /** A remote-tracking branch. */
  | 'remote'
  /** A tag. */
  | 'tag'

/** One decoration pointing at a commit. */
export interface CommitRef {
  /** The name as the row prints it: `main`, `origin/main`, `v1.0`. */
  readonly name: string
  readonly kind: RefKind
}

/** One entry of the commit history. */
export interface CommitEntry {
  /** Full object name. */
  readonly sha: string
  /** Abbreviated object name Git prints by default. */
  readonly short: string
  /** The first line of the message. */
  readonly subject: string
  readonly author: string
  /** Author e-mail, which the graph uses as a stable identity. */
  readonly email: string
  /** Author date, ISO 8601. */
  readonly when: string
  /** Decorations pointing at this commit, in Git's own order. */
  readonly refs: readonly CommitRef[]
  /** Full object names of this commit's parents, in Git's order. */
  readonly parents: readonly string[]
}

/** Arguments of the history page. */
export interface HistoryArgs {
  readonly sessionId: string
  /** Most commits to return. */
  readonly limit: number
  /** Commits to skip, for the next page. */
  readonly skip: number
}

/** The commit history page, and whether more commits follow it. */
export interface HistoryPage {
  readonly commits: readonly CommitEntry[]
  readonly hasMore: boolean
}

/** Arguments of one commit's own diff. */
export interface CommitDetailArgs {
  readonly sessionId: string
  readonly sha: string
}

/** One local branch. */
export interface BranchEntry {
  readonly name: string
  /** Whether this branch is the checked-out one. */
  readonly current: boolean
}

/** What the branch picker offers. */
export interface BranchList {
  readonly current: string | null
  readonly local: readonly string[]
  readonly remote: readonly string[]
}

/** Arguments of the branch list. */
export interface BranchListArgs {
  readonly sessionId: string
}

/** Arguments of a branch checkout. */
export interface CheckoutArgs {
  readonly sessionId: string
  readonly branch: string
}

/** Arguments of a branch creation. */
export interface CreateBranchArgs {
  readonly sessionId: string
  readonly name: string
  /** Commit or branch to start from; HEAD when omitted. */
  readonly from?: string
}

/** Arguments of a branch deletion. */
export interface DeleteBranchArgs {
  readonly sessionId: string
  readonly branch: string
  /** Delete even when the branch is not merged. */
  readonly force: boolean
}

/** Arguments of a branch merge into the checked-out one. */
export interface MergeBranchArgs {
  readonly sessionId: string
  readonly branch: string
}

/** One stash entry. */
export interface StashEntry {
  /** Its position, 0 being the newest; the value `stash@{n}` takes. */
  readonly index: number
  /** The reflog subject, which carries the message the user wrote. */
  readonly subject: string
}

/** Arguments of the stash list. */
export interface StashListArgs {
  readonly sessionId: string
}

/** Arguments of a stash push. */
export interface StashArgs {
  readonly sessionId: string
  /** Message to store with the entry; Git's own default when omitted. */
  readonly message?: string
}

/** Arguments of a stash apply or pop. */
export interface StashApplyArgs {
  readonly sessionId: string
  readonly index: number
  /** Pop removes the entry after applying it; apply keeps it. */
  readonly drop: boolean
}

/** Arguments of a stash drop: remove the entry without applying it. */
export interface StashDropArgs {
  readonly sessionId: string
  readonly index: number
}

/** The network operation a sync request names. */
export type SyncAction = 'fetch' | 'pull' | 'push'

/** How one conflicted region is resolved. */
export type ConflictChoice = 'ours' | 'theirs' | 'both'

/** One run of lines in a conflicted file: shared text, or a conflict block. */
export type ConflictSegment =
  | { readonly kind: 'common'; readonly lines: readonly string[] }
  | {
    readonly kind: 'conflict'
    /** Text between the opening marker and `=======`. */
    readonly ours: readonly string[]
    /** Text between `=======` and the closing marker. */
    readonly theirs: readonly string[]
    /** The branch or commit each side came from, as the marker spells it. */
    readonly oursLabel: string
    readonly theirsLabel: string
  }

/** One conflicted file, split into the regions a reader decides between. */
export type ConflictContent =
  | { readonly kind: 'marked'; readonly segments: readonly ConflictSegment[] }
  /** The file holds no conflict markers, so the reader resolved it by hand. */
  | { readonly kind: 'resolved' }
  | { readonly kind: 'error'; readonly message: string }

/** Arguments of one conflicted file. */
export interface ConflictArgs {
  readonly sessionId: string
  readonly path: string
}

/** Arguments of a resolution request. */
export interface ResolveConflictArgs {
  readonly sessionId: string
  readonly path: string
  /**
   * One choice per conflicted region, in file order. A shorter list leaves the
   * remaining regions as they are.
   */
  readonly choices: readonly ConflictChoice[]
}

/** Arguments of a staging or discard request that names one hunk. */
export interface HunkArgs {
  readonly sessionId: string
  readonly path: string
  /** The hunk's position in the file's patch, counted from zero. */
  readonly hunk: number
}

/** Arguments of an abort request. */
export interface AbortArgs {
  readonly sessionId: string
}

/** Arguments of a sync request. */
export interface SyncArgs {
  readonly sessionId: string
  readonly action: SyncAction
}

/** Namespace the Host service binds and the client mounts under. */
export const REMOTE_NAMESPACE = 'gitSidebar'

/** Package identity carried on every descriptor and on the client bundle. */
export const PACKAGE_NAME = '@dsh-plugin/dsh-git-sidebar'

/** Tab id of the panel, also the key its body registers under. */
export const PANEL_TAB_ID = '@dsh-plugin/dsh-git-sidebar'

/** Tab kind the Start page opens for the panel. */
export const PANEL_TAB_KIND = 'git-panel'

/** Tab id of the diff viewer, also the key its body registers under. */
export const DIFF_TAB_ID = '@dsh-plugin/dsh-git-sidebar/diff'

/** Tab kind the panel opens for one file's diff. */
export const DIFF_TAB_KIND = 'git-diff'

/**
 * Address prefix identifying a diff tab's content.
 *
 * The Sidebar's resource controller accepts `dsh-resource://` addresses only,
 * so the diff address uses that scheme with this package's own type segment.
 * That keeps one tab per file and lets the tab chip name the file.
 */
export const DIFF_ADDRESS_PREFIX = 'dsh-resource://git-diff/'

/**
 * Compose a diff tab address.
 * @param path - repository-relative path.
 * @param staged - which side of the index the diff describes.
 * @returns the address the tab system uses as content identity.
 */
export function diffAddress(path: string, staged: boolean): string {
  return `${DIFF_ADDRESS_PREFIX}${staged ? 'staged' : 'worktree'}/${encodeURIComponent(path)}`
}

/**
 * Compose the address of one commit's diff tab.
 * @param sha - the commit's object name.
 * @returns the address the tab system uses as content identity.
 */
export function commitDiffAddress(sha: string): string {
  return `${DIFF_ADDRESS_PREFIX}commit/${encodeURIComponent(sha)}`
}

/**
 * Read back the commit of a diff address.
 * @param address - an address produced by {@link commitDiffAddress}.
 * @returns the commit name, or undefined when the address names a file instead.
 */
export function parseCommitDiffAddress(address: string): string | undefined {
  const prefix = `${DIFF_ADDRESS_PREFIX}commit/`
  if (!address.startsWith(prefix)) return undefined
  const raw = address.slice(prefix.length)
  if (raw.length === 0) return undefined
  try {
    return decodeURIComponent(raw)
  } catch {
    return undefined
  }
}

/**
 * Read back a diff tab address.
 * @param address - an address produced by {@link diffAddress}.
 * @returns the path and staging side, or undefined when the address is foreign.
 */
export function parseDiffAddress(address: string): { path: string; staged: boolean } | undefined {
  if (!address.startsWith(DIFF_ADDRESS_PREFIX)) return undefined
  const rest = address.slice(DIFF_ADDRESS_PREFIX.length)
  const slash = rest.indexOf('/')
  if (slash < 0) return undefined
  const side = rest.slice(0, slash)
  if (side !== 'staged' && side !== 'worktree') return undefined
  try {
    return { path: decodeURIComponent(rest.slice(slash + 1)), staged: side === 'staged' }
  } catch {
    return undefined
  }
}
