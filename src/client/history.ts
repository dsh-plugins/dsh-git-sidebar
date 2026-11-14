/**
 * The commit history, drawn as lanes.
 *
 * One page is read when the panel first gets a snapshot, and the next page is
 * read when the list is scrolled to its foot. The sentinel at the bottom doubles
 * as the "load more" control, so a reader who never scrolls can still ask, and a
 * reader on a touch screen gets the same gesture as a wheel.
 *
 * Every row draws its own slice of the graph: the strokes `layoutGraph` assigned
 * to it plus the node the commit sits on. Slices stack, so the lines a row ends
 * at its bottom edge are the lines the next row starts at its top edge, and the
 * column reads as one drawing although no row knows its neighbours.
 *
 * A row opens the commit's own patch as a diff tab. That address carries
 * `commit/<sha>` rather than a path, which is the one shape the diff viewer
 * reads with `commitDetail` instead of `diff`.
 */

import type { CommitEntry, CommitRef } from '../shared.ts'
import { DIFF_TAB_KIND, commitDiffAddress } from '../shared.ts'
import type { ReactLike, TabInfo, Translate } from './api.ts'
import type { GraphLaneSegment, GraphRow } from './graph-model.ts'
import { layoutGraph } from './graph-model.ts'
import { Icon } from './icons.ts'
import { PREFIX } from './styles.ts'

/** Commits one page carries. */
const PAGE = 20

/** Width of one lane, and so the gutter's unit of measure. */
const LANE_W = 14

/** Height of one row, which is also the tall edge of one graph slice. */
const ROW_H = 26

/** Radius of the dot a commit is drawn as. */
const NODE_R = 4

/** The selector a row control is found by, for the arrow keys. */
const ROW_SELECTOR = '[data-git-history-row]'

/**
 * The lane palette.
 *
 * Eight inks mixed from the shell's own tokens rather than written as hex, so
 * both themes keep their contrast: the severities are tuned per theme already,
 * and a mix of two of them stays inside the same gamut. Warm and cool alternate
 * so two neighbouring lanes never look alike, since neighbours are what a reader
 * compares while following one branch.
 */
const LANE_COLORS: readonly string[] = [
  'var(--dsw-alias-brand-primary)',
  'var(--dsw-alias-state-business-primary)',
  'var(--dsw-alias-state-success-primary)',
  'var(--dsw-alias-state-warn-primary)',
  'var(--dsw-alias-state-error-primary)',
  'color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, var(--dsw-alias-state-success-primary))',
  'color-mix(in srgb, var(--dsw-alias-state-business-primary) 55%, var(--dsw-alias-state-error-primary))',
  'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 50%, var(--dsw-alias-state-business-primary))',
]

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
  /** Re-read the panel's snapshot; absent when the panel offers no refresh. */
  onRefresh?(): void
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

    const onKeyDown = (event: RowKeyEvent): void => {
      moveRowFocus(event)
    }

    const layout = layoutGraph(commits.map(commit => ({
      sha: commit.sha,
      parents: commit.parents ?? [],
    })))
    const rows = new Map<string, GraphRow>(layout.rows.map(row => [row.sha, row] as const))
    const lanes = Math.max(1, layout.lanes)
    const body: BodyView = { commits, rows, lanes, hasMore, loading, failed, more, onScroll, onKeyDown }

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
      commits.length === 0
        ? null
        : React.createElement('span', { className: `${PREFIX}-history-count` },
          t('history.count', { count: commits.length })),
      props.onRefresh === undefined ? null : React.createElement('button', {
        type: 'button',
        className: `${PREFIX}-tool ${PREFIX}-history-refresh`,
        'data-git-history-refresh': '',
        title: t('refresh'),
        'aria-label': t('refresh'),
        onClick: props.onRefresh,
      }, Icon(React, 'refresh')),
    ),
    open ? historyBody(React, props, body) : null,
    )
  }
}

/** What one page of the list draws, gathered so the render helpers take one object. */
interface BodyView {
  readonly commits: readonly CommitEntry[]
  readonly rows: ReadonlyMap<string, GraphRow>
  readonly lanes: number
  readonly hasMore: boolean
  readonly loading: boolean
  readonly failed: boolean
  readonly more: () => void
  readonly onScroll: (event: ScrollPosition) => void
  readonly onKeyDown: (event: RowKeyEvent) => void
}

