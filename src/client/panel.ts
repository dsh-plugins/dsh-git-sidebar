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
  BranchList, ChangeEntry, CommitEntry, ConflictChoice, ConflictContent, GitIdentity, StashEntry, StatusSnapshot,
  SyncAction, WriteOutcome,
} from '../shared.ts'
import { DIFF_TAB_KIND, diffAddress } from '../shared.ts'
import type {
  GitRemoteHandle, GitSidebarApi, ReactLike, TabBodyProps, TabInfo, Translate,
} from './api.ts'
import { messageOf, unavailableSnapshot } from './api.ts'
import { makeBranchHeader, type BranchHeaderProps } from './branch-header.ts'
import { CommitBox } from './commit-box.ts'
import {
  confirmAbort, confirmDeleteBranch, confirmDiscard, confirmForceDelete, confirmMerge, confirmSync, notify,
} from './dialog.ts'
import { makeHistory } from './history.ts'
import { Icon } from './icons.ts'
import { makeFileRow, type RowAction } from './row.ts'
import { makeStashGroup, type StashProps } from './stash-group.ts'
import { PREFIX } from './styles.ts'
import { conflictNotice, makeConflictView } from './conflict-view.ts'
import { rangeBetween, selectionKey, type SelectionKey } from './list-model.ts'
import type { RowSelectEvent } from './row.ts'

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

/** A conflicted file the reader has open, with the choices made so far. */
interface OpenConflict {
  readonly path: string
  readonly content: ConflictContent | undefined
  readonly choices: readonly ConflictChoice[]
}

/**
 * The first choice per region: keep both sides.
 *
 * Keeping both never discards a line, so the default is the one a reader cannot
 * regret; picking a side is the deliberate narrowing that follows.
 * @param content - what the Host read.
 * @returns one choice per region.
 */
function defaultChoices(content: ConflictContent): ConflictChoice[] {
  if (content.kind !== 'marked') return []
  const regions = content.segments.filter(segment => segment.kind === 'conflict')
  return regions.map(() => 'both' as const)
}

/**
 * The endpoints one render's handlers call, already named with the Session.
 */
interface SessionCalls {
  stage(paths: readonly string[]): Promise<WriteOutcome>
  unstage(paths: readonly string[]): Promise<WriteOutcome>
  discard(paths: readonly string[], includeUntracked: boolean): Promise<WriteOutcome>
  commit(message: string, options?: { amend?: boolean; stageAll?: boolean }): ReturnType<GitSidebarApi['commit']>
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
    const [amend, setAmend] = React.useState(false)
    const [notice, setNotice] = React.useState('')
    const [stashes, setStashes] = React.useState<readonly StashEntry[]>([])
    const [historyOpen, setHistoryOpen] = React.useState(true)
    const [conflict, setConflict] = React.useState<OpenConflict | null>(null)
    const [filter, setFilter] = React.useState('')
    const [selected, setSelected] = React.useState<readonly SelectionKey[]>([])
    const [anchor, setAnchor] = React.useState<string | null>(null)

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
      commit: (text, options) => runtime.api.ready.then(api => api.commit(sessionId, text, options)),
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

