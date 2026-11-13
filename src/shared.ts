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
export type WriteProblem = 'no-paths' | 'failed'

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
