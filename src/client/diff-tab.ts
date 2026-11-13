/**
 * The diff viewer tab: one file's changes or one commit's patch, drawn from the
 * payload the Host already parsed.
 *
 * Registration follows the ordinary two-stage path a tab type uses: the
 * definition goes into `sidebarRightTabs`, the body into the keyed
 * `sidebar.right.pane.tab` seat under the same id. A page type names no guide
 * entry, so it never appears on the Start page; it claims this package's
 * resource scheme instead, which is what gives each file and each commit its own
 * tab.
 *
 * React and the Remote are not this module's to own. The client entry supplies
 * React from the module table, and the readers and copy either as factory
 * arguments or, following the slot framework's injected-props seat, as
 * `props.requestDiff`, `props.requestCommit`, and `props.t`. Both are accepted
 * because neither is invented here: one is how the shell hands React over, the
 * other is how the Sidebar's `inject` callback hands a body its services.
 *
 * A diff tab can name its target three ways, and all are read. A `commit/`
 * address carries a commit, a `staged/` or `worktree/` address carries a file
 * and its side of the index, and a page opened by kind is recorded at
 * `sidebar://<kind>` instead, so the target arrives in the navigation
 * parameters. That last shape is what an `openTab` open produces, and it is why
 * {@link makeDiffTitle} exists — the chip title captured at open time cannot
 * know the target of a later navigation.
 */

import type { CommitDetailArgs, DiffArgs, DiffHunk, DiffPayload } from '../shared.ts'
import {
  DIFF_ADDRESS_PREFIX, DIFF_TAB_ID, DIFF_TAB_KIND, parseCommitDiffAddress, parseDiffAddress,
} from '../shared.ts'
import { basenameOf, toRows, type DiffRow } from './diff-parse.ts'

/**
 * The React face this module calls.
 *
 * The parameter of {@link makeDiffBody} stays `unknown` on purpose: the client
 * entry declares its own minimal `ReactLike`, so a narrow parameter type would
 * reject the caller's value even though the loader's React is the real one. The
 * cast happens once, here.
 */
export interface DiffReactSurface {
  createElement(type: unknown, props?: unknown, ...children: unknown[]): unknown
  useState<T>(initial: T): [T, (value: T) => void]
  useEffect(effect: () => (() => void) | void, deps: readonly unknown[]): void
}

/** The tab type declaration the Sidebar registers; `guide` stays unset on purpose. */
export interface DiffTabDefinition {
  readonly id: string
  readonly kind: string
  /** Each open is its own content: a page open must not fold a second file into the first file's tab. */
  readonly multiple: boolean
  /**
   * Resource globs this type claims. Naming the package's own address scheme
   * lets a diff open as a resource tab, which keeps one tab per file or commit.
   */
  readonly patterns?: readonly string[]
  /**
   * The chip text, taken from the address the tab opened with.
   *
   * The parameter is optional because a page open passes the address the record
   * carries, while the Sidebar's own registry type takes a plain string; an
   * optional parameter is assignable to both.
   * @param address - the address the tab is recorded at.
   * @returns a file's basename, a commit's short name, or the generic label.
   */
  readonly title: (address?: string) => string
}

/** What the body needs from the client entry: the Remote readers, copy, and whether styles are already in. */
export interface DiffRuntime {
  /**
   * Read one file's diff.
   * @param args - the file and which side of the index to read.
   * @param signal - aborts the request when the tab navigates away.
   * @returns the Host's payload, or a rejection this body reports as a failure.
   */
  requestDiff?: (args: DiffArgs, signal?: AbortSignal) => Promise<DiffPayload>
  /**
   * Read one commit's own patch.
   * @param args - the commit and the Session whose checkout holds it.
   * @param signal - aborts the request when the tab navigates away.
   * @returns the Host's payload, in the same shape a file diff arrives in.
   */
  requestCommit?: (args: CommitDetailArgs, signal?: AbortSignal) => Promise<DiffPayload>
  /** Translate one copy key of {@link DIFF_DICTS}. */
  t?: (key: string) => string
  /** True once the entry injected {@link DIFF_STYLES} through `ctx.effect`, so the body need not. */
  stylesInstalled?: boolean
}

