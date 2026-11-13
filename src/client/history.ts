/**
 * The commit history, filling the slot the P0 panel reserved.
 *
 * One page is read when the panel first gets a snapshot, and the next page is
 * read when the list is scrolled to its foot. The sentinel at the bottom doubles
 * as the "load more" control, so a reader who never scrolls can still ask, and a
 * reader on a touch screen gets the same gesture as a wheel.
 *
 * A row opens the commit's own patch as a diff tab. That address carries
 * `commit/<sha>` rather than a path, which is the one shape the diff viewer
 * reads with `commitDetail` instead of `diff`.
 */

import type { CommitEntry } from '../shared.ts'
import { DIFF_TAB_KIND, commitDiffAddress } from '../shared.ts'
import type { ReactLike, TabInfo, Translate } from './api.ts'
import { Icon } from './icons.ts'
import { PREFIX } from './styles.ts'

/** Commits one page carries. */
const PAGE = 20

/** Props of the history section. */
export interface HistoryProps {
  /** Whether the section is open; the panel owns this so a refresh keeps it. */
  readonly open: boolean
  readonly t: Translate
  /** One page, from the offset the section asks for. */
  load(limit: number, skip: number): Promise<{ commits: readonly CommitEntry[]; hasMore: boolean }>
  /** The panel's tab, so a commit opens where the panel sits. */
  readonly tab: TabInfo['tab'] | undefined
  /** Changes whenever the newest commit might have changed, which re-reads the first page. */
  readonly revision: string
  onToggle(): void
}

/**
 * Build the history section.
 * @param React - the loader's React.
 * @returns the component the panel draws in its lower half.
 */
export function makeHistory(React: ReactLike): (props: HistoryProps) => unknown {
  return function History(props: HistoryProps): unknown {
    const { t, open } = props
    const [commits, setCommits] = React.useState<readonly CommitEntry[]>([])
    const [hasMore, setHasMore] = React.useState(false)
    const [loading, setLoading] = React.useState(false)
    const [failed, setFailed] = React.useState(false)
    // A scroll can fire several times before the first request settles, and a
    // refresh can land on top of a page still in flight. One cell holds the
    // answer so two requests can never be appended twice.
    const [gate] = React.useState<{ reading: boolean }>({ reading: false })

    const asked = commits.length

    const read = React.useCallback((skip: number): void => {
      if (gate.reading) return
      gate.reading = true
      setLoading(true)
      setFailed(false)
      void props.load(PAGE, skip)
        .then((page) => {
          setCommits(previous => skip === 0 ? page.commits : [...previous, ...page.commits])
          setHasMore(page.hasMore)
          setLoading(false)
        })
        .catch(() => {
          setFailed(true)
          setLoading(false)
        })
        .then(() => { gate.reading = false })
    }, [])

    React.useEffect(() => {
      if (!open) return
      read(0)
    }, [open, props.revision])

    const more = (): void => {
      if (loading || !hasMore) return
      read(asked)
    }

    // A reader who scrolls to the foot has asked for the next page already, so
    // the list reads it without waiting for a second gesture. The button below
    // the last row covers the reader who never scrolls and the touch screen.
    const onScroll = (event: ScrollPosition): void => {
      const node = event.currentTarget
      if (node.scrollTop + node.clientHeight < node.scrollHeight - 24) return
      more()
    }

    return React.createElement('section', {
      className: `${PREFIX}-history`,
      'data-git-history': '',
      'data-open': open ? '' : undefined,
    },
    React.createElement('div', { className: `${PREFIX}-history-head` },
      React.createElement('button', {
        type: 'button',
        className: `${PREFIX}-history-title`,
        'data-git-history-toggle': '',
        'aria-expanded': open ? 'true' : 'false',
        title: t(open ? 'history.collapse' : 'history.expand'),
        onClick: props.onToggle,
      },
      Icon(React, open ? 'expand' : 'chevron', { size: 16 }),
      React.createElement('h3', { className: `${PREFIX}-group-title` }, t('history.title'))),
      commits.length === 0 ? null : React.createElement('span', { className: `${PREFIX}-count` }, String(commits.length)),
    ),
    open ? historyBody(React, props, commits, hasMore, loading, failed, more, onScroll) : null,
    )
  }
}

