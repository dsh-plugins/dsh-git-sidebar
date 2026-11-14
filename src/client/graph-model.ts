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
}

/** One row of the graph: a commit, its lane, and every stroke it owns. */
export interface GraphRow {
  readonly sha: string
  /** The lane this commit's node sits in. */
  readonly lane: number
  /** Every stroke passing through or turning inside this row. */
  readonly segments: readonly GraphLaneSegment[]
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
        // The first parent can be this one too, when a history names it twice.
        if (!segments.some(segment => segment.kind === 'merge-out' && segment.lane === target)) {
          segments.push({ lane: target, kind: 'merge-out' })
        }
        continue
      }
      lanes.push(parent)
      segments.push({ lane: lanes.length - 1, kind: 'merge-out' })
    }

    widest = Math.max(widest, lanes.length)
    trimTrailing(lanes)
    rows.push({ sha: commit.sha, lane, segments })
  }

  return { rows, lanes: widest }
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
 * Take the lane a commit occupies, opening one when no lane awaited it.
 *
 * A head no lane waited for is a tip the history starts at, so it opens the
 * next lane. Several lanes waiting for one commit is a fork closing: the
 * leftmost carries the node and the rest are emptied here, which leaves them for
 * the caller to draw as `merge-in` strokes.
 * @param lanes - the lane table, mutated in place.
 * @param waiting - the lanes that awaited this commit.
 * @param sha - the commit taking the lane.
 * @returns the lane the commit's node sits in.
 */
function reserveLane(lanes: (string | null)[], waiting: readonly number[], sha: string): number {
  const first = waiting[0]
  if (first === undefined) {
    lanes.push(sha)
    return lanes.length - 1
  }
  for (const extra of waiting.slice(1)) lanes[extra] = null
  return first
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
