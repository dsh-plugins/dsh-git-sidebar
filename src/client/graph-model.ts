/**
 * Lane assignment for the commit graph.
 *
 * The module is a pure function and nothing else: no React, no DOM, no locale,
 * so the shape of every graph is decided here and the drawing layer only has to
 * place what this returns. A caller scans commits newest first, which is the
 * order Git prints them in, and every row names the lane the commit sits in plus
 * the strokes that cross or turn inside that row.
 *
 * A lane is a slot waiting for one commit: while a branch's tip is still ahead,
 * the lane holds that tip's object name, and the row that finally carries the
 * commit takes the lane over for its parent. That single rule is enough for
 * forks (a merge's second parent opens a lane), for joins (a commit several
 * lanes wait for collapses them into one), and for the straight case, where one
 * lane is reused from the first row to the last.
 */

/** One commit, reduced to what the layout reads. */
export interface GraphInput {
  /** Full object name; the identity a lane waits for. */
  readonly sha: string
  /** Full object names of this commit's parents, in Git's order. */
  readonly parents: readonly string[]
}

/** One stroke of one row. */
export interface GraphLaneSegment {
  /** The lane the stroke occupies, counted from zero. */
  readonly lane: number
  /**
   * How the stroke is drawn:
   *
   * - `through` — a lane that is not this row's own, passing straight past it.
   * - `up` — this row's lane reaches the node from above and stops there, which
   *   is how a root commit ends its lane.
   * - `down` — this row's lane leaves the node downwards, continuing to the
   *   first parent.
   * - `merge-in` — another lane joins this row's node from above, which is a
   *   fork seen from the side of the commit both sides end on.
   * - `merge-out` — this row's node branches into another lane, which is where a
   *   merge's second and later parents go.
   */
  readonly kind: 'through' | 'up' | 'down' | 'merge-in' | 'merge-out'
  /**
   * True when the lane is there but its stretch is folded away.
   *
   * A branch can wait hundreds of rows for its next commit, and every row in
   * between would draw the same vertical line. IntelliJ stops drawing those
   * stretches and marks the two ends with an arrow; the rows in the middle carry
   * this flag, so the drawing layer knows the lane exists without covering the
   * list in parallel lines.
   */
  readonly collapsed?: true
}

/** One end of a folded stretch, and where a click on it goes. */
export interface GraphArrow {
  /** The lane whose stretch was folded. */
  readonly lane: number
  /** Which way the lane continues past this end; `down` is towards older commits. */
  readonly direction: 'up' | 'down'
  /** Object name of the commit at the other end, which is where a click lands. */
  readonly to: string
}

/** One row of the graph: a commit, its lane, and every stroke it owns. */
export interface GraphRow {
  readonly sha: string
  /** The lane this commit's node sits in. */
  readonly lane: number
  /** Every stroke passing through or turning inside this row. */
  readonly segments: readonly GraphLaneSegment[]
  /** Ends of folded stretches drawn in this row; absent when none was folded. */
  readonly arrows?: readonly GraphArrow[]
}

/** The whole graph: one row per commit, and the width it needs. */
export interface GraphLayout {
  readonly rows: readonly GraphRow[]
  /** Lanes used at the graph's widest point, which is the canvas width. */
  readonly lanes: number
}

/**
 * Stack one branch above another.
 *
 * A lane slot holds the object name of the commit it waits for, or `null` once a
 * join has emptied it. Trailing empty slots are dropped after every row, so a
 * branch that ended deep in the history cannot keep the canvas wide forever; the
 * widest length reached during the scan is what the canvas reports, because rows
 * already laid out still refer to those lanes by index.
 * @param commits - commits newest first, as Git prints them.
 * @returns one row per distinct commit, plus the lane count.
 */
