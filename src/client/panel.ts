/**
 * The Git panel body: the branch header, the two change groups, conflicts, the
 * commit box, the stash group, and the commit history.
 *
 * Everything the panel draws comes from one `StatusSnapshot`, which the Host
 * returns after every write as well as from `status`. A write therefore never
 * settles the list from a guess: the snapshot the outcome carries replaces the
 * one on screen, so a file that a hook, a filter, or a concurrent edit moved
 * between the groups lands where Git says it is.
 *
 * The branch list, the stash entries, and the history page are not part of that
 * snapshot: they are read on demand. A snapshot is read on every refresh and
 * after every write, and carrying three extra lists through it would make each
 * of those reads pay for data the panel is not showing.
 */

import type {
  BranchList, ChangeEntry, CommitEntry, GitIdentity, StashEntry, StatusSnapshot, SyncAction, WriteOutcome,
} from '../shared.ts'
import { DIFF_TAB_KIND, diffAddress } from '../shared.ts'
import type {
  GitRemoteHandle, GitSidebarApi, ReactLike, TabBodyProps, TabInfo, Translate,
} from './api.ts'
import { messageOf, unavailableSnapshot } from './api.ts'
import { makeBranchHeader, type BranchHeaderProps } from './branch-header.ts'
import { CommitBox } from './commit-box.ts'
import { confirmDiscard, confirmSync, notify } from './dialog.ts'
import { makeHistory } from './history.ts'
import { Icon } from './icons.ts'
import { makeFileRow, type RowAction } from './row.ts'
import { makeStashGroup, type StashProps } from './stash-group.ts'
import { PREFIX } from './styles.ts'

/** The panel's runtime facts, fixed for the life of the plugin. */
export interface PanelRuntime {
  readonly api: GitRemoteHandle
  readonly t: Translate
  /** Read the body's own tab, so a diff opens where the file's tab belongs. */
  readonly tab: (props: TabBodyProps) => TabInfo['tab'] | undefined
}

/** A snapshot to read while nothing has arrived yet. */
const EMPTY_SNAPSHOT: StatusSnapshot = {
  kind: 'repository',
  staged: [],
  unstaged: [],
  conflicts: [],
  identity: { name: null, email: null },
}

/** What the branch picker shows when the listing could not be read at all. */
const EMPTY_BRANCHES: BranchList = { current: null, local: [], remote: [] }

/** What the history shows when the page could not be read at all. */
const EMPTY_PAGE: { commits: readonly CommitEntry[]; hasMore: boolean } = { commits: [], hasMore: false }

/**
 * Refusals the reader is told about where they are looking, not only in the
 * notice line: each of them answers a branch action with a repository fact the
 * reader cannot see from the panel's own state.
 */
const REFUSAL_ALERTS: ReadonlySet<string> = new Set(['dirty', 'exists', 'invalid-name'])

/** One group-level action: what it does, how it is labelled, and which glyph draws it. */
interface GroupAction {
  readonly id: string
  readonly label: string
  readonly icon: 'stage' | 'unstage' | 'discard'
  readonly danger?: boolean
  readonly disabled?: boolean
  run(): void
}

/** The endpoints one render's handlers call, already named with the Session. */
interface SessionCalls {
  stage(paths: readonly string[]): Promise<WriteOutcome>
  unstage(paths: readonly string[]): Promise<WriteOutcome>
  discard(paths: readonly string[], includeUntracked: boolean): Promise<WriteOutcome>
  commit(message: string): ReturnType<GitSidebarApi['commit']>
  branches(): Promise<BranchList>
  checkout(branch: string): Promise<WriteOutcome>
  createBranch(name: string): Promise<WriteOutcome>
  stash(): Promise<WriteOutcome>
  stashApply(index: number, drop: boolean): Promise<WriteOutcome>
  stashDrop(index: number): Promise<WriteOutcome>
  sync(action: SyncAction): Promise<WriteOutcome>
  history(limit: number, skip: number): Promise<{ commits: readonly CommitEntry[]; hasMore: boolean }>
}

/**
 * Build the panel body.
 * @param React - the loader's React.
 * @param runtime - the Remote handle, copy, and the tab accessor.
 * @returns the component the Sidebar registers under the panel's id.
 */