/** The props read from the slot framework: standard tab identity plus any injected readers. */
export interface DiffBodyProps {
  /** Framework-bound tab information: live address, parameters, and lifetime signal. */
  useTabInfo?: () => DiffTabInfo
  /** Session the tab belongs to, which the Remote calls name. */
  sessionId?: string
  /** File reader injected through the seat's `inject` callback, if the entry chose that path. */
  requestDiff?: DiffRuntime['requestDiff']
  /** Commit reader injected through the seat's `inject` callback, if the entry chose that path. */
  requestCommit?: DiffRuntime['requestCommit']
  /** Copy injected through the seat's `inject` callback, if the entry registered a locale. */
  t?: (key: string) => string
}

/** The share of `useTabInfo()` this module reads. */
export interface DiffTabInfo {
  readonly tab: {
    readonly navigation: {
      readonly address: string
      readonly params?: unknown
      /** Incremented on every navigation, so a repeat open of one file reads it again. */
      readonly revision?: number
    }
    /** Aborted when the tab record disappears. */
    readonly signal?: AbortSignal
  }
}

/** Locale namespace the diff copy belongs to. */
export const DIFF_LOCALE_NS = 'git-sidebar-diff'

/** Copy dictionary of the diff surfaces: locale id to a flat key/text map. */
export type DiffDictionaries = Record<string, Record<string, string>>

/** The chip text used where no address names a file or commit. */
const DEFAULT_TITLE = 'Diff'

/** Copy of the diff surfaces, in the two shipped languages. */
export const DIFF_DICTS: DiffDictionaries = {
  zh: {
    'title': '差异',
    'staged': '已暂存',
    'worktree': '工作区',
    'commit': '提交',
    'empty': '没有差异',
    'binary': '二进制文件',
    'truncated': '差异过大，已截断',
    'failed': '无法读取这个差异',
    'commitFailed': '无法读取这个提交的差异',
    'commitUnavailable': '这个提交的差异暂不可用',
    'unknownTarget': '这个差异标签页没有对应到文件或提交',
    'unavailable': '差异服务不可用',
  },
  en: {
    'title': 'Diff',
    'staged': 'Staged',
    'worktree': 'Working tree',
    'commit': 'Commit',
    'empty': 'No changes',
    'binary': 'Binary file',
    'truncated': 'The diff is too large and was truncated',
    'failed': 'Could not read this diff',
    'commitFailed': 'Could not read this commit’s diff',
    'commitUnavailable': 'This commit’s diff is unavailable',
    'unknownTarget': 'This diff tab names no file or commit',
    'unavailable': 'The diff service is unavailable',
  },
}

/** What one diff tab shows: a file on one side of the index, or a commit's own patch. */
type DiffTarget =
  | { readonly kind: 'file'; readonly path: string; readonly staged: boolean }
  | { readonly kind: 'commit'; readonly sha: string }

/** Characters of a commit name a chip shows. */
const SHORT_SHA = 7

/** What the body is showing: a request in flight, a payload, or a rejection. */
type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly payload: DiffPayload }
  | { readonly status: 'failed'; readonly message: string }

/** Class prefix of every element and rule this module owns. */
const PREFIX = 'dsh-gsd'

/**
 * The diff tab's registry definition.
 *
 * A page type opened by kind declares no resource patterns, but this one claims
 * the package's own scheme: a diff then opens as a resource tab, which is what
 * gives it a per-file identity and a chip naming the file or commit. The Start
 * page offers no entry for it. Each open is its own content, so two files (or two
 * commits) never share one tab.
 */
export const DIFF_TAB_DEFINITION: DiffTabDefinition = {
  id: DIFF_TAB_ID,
  kind: DIFF_TAB_KIND,
  multiple: true,
  // Claim this package's resource scheme so a diff opens as a resource tab:
  // that is what gives it a per-file identity and a chip naming the target.
  patterns: [`${DIFF_ADDRESS_PREFIX}**`],
  title: (address?: string): string => {
    const target = address === undefined ? undefined : addressTarget(address)
    return target === undefined ? DEFAULT_TITLE : labelOf(target)
  },
}

/**
 * Build the body the Sidebar registers under {@link DIFF_TAB_ID}.
 * @param React - the loader's React.
 * @param runtime - the Remote call, copy, and style status; injected props win over it.
 * @returns a component taking the slot framework's props.
 */
