/**
 * Pure model behind the diff viewer: row kinds, per-side line numbers, and a
 * reader for raw unified patches.
 *
 * The Host already validates and splits a file's diff into hunks, so the viewer
 * never parses Git output at render time; {@link toRows} only numbers what the
 * hunks contain, taking each block's starting line from its `@@` header.
 * {@link parsePatch} exists for callers that hold one patch as text — tests and
 * the Host's own fixtures — and reads a hunk's extent from the counts in that
 * same header, which is what tells it where the block ends.
 */

import type { DiffHunk, DiffLine } from '../shared.ts'

/** How one drawn line reads: a file name, a block header, content, or a change. */
export type RowKind = 'file' | 'hunk-header' | 'context' | 'added' | 'removed' | 'meta'

/** One line of the viewer, numbered per side where that side has the line. */
export interface DiffRow {
  readonly kind: RowKind
  readonly text: string
  /** Line number on the old side; absent for added lines. */
  readonly oldNo?: number
  /** Line number on the new side; absent for removed lines. */
  readonly newNo?: number
}

/** A hunk header's two ranges: where the block starts on each side and how many lines it holds. */
export interface HunkRange {
  readonly oldStart: number
  readonly oldLines: number
  readonly newStart: number
  readonly newLines: number
}

/** One parsed hunk, in the shape the wire contract uses. */
export type ParsedHunk = DiffHunk & { readonly lines: DiffLine[] }

/** One parsed file of a patch. */
export interface ParsedFile {
  oldPath: string
  newPath: string
  hunks: ParsedHunk[]
}

/** A whole patch, file by file. */
export interface ParsedPatch {
  files: ParsedFile[]
}

/** The `@@ -a,b +c,d @@` prefix; a range without `,n` means one line. */
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

/** The prefix of a per-file patch header. */
const FILE_HEADER = 'diff --git '

/** The marker Git writes after the last line of a file that has no final newline. */
const NO_NEWLINE = '\\'

/**
 * The ranges of a hunk header.
 * @param header - the `@@` line as Git wrote it.
 * @returns both ranges, or undefined when the line is not a hunk header.
 */
export function parseHunkHeader(header: string): HunkRange | undefined {
  const match = HUNK_HEADER.exec(header)
  if (match === null) return undefined
  const oldStart = Number(match[1])
  const oldLines = match[2] === undefined ? 1 : Number(match[2])
  const newStart = Number(match[3])
  const newLines = match[4] === undefined ? 1 : Number(match[4])
  if (![oldStart, oldLines, newStart, newLines].every(Number.isFinite)) return undefined
  return { oldStart, oldLines, newStart, newLines }
}

/**
 * Number every line of the given hunks, header rows included.
 *
 * A block whose header cannot be read still draws, without line numbers, so a
 * malformed payload never blanks the viewer.
 * @param hunks - hunks as the Host parsed them.
 * @returns rows in patch order.
 */
export function toRows(hunks: readonly DiffHunk[]): DiffRow[] {
  const rows: DiffRow[] = []
  let current: string | undefined
  for (const hunk of hunks) {
    // A commit's patch spans several files. The name is drawn once, before the
    // first hunk of each, so a reader can tell which file the lines below
    // change without scrolling back to the top of the tab.
    if (hunk.path !== undefined && hunk.path !== current) {
      current = hunk.path
      rows.push({ kind: 'file', text: hunk.path })
    }
    rows.push({ kind: 'hunk-header', text: drawn(hunk.header) })
    const section = hunk.section?.trim() ?? ''
    if (section !== '') rows.push({ kind: 'meta', text: section })
    const range = parseHunkHeader(hunk.header)
    let oldNo = range?.oldStart
    let newNo = range?.newStart
    for (const line of hunk.lines) {
      const text = drawn(line.text)
      if (line.kind === 'added') {
        rows.push({ kind: 'added', text, newNo })
        if (newNo !== undefined) newNo += 1
        continue
      }
      if (line.kind === 'removed') {
        rows.push({ kind: 'removed', text, oldNo })
        if (oldNo !== undefined) oldNo += 1
        continue
      }
      rows.push({ kind: 'context', text, oldNo, newNo })
      if (oldNo !== undefined) oldNo += 1
      if (newNo !== undefined) newNo += 1
    }
  }
  return rows
}

