/**
 * The Git panel body: the branch, the two change groups, conflicts, and the
 * commit box.
 *
 * Everything the panel draws comes from one `StatusSnapshot`, which the Host
 * returns after every write as well as from `status`. A write therefore never
 * settles the list from a guess: the snapshot the outcome carries replaces the
 * one on screen, so a file that a hook, a filter, or a concurrent edit moved
 * between the groups lands where Git says it is.
 *
 * The history slot at the bottom stays empty and addressable
 * (`data-git-history-slot`), so a later version fills it without moving the
 * commit box or changing this component's shape.
 */

import type {
  ChangeEntry, GitIdentity, StatusSnapshot, WriteOutcome,
} from '../shared.ts'
import { DIFF_TAB_KIND } from '../shared.ts'
import type {
  GitRemoteHandle, GitSidebarApi, ReactLike, TabBodyProps, TabInfo, Translate,
} from './api.ts'
import { messageOf, unavailableSnapshot } from './api.ts'
import { CommitBox } from './commit-box.ts'
import { confirmDiscard } from './dialog.ts'
import { Icon } from './icons.ts'
import { makeFileRow, type RowAction } from './row.ts'
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

  /** The panel: one snapshot, one message, and the writes that change them. */
  function GitPanel(props: TabBodyProps): unknown {
    const sessionId = props.sessionId ?? ''
    const [snapshot, setSnapshot] = React.useState<StatusSnapshot | undefined>(undefined)
    const [loading, setLoading] = React.useState(true)
    const [busy, setBusy] = React.useState(false)
    const [message, setMessage] = React.useState('')
    const [notice, setNotice] = React.useState('')

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

    const current = (): StatusSnapshot => snapshot ?? EMPTY_SNAPSHOT
    const tab = runtime.tab(props)

    const calls: SessionCalls = {
      stage: paths => runtime.api.ready.then(api => api.stage(sessionId, paths)),
      unstage: paths => runtime.api.ready.then(api => api.unstage(sessionId, paths)),
      discard: (paths, includeUntracked) => runtime.api.ready
        .then(api => api.discard(sessionId, paths, includeUntracked)),
      commit: text => runtime.api.ready.then(api => api.commit(sessionId, text)),
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
            return
          }
          setNotice(outcome.message === '' ? failure : outcome.message)
        })
    }

    const refresh = (): void => {
      setNotice('')
      load()
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

    if (snapshot === undefined) {
      return React.createElement('section', {
        className: `${PREFIX}-root`,
        'data-git-panel': '',
        ...busy ? { 'data-git-busy': '' } : {},
      },
        branchHeader(React, t, undefined, loading, refresh),
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
      branchHeader(React, t, snapshot, loading, refresh),
      stateBlock(React, t(`state.${problem}.title`), t(`state.${problem}.body`), snapshot.message),
      )
    }

    const total = snapshot.staged.length + snapshot.unstaged.length + snapshot.conflicts.length
    return React.createElement('section', {
      className: `${PREFIX}-root`,
      'data-git-panel': '',
      ...busy ? { 'data-git-busy': '' } : {},
    },
      branchHeader(React, t, snapshot, loading, refresh),
      React.createElement('div', { className: `${PREFIX}-body` },
        notice === '' ? null : React.createElement('p', { className: `${PREFIX}-notice`, role: 'alert' }, notice),
        total === 0 ? stateBlock(React, t('state.clean.title'), t('state.clean.body')) : null,
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
      // The lower half stays empty in this version: the history view that will
      // fill it owns no state here, and the slot keeps its place in the layout.
      React.createElement('div', {
        className: `${PREFIX}-history-slot`,
        'data-git-history-slot': '',
        style: { flex: 1, minHeight: 0, overflow: 'auto' },
      }),
    )
  }
  return GitPanel
}

/**
 * Open one file's diff as its own tab.
 *
 * The Sidebar's `openResource` accepts `dsh-resource://` addresses only, and a
 * diff address is this package's own scheme, so the viewer is opened by kind and
 * handed its file through the navigation parameters; it declares `multiple`, so
 * two files are two tabs rather than one tab re-navigated.
 * @param tab - the panel's own tab.
 * @param path - the changed file.
 * @param staged - which side of the index to read.
 */
function openFileDiff(tab: TabInfo['tab'] | undefined, path: string, staged: boolean): void {
  if (tab === undefined) return
  tab.actions.openTab(DIFF_TAB_KIND, { params: { path, staged } })
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

/** The branch header: the checked-out name, the short commit when HEAD is detached, and refresh. */
function branchHeader(
  React: ReactLike,
  t: Translate,
  snapshot: StatusSnapshot | undefined,
  loading: boolean,
  refresh: () => void,
): unknown {
  const detached = snapshot?.branch === null
  // An unavailable snapshot describes no checkout, so its header names no
  // branch rather than claiming an unknown one.
  const label = snapshot === undefined || snapshot.kind === 'unavailable'
    ? ''
    : snapshot.branch ?? snapshot.commit ?? t('branch.unknown')
  const root = snapshot?.root
  return React.createElement('div', { className: `${PREFIX}-header` },
    snapshot === undefined
      ? React.createElement('span', { className: `${PREFIX}-branch`, 'aria-busy': 'true' }, loading ? '…' : '')
      : React.createElement('span', {
        className: `${PREFIX}-branch`,
        'data-git-branch': '',
        'data-detached': detached ? '' : undefined,
        title: root === undefined || label === '' ? undefined : `${label}\n${root}`,
      }, label),
    root === undefined
      ? null
      : React.createElement('span', { className: `${PREFIX}-sub`, title: root }, root),
    React.createElement('button', {
      type: 'button',
      className: `${PREFIX}-tool`,
      'aria-label': t('refresh'),
      title: t('refresh'),
      'data-git-refresh': '',
      'data-turning': loading ? '' : undefined,
      disabled: loading,
      onClick: refresh,
    }, Icon(React, 'refresh')),
  )
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
