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

/** What a directory with a `.git` entry is, as the repository picker presents it. */
export type RepositoryKind =
  /** An ordinary checkout: `.git` is a directory. */
  | 'repository'
  /** A submodule: `.git` is a file whose gitdir lives under `.git/modules`. */
  | 'submodule'
  /** A linked worktree: `.git` is a file whose gitdir lives under `.git/worktrees`. */
  | 'worktree'

/** One checkout the scan found below the Session's working directory. */
export interface RepositoryEntry {
  /** Absolute path of the checkout's top level. */
  readonly root: string
  /** Path from the scan root, forward-slashed; `.` is the scan root itself. */
  readonly relative: string
  /** Last segment of {@link root}, for the narrow label. */
  readonly name: string
  readonly kind: RepositoryKind
}

/** What the repository picker offers, and which checkout the panel is reading. */
export interface RepositoryList {
  /** The Session's working directory, which is depth 0 of the scan. */
  readonly scanRoot: string
  /** The depth limit the scan ran under. */
  readonly depth: number
  /** The root chosen with {@link SelectRepositoryArgs}; null reads the working directory's own checkout. */
  readonly selected: string | null
  /** The checkouts found, the current one first and the rest by path. */
  readonly entries: readonly RepositoryEntry[]
  /** True when the traversal budget ran out before every directory was visited. */
  readonly truncated: boolean
  /** Reasons part of the scan could not run, such as an exclude rule that is not a regex. */
  readonly warnings: readonly string[]
  /** Why the scan failed as a whole; absent when it ran. */
  readonly error?: string
}

/** Arguments of the repository scan. */
export interface RepositoriesArgs {
  readonly sessionId: string
}

/** Arguments of a repository switch. */
export interface SelectRepositoryArgs {
  readonly sessionId: string
  /** Absolute checkout root; omitted or empty returns to the working directory's own checkout. */
  readonly root?: string
}

/** Why a repository switch refused. */
export type SelectProblem = 'no-repository' | 'failed'

/** The result of a repository switch. */
export type SelectOutcome =
  | { readonly ok: true; readonly snapshot: StatusSnapshot }
  | { readonly ok: false; readonly problem: SelectProblem; readonly message: string }

/** One checkout as the agent tools report it. */
export interface RepositoryToolEntry extends RepositoryEntry {
  /** Whether the panel is reading this checkout. */
  readonly current: boolean
}

/** What the repository listing tool returns. */
export interface RepositoryToolList {
  /** The Session's working directory, which is depth 0 of the scan. */
  readonly scanRoot: string
  readonly depth: number
  readonly entries: readonly RepositoryToolEntry[]
  readonly truncated: boolean
  readonly warnings: readonly string[]
}

/** What the open-repository tool returns once a checkout is selected. */
export interface OpenRepositoryResult {
  /** Absolute top level of the selected checkout. */
  readonly root: string
  /** Path from the Session directory; `.` when the working directory is the checkout. */
  readonly relative: string
  /** Checked-out branch; empty on a detached HEAD. */
  readonly branch: string
  /** True when HEAD points at a commit instead of a branch. */
  readonly detached: boolean
  readonly staged: number
  readonly unstaged: number
  readonly conflicts: number
}

/** Model-facing names of the tools this bundle registers. */
export const GIT_TOOL_NAMES = {
  /** List the checkouts the panel's scan finds. */
  list: 'git_repositories',
  /** Select one checkout and present its panel. */
  open: 'git_open_repository',
} as const

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

/**
 * Both sides of one file's change.
 *
 * A patch says where lines differ; the Monaco diff editor compares two whole
 * documents, so the viewer asks for the two texts the change implies instead of
 * the hunks. A side that does not exist (an addition's old side, a deletion's
 * new side) is the empty string.
 */
export type DiffSides =
  | { readonly kind: 'text'; readonly oldText: string; readonly newText: string }
  | { readonly kind: 'binary' }
  /**
   * One side is larger than the reader's cap. `bytes` is what the reader
   * measured, which is a floor rather than the exact size when the read itself
   * stopped at its own limit.
   */
  | { readonly kind: 'too-large'; readonly bytes: number }
  | { readonly kind: 'error'; readonly message: string }

/** Arguments of one file's two sides, on one side of the index. */
export interface FileSidesArgs {
  readonly sessionId: string
  readonly path: string
  /** True reads HEAD..index; false reads index..worktree. */
  readonly staged: boolean
}

/** Arguments of one file's two sides, inside one commit. */
export interface CommitSidesArgs {
  readonly sessionId: string
  readonly sha: string
  /** Path relative to the repository root; the new path of a rename. */
  readonly path: string
}

/** One file of a commit, as the diff viewer's file picker presents it. */
export interface CommitFile {
  /** Repository-relative path, the new path of a rename. */
  readonly path: string
  readonly status: ChangeStatus
  /** Original path of a rename or copy; absent otherwise. */
  readonly from?: string
  /** True when the change is binary, so no two texts describe it. */
  readonly binary: boolean
  /** Lines added in this commit, 0 for binary content. */
  readonly added: number
  /** Lines removed in this commit, 0 for binary content. */
  readonly removed: number
}

/** The result of asking for the files one commit changes. */
export type CommitFilesPayload =
  | {
    readonly kind: 'files'
    readonly files: readonly CommitFile[]
    /**
     * True when the commit has more than one parent.
     *
     * A merge has no single old side: the files, their line counts, and each
     * file's two texts are all compared against the first parent, and the
     * viewer says so instead of passing that choice off as the commit's own.
     */
    readonly merge?: boolean
  }
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
  /**
   * Commit only these paths, leaving the rest of the index as it is.
   *
   * Relative to the repository root. Absent means the commit takes the whole
   * index, which is what a client that predates the picks sends.
   */
  readonly paths?: readonly string[]
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
  /**
   * Read the log of this local branch instead of the checked-out one.
   *
   * The panel's preview state is the only caller: browsing another branch's
   * history must not move the checkout, so the log is read from the ref the
   * reader is looking at while HEAD stays where it is. Absent reads HEAD, which
   * is what a client without preview sends.
   */
  readonly branch?: string
}

/** The commit history page, and whether more commits follow it. */
export interface HistoryPage {
  readonly commits: readonly CommitEntry[]
  readonly hasMore: boolean
  /** Every commit reachable from HEAD, which is the length the header names. */
  readonly total: number
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
  /**
   * The changed block inside that hunk, counted from zero.
   *
   * A block is Git's hunk split where its context lines break it, which is what
   * the editor's per-block buttons name. Absent reads the whole hunk, which is
   * what the textual viewer's per-hunk buttons send.
   */
  readonly region?: number
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

/** Arguments of a commit-message draft. */
export interface GenerateMessageArgs {
  readonly sessionId: string
  /** Read the index instead of the working tree. */
  readonly staged: boolean
}

/**
 * Why a draft could not be written.
 *
 * `not-configured` is the one a reader can fix: the bundle needs a model route
 * before it can ask one for wording, and saying so is more useful than a generic
 * failure.
 */
export type DraftProblem = 'no-changes' | 'not-configured' | 'too-large' | 'failed'

/** The result of asking a model for a commit message. */
export type MessageDraft =
  | { readonly ok: true; readonly message: string }
  | { readonly ok: false; readonly problem: DraftProblem; readonly message: string }

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
