/**
 * The commit history, drawn as lanes.
 *
 * One page is read when the panel first gets a snapshot, and the next page is
 * read when the list is scrolled to its foot. The sentinel at the bottom doubles
 * as the "load more" control, so a reader who never scrolls can still ask, and a
 * reader on a touch screen gets the same gesture as a wheel.
 *
 * Every row draws its own slice of the graph: the lines `layoutGraph` assigned to
 * it plus the node the commit sits on. Slices stack, so the lines a row ends at
 * its bottom edge are the lines the next row starts at its top edge, and the
 * column reads as one drawing although no row knows its neighbours. The geometry
 * is VS Code's: a column is 14px, a quarter turn is 5px, a merge's extra parent
 * leaves the node sideways and turns down into its own column, and the node is
 * painted last with a ring in the row's ground colour so no line crosses it.
 *
 * A row opens the commit's own patch as a diff tab. That address carries
 * `commit/<sha>` rather than a path, which is the one shape the diff viewer
 * reads with `commitDetail` instead of `diff`.
 */

import type { CommitEntry, CommitRef } from '../shared.ts'
import { DIFF_TAB_KIND, commitDiffAddress } from '../shared.ts'
import type { ReactLike, TabInfo, Translate } from './api.ts'
import type { GraphRow, GraphRowStroke } from './graph-model.ts'
import { layoutGraph } from './graph-model.ts'
import { Icon } from './icons.ts'
import { makeProgress } from './progress.ts'
import { PREFIX } from './styles.ts'

/** Commits one page carries. */
const PAGE = 20

/** Width the commit menu reserves, used to keep it inside the viewport. */
const MENU_W = 190

/** Width of one lane, and so the gutter's unit of measure. */
const LANE_W = 14

/** Height of one row, which is also the tall edge of one graph slice. */
const ROW_H = 26

/** Radius of the node a commit is drawn as, and of a merge's wider node. */
const NODE_R = 4
const MERGE_NODE_R = 6

/** Radius of the quarter turns that join a line's vertical runs. */
const TURN_R = 5

/** Ring around a node, in the colour of the ground it sits on, so lines break there. */
const NODE_RING = 'var(--dsw-alias-bg-layer-1)'

/** The selector a row control is found by, for the arrow keys. */
const ROW_SELECTOR = '[data-git-history-row]'

/**
 * The lane palette.
 *
 * Eight inks mixed from the shell's own tokens rather than written as hex, so
 * both themes keep their contrast: the severities are tuned per theme already,
 * and a mix of two of them stays inside the same gamut.
 *
 * The first entry is deliberately the brand ink, which reads as near-white in
 * the dark theme and as near-black in the light one. That is the lane the
 * checked-out branch sits in, and a neutral line is what makes the coloured
 * branches beside it legible — a coloured trunk would compete with them.
 *
 * The rest are ordered for hue separation rather than for convenience: amber,
 * green, magenta, blue, yellow-green, red, teal. Mixing two neighbouring
 * severities covers the gaps the five token inks leave, so no two lanes land on
 * the same hue.
 */
const LANE_COLORS: readonly string[] = [
  'var(--dsw-alias-brand-primary)',
  'var(--dsw-alias-state-warn-primary)',
  'var(--dsw-alias-state-success-primary)',
  'color-mix(in srgb, var(--dsw-alias-state-business-primary) 50%, var(--dsw-alias-state-error-primary))',
  'var(--dsw-alias-state-business-primary)',
  'color-mix(in srgb, var(--dsw-alias-state-success-primary) 50%, var(--dsw-alias-state-warn-primary))',
  'var(--dsw-alias-state-error-primary)',
  'color-mix(in srgb, var(--dsw-alias-state-business-primary) 60%, var(--dsw-alias-state-success-primary))',
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
  /**
   * The page this Session already read, when the panel's cache holds one.
   *
   * A reopened tab draws these rows straight away instead of asking again; the
   * rows are replaced as soon as `load` answers anything.
   */
  readonly initial?: { readonly commits: readonly CommitEntry[]; readonly hasMore: boolean }
  /** Store a page the list just read, so the next mount can draw it. */
  readonly remember?: (page: { commits: readonly CommitEntry[]; hasMore: boolean }) => void
  /** Check out one commit, leaving the branch and landing on a detached head. */
  onCheckout?(sha: string): void
  /** Create a branch starting at one commit. */
  onBranchFrom?(sha: string): void
  /** Put one commit's object name on the clipboard. */
  onCopy?(sha: string): void
}

/**
 * Build the history section.
 * @param React - the loader's React.
 * @returns the component the panel draws in its lower half.
 */
