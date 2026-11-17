/**
 * Patch surgery: lifting one hunk, or one changed block of a hunk, out of the
 * patch the viewer rendered.
 *
 * The browser names a position in the patch it saw, so the patch is read again
 * here and the same position selects the same lines. A block is Git's hunk
 * split where its context lines break it; lifting one rebuilds it without
 * context, because `git apply --unidiff-zero` replays a range-free patch
 * against the lines the header names.
 */

/** One changed run of a hunk: its two ranges and the patch lines that carry it. */
interface PatchBlock {
  oldStart: number
  newStart: number
  removed: number
  added: number
  lines: string[]
}

/** The two starting lines of a hunk header. */
interface HunkRange {
  readonly oldStart: number
  readonly newStart: number
}

/** The prefix of a plain hunk header. */
const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

/**
 * Keep one hunk of a patch and drop the rest.
 *
 * The hunk indexes are counted from zero over the `@@` lines in order, which is
 * the order `parsePatch` returns them in, so an index the browser computed from
 * the rendered hunks selects the hunk the reader clicked.
 * @param text - the whole patch of one file.
 * @param hunk - the position of the hunk to keep.
 * @returns a one-hunk patch with the original head, or undefined when no hunk has that position.
 */
export function hunkPatch(text: string, hunk: number): string | undefined {
  const lines = withoutTrailer(text.split('\n'))
  const starts = hunkStarts(lines)
  const start = starts[hunk]
  if (start === undefined) return undefined
  const head = lines.slice(0, starts[0] ?? 0)
  if (!head.some(line => line.startsWith('diff --git '))) return undefined
  const body = lines.slice(start, starts[hunk + 1] ?? lines.length)
  const header = body[0] ?? ''
  // A combined hunk of an unmerged path carries one column per parent and
  // cannot be lifted into a patch `git apply` accepts, so it stays stale.
  if (header.startsWith('@@@')) return undefined
  if (!complete(header, body.slice(1))) return undefined
  // A patch needs complete lines: the join plus this newline restores the one
  // that split() consumed at the end of the captured text.
  return `${[...head, ...body].join('\n')}\n`
}

/**
 * Keep one changed block of one hunk, and drop everything else.
 *
 * Git groups every change within three lines of context into one hunk, so a
 * hunk can carry several separate changes — the blocks VS Code puts its own
 * actions on. A block is lifted by rebuilding it without context: the header's
 * two ranges cover exactly the removed and added lines the reader clicked,
 * which `git apply --unidiff-zero` replays on its own.
 * @param text - the whole patch of one file.
 * @param hunk - the position of the hunk the block belongs to.
 * @param region - the block's position inside that hunk, counted from zero.
 * @returns a one-block patch with the original head, or undefined when either position is past the end.
 */
export function regionPatch(text: string, hunk: number, region: number): string | undefined {
  const lines = withoutTrailer(text.split('\n'))
  const starts = hunkStarts(lines)
  const start = starts[hunk]
  if (start === undefined) return undefined
  const head = lines.slice(0, starts[0] ?? 0)
  if (!head.some(line => line.startsWith('diff --git '))) return undefined
  const body = lines.slice(start, starts[hunk + 1] ?? lines.length)
  const header = body[0] ?? ''
  // A combined hunk of an unmerged path carries one column per parent, so its
  // lines cannot be lifted into a patch `git apply` accepts.
  if (header.startsWith('@@@')) return undefined
  const range = hunkRange(header)
  if (range === undefined) return undefined
  const block = blocksOf(body.slice(1), range).at(region)
  if (block === undefined) return undefined
  // Git names an empty side of a block at position 0, which is why the start of
  // a side with no lines is the line before the block, never below zero.
  const oldStart = block.removed === 0 ? Math.max(block.oldStart - 1, 0) : block.oldStart
  const newStart = block.added === 0 ? Math.max(block.newStart - 1, 0) : block.newStart
  const oldSpec = `${oldStart},${block.removed}`
  const newSpec = `${newStart},${block.added}`
  return `${[...head, `@@ -${oldSpec} +${newSpec} @@`, ...block.lines].join('\n')}\n`
}