    /**
     * Stage the given paths, or the whole unstaged group when none are given.
     * @param paths - the paths the group action applies to.
     */
    const stagePaths = (paths: readonly string[]): void => {
      const wanted = paths.length > 0 ? [...paths] : current().unstaged.map(entry => entry.path)
      if (wanted.length === 0) return
      clearSelection()
      write(() => calls.stage(wanted), t('notice.stageFailed'))
    }
    const unstagePaths = (paths: readonly string[]): void => {
      const wanted = paths.length > 0 ? [...paths] : current().staged.map(entry => entry.path)
      if (wanted.length === 0) return
      clearSelection()
      write(() => calls.unstage(wanted), t('notice.unstageFailed'))
    }
    /**
     * Discard the given paths, asking first and naming what is untracked.
     * @param paths - the paths the group action applies to.
     */
    const discardPaths = (paths: readonly string[]): void => {
      const entries = current().unstaged.filter(entry => paths.includes(entry.path))
      if (entries.length === 0) return
      const files = entries.map(entry => entry.path)
      const untracked = entries.filter(entry => entry.status === 'untracked').map(entry => entry.path)
      if (!confirmDiscard(t, { files, untracked })) return
      clearSelection()
      write(() => calls.discard(files, untracked.length > 0), t('notice.discardFailed'))
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

    /** Open one conflicted file: read its regions and clear the previous choice. */
    const openConflict = (path: string): void => {
      setConflict({ path, content: undefined, choices: [] })
      void runtime.api.ready
        .then(api => api.conflict(sessionId, path))
        .catch((error: unknown) => ({ kind: 'error' as const, message: messageOf(error) }))
        .then((content) => {
          setConflict((open) => open === null || open.path !== path
            ? open
            : { path, content, choices: defaultChoices(content) })
        })
    }

    /** Record one region's choice, leaving the others alone. */
    const chooseRegion = (index: number, choice: ConflictChoice): void => {
      setConflict((open) => {
        if (open === null) return open
        const choices = [...open.choices]
        choices[index] = choice
        return { ...open, choices }
      })
    }

    const resolveOpenConflict = (): void => {
      if (conflict === null) return
      const { path, choices } = conflict
      setBusy(true)
      setNotice('')
      void runtime.api.ready
        .then(api => api.resolveConflict(sessionId, path, choices))
        .catch((error: unknown) => ({ ok: false as const, problem: 'failed' as const, message: messageOf(error) }))
        .then((outcome) => {
          setBusy(false)
          const text = conflictNotice(outcome, t)
          if (text !== '') {
            setNotice(text)
            return
          }
          if (outcome.ok) setSnapshot(outcome.snapshot)
          setConflict(null)
        })
    }

    const abortOperation = (): void => {
      if (current().operation === null || current().operation === undefined) return
      if (!confirmAbort(t, String(current().operation))) return
      write(() => runtime.api.ready.then(api => api.abortOperation(sessionId)), t('notice.abortFailed'))
    }

    /** Delete one branch; an unmerged branch asks again before forcing it. */
    const deleteBranch = (branch: string): void => {
      if (!confirmDeleteBranch(t, branch)) return
      setBusy(true)
      setNotice('')
      void runtime.api.ready
        .then(api => api.deleteBranch(sessionId, branch, false))
        .catch((error: unknown) => ({ ok: false as const, problem: 'failed' as const, message: messageOf(error) }))
        .then(async (outcome) => {
          if (outcome.ok) {
            setBusy(false)
            setSnapshot(outcome.snapshot)
            return
          }
          if (outcome.problem !== 'unmerged') {
            setBusy(false)
            const text = refusalText(t, outcome.problem, outcome.message, t('notice.deleteFailed'))
            setNotice(text)
            return
          }
          // An unmerged branch is refused once so the reader can decide whether
          // its commits are worth losing; only the second answer forces it.
          setBusy(false)
          if (!confirmForceDelete(t, branch)) return
          write(() => runtime.api.ready.then(api => api.deleteBranch(sessionId, branch, true)),
            t('notice.deleteFailed'))
        })
    }

    /** Merge one branch; a conflict leaves the merge in progress for the conflict view. */
    const merge = (branch: string): void => {
      if (!confirmMerge(t, branch, current().branch ?? null)) return
      write(() => runtime.api.ready.then(api => api.mergeBranch(sessionId, branch)), t('notice.mergeFailed'))
    }

    /**
     * Commit the written message, amending or staging everything when asked.
     * @param stageAll - stage every tracked change first, for a commit with an
     * empty index.
     */
    const commitWith = (stageAll: boolean): void => {
      const text = message.trim()
      if (text === '') return
      setNotice('')
      setBusy(true)
      void calls.commit(text, { amend, stageAll })
        .catch((error: unknown) => ({ ok: false as const, problem: 'failed' as const, message: messageOf(error) }))
        .then((outcome) => {
          setBusy(false)
          if (!outcome.ok) {
            setNotice(outcome.message)
            return
          }
          setSnapshot(outcome.snapshot)
          setMessage('')
          setAmend(false)
        })
    }

    const rowActions = (entry: ChangeEntry, staged: boolean, conflicted: boolean): readonly RowAction[] => {
      const openDiff = (): void => { openFileDiff(tab, entry.path, staged) }
      const diffAction: RowAction = { id: 'diff', icon: 'diff', label: t('row.diff'), run: openDiff }
      // A conflicted path's default action opens the region chooser: the diff
      // shows the same two sides with markers, which is not what resolves it.
      if (conflicted) {
        return [{
          id: 'resolve',
          icon: 'merge',
          label: t('row.resolve'),
          run: () => { openConflict(entry.path) },
        }, diffAction]
      }
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
      abort: abortOperation,
      deleteBranch,
      mergeBranch: merge,
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

    const ConflictView = makeConflictView(React)

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
    const visible = (entries: readonly ChangeEntry[], staged: boolean): ChangeEntry[] => {
      void staged
      const needle = filter.trim().toLowerCase()
      if (needle === '') return [...entries]
      return entries.filter(entry => entry.path.toLowerCase().includes(needle))
    }

    /**
     * Act on the selection when one exists, otherwise on the whole group.
     * @param group - which group the clicked action belongs to.
     * @param fallback - the group's full path list.
     * @returns the paths the action applies to.
     */
    const pathsFor = (group: 'staged' | 'unstaged', fallback: readonly string[]): string[] => {
      const picked = selected
        .filter(key => key.startsWith(`${group}:`))
        .map(key => key.slice(group.length + 1))
      return picked.length > 0 ? picked : [...fallback]
    }

    const clearSelection = (): void => {
      setSelected([])
      setAnchor(null)
    }

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
    const selectRow = (
      group: 'staged' | 'unstaged',
      entries: readonly ChangeEntry[],
      path: string,
      range: boolean,
    ): void => {
      const key = selectionKey(group, path)
      if (range) {
        const span = rangeBetween(entries, anchor, path).map(picked => selectionKey(group, picked))
        setSelected([...new Set([...selected, ...span])])
        return
      }
      setAnchor(path)
      setSelected(selected.includes(key)
        ? selected.filter(existing => existing !== key)
        : [...selected, key])
    }

    /**
     * The change list, replaced by the conflict view while a conflicted file is
     * open: resolving one region needs its two sides on screen, which the list
     * has no room for.
     */
    const bodyElement = (snapshotNow: StatusSnapshot): unknown => {
      if (conflict !== null) {
        return React.createElement(ConflictView, {
          path: conflict.path,
          content: conflict.content,
          choices: conflict.choices,
          busy,
          t,
          choose: chooseRegion,
          submit: resolveOpenConflict,
          close: () => { setConflict(null) },
        })
      }
      return React.createElement('div', { className: `${PREFIX}-body` },
        notice === '' ? null : React.createElement('p', { className: `${PREFIX}-notice`, role: 'alert' }, notice),
        React.createElement('input', {
          type: 'search',
          className: `${PREFIX}-filter`,
          'data-git-filter': '',
          value: filter,
          placeholder: t('list.filter'),
          'aria-label': t('list.filter'),
          spellCheck: false,
          onChange: (event: { target: { value: string } }) => { setFilter(event.target.value) },
        }),
        changeGroup(React, {
          title: t('group.staged'),
          group: 'staged',
          count: snapshotNow.staged.length,
          rows: visible(snapshotNow.staged, true).map(entry => React.createElement(FileRow, {
            key: `staged:${entry.path}`,
            entry,
            actions: rowActions(entry, true, false),
            t,
            selected: selected.includes(selectionKey('staged', entry.path)),
            onSelect: (event: RowSelectEvent) => { selectRow('staged', visible(snapshotNow.staged, true), entry.path, event.shiftKey) },
          })),
          actions: [{
            id: 'unstage-all',
            label: t('group.unstageAll'),
            icon: 'unstage',
            disabled: busy || snapshotNow.staged.length === 0,
            run: () => { unstagePaths(pathsFor('staged', snapshotNow.staged.map(entry => entry.path))) },
          }, {
            id: 'discard-staged',
            label: t('group.discardStaged'),
            icon: 'discard',
            danger: true,
            disabled: busy || snapshotNow.staged.length === 0,
            run: () => { discardPaths(pathsFor('staged', snapshotNow.staged.map(entry => entry.path))) },
          }],
        }),
        changeGroup(React, {
          title: t('group.changes'),
          group: 'unstaged',
          count: snapshotNow.unstaged.length,
          rows: visible(snapshotNow.unstaged, false).map(entry => React.createElement(FileRow, {
            key: `changes:${entry.path}`,
            entry,
            actions: rowActions(entry, false, false),
            t,
            selected: selected.includes(selectionKey('unstaged', entry.path)),
            onSelect: (event: RowSelectEvent) => { selectRow('unstaged', visible(snapshotNow.unstaged, false), entry.path, event.shiftKey) },
          })),
          actions: [{
            id: 'stage-all',
            label: t('group.stageAll'),
            icon: 'stage',
            disabled: busy || snapshotNow.unstaged.length === 0,
            run: () => { stagePaths(pathsFor('unstaged', snapshotNow.unstaged.map(entry => entry.path))) },
          }, {
            id: 'discard-all',
            label: t('group.discardAll'),
            icon: 'discard',
            danger: true,
            disabled: busy || snapshotNow.unstaged.length === 0,
            run: () => { discardPaths(pathsFor('unstaged', snapshotNow.unstaged.map(entry => entry.path))) },
          }],
        }),
        selected.length === 0 ? null : React.createElement('p', {
          className: `${PREFIX}-selection`,
          'data-git-selection': String(selected.length),
          role: 'status',
        }, t('list.selected', { count: selected.length }),
        React.createElement('button', {
          type: 'button',
          className: `${PREFIX}-selection-clear`,
          'data-git-selection-clear': '',
          onClick: clearSelection,
        }, t('list.clear'))),
        snapshotNow.conflicts.length === 0 ? null : changeGroup(React, {
          title: t('group.conflicts'),
          group: 'conflicts',
          tone: 'error',
          count: snapshotNow.conflicts.length,
          rows: snapshotNow.conflicts.map(entry => React.createElement(FileRow, {
            key: `conflicted:${entry.path}`,
            entry,
            actions: rowActions(entry, false, true),
            t,
          })),
          actions: [],
        }),
        React.createElement(StashGroup, stashProps()),
      )
    }

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
    // A clean tree keeps its commit box: amending the previous commit's message
    // is a legitimate clean-tree operation, and hiding the box would make that
    // the one thing the panel cannot do.
    if (total === 0 && conflict === null) {
      return React.createElement('section', {
        className: `${PREFIX}-root`,
        'data-git-panel': '',
        ...busy ? { 'data-git-busy': '' } : {},
      },
      React.createElement(BranchHeader, headerProps()),
      notice === '' ? null : React.createElement('p', { className: `${PREFIX}-notice`, role: 'alert' }, notice),
      stateBlock(React, t('state.clean.title'), t('state.clean.body')),
      React.createElement(StashGroup, stashProps()),
      CommitBox(React, {
        message,
        stagedCount: 0,
        unstagedCount: 0,
        clean: true,
        identityMissing: isIdentityMissing(snapshot.identity),
        busy,
        canAmend: snapshot.commit !== null && snapshot.commit !== undefined,
        amend,
        t,
        onChange: setMessage,
        onAmendChange: setAmend,
        onSubmit: commitWith,
      }),
      historyElement(),
      )
    }

    return React.createElement('section', {
      className: `${PREFIX}-root`,
      'data-git-panel': '',
      ...busy ? { 'data-git-busy': '' } : {},
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
        canAmend: snapshot.commit !== null && snapshot.commit !== undefined,
        amend,
        t,
        onChange: setMessage,
        onAmendChange: setAmend,
        onSubmit: commitWith,
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
  // A stale hunk means the file moved under the reader, so the sentence states
  // the refresh rather than repeating Git's own diagnostic.
  if (problem === 'stale') return t('notice.stale')
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