/** The scrolling graph, or the sentence that replaces it. */
function historyBody(React: ReactLike, props: HistoryProps, view: BodyView): unknown {
  const { t, tab } = props
  if (view.failed) {
    return React.createElement('p', { className: `${PREFIX}-history-note`, role: 'status' }, t('history.failed'))
  }
  if (view.commits.length === 0) {
    return React.createElement('p', { className: `${PREFIX}-history-note`, role: 'status' },
      view.loading ? t('history.loading') : t('history.empty'))
  }
  return React.createElement('div', { className: `${PREFIX}-history-body`, onScroll: view.onScroll },
    React.createElement('div', {
      className: `${PREFIX}-graph`,
      'data-git-graph': '',
      'data-lanes': String(view.lanes),
    },
    React.createElement('ul', { className: `${PREFIX}-commits`, onKeyDown: view.onKeyDown },
      ...view.commits.map((commit, index) => commitRow(React, t, tab, commit, view, index)))),
    view.hasMore
      ? React.createElement('button', {
        type: 'button',
        className: `${PREFIX}-history-more`,
        'data-git-history-more': '',
        disabled: view.loading,
        onClick: view.more,
      }, view.loading ? t('history.loading') : t('history.more'))
      : React.createElement('p', { className: `${PREFIX}-history-end`, 'data-git-history-end': '' },
        t('history.end')),
  )
}

/** One commit: its slice of the graph, its short name, its subject, refs, author, and age. */
function commitRow(
  React: ReactLike,
  t: Translate,
  tab: TabInfo['tab'] | undefined,
  commit: CommitEntry,
  view: BodyView,
  index: number,
): unknown {
  const open = (): void => {
    if (tab === undefined) return
    tab.actions.openResource(commitDiffAddress(commit.sha), { kind: DIFF_TAB_KIND })
  }
  const row = view.rows.get(commit.sha) ?? { sha: commit.sha, lane: 0, segments: [] }
  const previous = view.rows.get(view.commits[index - 1]?.sha ?? '')
  return React.createElement('li', { key: commit.sha, className: `${PREFIX}-commit-row` },
    React.createElement('button', {
      type: 'button',
      className: `${PREFIX}-commit-open`,
      'data-git-history-row': commit.sha,
      title: `${commit.short} ${commit.subject}`,
      onClick: open,
    },
    graphSlice(React, row, view.lanes, continuesFromAbove(previous, row.lane)),
    React.createElement('span', { className: `${PREFIX}-sha`, title: commit.sha }, commit.short),
    React.createElement('span', { className: `${PREFIX}-subject` }, commit.subject),
    commit.refs.length === 0
      ? null
      : React.createElement('span', { className: `${PREFIX}-refs` },
        ...commit.refs.map(ref => refTag(React, ref))),
    React.createElement('span', { className: `${PREFIX}-commit-meta` },
      React.createElement('span', {
        className: `${PREFIX}-author`,
        title: `${commit.author} <${commit.email}>`,
      }, commit.author),
      React.createElement('span', { className: `${PREFIX}-when`, title: commit.when },
        relativeTime(t, commit.when))),
    ))
}

/** One decoration as a capsule, inked by what it names. */
function refTag(React: ReactLike, decoration: CommitRef | string): unknown {
  const ref = normalizeRef(decoration)
  return React.createElement('span', {
    key: `${ref.kind}:${ref.name}`,
    className: `${PREFIX}-ref`,
    'data-git-ref-kind': ref.kind,
    // The earlier two-ink split, kept so a query written before the four kinds
    // existed still finds the tag it was looking for.
    'data-ref': ref.kind === 'tag' ? 'tag' : 'branch',
    title: ref.name,
  }, ref.name)
}

/**
 * Read one decoration, whichever shape it arrived in.
 *
 * A Host built before the typed refs sent `%D` entries as strings, and the two
 * shapes mean the same thing: `tag: ` marks a tag, a slash marks a remote, and
 * anything else is a local branch.
 * @param decoration - one entry of a commit's decoration list.
 * @returns the typed ref.
 */
function normalizeRef(decoration: CommitRef | string): CommitRef {
  if (typeof decoration !== 'string') return decoration
  const tag = 'tag: '
  if (decoration.startsWith(tag)) return { name: decoration.slice(tag.length), kind: 'tag' }
  return { name: decoration, kind: decoration.includes('/') ? 'remote' : 'local' }
}

/**
 * One row's slice of the graph.
 *
 * The slice is as wide as the whole graph, so every gutter lines up, and every
 * stroke it draws fits inside `ROW_H`, which is what lets the rows stack without
 * a seam.
 * @param React - the loader's React.
 * @param row - the row the layout produced.
 * @param lanes - the graph's total width in lanes.
 * @param above - whether a line already reaches this row's own lane from above.
 * @returns the SVG element.
 */