/**
 * Read one patch as text.
 *
 * A block ends when the counts in its header are spent, which is what lets the
 * `--- `/`+++ ` pair of a following file be told apart from a removed or added
 * line whose own text begins with those dashes.
 * @param text - a unified diff, with or without `diff --git` headers.
 * @returns every file the text describes.
 */
export function parsePatch(text: string): ParsedPatch {
  const files: ParsedFile[] = []
  const lines = text.split('\n')
  let file: ParsedFile | undefined
  let hunk: ParsedHunk | undefined
  let remainingOld = 0
  let remainingNew = 0
  // A `diff --git` header already named both paths, so the `---`/`+++` pair that
  // follows refines that file instead of starting another one.
  let refinePaths = false
  for (const raw of lines) {
    const line = drawn(raw)
    if (hunk !== undefined) {
      if (remainingOld > 0 || remainingNew > 0) {
        if (line.startsWith(NO_NEWLINE)) continue
        appendHunkLine(hunk, line)
        if (line.startsWith('+')) remainingNew -= 1
        else if (line.startsWith('-')) remainingOld -= 1
        else {
          remainingOld -= 1
          remainingNew -= 1
        }
        continue
      }
      hunk = undefined
    }
    if (line.startsWith(FILE_HEADER)) {
      file = fileOf(line.slice(FILE_HEADER.length))
      files.push(file)
      refinePaths = true
      continue
    }
    if (line.startsWith('--- ')) {
      if (!refinePaths || file === undefined) {
        file = { oldPath: '', newPath: '', hunks: [] }
        files.push(file)
      }
      file.oldPath = cleanPath(line.slice(4))
      refinePaths = true
      continue
    }
    if (line.startsWith('+++ ') && file !== undefined && refinePaths) {
      file.newPath = cleanPath(line.slice(4))
      refinePaths = false
      continue
    }
    const range = line.startsWith('@@') ? parseHunkHeader(line) : undefined
    if (range !== undefined) {
      file = file ?? pushFile(files)
      hunk = { header: line, lines: [] }
      file.hunks.push(hunk)
      remainingOld = range.oldLines
      remainingNew = range.newLines
    }
  }
  return { files }
}

/** The last path segment of a repository-relative path. */
export function basenameOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1)
  return name === '' ? path : name
}

/** A line without the carriage return of a CRLF ending. */
function drawn(text: string): string {
  return text.endsWith('\r') ? text.slice(0, -1) : text
}

/** Start a file the text did not name. */
function pushFile(files: ParsedFile[]): ParsedFile {
  const file: ParsedFile = { oldPath: '', newPath: '', hunks: [] }
  files.push(file)
  return file
}

/** Seed a file's paths from its `diff --git a/<old> b/<new>` header. */
function fileOf(header: string): ParsedFile {
  const marker = header.lastIndexOf(' b/')
  if (marker <= 0) return { oldPath: '', newPath: '', hunks: [] }
  return {
    oldPath: cleanPath(header.slice(0, marker)),
    newPath: cleanPath(header.slice(marker + 1)),
    hunks: [],
  }
}

/** One line whose sign says how it reads; the header's counts already said it belongs here. */
function appendHunkLine(hunk: ParsedHunk, line: string): void {
  if (line.startsWith('+')) hunk.lines.push({ kind: 'added', text: line.slice(1) })
  else if (line.startsWith('-')) hunk.lines.push({ kind: 'removed', text: line.slice(1) })
  else hunk.lines.push({ kind: 'context', text: line.slice(1) })
}

/** A patch path without its quote pair, `a/` or `b/` prefix, or `/dev/null`. */
function cleanPath(raw: string): string {
  let value = raw.trim()
  if (value === '/dev/null') return ''
  if (value.length > 1 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
  if (value.startsWith('a/') || value.startsWith('b/')) value = value.slice(2)
  return value
}
