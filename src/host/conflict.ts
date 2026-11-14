/**
 * Conflict markers: reading a conflicted file and writing a resolved one.
 *
 * Git marks a conflicted region with `<<<<<<<` (ours), `|||||||` (the merge
 * base, only with `diff3` style), `=======`, and `>>>>>>>` (theirs). The reader
 * splits a file into the plain runs between regions and the regions
 * themselves, so the panel can offer one choice per region instead of asking
 * the reader to edit markers by hand.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ConflictChoice, ConflictContent, ConflictSegment } from '../shared.ts'

/** The line that opens our side of a region. */
const OURS = '<<<<<<<'

/** The line that opens the merge base, present only in `diff3` style output. */
const BASE = '|||||||'

/** The line between the two sides. */
const SEPARATOR = '======='

/** The line that closes a region. */
const THEIRS = '>>>>>>>'

/** Largest conflicted file the panel reads into memory. */
const MAX_BYTES = 4 * 1024 * 1024

/**
 * Read one conflicted file and split it into regions.
 * @param root - absolute repository root.
 * @param path - repository-relative path.
 * @returns the segments, a `resolved` notice, or the reason it is unavailable.
 */
export async function readConflict(root: string, path: string): Promise<ConflictContent> {
  const absolute = join(root, path)
  let text: string
  try {
    // A conflicted blob is text by definition; a binary file cannot carry
    // markers, and reading it as text would decode it into noise.
    const bytes = await readFile(absolute)
    if (bytes.byteLength > MAX_BYTES) {
      return { kind: 'error', message: 'the conflicted file is too large to read' }
    }
    text = bytes.toString('utf8')
    if (text.includes('\u0000')) return { kind: 'error', message: 'the conflicted file is binary' }
  } catch {
    return { kind: 'error', message: 'the conflicted file could not be read' }
  }
  const segments = split(text)
  const marked = segments.some(segment => segment.kind === 'conflict')
  return marked ? { kind: 'marked', segments } : { kind: 'resolved' }
}

/**
 * Split one file's text into common runs and conflict regions.
 * @param text - the file's contents.
 * @returns the segments in file order.
 */
export function split(text: string): ConflictSegment[] {
  const lines = text.split('\n')
  const segments: ConflictSegment[] = []
  let common: string[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (!line.startsWith(OURS)) {
      common.push(line)
      index += 1
      continue
    }
    if (common.length > 0) {
      segments.push({ kind: 'common', lines: common })
      common = []
    }
    const region = readRegion(lines, index)
    if (region === undefined) {
      // An unterminated marker is not a region the panel can offer a choice
      // for; the line stays common so the file survives the round trip.
      common.push(line)
      index += 1
      continue
    }
    segments.push(region.segment)
    index = region.next
  }
  if (common.length > 0) segments.push({ kind: 'common', lines: common })
  return segments
}

/** One region read from a marker block. */
interface Region {
  readonly segment: ConflictSegment
  /** Index of the line after the closing marker. */
  readonly next: number
}

/**
 * Read one conflict region starting at its opening marker.
 * @param lines - the file's lines.
 * @param start - index of the `<<<<<<<` line.
 * @returns the region and where it ends, or undefined when a marker is missing.
 */
function readRegion(lines: readonly string[], start: number): Region | undefined {
  const ours: string[] = []
  const theirs: string[] = []
  const open = lines[start] ?? ''
  let index = start + 1
  let inBase = false
  let sawSeparator = false
  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (line.startsWith(BASE) && !sawSeparator) {
      inBase = true
      index += 1
      continue
    }
    if (line.startsWith(SEPARATOR) && !sawSeparator) {
      sawSeparator = true
      inBase = false
      index += 1
      continue
    }
    if (line.startsWith(THEIRS) && sawSeparator) {
      return {
        segment: {
          kind: 'conflict',
          ours,
          theirs,
          oursLabel: open.slice(OURS.length).trim(),
          theirsLabel: line.slice(THEIRS.length).trim(),
        },
        next: index + 1,
      }
    }
    // The merge base is metadata for a human, not a choice the panel offers.
    if (!inBase) (sawSeparator ? theirs : ours).push(line)
    index += 1
  }
  return undefined
}

/**
 * Render one file with the chosen side of every region.
 * @param segments - the file's segments.
 * @param choices - one choice per region, in file order.
 * @returns the file's new contents.
 */
export function render(segments: readonly ConflictSegment[], choices: readonly ConflictChoice[]): string {
  const out: string[] = []
  let region = 0
  for (const segment of segments) {
    if (segment.kind === 'common') {
      out.push(...segment.lines)
      continue
    }
    const choice = choices[region] ?? 'both'
    region += 1
    if (choice === 'ours') out.push(...segment.ours)
    else if (choice === 'theirs') out.push(...segment.theirs)
    else out.push(...segment.ours, ...segment.theirs)
  }
  return out.join('\n')
}

/**
 * Write a resolved file back to disk.
 * @param root - absolute repository root.
 * @param path - repository-relative path.
 * @param segments - the file's segments.
 * @param choices - one choice per region.
 * @returns whether the write succeeded.
 */
export async function writeResolved(
  root: string,
  path: string,
  segments: readonly ConflictSegment[],
  choices: readonly ConflictChoice[],
): Promise<boolean> {
  try {
    await writeFile(join(root, path), render(segments, choices), 'utf8')
    return true
  } catch {
    return false
  }
}