export function layoutGraph(commits: readonly GraphInput[]): GraphLayout {
  /** The commit each lane is waiting for, or null when the lane is free. */
  const lanes: (string | null)[] = []
  const rows: GraphRow[] = []
  const seen = new Set<string>()
  let widest = 0

  for (const commit of commits) {
    // A history names each commit once; a repeated object name would draw two
    // nodes for one commit, so the second is dropped rather than duplicated.
    if (seen.has(commit.sha)) continue
    seen.add(commit.sha)

    const waiting = lanesWaiting(lanes, commit.sha)
    const lane = reserveLane(lanes, waiting, commit.sha)
    const segments: GraphLaneSegment[] = []

    for (let index = 0; index < lanes.length; index += 1) {
      if (lanes[index] === null || index === lane) continue
      segments.push({ lane: index, kind: 'through' })
    }
    for (const joined of waiting.slice(1)) {
      segments.push({ lane: joined, kind: 'merge-in' })
    }

    const first = commit.parents[0]
    if (first === undefined) {
      // A root commit has nothing below it, so its lane ends at this node.
      lanes[lane] = null
      segments.push({ lane, kind: 'up' })
    } else {
      lanes[lane] = first
      segments.push({ lane, kind: 'down' })
    }

    for (const parent of commit.parents.slice(1)) {
      const target = lanesWaiting(lanes, parent).find(index => index !== lane)
      if (target !== undefined) {
        // A lane already waits for this parent, so the merge joins that lane
        // instead of widening the canvas with a second slot for one commit.
        // VS Code appends a duplicate lane here and keeps it until the join, which
        // is the single largest reason its graph grows beyond what the history
        // needs.
        if (!segments.some(segment => segment.kind === 'merge-out' && segment.lane === target)) {
          segments.push({ lane: target, kind: 'merge-out' })
        }
        continue
      }
      // A new lane goes into the nearest free slot, so the bend leaves the node
      // towards empty space instead of crossing every line to its right.
      const free = nearestFree(lanes, lane)
      if (free >= lanes.length) lanes.push(parent)
      else lanes[free] = parent
      segments.push({ lane: free >= lanes.length ? lanes.length - 1 : free, kind: 'merge-out' })
    }

    widest = Math.max(widest, lanes.length)
    trimTrailing(lanes)
    rows.push({ sha: commit.sha, lane, segments })
  }

  return { rows: foldLongStretches(rows), lanes: widest }
}

/** Whether one row does something on one lane, rather than just passing through it. */
function hasEvent(row: GraphRow, lane: number): boolean {
  if (row.lane === lane) return true
  return row.segments.some(segment => segment.lane === lane && segment.kind !== 'through')
}

/**
 * How many rows a lane may pass through before its stretch is folded away.
 *
 * The reader asked for five; IntelliJ's own threshold is thirty rows, which suits
 * a log read in a tall window. Five keeps the drawing honest in a sidebar panel,
 * where a handful of idle rows is already a third of the visible history.
 */
const FOLD_AFTER = 5

/**
 * Fold the long stretches of a lane into arrows at their two ends.
 *
 * A branch tip can wait hundreds of commits before the row that carries it
 * arrives, and every row in between would draw the same vertical line: those are
 * the parallel lines that make a graph unreadable. The unit is the stretch a lane
 * stays occupied, not a pair of its own commits — the row that opens a lane is
 * usually a merge sitting in a different lane, so looking for two nodes of the
 * same lane would miss every merge-introduced branch.
 *
 * Each stretch keeps the row next to either end, which carries an arrow towards
 * the event at the other end, and drops the rows in between. A stretch that runs
 * off the page has no other end to point at, so it is left alone.
 * @param rows - the laid-out rows, newest first.
 * @param occupancy - which lanes held a pending commit at each row's edges.
 * @returns the same rows, with folded stretches marked.
 */