function graphSlice(React: ReactLike, row: GraphRow, lanes: number, above: boolean): unknown {
  const width = lanes * LANE_W
  const shapes: unknown[] = []
  row.segments.forEach((segment, index) => {
    const path = segmentPath(segment, row.lane, above)
    if (path === undefined) return
    shapes.push(React.createElement('path', {
      // A malformed history can name one parent twice, which would give two
      // strokes of one row the same lane; the position keeps the keys unique.
      key: `${index}:${segment.kind}:${segment.lane}`,
      className: `${PREFIX}-graph-line`,
      'data-git-graph-line': '',
      'data-git-graph-kind': segment.kind,
      d: path,
      style: { stroke: laneColor(segment.lane) },
    }))
  })
  shapes.push(React.createElement('circle', {
    key: 'node',
    className: `${PREFIX}-graph-node`,
    'data-git-graph-node': '',
    cx: laneCenter(row.lane),
    cy: ROW_H / 2,
    r: NODE_R,
    style: { fill: laneColor(row.lane) },
  }))
  return React.createElement('svg', {
    className: `${PREFIX}-graph-row`,
    'data-git-graph-row': row.sha,
    'data-lane': String(row.lane),
    width,
    height: ROW_H,
    viewBox: `0 0 ${width} ${ROW_H}`,
    'aria-hidden': true,
    focusable: false,
  }, ...shapes)
}

/**
 * Whether a line reaches a lane from the row above it.
 *
 * The layout names what leaves a row, never what enters it, and the two are not
 * symmetric: a stroke that ends at the node stops halfway down, while one that
 * runs past the row reaches the next row's top edge. Reading the previous row
 * is therefore what tells a row whether its own lane already has a line above
 * it — a tip the history starts at does not, which is why its slice holds only a
 * dot.
 * @param previous - the row above, absent for the first row of the list.
 * @param lane - the lane being asked about.
 * @returns true when a stroke crossed the boundary between the two rows.
 */
function continuesFromAbove(previous: GraphRow | undefined, lane: number): boolean {
  if (previous === undefined) return false
  return previous.segments.some(segment => segment.lane === lane
    && (segment.kind === 'through' || segment.kind === 'down' || segment.kind === 'merge-out'))
}

/**
 * The path one stroke draws inside its row.
 *
 * The turns are cubics whose control points leave and enter vertically, which is
 * what makes a branch bend rather than break at a right angle. Every stroke ends
 * on a horizontal edge, or at the node, so a slice never needs to know where its
 * neighbour put anything.
 * @param segment - one stroke of the row.
 * @param rowLane - the lane the row's own node sits in.
 * @param above - whether a line already reaches this row's own lane from above.
 * @returns the `d` attribute, or undefined when the stroke would be a point.
 */
function segmentPath(segment: GraphLaneSegment, rowLane: number, above: boolean): string | undefined {
  const x = laneCenter(segment.lane)
  const mid = ROW_H / 2
  const quarter = ROW_H / 4
  const threeQuarters = (ROW_H * 3) / 4
  // The row's own lane may already carry a line down to the node, and drawing a
  // second stroke from the middle would leave the top half of the row empty.
  const start = above ? 0 : mid
  switch (segment.kind) {
    case 'through':
      return `M${x} 0V${ROW_H}`
    case 'up':
      return above ? `M${x} 0V${mid}` : undefined
    case 'down':
      return `M${x} ${start}V${ROW_H}`
    case 'merge-in':
      return `M${x} 0C${x} ${quarter},${laneCenter(rowLane)} ${quarter},${laneCenter(rowLane)} ${mid}`
    case 'merge-out': {
      const y = laneCenter(rowLane)
      if (y === x) return undefined
      return `M${y} ${mid}C${y} ${threeQuarters},${x} ${threeQuarters},${x} ${ROW_H}`
    }
  }
}

/** The horizontal centre of one lane. */
function laneCenter(lane: number): number {
  return lane * LANE_W + LANE_W / 2
}

/** The ink of one lane, wrapped around the palette so any depth gets a colour. */
function laneColor(lane: number): string {
  const size = LANE_COLORS.length
  return LANE_COLORS[((lane % size) + size) % size] ?? 'currentColor'
}

/** The share of a scrolling element's position this module reads. */
interface ScrollPosition {
  readonly currentTarget: {
    readonly scrollTop: number
    readonly clientHeight: number
    readonly scrollHeight: number
  }
}

/** The share of a key event the row list acts on. */
interface RowKeyEvent {
  readonly key: string
  readonly target: unknown
  preventDefault?(): void
}

/** The share of a DOM node the row list walks to move focus. */
interface RowNode {
  readonly nextElementSibling: RowNode | null
  readonly previousElementSibling: RowNode | null
  querySelector(selector: string): RowNode | null
  closest(selector: string): RowNode | null
  focus(): void
}

/**
 * Move the focus to the row below or above the focused one.
 *
 * Rows are ordinary buttons, so Tab already reaches every one of them; the arrow
 * keys only shorten the walk down a long history. Home and End are left to the
 * browser, which knows where the list starts and stops.
 * @param event - the key event the list saw.
 */
function moveRowFocus(event: RowKeyEvent): void {
  const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
  if (step === 0) return
  const target = event.target as Partial<RowNode> | null
  if (target === null || target === undefined) return
  if (typeof target.closest !== 'function') return
  const row = target.closest('li')
  if (row === null) return
  event.preventDefault?.()
  const neighbour = step > 0 ? row.nextElementSibling : row.previousElementSibling
  neighbour?.querySelector(ROW_SELECTOR)?.focus()
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