export function makeDiffBody(React: unknown, runtime?: DiffRuntime): (props: unknown) => unknown {
  const R = React as DiffReactSurface

  /** The pane: one request per target, cancelled when the tab navigates or leaves. */
  function DiffPanel(props: DiffBodyProps): unknown {
    const info = props.useTabInfo === undefined ? undefined : props.useTabInfo()
    const address = info?.tab.navigation.address ?? ''
    const target = targetOf(address, info?.tab.navigation.params)
    const revision = info?.tab.navigation.revision ?? 0
    const sessionId = props.sessionId
    const requestDiff = props.requestDiff ?? runtime?.requestDiff
    const requestCommit = props.requestCommit ?? runtime?.requestCommit
    const t = translator(props.t ?? runtime?.t)
    const [state, setState] = R.useState<ViewState>({ status: 'loading' })
    // A target that changes identity while the pane stays mounted is a new
    // request; the string is what the effect below compares, so a fresh object
    // of the same target does not read again.
    const key = target === undefined ? '' : targetKey(target)
    // A commit is read by its own endpoint and a file by the file endpoint, so a
    // missing reader is a wiring fact about one target, not about the pane.
    const missingReader = target !== undefined
      && (target.kind === 'commit' ? requestCommit === undefined : requestDiff === undefined)

    R.useEffect((): (() => void) | void => {
      if (sessionId === undefined || target === undefined || missingReader) return
      const controller = new AbortController()
      // Narrowed one branch at a time, so each reader keeps its own argument type.
      let pending: Promise<DiffPayload>
      if (target.kind === 'commit') {
        if (requestCommit === undefined) return
        pending = requestCommit({ sessionId, sha: target.sha }, controller.signal)
      } else {
        if (requestDiff === undefined) return
        pending = requestDiff({ sessionId, path: target.path, staged: target.staged }, controller.signal)
      }
      const outer = info?.tab.signal
      let live = true
      const stop = (): void => { live = false }
      if (outer !== undefined) outer.addEventListener('abort', stop)
      setState({ status: 'loading' })
      // Both readers fold their own failures into a payload, so what reaches the
      // rejection arm is a fault the caller could not turn into a value at all.
      void pending.then(
        (payload) => { if (live) setState({ status: 'ready', payload }) },
        (error: unknown) => { if (live) setState({ status: 'failed', message: messageOf(error) }) },
      )
      return () => {
        live = false
        outer?.removeEventListener('abort', stop)
        controller.abort()
      }
    }, [address, key, sessionId, requestDiff, requestCommit, revision, missingReader])

    const truncated = state.status === 'ready' && state.payload.kind === 'text'
      && state.payload.truncated === true
    return R.createElement('div', { className: PREFIX, ...identityOf(target) },
      runtime?.stylesInstalled === true ? null : styleElement(R),
      head(R, t, target, state),
      truncated ? banner(R, t('truncated')) : null,
      content(R, t, target, state, missingReader),
    )
  }

  /** Shown when the pane cannot be wired at all: a wiring fault, stated rather than hidden. */
  function DiffUnavailable(props: DiffBodyProps): unknown {
    const t = translator(props.t ?? runtime?.t)
    return R.createElement('div', { className: PREFIX },
      runtime?.stylesInstalled === true ? null : styleElement(R),
      note(R, t('unavailable')),
    )
  }

  return function DiffBody(props: unknown): unknown {
    const typed = (props ?? {}) as DiffBodyProps
    // A body without a Session or a tab reader has nothing it could read a diff
    // with, so it states the fault instead of drawing a skeleton that would
    // never resolve. Either reader alone is enough: a tab shows one target.
    const reads = typed.requestDiff !== undefined || typed.requestCommit !== undefined
      || runtime?.requestDiff !== undefined || runtime?.requestCommit !== undefined
    const usable = typeof typed.useTabInfo === 'function'
      && typeof typed.sessionId === 'string'
      && reads
    return R.createElement(usable ? DiffPanel : DiffUnavailable, typed)
  }
}

/**
 * Build the chip-title component the Sidebar registers under
 * `sidebar.right.pane.tab.title`.
 *
 * A page opened by kind is recorded at `sidebar://<kind>`, which names no
 * target, so the file or commit arrives in the navigation parameters and only a
 * live title can show it. Registering this is optional: without it the chip keeps
 * the title the registry captured when the tab opened, which is already the
 * file's basename (or the commit's short name) for an open by `diffAddress`.
 * @param React - the loader's React.
 * @param runtime - optional copy.
 * @returns a component taking the slot framework's props.
 */
