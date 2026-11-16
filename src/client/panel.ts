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
  BranchList, ChangeEntry, CommitEntry, ConflictChoice, ConflictContent, DraftProblem, GitIdentity, MessageDraft,
  RepositoryList, SelectOutcome, StashEntry, StatusSnapshot, SyncAction, WriteOutcome,
} from '../shared.ts'
import { DIFF_TAB_KIND, diffAddress } from '../shared.ts'
import type {
  GitRemoteHandle, GitSidebarApi, ReactLike, TabBodyProps, TabInfo, Translate,
} from './api.ts'
import { messageOf, unavailableSnapshot } from './api.ts'
import { makeBranchHeader, type BranchHeaderProps } from './branch-header.ts'
import { makeRepoBar } from './repo-picker.ts'
import { CommitBox } from './commit-box.ts'
import {
  askBranchName, confirmAbort, confirmDeleteBranch, confirmDetach, confirmDiscard, confirmForceDelete,
  confirmMerge, confirmPreviewCheckout, confirmSync, notify,
} from './dialog.ts'
import { HISTORY_CHROME_H, makeHistory, ROW_H } from './history.ts'
import { Icon } from './icons.ts'
import { makeFileRow, type RowAction } from './row.ts'
import { makeStashGroup, type StashProps } from './stash-group.ts'
import { PREFIX } from './styles.ts'
import {
  clampPaneSize, gitPane, PANE_DEFAULTS, PANE_FLOOR, PANES_EXPANDED, PANE_MIN, paneKeySize, snapPaneSize, startPaneDrag,
  type PaneCollapsed, type PaneId, type PaneKeyEvent, type PanePointerEvent, type PaneSizes,
} from './panes.ts'
import { conflictNotice, makeConflictView } from './conflict-view.ts'
import { rangeBetween, selectionKey, togglePick, type SelectionKey } from './list-model.ts'
import type { RowSelectEvent } from './row.ts'
import {
  appendHistory, createPanelCache, forgetHistory, invalidateSession, rememberStashes, rememberStatus,
  type PanelCache,
} from './panel-cache.ts'
import { makeDialogHost } from './dialog-host.ts'
import { makeProgress } from './progress.ts'

/** The panel's runtime facts, fixed for the life of the plugin. */
export interface PanelRuntime {
  readonly api: GitRemoteHandle
  readonly t: Translate
  /** Read the body's own tab, so a diff opens where the file's tab belongs. */
  readonly tab: (props: TabBodyProps) => TabInfo['tab'] | undefined
  /**
   * What the panel remembers between mounts.
   *
   * One instance per plugin activation, so a closed and reopened tab renders
   * what the previous mount already read instead of asking again.
   */
  readonly cache?: PanelCache
  /** Drop the cached patches; a refresh is the reader saying the tree moved. */
  readonly clearDiffCache?: () => void
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
const EMPTY_PAGE: { commits: readonly CommitEntry[]; hasMore: boolean; total: number } = { commits: [], hasMore: false, total: 0 }

/** What the repository picker shows when the scan could not run at all. */
const EMPTY_REPOS: RepositoryList = {
  scanRoot: '',
  depth: 0,
  selected: null,
  entries: [],
  truncated: false,
  warnings: [],
}

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
  readonly icon: 'stage' | 'unstage' | 'discard' | 'undo'
  readonly danger?: boolean
  readonly disabled?: boolean
  run(): void
}

/**
 * Which of the three lists the panel is showing.
 *
 * The three are read at once but used one at a time: a reader staging files
 * wants the whole column for the list they are working in, not three lists
 * sharing it.
 */