function foldLongStretches(
  rows: readonly GraphRow[],
): GraphRow[] {
  /** Folded lane rows, keyed by row index. */
  const collapsed = new Map<number, number[]>()
  const arrows = new Map<number, GraphArrow[]>()
  const addArrow = (index: number, arrow: GraphArrow): void => {
    const known = arrows.get(index)
    if (known === undefined) arrows.set(index, [arrow])
    else known.push(arrow)
  }

  const width = rows.reduce((most, row) =>
    Math.max(most, row.lane + 1, ...row.segments.map(segment => segment.lane + 1)), 0)
  for (let lane = 0; lane < width; lane += 1) {
    // A row is a plain pass-through for this lane when the lane is drawn but
    // nothing happens on it.
    const straight = rows.map(row => row.segments.some(segment =>
      segment.lane === lane && segment.kind === 'through'))
    let index = 0
    while (index < rows.length) {
      if (straight[index] !== true) {
        index += 1
        continue
      }
      const from = index
      while (index < rows.length && straight[index] === true) index += 1
      const to = index - 1
      if (to - from + 1 < FOLD_AFTER) continue
      // The stretch has to be opened by something the lane does: the row before
      // it is the merge or the node that started waiting. Without that, the line
      // arrives from above the loaded page and there is nothing to fold towards.
      const above = rows[from - 1]
      if (above === undefined || !hasEvent(above, lane)) continue
      const below = rows[to + 1]
      const reached = below !== undefined && hasEvent(below, lane)
      if (!reached) {
        // The next commit of this lane is below the loaded page, which is exactly
        // the line that otherwise runs off the bottom of the list. Fold everything
        // after the first row and let the arrow ask for the page that holds it.
        for (let hidden = from + 1; hidden <= to; hidden += 1) {
          const known = collapsed.get(hidden)
          if (known === undefined) collapsed.set(hidden, [lane])
          else known.push(lane)
        }
        addArrow(from, { lane, direction: 'down', to: '' })
        continue
      }
      for (let hidden = from + 1; hidden <= to - 1; hidden += 1) {
        const known = collapsed.get(hidden)
        if (known === undefined) collapsed.set(hidden, [lane])
        else known.push(lane)
      }
      addArrow(from, { lane, direction: 'down', to: below.sha })
      addArrow(to, { lane, direction: 'up', to: above.sha })
    }
  }

  return rows.map((row, index) => {
    const hidden = collapsed.get(index)
    const rowArrows = arrows.get(index)
    const folded = hidden === undefined
      ? row.segments
      : row.segments.map((segment): GraphLaneSegment =>
        segment.kind === 'through' && hidden.includes(segment.lane)
          ? { ...segment, collapsed: true }
          : segment)
    return {
      ...row,
      segments: folded,
      ...rowArrows === undefined ? {} : { arrows: rowArrows },
    }
  })
}

/**
 * The nearest free lane to one column.
 *
 * Probing outwards keeps a merge's bend short: the stroke turns into the empty
 * column beside the node rather than travelling across every line between the
 * node and the right edge, which is what makes a merge readable.
 * @param lanes - the lane table.
 * @param from - the column to start from.
 * @returns the free lane index, or the table's length when every slot is taken.
 */
function nearestFree(lanes: readonly (string | null)[], from: number): number {
  for (let distance = 1; distance <= lanes.length; distance += 1) {
    const left = from - distance
    if (left >= 0 && lanes[left] === null) return left
    const right = from + distance
    if (right < lanes.length && lanes[right] === null) return right
  }
  return lanes.length
}

/**
 * Every lane currently waiting for one commit.
 * @param lanes - the lane table.
 * @param sha - the commit being placed.
 * @returns the lane indices, ascending; empty when no lane waited for it.
 */
function lanesWaiting(lanes: readonly (string | null)[], sha: string): number[] {
  const found: number[] = []
  for (let index = 0; index < lanes.length; index += 1) {
    if (lanes[index] === sha) found.push(index)
  }
  return found
}

/**
 * Take the lane a commit occupies, opening one only when no lane awaited it.
 *
 * A head no lane waited for is a tip the history starts at. VS Code appends it to
 * the right; this layout instead takes the leftmost free slot, because a hole
 * left behind by a finished branch is a column of empty space that every row
 * below pays for. Only when no slot is free does the canvas widen.
 *
 * Several lanes waiting for one commit is a fork closing: the leftmost carries
 * the node and the rest are emptied here, which leaves them for the caller to
 * draw as `merge-in` strokes.
 * @param lanes - the lane table, mutated in place.
 * @param waiting - the lanes that awaited this commit.
 * @param sha - the commit taking the lane.
 * @returns the lane the commit's node sits in.
 */
function reserveLane(lanes: (string | null)[], waiting: readonly number[], sha: string): number {
  const first = waiting[0]
  if (first !== undefined) {
    for (const extra of waiting.slice(1)) lanes[extra] = null
    return first
  }
  const free = lanes.indexOf(null)
  if (free >= 0) {
    lanes[free] = sha
    return free
  }
  lanes.push(sha)
  return lanes.length - 1
}

/**
 * Drop the empty lanes at the table's end.
 *
 * Only the tail is trimmed: a hole in the middle still has lanes to its right
 * that rows already laid out refer to by index, and renumbering them would move
 * every line of the history below.
 * @param lanes - the lane table, mutated in place.
 */
function trimTrailing(lanes: (string | null)[]): void {
  while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop()
}