export function makeDiffTitle(React: unknown, runtime?: DiffRuntime): (props: unknown) => unknown {
  const R = React as DiffReactSurface
  return function DiffTitle(props: unknown): unknown {
    const typed = (props ?? {}) as DiffBodyProps
    const info = typed.useTabInfo === undefined ? undefined : typed.useTabInfo()
    const address = info?.tab.navigation.address ?? ''
    const target = targetOf(address, info?.tab.navigation.params)
    const t = translator(typed.t ?? runtime?.t)
    return R.createElement('span', { className: `${PREFIX}-chip` },
      target === undefined ? t('title') : labelOf(target))
  }
}

/** The pane's row: the target, which side it describes, and its line counts. */
function head(
  React: DiffReactSurface,
  t: (key: string) => string,
  target: DiffTarget | undefined,
  state: ViewState,
): unknown {
  const counts = state.status === 'ready' && state.payload.kind === 'text'
    ? countOf(state.payload.hunks)
    : undefined
  const named = target === undefined ? '' : target.kind === 'file' ? target.path : target.sha
  const name = named === '' ? t('title') : named
  return React.createElement('div', { className: `${PREFIX}-head` },
    React.createElement('span', { className: `${PREFIX}-path`, title: name }, name),
    target === undefined ? null : React.createElement('span', { className: `${PREFIX}-side` }, sideOf(t, target)),
    counts === undefined
      ? null
      : React.createElement('span', { className: `${PREFIX}-counts` },
        React.createElement('span', { className: `${PREFIX}-tally ${PREFIX}-up` }, `+${counts.added}`),
        React.createElement('span', { className: `${PREFIX}-tally ${PREFIX}-down` }, `-${counts.removed}`)),
  )
}

/** The scrolling body: rows, a note, or the skeleton while the request runs. */
function content(
  React: DiffReactSurface,
  t: (key: string) => string,
  target: DiffTarget | undefined,
  state: ViewState,
  missingReader: boolean,
): unknown {
  if (target === undefined) return note(React, t('unknownTarget'))
  if (missingReader) {
    return note(React, t(target.kind === 'commit' ? 'commitUnavailable' : 'unavailable'))
  }
  if (state.status === 'loading') return skeleton(React)
  const failed = target.kind === 'commit' ? t('commitFailed') : t('failed')
  if (state.status === 'failed') return note(React, failed, state.message)
  const payload = state.payload
  if (payload.kind === 'error') return note(React, failed, payload.message)
  if (payload.kind === 'binary') {
    return note(React, t('binary'), target.kind === 'file' ? target.path : target.sha)
  }
  if (payload.hunks.length === 0) return note(React, t('empty'))
  const rows = toRows(payload.hunks)
  return React.createElement('div', { className: `${PREFIX}-body` },
    React.createElement('div', { className: `${PREFIX}-rows` },
      ...rows.map((row, index) => drawn(React, row, index))),
  )
}

/** One drawn row: its two numbers, its sign, and its text. */
function drawn(React: DiffReactSurface, row: DiffRow, key: number): unknown {
  if (row.kind === 'hunk-header') {
    return React.createElement('div', { key, className: `${PREFIX}-hunk` }, row.text)
  }
  if (row.kind === 'meta') {
    return React.createElement('div', { key, className: `${PREFIX}-meta` }, row.text)
  }
  return React.createElement('div', {
    key,
    className: `${PREFIX}-row ${PREFIX}-${row.kind}`,
    'data-git-diff-row': row.kind,
  },
    React.createElement('span', { className: `${PREFIX}-no` }, row.oldNo ?? ''),
    React.createElement('span', { className: `${PREFIX}-no` }, row.newNo ?? ''),
    React.createElement('span', { className: `${PREFIX}-sign` }, signOf(row.kind)),
    React.createElement('span', { className: `${PREFIX}-text` }, row.text),
  )
}

/** The sign column of a drawn row. */
function signOf(kind: DiffRow['kind']): string {
  if (kind === 'added') return '+'
  if (kind === 'removed') return '-'
  return ' '
}