export function makeHistory(React: ReactLike): (props: HistoryProps) => unknown {
  const Progress = makeProgress(React)
  return function History(props: HistoryProps): unknown {
    const { t, open } = props
    const [commits, setCommits] = React.useState<readonly CommitEntry[]>(props.initial?.commits ?? [])
    const [hasMore, setHasMore] = React.useState(props.initial?.hasMore ?? false)
    const [loading, setLoading] = React.useState(false)
    const [failed, setFailed] = React.useState(false)
    // A scroll can fire several times before the first request settles, and a
    // refresh can land on top of a page still in flight. One cell holds the
    // answer so two requests can never be appended twice.
    const [gate] = React.useState<{ reading: boolean }>({ reading: false })
    /**
     * Whether this mount has read anything yet.
     *
     * A cached page makes the first render complete, so the effect below must
     * not read again on mount — that is exactly the request the cache exists to
     * avoid. A refresh clears the cache and bumps the revision, which is what
     * re-arms this cell.
     */
    const [armed] = React.useState<{ read: boolean }>({ read: props.initial === undefined })

    const asked = commits.length

    const read = React.useCallback((skip: number): void => {
      if (gate.reading) return
      gate.reading = true
      setLoading(true)
      setFailed(false)
      void props.load(PAGE, skip)
        .then((page) => {
          setCommits((previous) => {
            const next = skip === 0 ? page.commits : [...previous, ...page.commits]
            props.remember?.({ commits: next, hasMore: page.hasMore })
            return next
          })
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
      if (!armed.read) {
        armed.read = true
        return
      }
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

    /**
     * Which commit's menu is open, and where it was asked for.
     *
     * The menu is positioned rather than nested: the list scrolls, so a menu
     * drawn inside a row would be clipped by the scroller. Keeping the anchor
     * in state is what lets the menu render outside it.
     */
    const [menu, setMenu] = React.useState<CommitMenu | null>(null)
    const openMenu = (sha: string, node: MenuAnchor | null): void => {
      if (node === null) return
      const box = node.getBoundingClientRect()
      setMenu({ sha, top: box.bottom + 4, left: Math.max(8, box.right - MENU_W) })
    }
    const closeMenu = (): void => { setMenu(null) }

    const layout = layoutGraph(commits.map(commit => ({
      sha: commit.sha,
      parents: commit.parents ?? [],
    })))
    const rows = new Map<string, GraphRow>(layout.rows.map(row => [row.sha, row] as const))
    const lanes = Math.max(1, layout.lanes)
    const body: BodyView = {
      commits,
      rows,
      lanes,
      hasMore,
      loading,
      failed,
      more,
      onScroll,
      onKeyDown,
      menu,
      openMenu,
      closeMenu,
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
    open ? React.createElement(Progress, { active: loading }) : null,
    open ? historyBody(React, props, body) : null,
    menu === null ? null : commitMenu(React, props, menu, closeMenu),
    )
  }
}

/** Which commit's menu is open, and where on screen it hangs. */
interface CommitMenu {
  readonly sha: string
  readonly top: number
  readonly left: number
}

/** The share of a DOM node the menu needs to place itself. */
interface MenuAnchor {
  getBoundingClientRect(): { readonly bottom: number; readonly right: number }
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
  readonly menu: CommitMenu | null
  readonly openMenu: (sha: string, node: MenuAnchor | null) => void
  readonly closeMenu: () => void
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
      ...view.commits.map(commit => commitRow(React, t, tab, commit, view)))),
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
): unknown {
  const open = (): void => {
    if (tab === undefined) return
    tab.actions.openResource(commitDiffAddress(commit.sha), { kind: DIFF_TAB_KIND })
  }
  const row = view.rows.get(commit.sha) ?? { sha: commit.sha, lane: 0, color: 0, merged: false, strokes: [] }
  return React.createElement('li', { key: commit.sha, className: `${PREFIX}-commit-row` },
    React.createElement('button', {
      type: 'button',
      className: `${PREFIX}-commit-open`,
      'data-git-history-row': commit.sha,
      title: `${commit.short} ${commit.subject}`,
      onClick: open,
    },
    graphSlice(React, row, view.lanes),
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
    ),
    // The menu button is the row's second control, so it sits beside the row
    // rather than inside it: a button cannot nest in a button, and hovering the
    // row is what reveals it.
    React.createElement('button', {
      type: 'button',
      className: `${PREFIX}-commit-more`,
      'data-git-commit-more': commit.sha,
      title: t('commit.more'),
      'aria-label': t('commit.more'),
      'aria-haspopup': 'menu',
      'aria-expanded': view.menu?.sha === commit.sha ? 'true' : 'false',
      onClick: (event: MenuEvent) => {
        event.stopPropagation()
        if (view.menu?.sha === commit.sha) {
          view.closeMenu()
          return
        }
        view.openMenu(commit.sha, event.currentTarget)
      },
    }, Icon(React, 'more')),
  )
}

/** The share of a click the menu button reads. */
interface MenuEvent {
  readonly currentTarget: MenuAnchor
  stopPropagation(): void
}

/**
 * The menu one commit offers.
 *
 * It hangs in a fixed layer rather than inside the row, because the list it
 * belongs to scrolls and would clip it. A full-window backdrop closes it, which
 * is the same dismissal the branch menus use and needs no document listener.
 * @param React - the loader's React.
 * @param props - the panel's callbacks.
 * @param menu - the commit whose menu is open, and where.
 * @param close - dismissal for every entry and for the backdrop.
 * @returns the backdrop and the menu.
 */
function commitMenu(
  React: ReactLike,
  props: HistoryProps,
  menu: CommitMenu,
  close: () => void,
): unknown {
  const { t } = props
  const entry = (id: string, label: string, run: (() => void) | undefined): unknown => {
    if (run === undefined) return null
    return React.createElement('button', {
      key: id,
      type: 'button',
      className: `${PREFIX}-commit-menu-item`,
      role: 'menuitem',
      'data-git-commit-action': id,
      onClick: () => {
        close()
        run()
      },
    }, label)
  }
  return React.createElement('div', { key: 'commit-menu' },
    React.createElement('div', { className: `${PREFIX}-backdrop`, 'data-git-dismiss': '', onClick: close }),
    React.createElement('div', {
      className: `${PREFIX}-commit-menu`,
      'data-git-commit-menu': menu.sha,
      role: 'menu',
      style: { top: `${menu.top}px`, left: `${menu.left}px` },
    },
    entry('checkout', t('commit.checkout'), props.onCheckout === undefined ? undefined : () => {
      props.onCheckout?.(menu.sha)
    }),
    entry('branch', t('commit.branchFrom'), props.onBranchFrom === undefined ? undefined : () => {
      props.onBranchFrom?.(menu.sha)
    }),
    entry('copy', t('commit.copySha'), props.onCopy === undefined ? undefined : () => {
      props.onCopy?.(menu.sha)
    })),
  )
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

/** The drawing passes, in the order the shapes of one row are added. */
const DRAW_ORDER = ['passing', 'arc', 'upper', 'lower'] as const

/** One pass of the drawing, named by what it puts down. */
type DrawPhase = typeof DRAW_ORDER[number]

/**
 * Which pass draws one line.
 *
 * A line that enters at the top edge and leaves at the bottom one belongs to the
 * first pass. A merge's arc leaves the node, so it goes over those; the node's own
 * two halves go over both, which is what makes the join with its first parent
 * look like one line through the dot rather than three.
 * @param stroke - one line of the row.
 * @param rowLane - the column the row's node sits in.
 * @returns the pass that draws it.
 */
function phaseOf(stroke: GraphRowStroke, rowLane: number): DrawPhase {
  if (stroke.kind === 'through' || stroke.kind === 'bend') return 'passing'
  if (stroke.kind === 'join') return stroke.prior === rowLane ? 'upper' : 'passing'
  return stroke.next === rowLane ? 'lower' : 'arc'
}

/**
 * One row's slice of the graph.
 *
 * The slice is as wide as the whole graph, so every gutter lines up, and every
 * line it draws stays inside `ROW_H`, which is what lets the rows stack without a
 * seam: a row leaves a line at its bottom edge exactly where the next row picks
 * it up at the top edge.
 *
 * The order the shapes are added in is the whole drawing: the lines that cross
 * the row first, then a merge's arcs over them, then the node's own two halves,
 * and the node last, so its ring cuts whatever ran behind it.
 * @param React - the loader's React.
 * @param row - the row the layout produced.
 * @param lanes - the graph's total width in columns.
 * @returns the SVG element.
 */
function graphSlice(React: ReactLike, row: GraphRow, lanes: number): unknown {
  const width = laneX(lanes)
  const nodeX = laneX(row.lane)
  const shapes: unknown[] = []

  for (const phase of DRAW_ORDER) {
    row.strokes.forEach((stroke, index) => {
      if (phaseOf(stroke, row.lane) !== phase) return
      shapes.push(React.createElement('path', {
        key: `${index}:${stroke.kind}`,
        className: `${PREFIX}-graph-line`,
        'data-git-graph-line': '',
        'data-git-graph-kind': stroke.kind,
        d: strokePath(stroke, nodeX),
        style: { stroke: slotColor(stroke.color) },
      }))
    })
  }

  shapes.push(React.createElement('circle', {
    key: 'node',
    className: `${PREFIX}-graph-node`,
    'data-git-graph-node': '',
    'data-git-graph-merged': row.merged ? '' : undefined,
    cx: nodeX,
    cy: ROW_H / 2,
    r: row.merged ? MERGE_NODE_R : NODE_R,
    // The node takes its column's ink and is ringed with the row's own ground, so
    // a line running behind it reads as interrupted rather than crossed.
    style: { fill: slotColor(row.color), stroke: NODE_RING, strokeWidth: 2 },
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
 * The path of one line.
 *
 * A line that reaches an edge runs from that edge to the other; one that starts or
 * ends at the node runs only half the row, because the node itself covers the
 * rest. A sideways move happens at the node's height, as a step with rounded
 * corners rather than a diagonal, which is what keeps two lines side by side
 * readable while they cross.
 * @param stroke - one line of the row.
 * @param nodeX - the x of this row's node, which is where an open end attaches.
 * @returns the `d` attribute.
 */
function strokePath(stroke: GraphRowStroke, nodeX: number): string {
  const from = stroke.prior === undefined ? nodeX : laneX(stroke.prior)
  const to = stroke.next === undefined ? nodeX : laneX(stroke.next)
  if (stroke.prior === undefined) return branchPath(from, to)
  if (stroke.next === undefined) return joinPath(from, to)
  if (from === to) return `M${from} 0V${ROW_H}`
  return stepPath(from, to)
}

/** A full row: a vertical run, a rounded step at the node's height, a second run. */
function stepPath(from: number, to: number): string {
  const middle = ROW_H / 2
  if (to < from) {
    return `M${from} 0V${middle - TURN_R}` +
      `A${TURN_R} ${TURN_R} 0 0 1 ${from - TURN_R} ${middle}` +
      `H${to + TURN_R}` +
      `A${TURN_R} ${TURN_R} 0 0 0 ${to} ${middle + TURN_R}` +
      `V${ROW_H}`
  }
  return `M${from} 0V${middle - TURN_R}` +
    `A${TURN_R} ${TURN_R} 0 0 0 ${from + TURN_R} ${middle}` +
    `H${to - TURN_R}` +
    `A${TURN_R} ${TURN_R} 0 0 1 ${to} ${middle + TURN_R}` +
    `V${ROW_H}`
}

/** The top half: a run down from the edge, then a rounded turn into the node. */
function joinPath(from: number, nodeX: number): string {
  const middle = ROW_H / 2
  if (from === nodeX) return `M${from} 0V${middle}`
  if (from > nodeX) {
    return `M${from} 0V${middle - TURN_R}` +
      `A${TURN_R} ${TURN_R} 0 0 1 ${from - TURN_R} ${middle}` +
      `H${nodeX}`
  }
  return `M${from} 0V${middle - TURN_R}` +
    `A${TURN_R} ${TURN_R} 0 0 0 ${from + TURN_R} ${middle}` +
    `H${nodeX}`
}

/** The bottom half: a rounded turn out of the node, then a run to the edge. */
function branchPath(nodeX: number, to: number): string {
  const middle = ROW_H / 2
  if (nodeX === to) return `M${nodeX} ${middle}V${ROW_H}`
  if (to > nodeX) {
    return `M${nodeX} ${middle}H${to - TURN_R}` +
      `A${TURN_R} ${TURN_R} 0 0 1 ${to} ${middle + TURN_R}` +
      `V${ROW_H}`
  }
  return `M${nodeX} ${middle}H${to + TURN_R}` +
    `A${TURN_R} ${TURN_R} 0 0 0 ${to} ${middle + TURN_R}` +
    `V${ROW_H}`
}

/**
 * The x of one column's centre.
 *
 * The drawing keeps one column of padding on the left, so the outermost line of a
 * graph that starts at the head's column is never cut by the gutter's edge; the
 * right side gets the same padding from the width.
 * @param lane - the column, counted from zero.
 * @returns the x in pixels.
 */
function laneX(lane: number): number {
  return LANE_W * (lane + 1)
}

/** The ink of one palette slot, wrapped around the palette so any depth gets a colour. */
function slotColor(slot: number): string {
  const size = LANE_COLORS.length
  return LANE_COLORS[((slot % size) + size) % size] ?? 'currentColor'
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