/**
 * Split a hunk body into its changed runs.
 * @param body - the hunk's lines, markers included, without its header.
 * @param range - the ranges the header declares.
 * @returns the runs in patch order.
 */
function blocksOf(body: readonly string[], range: HunkRange): PatchBlock[] {
  const blocks: PatchBlock[] = []
  let oldLine = range.oldStart
  let newLine = range.newStart
  let current: PatchBlock | undefined
  for (const line of body) {
    const marker = line.charAt(0)
    if (marker === '-' || marker === '+') {
      if (current === undefined) {
        current = { oldStart: oldLine, newStart: newLine, removed: 0, added: 0, lines: [] }
        blocks.push(current)
      }
      current.lines.push(line)
      if (marker === '-') {
        current.removed += 1
        oldLine += 1
      } else {
        current.added += 1
        newLine += 1
      }
      continue
    }
    // The marker Git writes after a file that has no final newline belongs to
    // the line it follows, so it stays with the run it closes.
    if (marker === '\\' && current !== undefined) {
      current.lines.push(line)
      continue
    }
    current = undefined
    if (marker === ' ' || line.length === 0) {
      oldLine += 1
      newLine += 1
    }
  }
  return blocks
}

/**
 * Read the starting lines a hunk header declares.
 * @param header - the `@@` line.
 * @returns both starts, or undefined when the line is not a plain hunk header.
 */
function hunkRange(header: string): HunkRange | undefined {
  const match = HUNK_HEADER.exec(header)
  if (match === null) return undefined
  const oldStart = Number(match[1])
  const newStart = Number(match[2])
  if (!Number.isFinite(oldStart) || !Number.isFinite(newStart)) return undefined
  return { oldStart, newStart }
}

/**
 * Locate every hunk header in a patch's lines.
 * @param lines - the patch split at line feeds.
 * @returns the index of each `@@` line, in order.
 */
function hunkStarts(lines: readonly string[]): number[] {
  return lines.reduce<number[]>((found, line, index) => {
    if (line.startsWith('@@')) found.push(index)
    return found
  }, [])
}

/**
 * Report whether a hunk body holds as many lines as its header declares.
 *
 * A capture cut at the rendering limit ends inside a hunk, and a patch whose
 * counts disagree with its lines is one Git rejects as corrupt rather than as
 * stale; checking here keeps that case on the refresh path the client has.
 * @param header - the `@@ -a,b +c,d @@` line.
 * @param body - the hunk's lines, markers included.
 * @returns whether the body supplies both counts the header promises.
 */
function complete(header: string, body: readonly string[]): boolean {
  const close = header.indexOf('@@', 2)
  const spec = close < 0 ? header : header.slice(0, close)
  const ranges = [...spec.matchAll(/[-+](\d+)(?:,(\d+))?/g)]
  if (ranges.length < 2) return false
  const declared = ranges.slice(0, 2).map(range => (range[2] === undefined ? 1 : Number(range[2])))
  let before = 0
  let after = 0
  for (const line of body) {
    const marker = line.charAt(0)
    if (marker === '-') before += 1
    else if (marker === '+') after += 1
    else if (marker === ' ' || line.length === 0) {
      before += 1
      after += 1
    }
  }
  return before === declared[0] && after === declared[1]
}

/**
 * Drop the empty strings a trailing newline leaves behind.
 * @param lines - the patch split at line feeds.
 * @returns the lines without the empty run at the end.
 */
function withoutTrailer(lines: readonly string[]): string[] {
  const copy = [...lines]
  while (copy.length > 0 && copy[copy.length - 1] === '') copy.pop()
  return copy
}