type Section = 'unstaged' | 'staged' | 'stashes'

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
  commit(
    message: string,
    options?: { amend?: boolean; stageAll?: boolean; paths?: readonly string[] },
  ): ReturnType<GitSidebarApi['commit']>
  generateMessage(staged: boolean): Promise<MessageDraft>
  branches(): Promise<BranchList>
  checkout(branch: string): Promise<WriteOutcome>
  createBranch(name: string, from?: string): Promise<WriteOutcome>
  stash(): Promise<WriteOutcome>
  stashApply(index: number, drop: boolean): Promise<WriteOutcome>
  stashDrop(index: number): Promise<WriteOutcome>
  sync(action: SyncAction): Promise<WriteOutcome>
  history(limit: number, skip: number, branch?: string): Promise<{ commits: readonly CommitEntry[]; hasMore: boolean; total: number }>
  repositories(): Promise<RepositoryList>
  selectRepository(root?: string): Promise<SelectOutcome>
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
  const RepoBar = makeRepoBar(React)
  const StashGroup = makeStashGroup(React)
  const History = makeHistory(React)
  const Progress = makeProgress(React)
  const DialogHost = makeDialogHost(React)
  // A caller that supplies no cache still gets a working panel: the factory
  // then owns an empty one, which behaves exactly like an always-cold cache.
  const cache = runtime.cache ?? createPanelCache()

  /** The panel: one snapshot, one message, and the writes that change them. */
  function GitPanel(props: TabBodyProps): unknown {
    const sessionId = props.sessionId ?? ''
    // The first render reads the cache, so a reopened tab draws its previous
    // content immediately instead of a skeleton that resolves a moment later.
    // `useState` keeps only the first value it is given, so re-reading the cache
    // on later renders cannot move the panel back to an older snapshot.
    const cachedStatus = cache.status.get(sessionId)
    const cachedStashes = cache.stashes.get(sessionId)
    const [snapshot, setSnapshot] = React.useState<StatusSnapshot | undefined>(cachedStatus)
    const [loading, setLoading] = React.useState(cachedStatus === undefined)
    const [busy, setBusy] = React.useState(false)
    const [refreshing, setRefreshing] = React.useState(false)
    const [message, setMessage] = React.useState('')
    const [amend, setAmend] = React.useState(false)
    const [recentOpen, setRecentOpen] = React.useState(false)
    const [drafting, setDrafting] = React.useState(false)
    // Offered back as one-click messages. Seeded from the cached page and kept
    // current by the history's own remember hook, so this costs no request.
    const [recent, setRecent] = React.useState<readonly string[]>(subjectsOf(cache.history.get(sessionId)))
    const [notice, setNotice] = React.useState('')
    const [stashes, setStashes] = React.useState<readonly StashEntry[]>(cachedStashes ?? [])
    // The three regions of the body, each with the height the reader gave it and
    // a fold of its own. They are per mount, so a closed and reopened tab starts
    // from the defaults again.
    const [paneSizes, setPaneSizes] = React.useState<PaneSizes>(PANE_DEFAULTS)
    const [collapsedPanes, setCollapsedPanes] = React.useState<PaneCollapsed>(PANES_EXPANDED)
    // The drag in flight. A cell rather than a hook: the panel needs its stop
    // function in the cleanup of an effect, and no other hook can hold it.
    const [drag] = React.useState<{ stop: (() => void) | undefined }>({ stop: undefined })
    const [conflict, setConflict] = React.useState<OpenConflict | null>(null)
    const [filter, setFilter] = React.useState('')
    const [section, setSection] = React.useState<Section>('unstaged')
    const [selected, setSelected] = React.useState<readonly SelectionKey[]>([])
    const [anchor, setAnchor] = React.useState<string | null>(null)
    // The files the next commit takes. One set across both groups, kept apart
    // from the row selection: selecting says what a group action acts on, ticking
    // says what the commit holds.
    const [picked, setPicked] = React.useState<readonly string[]>([])
    // The branch the header and the history describe without checking it out.
    // A preview is a reading state: it moves no ref, and every write still lands
    // on the checkout the bar under the header names.
    const [preview, setPreview] = React.useState<string | null>(null)
    // Which read the first paint came from, which is what a test can observe
    // without counting requests: `hit` means the cache answered.
    const [cacheState] = React.useState<'hit' | 'miss'>(cachedStatus === undefined ? 'miss' : 'hit')
    /**
     * What the history list compares to decide whether to read again.
     *
     * It starts at whatever the last write produced, and every invalidating
     * action bumps it, so the list reads a dropped cache exactly once instead of
     * on every render of the panel.
     */
    const [historyRevision, setHistoryRevision] = React.useState('')

    /**
     * Read the snapshot, through the cache when it is there.
     *
     * A hit paints at once and stops: a cache that still asked the Host would
     * save nothing, since the wait is what the reader notices, not the parse.
     * @param force - ignore the cache and read the Host.
     * @returns a promise that settles when the snapshot on screen is current.
     */
    const load = React.useCallback(async (force = false): Promise<void> => {
      if (sessionId === '') {
        setLoading(false)
        return
      }
      const cached = force ? undefined : cache.status.get(sessionId)
      if (cached !== undefined) {
        setSnapshot(cached)
        setLoading(false)
        return
      }
      setLoading(true)
      await runtime.api.ready
        .then(api => api.status(sessionId))
        .catch((error: unknown) => unavailableSnapshot(messageOf(error), 'failed'))
        .then((next) => {
          rememberStatus(cache, sessionId, next)
          setSnapshot(next)
          setLoading(false)
        })
    }, [sessionId])

    React.useEffect(() => {
      void load()
    }, [load])

    /**
     * Read the stash entries, through the cache when it is there.
     * @param force - ignore the cache and read the Host.
     * @returns a promise that settles when the list on screen is current.
     */
    const loadStashes = React.useCallback(async (force = false): Promise<void> => {
      if (sessionId === '') return
      const cached = force ? undefined : cache.stashes.get(sessionId)
      if (cached !== undefined) {
        setStashes(cached)
        return
      }
      await runtime.api.ready
        .then(api => api.stashes(sessionId))
        .catch(() => [] as readonly StashEntry[])
        .then((entries) => {
          rememberStashes(cache, sessionId, entries)
          setStashes(entries)
        })
    }, [sessionId])

    React.useEffect(() => {
      void loadStashes()
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
      createBranch: (name, from) => runtime.api.ready.then(api => api.createBranch(sessionId, name, from)),
      stash: () => runtime.api.ready.then(api => api.stash(sessionId)),
      stashApply: (index, drop) => runtime.api.ready.then(api => api.stashApply(sessionId, index, drop)),
      stashDrop: index => runtime.api.ready.then(api => api.stashDrop(sessionId, index)),
      sync: action => runtime.api.ready.then(api => api.sync(sessionId, action)),
      generateMessage: staged => runtime.api.ready.then(api => api.generateMessage(sessionId, staged)),
      history: (limit, skip, branch) => runtime.api.ready
        .then(api => api.history(sessionId, limit, skip, branch))
        .catch(() => EMPTY_PAGE),
      repositories: () => runtime.api.ready
        .then(api => api.repositories(sessionId))
        .catch(() => EMPTY_REPOS),
      selectRepository: root => runtime.api.ready
        .then(api => api.selectRepository(sessionId, root))
        .catch(failedSelect),
    }

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
    const readHistory = (limit: number, skip: number): Promise<{ commits: readonly CommitEntry[]; hasMore: boolean; total: number }> => {
      if (preview !== null) return calls.history(limit, skip, preview)
      const cached = cache.history.get(sessionId)
      if (cached !== undefined && skip === 0) return Promise.resolve(cached)
      return calls.history(limit, skip).then((page) => {
        // The cache holds the list as the reader has built it so far, but the
        // caller asked for one page and appends it itself. Returning the merged
        // list here would make the two accumulations compound.
        if (skip === 0) {
          appendHistory(cache, sessionId, { commits: page.commits, hasMore: page.hasMore, total: page.total })
          return page
        }
        appendHistory(cache, sessionId, {
          commits: [...(cached?.commits ?? []), ...page.commits],
          hasMore: page.hasMore,
        total: page.total,
        })
        return page
      })
    }

    /**
     * Drop the cached history and make the list read it once more.
     *
     * A commit moves the head, a checkout moves the branch, and a stash moves
     * work out of the tree: all three change the newest rows of the log, so the
     * page the list is showing is wrong for exactly as long as it takes the
     * reader to scroll it. The revision is what the list watches.
     */
    const dropHistory = (): void => {
      forgetHistory(cache, sessionId)
      setHistoryRevision(`${Date.now()}:${Math.random()}`)
    }

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
    const write = (
      action: () => Promise<WriteOutcome>,
      failure: string,
      effect: 'log' | 'stashes' | 'both' | undefined = undefined,
      after?: () => void,
    ): void => {
      setNotice('')
      setBusy(true)
      void action()
        .catch((error: unknown) => ({ ok: false as const, problem: 'failed' as const, message: messageOf(error) }))
        .then((outcome) => {
          setBusy(false)
          if (outcome.ok) {
            // The write already answered with the new snapshot, so the cache is
            // updated from that reply rather than by asking again.
            rememberStatus(cache, sessionId, outcome.snapshot)
            setSnapshot(outcome.snapshot)
            if (effect === 'stashes' || effect === 'both') loadStashes(true)
            if (effect === 'log' || effect === 'both') dropHistory()
            after?.()
            return
          }
          const text = refusalText(t, outcome.problem, outcome.message, failure)
          setNotice(text)
          // A refusal the reader did not expect — a checkout declined for a
          // dirty tree, a branch name already taken — is stated where they are
          // looking as well as in the notice line, which a busy panel can hide.
          if (REFUSAL_ALERTS.has(outcome.problem)) void notify(t, text)
        })
    }

    /**
     * Throw the Session's cache away and read everything again.
     *
     * This is the one forced read: every other path either has a fresh answer in
     * hand (a write) or is content with what the cache holds.
     */
    const refresh = (): void => {
      setNotice('')
      setRefreshing(true)
      invalidateSession(cache, sessionId)
      runtime.clearDiffCache?.()
      // The list keeps its own rows, so dropping the cache is not enough: the
      // revision is what tells it the page it holds is the one just thrown away.
      dropHistory()
      // Both reads are awaited, so the bar lasts exactly as long as the work the
      // reader asked for. A cache hit cannot happen here: the entry was just
      // deleted, so both calls go to the Host.
      void Promise.all([load(true), loadStashes(true)])
        .finally(() => { setRefreshing(false) })
    }

    /**
     * Describe another branch without moving the checkout.
     *
     * Only the header and the history change: the working tree, the index, the
     * stashes and the commit box still belong to the checkout, which is what the
     * bar under the header states.
     * @param branch - the local branch to read.
     */
    const previewBranch = (branch: string): void => {
      setNotice('')
      setPreview(branch)
      setConflict(null)
      clearSelection()
    }

    /** Go back to describing the checkout; the cached page brings it back. */
    const exitPreview = (): void => {
      setNotice('')
      setPreview(null)
    }

    /**
     * Check a branch out, then run what asked for the checkout.
     *
     * A confirmed preview stops describing another branch and starts describing
     * the checkout, so the preview is cleared here rather than in every caller.
     * @param branch - the branch to check out.
     * @param then - what to run once the checkout landed; skipped on refusal.
     */
    const checkoutAndThen = (branch: string, then?: () => void): void => {
      write(() => calls.checkout(branch), t('notice.checkoutFailed'), 'log', () => {
        setPreview(null)
        then?.()
      })
    }

    /**
     * Run one action that belongs to the branch being previewed.
     *
     * A preview moves nothing, so an action that acts on the previewed branch
     * cannot run as it stands: the reader is asked, and a confirmed answer checks
     * the branch out before the action runs. Without a preview the action is
     * simply run.
     * @param action - what to do once the branch is the checkout.
     */
    const onPreviewed = (action: () => void): void => {
      const branch = preview
      if (branch === null) {
        action()
        return
      }
      void confirmPreviewCheckout(t, branch, current().branch ?? null).then((agreed) => {
        if (!agreed) return
        checkoutAndThen(branch, action)
      })
    }

    /**
     * Read another checkout of the Session's directory tree.
     *
     * Everything the panel remembers belongs to the checkout it was read from, so
     * a successful switch drops all of it: the snapshot, the stashes, the history
     * page, and the patches. The Host answers with the new checkout's snapshot,
     * which is what the list paints from, so the switch costs no second read.
     * @param root - the checkout to read; undefined returns to the working directory.
     */
    const switchRepository = (root: string | undefined): void => {
      setNotice('')
      setBusy(true)
      setRefreshing(true)
      void calls.selectRepository(root).then((outcome) => {
        setBusy(false)
        setRefreshing(false)
        if (!outcome.ok) {
          setNotice(refusalText(t, outcome.problem, outcome.message, t('notice.switchFailed')))
          return
        }
        invalidateSession(cache, sessionId)
        rememberStatus(cache, sessionId, outcome.snapshot)
        setSnapshot(outcome.snapshot)
        setStashes([])
        rememberStashes(cache, sessionId, [])
        setConflict(null)
        // A preview names a branch of the checkout just left, so it goes too.
        setPreview(null)
        clearSelection()
        setPicked([])
        runtime.clearDiffCache?.()
        dropHistory()
        void loadStashes(true)
      })
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
      void confirmDiscard(t, { files, untracked }).then((agreed) => {
        if (!agreed) return
        clearSelection()
        write(() => calls.discard(files, untracked.length > 0), t('notice.discardFailed'))
      })
    }
    const discardStaged = (): void => {
      const files = current().staged.map(entry => entry.path)
      if (files.length === 0) return
      void confirmDiscard(t, { files, untracked: [] }).then((agreed) => {
        if (!agreed) return
        write(() => calls.discard(files, false), t('notice.discardFailed'))
      })
    }

    const stashCurrent = (): void => {
      write(() => calls.stash(), t('notice.stashFailed'), 'both')
    }
    const stashApply = (index: number): void => {
      write(() => calls.stashApply(index, false), t('notice.stashApplyFailed'), 'both')
    }
    const stashPop = (index: number): void => {
      write(() => calls.stashApply(index, true), t('notice.stashPopFailed'), 'both')
    }
    const stashDrop = (index: number): void => {
      write(() => calls.stashDrop(index), t('notice.stashDropFailed'), 'stashes')
    }

    const checkout = (branch: string): void => {
      checkoutAndThen(branch)
    }
    const createBranch = (name: string): void => {
      // A new branch is created and checked out, so a preview has to become the
      // checkout first for the name to mean what the header shows.
      onPreviewed(() => {
        write(() => calls.createBranch(name), t('notice.createBranchFailed'), 'log', () => { setPreview(null) })
      })
    }

    /**
     * Check out one commit rather than a branch.
     *
     * Git accepts an object name wherever it accepts a ref, so this is the same
     * call the branch picker makes; what differs is that it leaves a detached
     * head, which is why the reader is asked first.
     * @param sha - the commit to check out.
     */
    const checkoutCommit = (sha: string): void => {
      onPreviewed(() => {
        void confirmDetach(t, sha.slice(0, 7)).then((agreed) => {
          if (!agreed) return
          write(() => calls.checkout(sha), t('notice.checkoutFailed'), 'log')
        })
      })
    }

    /**
     * Start a branch at one commit and move onto it.
     *
     * The Host creates it with `checkout -b`, so this both names the branch and
     * switches to it — the same thing the header's new-branch field does, only
     * from an older commit instead of the current head.
     * @param sha - the commit the branch starts at.
     */
    const branchFromCommit = (sha: string): void => {
      onPreviewed(() => {
        void askBranchName(t, sha.slice(0, 7)).then((name) => {
          if (name === null) return
          write(() => calls.createBranch(name, sha), t('notice.createBranchFailed'), 'log', () => {
            setPreview(null)
          })
        })
      })
    }

    /**
     * Put one commit's object name on the clipboard.
     *
     * The full name rather than the abbreviation, because the reason to copy it
     * is to paste it somewhere that resolves it.
     * @param sha - the commit whose name is copied.
     */
    const copyCommit = (sha: string): void => {
      const clipboard = navigator.clipboard
      if (clipboard === undefined) {
        void notify(t, t('notice.copyFailed'))
        return
      }
      void clipboard.writeText(sha)
        .then(() => { setNotice(t('notice.copied', { short: sha.slice(0, 7) })) })
        .catch(() => { void notify(t, t('notice.copyFailed')) })
    }
    /**
     * Ask the model for a commit message and put it in the field.
     *
     * The draft describes the index when anything is staged, because that is
     * what the commit will actually contain; otherwise it describes the working
     * tree, which is what the buttons would stage.
     */
    const draftMessage = (): void => {
      setNotice('')
      setDrafting(true)
      void calls.generateMessage(current().staged.length > 0)
        .catch((error: unknown) => ({
          ok: false as const,
          problem: 'failed' as const,
          message: messageOf(error),
        }))
        .then((draft) => {
          setDrafting(false)
          if (!draft.ok) {
            setNotice(draftRefusal(t, draft.problem, draft.message))
            return
          }
          setMessage(draft.message)
        })
    }

    const sync = (action: SyncAction): void => {
      if (action === 'fetch') {
        runSync(action)
        return
      }
      // A pull and a push act on the checked-out branch, so a preview has to
      // become the checkout first. The preview question already names the
      // operation, so the remote is not asked about twice for one gesture.
      if (preview !== null) {
        onPreviewed(() => { runSync(action) })
        return
      }
      void confirmSync(t, action, current().upstream?.name ?? null).then((agreed) => {
        if (!agreed) return
        runSync(action)
      })
    }

    /** The read the confirmation guards: a sync the reader agreed to. */
    const runSync = (action: SyncAction): void => {
      setNotice('')
      setBusy(true)
      void calls.sync(action)
        .catch((error: unknown) => ({ ok: false as const, problem: 'failed' as const, message: messageOf(error) }))
        .then((outcome) => {
          setBusy(false)
          if (outcome.ok) {
            rememberStatus(cache, sessionId, outcome.snapshot)
            setSnapshot(outcome.snapshot)
            setNotice(t('notice.syncDone', { action: t(`sync.${action}`) }))
            // A pull moves the branch the log hangs from, so the page is stale.
            dropHistory()
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
          if (outcome.ok) {
            rememberStatus(cache, sessionId, outcome.snapshot)
            setSnapshot(outcome.snapshot)
          }
          setConflict(null)
        })
    }

    const abortOperation = (): void => {
      if (current().operation === null || current().operation === undefined) return
      void confirmAbort(t, String(current().operation)).then((agreed) => {
        if (!agreed) return
        write(() => runtime.api.ready.then(api => api.abortOperation(sessionId)), t('notice.abortFailed'))
      })
    }

    /** Delete one branch; an unmerged branch asks again before forcing it. */
    const deleteBranch = (branch: string): void => {
      void confirmDeleteBranch(t, branch).then((agreed) => {
        if (agreed) removeBranch(branch)
      })
    }

    /** The delete the confirmation guards. */
    const removeBranch = (branch: string): void => {
      setBusy(true)
      setNotice('')
      void runtime.api.ready
        .then(api => api.deleteBranch(sessionId, branch, false))
        .catch((error: unknown) => ({ ok: false as const, problem: 'failed' as const, message: messageOf(error) }))
        .then(async (outcome) => {
          if (outcome.ok) {
            setBusy(false)
            rememberStatus(cache, sessionId, outcome.snapshot)
            setSnapshot(outcome.snapshot)
            // A deleted branch cannot stay previewed: the log it named is gone.
            if (branch === preview) setPreview(null)
            dropHistory()
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
          void confirmForceDelete(t, branch).then((forced) => {
            if (!forced) return
            write(() => runtime.api.ready.then(api => api.deleteBranch(sessionId, branch, true)),
              t('notice.deleteFailed'))
          })
        })
    }

    /** Merge one branch; a conflict leaves the merge in progress for the conflict view. */
    const merge = (branch: string): void => {
      if (preview !== null) {
        // The preview question already names the merge, so the merge question is
        // skipped rather than asked twice for one gesture.
        onPreviewed(() => { mergeInto(branch) })
        return
      }
      void confirmMerge(t, branch, current().branch ?? null).then((agreed) => {
        if (!agreed) return
        mergeInto(branch)
      })
    }

    /** The merge the questions guard. */
    const mergeInto = (branch: string): void => {
      write(() => runtime.api.ready.then(api => api.mergeBranch(sessionId, branch)),
        t('notice.mergeFailed'), 'log')
    }

    /**
     * Commit the written message, amending or staging everything when asked.
     *
     * Ticked paths narrow the commit to those files; a stage-all commit decides
     * its own content, so the ticks do not apply to it.
     * @param stageAll - stage every tracked change first, for a commit with an
     * empty index.
     */
    const commitWith = (stageAll: boolean): void => {
      const text = message.trim()
      if (text === '') return
      setNotice('')
      setBusy(true)
      const paths = stageAll || picked.length === 0 ? undefined : [...picked]
      const options = paths === undefined ? { amend, stageAll } : { amend, stageAll, paths }
      void calls.commit(text, options)
        .catch((error: unknown) => ({ ok: false as const, problem: 'failed' as const, message: messageOf(error) }))
        .then((outcome) => {
          setBusy(false)
          if (!outcome.ok) {
            setNotice(outcome.message)
            return
          }
          rememberStatus(cache, sessionId, outcome.snapshot)
          setSnapshot(outcome.snapshot)
          setMessage('')
          setAmend(false)
          setPicked([])
          // A commit is the newest row of the log, so the cached page is stale.
          dropHistory()
        })
    }

    /**
     * Commit, then push the branch.
     *
     * The push is the second half of one gesture, so it runs only when the
     * commit succeeded: a failed commit leaves nothing new to send, and asking
     * about a push for a write that never happened would be a question about
     * nothing.
     * @param stageAll - whether to stage every tracked change first.
     */
    const commitAndPush = (stageAll: boolean): void => {
      const text = message.trim()
      if (text === '') return
      void confirmSync(t, 'push', current().upstream?.name ?? null).then((agreed) => {
        if (!agreed) return
        pushAfterCommit(text, stageAll)
      })
    }

    /** The write the confirmation guards: a commit followed by its push. */
    const pushAfterCommit = (text: string, stageAll: boolean): void => {
      setNotice('')
      setBusy(true)
      const paths = stageAll || picked.length === 0 ? undefined : [...picked]
      const options = paths === undefined ? { amend, stageAll } : { amend, stageAll, paths }
      void calls.commit(text, options)
        .catch((error: unknown) => ({ ok: false as const, problem: 'failed' as const, message: messageOf(error) }))
        .then((outcome) => {
          if (!outcome.ok) {
            setBusy(false)
            setNotice(outcome.message)
            return
          }
          rememberStatus(cache, sessionId, outcome.snapshot)
          setSnapshot(outcome.snapshot)
          setMessage('')
          setAmend(false)
          setPicked([])
          dropHistory()
          return calls.sync('push')
            .catch((error: unknown) => ({ ok: false as const, problem: 'failed' as const, message: messageOf(error) }))
            .then((pushed) => {
              setBusy(false)
              if (pushed.ok) {
                rememberStatus(cache, sessionId, pushed.snapshot)
                setSnapshot(pushed.snapshot)
                setNotice(t('notice.commitPushed'))
                return
              }
              setNotice(refusalText(t, pushed.problem, pushed.message, t('notice.syncFailed')))
            })
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
        void confirmDiscard(t, { files: [entry.path], untracked: untracked ? [entry.path] : [] })
          .then((agreed) => {
            if (!agreed) return
            write(() => calls.discard([entry.path], untracked), t('notice.discardFailed'))
          })
      }
      return [{
        id: 'stage',
        icon: 'stage',
        label: t('row.stage'),
        run: () => { write(() => calls.stage([entry.path]), t('notice.stageFailed')) },
      }, {
        id: 'discard',
        icon: 'undo',
        label: t('row.discard'),
        danger: true,
        run: discard,
      }, diffAction]
    }

    /** The history section is open exactly while its region is expanded. */
    const historyOpen = !collapsedPanes.history

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
    const aboveOf = (id: PaneId): readonly PaneId[] =>
      id === 'history' ? ['commit', 'changes'] : id === 'commit' ? ['changes'] : []

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
    const slackOf = (): number => {
      if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return 0
      const grown = document.querySelector(`[data-git-pane='changes']`)
      if (grown === null) return 0
      return Math.max(0, Math.round(grown.getBoundingClientRect().height - paneSizes.changes))
    }

    const sizePane = (id: PaneId, size: number): void => {
      const slack = slackOf()
      setPaneSizes((previous) => {
        const wanted = snapPaneSize(id, clampPaneSize(size), ROW_H, HISTORY_CHROME_H)
        const delta = wanted - previous[id]
        if (delta === 0) return previous
        // Growing spends the column's leftover room first, then borrows from the
        // regions above in order, each down to its own floor.
        let remaining = delta > 0 ? delta - Math.min(delta, slack) : delta
        const next = { ...previous, [id]: wanted }
        for (const other of aboveOf(id)) {
          if (remaining <= 0) break
          const room = next[other] - PANE_FLOOR[other]
          const taken = Math.min(remaining, room)
          next[other] = next[other] - taken
          remaining -= taken
        }
        // The topmost region has nothing above to borrow from, so it simply takes
        // the height it was given; anything else can only use room that another
        // region gave up.
        next[id] = aboveOf(id).length === 0 ? wanted : wanted - Math.max(0, remaining)
        return next
      })
    }

    /**
     * Fold one region to its title, or unfold it at the height it had.
     * @param id - the region.
     */
    const togglePane = (id: PaneId): void => {
      setCollapsedPanes(previous => ({ ...previous, [id]: !previous[id] }))
    }

    /**
     * Follow a pointer press on one region's handle until it is released.
     * @param id - the region.
     * @param event - the press, whose height the drag measures against.
     */
    const startResize = (id: PaneId, event: PanePointerEvent): void => {
      event.preventDefault?.()
      if (typeof window === 'undefined') return
      drag.stop?.()
      drag.stop = startPaneDrag({
        size: paneSizes[id],
        startY: event.clientY,
        window,
        onSize: (size) => { sizePane(id, size) },
      })
    }

    /**
     * Move one region's handle from the keyboard.
     * @param id - the region.
     * @param event - the key, which is only acted on when the handle owns it.
     */
    const resizeByKey = (id: PaneId, event: PaneKeyEvent): void => {
      // A region of fixed rows steps by a row, so a key press always lands on a
      // whole row rather than leaving the last one cut in half.
      const next = paneKeySize(id, paneSizes[id], event.key, id === 'history' ? ROW_H : undefined)
      if (next === undefined) return
      event.preventDefault?.()
      sizePane(id, next)
    }

    // A panel that closes mid-drag must leave neither the window listeners nor
    // the body's no-select state behind.
    React.useEffect(() => () => {
      drag.stop?.()
      drag.stop = undefined
    }, [])


    /**
     * One region of the body: its handle, its title, and what it holds.
     * @param id - the region.
     * @param title - what the region is called.
     * @param content - what it holds while it is expanded.
     * @returns the region.
     */
    const pane = (id: PaneId, title: string, content: unknown): unknown => gitPane(React, {
      id,
      title,
      size: paneSizes[id],
      collapsed: collapsedPanes[id],
      // The change list is the region that can always use more room, so it takes
      // whatever the other two leave: folding the history hands its height back to
      // the list instead of leaving a band of nothing under the last region.
      grow: id === 'changes',
      t,
      content,
      onToggle: () => { togglePane(id) },
      onResizeStart: (event) => { startResize(id, event) },
      onResizeKey: (event) => { resizeByKey(id, event) },
    })

    /** The regions as one column, which is what scrolls when their heights do not fit. */
    const panes = (...regions: readonly unknown[]): unknown =>
      React.createElement('div', { className: `${PREFIX}-panes`, 'data-git-panes': '' }, ...regions)

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
      preview,
      previewBranch,
      exitPreview,
      repo: React.createElement(RepoBar, {
        root: snapshot?.root,
        loading,
        busy,
        enabled: sessionId !== '',
        t,
        list: calls.repositories,
        select: switchRepository,
      }),
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

    /**
     * The commit box, which a clean tree and a dirty one both draw.
     *
     * A clean tree keeps it because amending the previous message is a
     * legitimate clean-tree operation, and the counts it shows are zero because
     * there is nothing to commit either way.
     * @param clean - whether the working tree and the index both match HEAD.
     * @returns the box.
     */
    const commitBox = (clean: boolean): unknown => {
      const now = current()
      return CommitBox(React, {
        message,
        stagedCount: clean ? 0 : now.staged.length,
        unstagedCount: clean ? 0 : now.unstaged.length,
        pickedCount: picked.length,
        clean,
        identityMissing: isIdentityMissing(now.identity),
        busy,
        canAmend: now.commit !== null && now.commit !== undefined,
        amend,
        recent,
        recentOpen,
        drafting,
        onDraft: draftMessage,
        onRecentToggle: () => { setRecentOpen(!recentOpen) },
        t,
        onChange: setMessage,
        onAmendChange: setAmend,
        onSubmit: commitWith,
        onSubmitAndPush: commitAndPush,
      })
    }

    /**
     * The messages worth offering back: the newest subjects the cache holds.
     *
     * A reader who commits the same kind of change repeatedly wants the wording
     * they used last time, and the history page already carries it.
     */
    const historyElement = (): unknown => React.createElement(History, {
      // A preview changes the ref the list reads, and the list's own reads close
      // over the props of the mount that made them, so the branch is part of the
      // identity: a new preview gets a component that reads from zero.
      key: preview ?? 'head',
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
      onToggle: () => { togglePane('history') },
      // The history head keeps the panel's own refresh, so a reader reading the
      // graph can ask for a new snapshot without scrolling back up.
      onRefresh: refresh,
      // The cached page this Session already read: a reopened tab draws these
      // rows on its first render instead of asking the Host again. A preview
      // reads past the cache, so it neither seeds nor fills it.
      initial: preview === null ? cache.history.get(sessionId) : undefined,
      remember: preview === null
        ? (page: { commits: readonly CommitEntry[]; hasMore: boolean; total: number }) => {
          appendHistory(cache, sessionId, page)
          setRecent(subjectsOf(page))
        }
        : undefined,
      onCheckout: checkoutCommit,
      onBranchFrom: branchFromCommit,
      onCopy: copyCommit,
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
     * Record one commit box as ticked or unticked.
     *
     * Both groups feed one set, so a path staged and changed at once is ticked
     * by either row and appears once in the commit.
     * @param path - the row's repository-relative path.
     * @param on - whether the box is now ticked.
     */
    const pickFile = (path: string, on: boolean): void => {
      setPicked(current => togglePick(current, path, on))
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
      /**
       * The actions the current list offers, drawn beside the filter.
       *
       * They live here rather than on the group so the toolbar and the list
       * share one row: the group used to draw its own action row under the
       * filter, which cost a whole line for two buttons.
       */
      const sectionActions: readonly GroupAction[] = section === 'staged'
        ? [{
          id: 'unstage-all',
          label: t('group.unstageAll'),
          icon: 'unstage',
          disabled: busy || snapshotNow.staged.length === 0,
          run: () => { unstagePaths(pathsFor('staged', snapshotNow.staged.map(entry => entry.path))) },
        }, {
          id: 'discard-staged',
          label: t('group.discardStaged'),
          icon: 'undo',
          danger: true,
          disabled: busy || snapshotNow.staged.length === 0,
          run: () => { discardPaths(pathsFor('staged', snapshotNow.staged.map(entry => entry.path))) },
        }]
        : section === 'unstaged'
          ? [{
            id: 'stage-all',
            label: t('group.stageAll'),
            icon: 'stage',
            disabled: busy || snapshotNow.unstaged.length === 0,
            run: () => { stagePaths(pathsFor('unstaged', snapshotNow.unstaged.map(entry => entry.path))) },
          }, {
            id: 'discard-all',
            label: t('group.discardAll'),
            icon: 'undo',
            danger: true,
            disabled: busy || snapshotNow.unstaged.length === 0,
            run: () => { discardPaths(pathsFor('unstaged', snapshotNow.unstaged.map(entry => entry.path))) },
          }]
          : []
      return React.createElement('div', { className: `${PREFIX}-body` },
        notice === '' ? null : React.createElement('p', { className: `${PREFIX}-notice`, role: 'alert' }, notice),
        sectionTabs(React, t, section, {
          unstaged: snapshotNow.unstaged.length,
          staged: snapshotNow.staged.length,
          stashes: stashes.length,
        }, setSection),
        sectionToolbar(React, t, {
          filter: section === 'stashes' ? undefined : filter,
          onFilter: setFilter,
          actions: sectionActions,
        }),
        // Conflicts stay above the tabs: an unmerged path blocks every other
        // action, so it must not be hidden behind a tab the reader is not on.
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
        section !== 'staged' ? null : changeGroup(React, {
          title: t('group.staged'),
          group: 'staged',
          headless: true,
          count: snapshotNow.staged.length,
          rows: visible(snapshotNow.staged, true).map(entry => React.createElement(FileRow, {
            key: `staged:${entry.path}`,
            entry,
            actions: rowActions(entry, true, false),
            t,
            selected: selected.includes(selectionKey('staged', entry.path)),
            picked: picked.includes(entry.path),
            onPick: (on: boolean) => { pickFile(entry.path, on) },
            onSelect: (event: RowSelectEvent) => {
              selectRow('staged', visible(snapshotNow.staged, true), entry.path, event.shiftKey)
            },
          })),
          actions: [],
        }),
        section !== 'unstaged' ? null : changeGroup(React, {
          title: t('group.changes'),
          group: 'unstaged',
          headless: true,
          count: snapshotNow.unstaged.length,
          rows: visible(snapshotNow.unstaged, false).map(entry => React.createElement(FileRow, {
            key: `changes:${entry.path}`,
            entry,
            actions: rowActions(entry, false, false),
            t,
            selected: selected.includes(selectionKey('unstaged', entry.path)),
            picked: picked.includes(entry.path),
            onPick: (on: boolean) => { pickFile(entry.path, on) },
            onSelect: (event: RowSelectEvent) => {
              selectRow('unstaged', visible(snapshotNow.unstaged, false), entry.path, event.shiftKey)
            },
          })),
          actions: [],
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
        section !== 'stashes' ? null : React.createElement(StashGroup, { ...stashProps(), headless: true }),
      )
    }

    if (snapshot === undefined) {
      return React.createElement('section', {
        className: `${PREFIX}-root`,
        'data-git-panel': '',
        'data-git-cache': cacheState,
        ...busy ? { 'data-git-busy': '' } : {},
      },
      React.createElement(Progress, { active: loading || refreshing }),
      React.createElement(BranchHeader, headerProps()),
      sessionId === ''
        ? stateBlock(React, t('state.noSession.title'), t('state.noSession.body'))
        : skeleton(React),
      React.createElement(DialogHost, null),
      )
    }

    if (snapshot.kind === 'unavailable') {
      const problem = snapshot.problem ?? 'failed'
      return React.createElement('section', {
        className: `${PREFIX}-root`,
        'data-git-panel': '',
        'data-git-cache': cacheState,
        'data-problem': problem,
      },
      React.createElement(Progress, { active: loading || refreshing }),
      React.createElement(BranchHeader, headerProps()),
      stateBlock(React, t(`state.${problem}.title`), t(`state.${problem}.body`), snapshot.message),
      panes(pane('history', t('history.title'), historyElement())),
      React.createElement(DialogHost, null),
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
        'data-git-cache': cacheState,
        ...busy ? { 'data-git-busy': '' } : {},
      },
      React.createElement(Progress, { active: loading || refreshing }),
      React.createElement(BranchHeader, headerProps()),
      notice === '' ? null : React.createElement('p', { className: `${PREFIX}-notice`, role: 'alert' }, notice),
      // The changes region keeps its head even when the tree is clean: the reader
      // still resizes and folds it, and a column that silently loses one of its
      // three regions would move the other two under the pointer.
      panes(
        pane('changes', t('group.changes'), React.createElement('div', null,
          stateBlock(React, t('state.clean.title'), t('state.clean.body')),
          React.createElement(StashGroup, stashProps()))),
        pane('commit', t('pane.commit'), commitBox(true)),
        pane('history', t('history.title'), historyElement()),
      ),
      React.createElement(DialogHost, null),
      )
    }

    return React.createElement('section', {
      className: `${PREFIX}-root`,
      'data-git-panel': '',
      'data-git-cache': cacheState,
      ...busy ? { 'data-git-busy': '' } : {},
    },
      React.createElement(Progress, { active: loading || refreshing }),
      React.createElement(BranchHeader, headerProps()),
      panes(
        pane('changes', t('group.changes'), bodyElement(snapshot)),
        pane('commit', t('pane.commit'), commitBox(false)),
        pane('history', t('history.title'), historyElement()),
      ),
      React.createElement(DialogHost, null),
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

/** A repository switch that never reached the Host, folded into the refusal shape. */
function failedSelect(error: unknown): SelectOutcome {
  return { ok: false, problem: 'failed', message: messageOf(error) }
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
function draftRefusal(t: Translate, problem: DraftProblem, message: string): string {
  if (problem === 'no-changes') return t('notice.draftEmpty')
  if (problem === 'not-configured') return t('notice.draftUnconfigured')
  return message === '' ? t('notice.draftFailed') : message
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
    /**
     * Whether the group draws its own title and count.
     *
     * A group shown under a tab is already named by that tab, so only its
     * actions and rows are drawn.
     */
    readonly headless?: boolean
  },
): unknown {
  const { title, count, rows, actions, tone } = props
  return React.createElement('section', {
    className: `${PREFIX}-group`,
    'data-git-group': props.group,
    'data-tone': tone,
    'data-count': count,
  },
  props.headless === true
    ? actions.length === 0
      ? null
      : React.createElement('div', { className: `${PREFIX}-group-head ${PREFIX}-group-head-actions` },
        React.createElement('span', { className: `${PREFIX}-group-actions` },
          ...actions.map(action => groupButton(React, action))))
    : React.createElement('div', { className: `${PREFIX}-group-head` },
      React.createElement('h3', { className: `${PREFIX}-group-title` }, title),
      React.createElement('span', { className: `${PREFIX}-count` }, String(count)),
      React.createElement('span', { className: `${PREFIX}-group-actions` },
        ...actions.map(action => groupButton(React, action)))),
  rows.length === 0 ? null : React.createElement('ul', { className: `${PREFIX}-list` }, ...rows),
  )
}

/** One tab: which list it shows, and what it is called. */
interface SectionTab {
  readonly id: Section
  readonly label: string
  readonly count: number
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
function sectionTabs(
  React: ReactLike,
  t: Translate,
  current: Section,
  counts: { readonly unstaged: number; readonly staged: number; readonly stashes: number },
  pick: (section: Section) => void,
): unknown {
  const tabs: readonly SectionTab[] = [
    { id: 'unstaged', label: t('group.changes'), count: counts.unstaged },
    { id: 'staged', label: t('group.staged'), count: counts.staged },
    { id: 'stashes', label: t('stash.group'), count: counts.stashes },
  ]
  return React.createElement('div', {
    className: `${PREFIX}-tabs`,
    'data-git-tabs': '',
    role: 'tablist',
  },
  ...tabs.map(tab => React.createElement('button', {
    key: tab.id,
    type: 'button',
    className: `${PREFIX}-tab`,
    role: 'tab',
    'data-git-tab': tab.id,
    'data-active': tab.id === current ? '' : undefined,
    'aria-selected': tab.id === current ? 'true' : 'false',
    onClick: () => { pick(tab.id) },
  },
  React.createElement('span', { className: `${PREFIX}-tab-label` }, tab.label),
  React.createElement('span', { className: `${PREFIX}-count` }, String(tab.count)))),
  )
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
function sectionToolbar(
  React: ReactLike,
  t: Translate,
  view: {
    /** Absent on a list that has nothing to narrow. */
    readonly filter: string | undefined
    readonly onFilter: (value: string) => void
    readonly actions: readonly GroupAction[]
  },
): unknown {
  return React.createElement('div', { className: `${PREFIX}-toolbar` },
    view.filter === undefined
      ? React.createElement('span', { className: `${PREFIX}-toolbar-fill` })
      : React.createElement('input', {
        type: 'search',
        className: `${PREFIX}-filter`,
        'data-git-filter': '',
        value: view.filter,
        placeholder: t('list.filter'),
        'aria-label': t('list.filter'),
        spellCheck: false,
        onChange: (event: { target: { value: string } }) => { view.onFilter(event.target.value) },
      }),
    React.createElement('span', { className: `${PREFIX}-group-actions` },
      ...view.actions.map(action => groupButton(React, action))))
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
/** How many past messages the commit panel offers back. */
const RECENT_LIMIT = 5

/**
 * The newest distinct subjects of one page, offered as one-click messages.
 *
 * A reader who commits the same kind of change repeatedly wants the wording they
 * used last time, and the history page already carries it. Duplicates are
 * dropped so five repeats of one message do not fill the menu.
 * @param page - the cached history page, when there is one.
 * @returns up to {@link RECENT_LIMIT} subjects, newest first.
 */
function subjectsOf(page: { readonly commits: readonly CommitEntry[] } | undefined): readonly string[] {
  if (page === undefined) return []
  const seen = new Set<string>()
  const subjects: string[] = []
  for (const commit of page.commits) {
    const subject = commit.subject.trim()
    if (subject === '' || seen.has(subject)) continue
    seen.add(subject)
    subjects.push(subject)
    if (subjects.length === RECENT_LIMIT) break
  }
  return subjects
}

function skeleton(React: ReactLike): unknown {
  const widths = [46, 70, 58, 34]
  return React.createElement('div', { className: `${PREFIX}-skeleton`, 'aria-busy': 'true' },
    ...widths.map((width, index) => React.createElement('div', {
      key: index,
      className: `${PREFIX}-skeleton-bar`,
      style: { width: `${width}%` },
    })))
}