export function makePanel(React: ReactLike, runtime: PanelRuntime): (props: TabBodyProps) => unknown {
  const t = runtime.t
  const FileRow = makeFileRow(React)
  const BranchHeader = makeBranchHeader(React)
  const StashGroup = makeStashGroup(React)
  const History = makeHistory(React)

  /** The panel: one snapshot, one message, and the writes that change them. */
  function GitPanel(props: TabBodyProps): unknown {
    const sessionId = props.sessionId ?? ''
    const [snapshot, setSnapshot] = React.useState<StatusSnapshot | undefined>(undefined)
    const [loading, setLoading] = React.useState(true)
    const [busy, setBusy] = React.useState(false)
    const [message, setMessage] = React.useState('')
    const [notice, setNotice] = React.useState('')
    const [stashes, setStashes] = React.useState<readonly StashEntry[]>([])
    const [historyOpen, setHistoryOpen] = React.useState(true)

    const load = React.useCallback((): void => {
      if (sessionId === '') {
        setLoading(false)
        return
      }
      setLoading(true)
      void runtime.api.ready
        .then(api => api.status(sessionId))
        .catch((error: unknown) => unavailableSnapshot(messageOf(error), 'failed'))
        .then((next) => {
          setSnapshot(next)
          setLoading(false)
        })
    }, [sessionId])

    React.useEffect(() => {
      load()
    }, [load])

    const loadStashes = React.useCallback((): void => {
      if (sessionId === '') return
      void runtime.api.ready
        .then(api => api.stashes(sessionId))
        .catch(() => [] as readonly StashEntry[])
        .then(setStashes)
    }, [sessionId])

    React.useEffect(() => {
      loadStashes()
    }, [loadStashes])

    const current = (): StatusSnapshot => snapshot ?? EMPTY_SNAPSHOT
    const tab = runtime.tab(props)

    const calls: SessionCalls = {
      stage: paths => runtime.api.ready.then(api => api.stage(sessionId, paths)),
      unstage: paths => runtime.api.ready.then(api => api.unstage(sessionId, paths)),
      discard: (paths, includeUntracked) => runtime.api.ready
        .then(api => api.discard(sessionId, paths, includeUntracked)),
      commit: text => runtime.api.ready.then(api => api.commit(sessionId, text)),
      branches: () => runtime.api.ready
        .then(api => api.branches(sessionId))
        .catch(() => EMPTY_BRANCHES),
      checkout: branch => runtime.api.ready.then(api => api.checkout(sessionId, branch)),
      createBranch: name => runtime.api.ready.then(api => api.createBranch(sessionId, name)),
      stash: () => runtime.api.ready.then(api => api.stash(sessionId)),
      stashApply: (index, drop) => runtime.api.ready.then(api => api.stashApply(sessionId, index, drop)),
      stashDrop: index => runtime.api.ready.then(api => api.stashDrop(sessionId, index)),
      sync: action => runtime.api.ready.then(api => api.sync(sessionId, action)),
      history: (limit, skip) => runtime.api.ready
        .then(api => api.history(sessionId, limit, skip))
        .catch(() => EMPTY_PAGE),
    }

    const write = (action: () => Promise<WriteOutcome>, failure: string): void => {
      setNotice('')
      setBusy(true)
      void action()
        .catch((error: unknown) => ({ ok: false as const, problem: 'failed' as const, message: messageOf(error) }))
        .then((outcome) => {
          setBusy(false)
          if (outcome.ok) {
            setSnapshot(outcome.snapshot)
            loadStashes()
            return
          }
          const text = refusalText(t, outcome.problem, outcome.message, failure)
          setNotice(text)
          // A refusal the reader did not expect — a checkout declined for a
          // dirty tree, a branch name already taken — is stated where they are
          // looking as well as in the notice line, which a busy panel can hide.
          if (REFUSAL_ALERTS.has(outcome.problem)) notify(text)
        })
    }

    const refresh = (): void => {
      setNotice('')
      load()
      loadStashes()
    }

    const stageAll = (): void => {
      const paths = current().unstaged.map(entry => entry.path)
      if (paths.length > 0) write(() => calls.stage(paths), t('notice.stageFailed'))
    }
    const unstageAll = (): void => {
      const paths = current().staged.map(entry => entry.path)
      if (paths.length > 0) write(() => calls.unstage(paths), t('notice.unstageFailed'))
    }
    const discardUnstaged = (): void => {
      const entries = current().unstaged
      if (entries.length === 0) return
      const files = entries.map(entry => entry.path)
      const untracked = entries.filter(entry => entry.status === 'untracked').map(entry => entry.path)
      if (!confirmDiscard(t, { files, untracked })) return
      write(() => calls.discard(files, true), t('notice.discardFailed'))
    }
    const discardStaged = (): void => {
      const files = current().staged.map(entry => entry.path)
      if (files.length === 0) return
      if (!confirmDiscard(t, { files, untracked: [] })) return
      write(() => calls.discard(files, false), t('notice.discardFailed'))
    }

    const stashCurrent = (): void => {
      write(() => calls.stash(), t('notice.stashFailed'))
    }
    const stashApply = (index: number): void => {
      write(() => calls.stashApply(index, false), t('notice.stashApplyFailed'))
    }
    const stashPop = (index: number): void => {
      write(() => calls.stashApply(index, true), t('notice.stashPopFailed'))
    }
    const stashDrop = (index: number): void => {
      write(() => calls.stashDrop(index), t('notice.stashDropFailed'))
    }

    const checkout = (branch: string): void => {
      write(() => calls.checkout(branch), t('notice.checkoutFailed'))
    }
    const createBranch = (name: string): void => {
      write(() => calls.createBranch(name), t('notice.createBranchFailed'))
    }
    const sync = (action: SyncAction): void => {
      if (action !== 'fetch' && !confirmSync(t, action, current().upstream?.name ?? null)) return
      setNotice('')
      setBusy(true)
      void calls.sync(action)
        .catch((error: unknown) => ({ ok: false as const, problem: 'failed' as const, message: messageOf(error) }))
        .then((outcome) => {
          setBusy(false)
          if (outcome.ok) {
            setSnapshot(outcome.snapshot)
            setNotice(t('notice.syncDone', { action: t(`sync.${action}`) }))
            return
          }
          setNotice(refusalText(t, outcome.problem, outcome.message, t('notice.syncFailed')))
        })
    }

    const commit = (): void => {
      const text = message.trim()
      if (text === '') return
      setNotice('')
      setBusy(true)
      void calls.commit(text)
        .catch((error: unknown) => ({ ok: false as const, problem: 'failed' as const, message: messageOf(error) }))
        .then((outcome) => {
          setBusy(false)
          if (!outcome.ok) {
            setNotice(outcome.message)
            return
          }
          setSnapshot(outcome.snapshot)
          setMessage('')
        })
    }

    const rowActions = (entry: ChangeEntry, staged: boolean, conflicted: boolean): readonly RowAction[] => {
      const openDiff = (): void => { openFileDiff(tab, entry.path, staged) }
      const diffAction: RowAction = { id: 'diff', icon: 'diff', label: t('row.diff'), run: openDiff }
      if (conflicted) return [diffAction]
      if (staged) {
        return [{
          id: 'unstage',
          icon: 'unstage',
          label: t('row.unstage'),
          run: () => { write(() => calls.unstage([entry.path]), t('notice.unstageFailed')) },
        }, diffAction]
      }
      const discard = (): void => {
        const untracked = entry.status === 'untracked'
        if (!confirmDiscard(t, { files: [entry.path], untracked: untracked ? [entry.path] : [] })) return
        write(() => calls.discard([entry.path], untracked), t('notice.discardFailed'))
      }
      return [{
        id: 'stage',
        icon: 'stage',
        label: t('row.stage'),
        run: () => { write(() => calls.stage([entry.path]), t('notice.stageFailed')) },
      }, {
        id: 'discard',
        icon: 'discard',
        label: t('row.discard'),
        danger: true,
        run: discard,
      }, diffAction]
    }

    const headerProps = (): BranchHeaderProps => ({
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
    })

    const stashProps = (): StashProps => ({
      entries: stashes,
      canStash: current().kind === 'repository'
        && current().staged.length + current().unstaged.length + current().conflicts.length > 0,
      busy,
      t,
      stash: stashCurrent,
      apply: stashApply,
      pop: stashPop,
      drop: stashDrop,
    })

    const historyElement = (): unknown => React.createElement(History, {
      open: historyOpen,
      t,
      load: calls.history,
      tab,
      // A commit changes the newest entry, so the list is read again after one.
      revision: snapshot?.commit ?? '',
      onToggle: () => { setHistoryOpen(!historyOpen) },
    })

    if (snapshot === undefined) {
      return React.createElement('section', {
        className: `${PREFIX}-root`,
        'data-git-panel': '',
        ...busy ? { 'data-git-busy': '' } : {},
      },
      React.createElement(BranchHeader, headerProps()),
      sessionId === ''
        ? stateBlock(React, t('state.noSession.title'), t('state.noSession.body'))
        : skeleton(React),
      )
    }

    if (snapshot.kind === 'unavailable') {
      const problem = snapshot.problem ?? 'failed'
      return React.createElement('section', {
        className: `${PREFIX}-root`,
        'data-git-panel': '',
        'data-problem': problem,
      },
      React.createElement(BranchHeader, headerProps()),
      stateBlock(React, t(`state.${problem}.title`), t(`state.${problem}.body`), snapshot.message),
      historyElement(),
      )
    }

    const total = snapshot.staged.length + snapshot.unstaged.length + snapshot.conflicts.length
    // With nothing to show, the groups and the commit box would offer empty
    // controls next to a sentence saying exactly that. The stash group and the
    // history stay, because both describe the repository rather than the tree.
    if (total === 0) {
      return React.createElement('section', {
        className: `${PREFIX}-root`,
        'data-git-panel': '',
        ...busy ? { 'data-git-busy': '' } : {},
      },
      React.createElement(BranchHeader, headerProps()),
      notice === '' ? null : React.createElement('p', { className: `${PREFIX}-notice`, role: 'alert' }, notice),
      stateBlock(React, t('state.clean.title'), t('state.clean.body')),
      React.createElement(StashGroup, stashProps()),
      historyElement(),
      )
    }

    return React.createElement('section', {
      className: `${PREFIX}-root`,
      'data-git-panel': '',
      ...busy ? { 'data-git-busy': '' } : {},
    },
      React.createElement(BranchHeader, headerProps()),
      React.createElement('div', { className: `${PREFIX}-body` },
        notice === '' ? null : React.createElement('p', { className: `${PREFIX}-notice`, role: 'alert' }, notice),
        changeGroup(React, {
          title: t('group.staged'),
          group: 'staged',
          count: snapshot.staged.length,
          rows: snapshot.staged.map(entry => React.createElement(FileRow, {
            key: `staged:${entry.path}`,
            entry,
            actions: rowActions(entry, true, false),
            t,
          })),
          actions: [{
            id: 'unstage-all',
            label: t('group.unstageAll'),
            icon: 'unstage',
            disabled: busy || snapshot.staged.length === 0,
            run: unstageAll,
          }, {
            id: 'discard-staged',
            label: t('group.discardStaged'),
            icon: 'discard',
            danger: true,
            disabled: busy || snapshot.staged.length === 0,
            run: discardStaged,
          }],
        }),
        changeGroup(React, {
          title: t('group.changes'),
          group: 'unstaged',
          count: snapshot.unstaged.length,
          rows: snapshot.unstaged.map(entry => React.createElement(FileRow, {
            key: `changes:${entry.path}`,
            entry,
            actions: rowActions(entry, false, false),
            t,
          })),
          actions: [{
            id: 'stage-all',
            label: t('group.stageAll'),
            icon: 'stage',
            disabled: busy || snapshot.unstaged.length === 0,
            run: stageAll,
          }, {
            id: 'discard-all',
            label: t('group.discardAll'),
            icon: 'discard',
            danger: true,
            disabled: busy || snapshot.unstaged.length === 0,
            run: discardUnstaged,
          }],
        }),
        snapshot.conflicts.length === 0 ? null : changeGroup(React, {
          title: t('group.conflicts'),
          group: 'conflicts',
          tone: 'error',
          count: snapshot.conflicts.length,
          rows: snapshot.conflicts.map(entry => React.createElement(FileRow, {
            key: `conflicted:${entry.path}`,
            entry,
            actions: rowActions(entry, false, true),
            t,
          })),
          actions: [],
        }),
        React.createElement(StashGroup, stashProps()),
      ),
      CommitBox(React, {
        message,
        stagedCount: snapshot.staged.length,
        identityMissing: isIdentityMissing(snapshot.identity),
        busy,
        t,
        onChange: setMessage,
        onSubmit: commit,
      }),
      historyElement(),
    )
  }
  return GitPanel
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
function openFileDiff(tab: TabInfo['tab'] | undefined, path: string, staged: boolean): void {
  if (tab === undefined) return
  tab.actions.openResource(diffAddress(path, staged), { kind: DIFF_TAB_KIND })
}

/**
 * Whether the repository has no author to commit with. A Host that could not
 * read the identity answers with both fields null, which a commit reports
 * precisely; the panel warns before that happens.
 * @param identity - what the snapshot carried.
 * @returns true when a commit is expected to be refused for a missing author.
 */
export function isIdentityMissing(identity: GitIdentity): boolean {
  return identity.name === null || identity.email === null
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
function refusalText(t: Translate, problem: string, message: string, fallback: string): string {
  if (problem === 'dirty') return t('notice.dirty')
  if (problem === 'exists') return t('notice.exists')
  if (problem === 'invalid-name') return t('notice.invalidName')
  return message === '' ? fallback : message
}

/** One group: its title, its count, its group-level actions, and its rows. */
function changeGroup(
  React: ReactLike,
  props: {
    readonly title: string
    readonly count: number
    readonly group: 'staged' | 'unstaged' | 'conflicts'
    readonly tone?: 'error'
    readonly rows: readonly unknown[]
    readonly actions: readonly GroupAction[]
  },
): unknown {
  const { title, count, rows, actions, tone } = props
  return React.createElement('section', {
    className: `${PREFIX}-group`,
    'data-git-group': props.group,
    'data-tone': tone,
    'data-count': count,
  },
  React.createElement('div', { className: `${PREFIX}-group-head` },
    React.createElement('h3', { className: `${PREFIX}-group-title` }, title),
    React.createElement('span', { className: `${PREFIX}-count` }, String(count)),
    React.createElement('span', { className: `${PREFIX}-group-actions` },
      ...actions.map(action => groupButton(React, action))),
  ),
  rows.length === 0 ? null : React.createElement('ul', { className: `${PREFIX}-list` }, ...rows),
  )
}

/** One group-level action as an icon button, labelled for pointer and assistive technology. */
function groupButton(React: ReactLike, action: GroupAction): unknown {
  return React.createElement('button', {
    key: action.id,
    type: 'button',
    className: `${PREFIX}-action`,
    'aria-label': action.label,
    title: action.label,
    'data-action': action.id,
    'data-git-action': action.id,
    ...action.danger === true ? { 'data-danger': '' } : {},
    ...action.disabled === true ? { disabled: true } : {},
    onClick: action.run,
  }, Icon(React, action.icon))
}

/** A headline, the next step under it, and the Host's own message when it has one. */
function stateBlock(React: ReactLike, title: string, body: string, detail?: string): unknown {
  const text = detail ?? ''
  return React.createElement('div', { className: `${PREFIX}-state`, role: 'status' },
    React.createElement('p', { className: `${PREFIX}-state-title` }, title),
    React.createElement('p', { className: `${PREFIX}-state-line` }, body),
    text === '' ? null : React.createElement('p', { className: `${PREFIX}-state-line` }, text),
  )
}

/** Bars at about the height the branch and the first group will take. */
function skeleton(React: ReactLike): unknown {
  const widths = [46, 70, 58, 34]
  return React.createElement('div', { className: `${PREFIX}-skeleton`, 'aria-busy': 'true' },
    ...widths.map((width, index) => React.createElement('div', {
      key: index,
      className: `${PREFIX}-skeleton-bar`,
      style: { width: `${width}%` },
    })))
}
