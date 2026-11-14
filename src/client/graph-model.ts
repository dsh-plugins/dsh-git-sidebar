/**
 * Lane assignment for the commit graph, following VS Code's SCM history graph.
 *
 * The module is a pure function and nothing else: no React, no DOM, no locale,
 * so the shape of every graph is decided here and the drawing layer only has to
 * place what this returns. A caller scans commits newest first, which is the
 * order Git prints them in.
 *
 * The state is a list of swimlanes whose index is the column the line is drawn
 * in. A lane holds the object name of the commit it waits for, so the row that
 * carries that commit takes the lane over for the commit's first parent, drops
 * every other lane waiting for the same commit, and opens the merge's remaining
 * parents at the end of the table.
 *
 * A lane is never moved into a hole left behind: the table has no holes, a lane
 * keeps its column for as long as it is alive, and a new branch always opens on
 * the right. That is the whole reason this file exists. Filling the column a
 * finished branch vacated makes one branch sit in a different column on almost
 * every row, and since a line may only shift where the table shrinks, the
 * drawing stops reading as a trunk with branches and starts reading as a ripple.
 */

/** One commit, reduced to what the layout reads. */
export interface GraphInput {
  /** Full object name; the identity a lane waits for. */
  readonly sha: string
  /** Full object names of this commit's parents, in Git's order. */
  readonly parents: readonly string[]
}

/** One line of one row, named by the columns it joins. */
export interface GraphRowStroke {
  /** Column the line enters at the top edge; absent when it starts at the node. */
  readonly prior?: number
  /** Column the line leaves at the bottom edge; absent when it ends at the node. */
  readonly next?: number
  /**
   * Which of the four joins this line is:
   *
   * - `through` — the line keeps its column and runs the full height.
   * - `bend` — the line moves to another column inside this row, which happens
   *   only to the lanes right of a dropped duplicate.
   * - `join` — a lane from above ends at this row's node. Several close at once
   *   when a fork lands on the commit all of them waited for.
   * - `branch` — a line leaves this row's node downwards: the first parent in
   *   the node's own column, the extra parents of a merge in the columns they
   *   just opened.
   */
  readonly kind: 'through' | 'bend' | 'join' | 'branch'
  /** Palette slot the line keeps along its whole length. */
  readonly color: number
}

/** One row: a commit, the column it sits in, and the lines it owns. */
export interface GraphRow {
  readonly sha: string
  /** Column of this commit's node, counted from zero. */
  readonly lane: number
  /** Palette slot of the node, which is also the ink of its first parent's line. */
  readonly color: number
  /** True when the commit has more than one parent, which draws a wider node. */
  readonly merged: boolean
  /** Every line this row draws, from the top edge to the bottom one. */
  readonly strokes: readonly GraphRowStroke[]
}

/** The whole graph: one row per commit, and the width it needs. */
export interface GraphLayout {
  readonly rows: readonly GraphRow[]
  /** Columns used at the graph's widest row, which is the canvas width. */
  readonly lanes: number
}

/** One lane: the commit it waits for, and the ink its line is drawn in. */
interface Swimlane {
  readonly id: string
  readonly color: number
}

/**
 * Lay out one page of history.
 * @param commits - commits newest first, as Git prints them.
 * @returns one row per distinct commit, plus the column count.
 */
export function layoutGraph(commits: readonly GraphInput[]): GraphLayout {
  /** The commit each lane waits for, indexed by the column it is drawn in. */
  let lanes: readonly Swimlane[] = []
  const rows: GraphRow[] = []
  const seen = new Set<string>()
  let widest = 0

  for (const commit of commits) {
    // A history names each commit once; a second row for one name would draw two
    // nodes for one commit, so the repeat is dropped rather than laid out twice.
    if (seen.has(commit.sha)) continue
    seen.add(commit.sha)

    const input = lanes
    const found = input.findIndex(lane => lane.id === commit.sha)
    const waited = input[found]
    const lane = waited === undefined ? input.length : found
    const firstParent = commit.parents[0]
    const extraParents = commit.parents.slice(1)
    const strokes: GraphRowStroke[] = []
    const output: Swimlane[] = []

    if (firstParent === undefined) {
      // A root closes the whole table: nothing continues below it, so every lane
      // still waiting here ends at the node instead of being handed on.
      input.forEach((swimlane, index) => {
        strokes.push({ prior: index, kind: 'join', color: swimlane.color })
      })
    } else {
      input.forEach((swimlane, index) => {
        if (swimlane.id === commit.sha) {
          // The first lane holding this commit carries its node and becomes the
          // first parent's; every later one is a duplicate the node absorbs, and
          // dropping it is the only thing in this loop that narrows the graph.
          if (index === lane) output.push({ id: firstParent, color: swimlane.color })
          strokes.push({ prior: index, kind: 'join', color: swimlane.color })
          return
        }
        const next = output.length
        output.push({ id: swimlane.id, color: swimlane.color })
        const kind = next === index ? 'through' : 'bend'
        strokes.push({ prior: index, next, kind, color: swimlane.color })
      })
      if (waited === undefined) output.push({ id: firstParent, color: lane })

      const parent = output[lane]
      if (parent !== undefined) {
        strokes.push({ prior: undefined, next: lane, kind: 'branch', color: parent.color })
      }
      for (const extra of extraParents) {
        const next = output.length
        output.push({ id: extra, color: next })
        strokes.push({ prior: undefined, next, kind: 'branch', color: next })
      }
    }

    widest = Math.max(widest, output.length, lane + 1)
    rows.push({
      sha: commit.sha,
      lane,
      color: waited === undefined ? lane : waited.color,
      merged: extraParents.length > 0,
      strokes,
    })
    lanes = output
  }

  return { rows, lanes: widest }
}