/** A line of explanation, with an optional detail under it. */
function note(React: DiffReactSurface, message: string, detail?: string): unknown {
  const repeat = detail === undefined || detail === '' || detail === message
  return React.createElement('div', { className: `${PREFIX}-note`, role: 'status' },
    React.createElement('p', { className: `${PREFIX}-line-note` }, message),
    repeat ? null : React.createElement('p', { className: `${PREFIX}-detail` }, detail ?? ''),
  )
}

/** The bar above the rows when the Host cut the diff short. */
function banner(React: DiffReactSurface, text: string): unknown {
  return React.createElement('p', { className: `${PREFIX}-truncated`, role: 'status' }, text)
}

/** The placeholder shown while the request runs: bars at about the height the rows will take. */
function skeleton(React: DiffReactSurface): unknown {
  const widths = [62, 40, 74, 51, 33, 68, 45]
  return React.createElement('div', { className: `${PREFIX}-body`, 'aria-busy': 'true' },
    ...widths.map((width, index) => React.createElement('div', {
      key: index,
      className: `${PREFIX}-skeleton`,
      style: { width: `${width}%` },
    })),
  )
}

/** The body's stylesheet, rendered with the body when the entry did not inject it. */
function styleElement(React: DiffReactSurface): unknown {
  return React.createElement('style', { 'data-dsh-git-sidebar-diff': '' }, DIFF_STYLES)
}

/** Added and removed line counts of a diff. */
function countOf(hunks: readonly DiffHunk[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.kind === 'added') added += 1
      else if (line.kind === 'removed') removed += 1
    }
  }
  return { added, removed }
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
function targetOf(address: string, params: unknown): DiffTarget | undefined {
  const fromAddress = addressTarget(address)
  if (fromAddress !== undefined) return fromAddress
  if (typeof params !== 'object' || params === null) return undefined
  const record = params as { readonly path?: unknown; readonly staged?: unknown; readonly sha?: unknown }
  const sha = shaOf(record.sha)
  if (sha !== undefined) return { kind: 'commit', sha }
  if (typeof record.path !== 'string' || record.path === '') return undefined
  return { kind: 'file', path: record.path, staged: record.staged === true }
}

/**
 * Read the target an address names.
 * @param address - a diff resource address.
 * @returns the target, or undefined when the address is foreign.
 */
function addressTarget(address: string): DiffTarget | undefined {
  const sha = parseCommitDiffAddress(address)
  if (sha !== undefined) return { kind: 'commit', sha }
  const parsed = parseDiffAddress(address)
  if (parsed === undefined) return undefined
  return { kind: 'file', path: parsed.path, staged: parsed.staged }
}

/** A commit name worth reading, or undefined for anything else. */
function shaOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** The identity of a target, used to decide whether a read is still current. */
function targetKey(target: DiffTarget): string {
  return target.kind === 'commit' ? `commit:${target.sha}` : `file:${target.staged ? 'staged' : 'worktree'}:${target.path}`
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
function identityOf(target: DiffTarget | undefined): Record<string, string> {
  if (target === undefined) return { 'data-git-diff': '' }
  if (target.kind === 'commit') return { 'data-git-diff': target.sha, 'data-git-diff-commit': target.sha }
  return { 'data-git-diff': target.path, 'data-git-diff-file': target.path }
}

/** The chip and row text of a target: a file's basename, or a commit's short name. */
function labelOf(target: DiffTarget): string {
  return target.kind === 'commit' ? shortSha(target.sha) : basenameOf(target.path)
}

/** The first {@link SHORT_SHA} characters of a commit name. */
function shortSha(sha: string): string {
  return sha.slice(0, SHORT_SHA)
}

/** The pill beside the target: which side of the index a file diff reads, or that this is a commit. */
function sideOf(t: (key: string) => string, target: DiffTarget): string {
  if (target.kind === 'commit') return t('commit')
  return t(target.staged ? 'staged' : 'worktree')
}

/** Narrow a rejection to a line worth showing. */
function messageOf(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message
  return typeof error === 'string' ? error : ''
}

/** Copy lookup: the entry's translator first, then this module's English fallback. */
function translator(t: ((key: string) => string) | undefined): (key: string) => string {
  return (key: string): string => {
    if (t !== undefined) {
      const text = t(key)
      if (text !== key) return text
    }
    return DIFF_DICTS.en?.[key] ?? key
  }
}

/** The body's rules: only `--dsw-*` tokens, monospace for the patch itself. */
export const DIFF_STYLES = `
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
`