/** The scrolling list, or the sentence that replaces it. */
function historyBody(
  React: ReactLike,
  props: HistoryProps,
  commits: readonly CommitEntry[],
  hasMore: boolean,
  loading: boolean,
  failed: boolean,
  more: () => void,
  onScroll: (event: ScrollPosition) => void,
): unknown {
  const { t, tab } = props
  if (failed) {
    return React.createElement('p', { className: `${PREFIX}-history-note`, role: 'status' }, t('history.failed'))
  }
  if (commits.length === 0) {
    return React.createElement('p', { className: `${PREFIX}-history-note`, role: 'status' },
      loading ? t('history.loading') : t('history.empty'))
  }
  return React.createElement('div', { className: `${PREFIX}-history-body`, onScroll },
    React.createElement('ul', { className: `${PREFIX}-commits` },
      ...commits.map(commit => commitRow(React, t, tab, commit))),
    hasMore
      ? React.createElement('button', {
        type: 'button',
        className: `${PREFIX}-history-more`,
        'data-git-history-more': '',
        disabled: loading,
        onClick: more,
      }, loading ? t('history.loading') : t('history.more'))
      : React.createElement('p', { className: `${PREFIX}-history-end`, 'data-git-history-end': '' },
        t('history.end')),
  )
}

/** One commit: its short name, its subject, who wrote it and when, and its refs. */
function commitRow(
  React: ReactLike,
  t: Translate,
  tab: TabInfo['tab'] | undefined,
  commit: CommitEntry,
): unknown {
  const open = (): void => {
    if (tab === undefined) return
    tab.actions.openResource(commitDiffAddress(commit.sha), { kind: DIFF_TAB_KIND })
  }
  return React.createElement('li', { key: commit.sha, className: `${PREFIX}-commit` },
    React.createElement('button', {
      type: 'button',
      className: `${PREFIX}-commit-open`,
      'data-git-history-row': commit.sha,
      title: `${commit.short} ${commit.subject}`,
      onClick: open,
    },
    React.createElement('span', { className: `${PREFIX}-sha` }, commit.short),
    React.createElement('span', { className: `${PREFIX}-subject` }, commit.subject),
    commit.refs.length === 0 ? null : React.createElement('span', { className: `${PREFIX}-refs` },
      ...commit.refs.map(ref => React.createElement('span', {
        key: ref,
        className: `${PREFIX}-ref`,
        'data-ref': refKind(ref),
      }, refName(ref)))),
    React.createElement('span', { className: `${PREFIX}-commit-meta` },
      React.createElement('span', { className: `${PREFIX}-author` }, commit.author),
      React.createElement('span', { className: `${PREFIX}-when`, title: commit.when },
        relativeTime(t, commit.when))),
    ),
  )
}

/**
 * How a decoration is drawn: a local branch and HEAD take the brand ink, while
 * a tag stays quiet. Git prefixes a tag with `tag: ` in `%D`, which is the only
 * shape that can be told apart from a branch without asking the repository.
 * @param ref - one entry of a commit's `%D` list.
 * @returns which of the two inks the label uses.
 */
function refKind(ref: string): 'tag' | 'branch' {
  return ref.startsWith('tag: ') ? 'tag' : 'branch'
}

/** The text of a decoration: Git writes a tag as `tag: v1`, but the tag is `v1`. */
function refName(ref: string): string {
  const tag = 'tag: '
  return ref.startsWith(tag) ? ref.slice(tag.length) : ref
}

/** The share of a scrolling element's position this module reads. */
interface ScrollPosition {
  readonly currentTarget: {
    readonly scrollTop: number
    readonly clientHeight: number
    readonly scrollHeight: number
  }
}

/** How far in the past a commit is, in the largest unit that still says something. */
function relativeTime(t: Translate, when: string): string {
  const then = Date.parse(when)
  if (!Number.isFinite(then)) return when
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (seconds < 60) return t('history.justNow')
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return t('history.minutesAgo', { count: minutes })
  const hours = Math.round(minutes / 60)
  if (hours < 24) return t('history.hoursAgo', { count: hours })
  const days = Math.round(hours / 24)
  if (days < 30) return t('history.daysAgo', { count: days })
  const months = Math.round(days / 30)
  if (months < 12) return t('history.monthsAgo', { count: months })
  return t('history.yearsAgo', { count: Math.round(months / 12) })
}
