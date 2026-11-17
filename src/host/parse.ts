/**
 * Parsers for the machine-readable Git output the panel runs.
 *
 * Only three formats are read: porcelain v2 with NUL-terminated fields,
 * `--numstat -z`, and a unified patch for one path. Parsing is total: output
 * Git may extend in a later release is skipped rather than rejected, so an
 * unrecognized record degrades one entry instead of the whole snapshot.
 */

import type { ChangeEntry, ChangeStatus, DiffHunk, DiffLine } from '../shared.ts'

/** Field separator of every `-z` format. */
const NUL = '\0'

/**
 * Read the first line of a one-line output such as `git rev-parse --show-toplevel`.
 * @param output - standard output.
 * @returns the line, or the empty string when the output is empty.
 */
export function parseTopLevel(output: string): string {
  const [root = ''] = output.split(/\r?\n/)
  return root
}

/**
 * Read the first line of a one-name output such as `git symbolic-ref --short HEAD`.
 * @param output - standard output.
 * @returns the name, or null when the command printed none.
 */
export function parseName(output: string): string | null {
  const [name = ''] = output.split(/\r?\n/)
  return name.length === 0 ? null : name
}

/**
 * Read the first diagnostic line of a standard-error stream.
 *
 * Git interleaves advisories with its diagnostics, and the advisory this panel
 * provokes on every command (`core.hooksPath=/dev/null` under a Windows Git
 * build) would otherwise hide the failure it accompanies.
 * @param text - standard error.
 * @returns the first line that is not an advisory, or a placeholder when the stream held none.
 */
export function firstLine(text: string): string {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0)
  return lines.find(line => !line.startsWith('warning:')) ?? lines[0] ?? 'no diagnostic'
}

/** Facts one `git status --porcelain=v2` run reports. */
export interface ParsedStatus {
  /** Entries whose change is in the index. */
  readonly staged: ChangeEntry[]
  /** Entries whose change is in the working tree, untracked files included. */
  readonly unstaged: ChangeEntry[]
  /** Unmerged paths. */
  readonly conflicts: ChangeEntry[]
}

/**
 * Map one porcelain status character onto the panel's vocabulary.
 * @param code - a single `XY` character.
 * @returns the change status, or undefined for an unmodified or unmerged code.
 */
function changeStatus(code: string): ChangeStatus | undefined {
  switch (code) {
    case 'M':
    case 'T':
      return 'modified'
    case 'A':
      return 'added'
    case 'D':
      return 'deleted'
    case 'R':
      return 'renamed'
    case 'C':
      return 'added'
    default:
      return undefined
  }
}

/**
 * Split one porcelain record into its fixed fields and its path.
 * @param record - one record whose leading character selects the shape.
 * @param fields - the fixed-field count the record type declares.
 * @returns the fields and the path, which may contain spaces.
 */
function splitRecord(record: string, fields: number): { parts: string[]; path: string } {
  const parts = record.split(' ')
  return { parts, path: parts.slice(fields).join(' ') }
}

/**
 * Parse `git status --porcelain=v2 -z --branch --untracked-files=all`.
 *
 * Branch and HEAD facts also arrive here, but the snapshot reads them from
 * `symbolic-ref` and `rev-parse` instead, which distinguish a detached HEAD
 * from an unborn branch without a second spelling of the same convention.
 * @param output - standard output.
 * @param truncated - whether the capture dropped the head of the output, and
 *   with it the first record, which is then discarded rather than parsed.
 * @returns the three entry groups.
 */
export function parseStatus(output: string, truncated = false): ParsedStatus {
  const fields = output.split(NUL)
  const staged: ChangeEntry[] = []
  const unstaged: ChangeEntry[] = []
  const conflicts: ChangeEntry[] = []
  for (let index = truncated ? 1 : 0; index < fields.length; index += 1) {
    const record = fields[index] ?? ''
    if (record.length === 0) continue
    switch (record.charAt(0)) {
      case '1': {
        const { parts, path } = splitRecord(record, 8)
        addPair(parts[1] ?? '..', path, undefined, staged, unstaged)
        break
      }
      case '2': {
        const { parts, path } = splitRecord(record, 9)
        const from = fields[index + 1]
        index += 1
        const origin = from === undefined || from.length === 0 ? undefined : from
        addPair(parts[1] ?? '..', path, origin, staged, unstaged)
        break
      }
      case 'u': {
        const { path } = splitRecord(record, 10)
        conflicts.push({ path, status: 'conflicted' })
        break
      }
      case '?': {
        const path = record.slice(2)
        if (path.length > 0) unstaged.push({ path, status: 'untracked' })
        break
      }
      default:
        break
    }
  }
  return { staged, unstaged, conflicts }
}

/**
 * Record a porcelain `XY` pair: `X` is the index column and `Y` the working tree.
 * @param pair - the two-character status pair.
 * @param path - current path of the entry.
 * @param from - original path of a rename or copy.
 * @param staged - index-side entries.
 * @param unstaged - working-tree-side entries.
 */
function addPair(
  pair: string,
  path: string,
  from: string | undefined,
  staged: ChangeEntry[],
  unstaged: ChangeEntry[],
): void {
  const index = changeStatus(pair.charAt(0))
  const worktree = changeStatus(pair.charAt(1))
  const beyond = from === undefined ? {} : { from }
  if (index !== undefined) staged.push({ path, status: index, ...beyond })
  if (worktree !== undefined) unstaged.push({ path, status: worktree, ...beyond })
}

/** One record of `git diff --numstat -z`. */
export interface NumstatRecord {
  /** Added line count, or `-` for binary content. */
  readonly additions: string
  /** Deleted line count, or `-` for binary content. */
  readonly deletions: string
  /** Path the record describes. */
  readonly path: string
}

/**
 * Parse `git diff --numstat -z`.
 *
 * A record's first two fields are its counts and the rest of the field is the
 * path, so a path holding a tab survives. A rename or copy carries no path
 * inline: its counts end at an empty third part, and the old and new paths
 * arrive as the next two fields.
 * @param output - standard output.
 * @returns the records in Git's order; a rename record reports its new path.
 */
export function parseNumstat(output: string): NumstatRecord[] {
  const fields = output.split(NUL)
  const records: NumstatRecord[] = []
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index] ?? ''
    if (field.length === 0) continue
    const parts = field.split('\t')
    const additions = parts[0] ?? ''
    const deletions = parts[1] ?? ''
    if (parts.length < 3) continue
    if (parts.length === 3 && parts[2] === '') {
      const target = fields[index + 2]
      index += 2
      if (target !== undefined && target.length > 0) records.push({ additions, deletions, path: target })
      continue
    }
    records.push({ additions, deletions, path: parts.slice(2).join('\t') })
  }
  return records
}

/**
 * Report whether a numstat listing names binary content.
 * @param records - parsed numstat records.
 * @returns whether any record reports `-` for both counts.
 */
export function isBinary(records: readonly NumstatRecord[]): boolean {
  return records.some(record => record.additions === '-' && record.deletions === '-')
}

/**
 * List the paths a numstat listing reports as binary.
 * @param records - parsed numstat records.
 * @returns the binary paths, as a set the per-path readers can test.
 */
export function binaryPaths(records: readonly NumstatRecord[]): Set<string> {
  const binary = new Set<string>()
  for (const record of records) {
    if (record.additions === '-' && record.deletions === '-') binary.add(record.path)
  }
  return binary
}

/** One record of `git diff --name-status -z`. */
export interface NameStatusRecord {
  /** Current path; the new path of a rename. */
  readonly path: string
  readonly status: ChangeStatus
  /** Original path of a rename or copy; absent otherwise. */
  readonly from?: string
}

/**
 * Map one `--name-status` letter onto the panel's vocabulary.
 * @param letter - the first character of the status field.
 * @returns the change status, or undefined for a letter the vocabulary has no word for.
 */
function nameStatusOf(letter: string): ChangeStatus | undefined {
  return letter === 'U' ? 'conflicted' : changeStatus(letter)
}

/**
 * Parse `git diff --name-status -z` or `git diff-tree --name-status -z`.
 *
 * Every record is a status field followed by one path field, and a rename or
 * copy carries a second path after the first: `R100\0old\0new\0`. The status
 * letter is therefore what says how many fields the record owns, which is why
 * it is read before the paths rather than after them.
 * @param output - standard output of a `--name-status -z` command.
 * @returns the records in Git's order; an unreadable status consumes one path
 *   and is dropped, so a later record is never mistaken for a path.
 */
export function parseNameStatus(output: string): NameStatusRecord[] {
  const fields = output.split(NUL)
  const records: NameStatusRecord[] = []
  for (let index = 0; index < fields.length; index += 1) {
    const code = fields[index] ?? ''
    if (code.length === 0) continue
    const status = nameStatusOf(code.charAt(0))
    const first = fields[index + 1] ?? ''
    if (status === undefined) {
      index += 1
      continue
    }
    if (code.startsWith('R') || code.startsWith('C')) {
      const second = fields[index + 2] ?? ''
      index += 2
      if (first.length === 0 || second.length === 0) continue
      records.push({ path: second, status, from: first })
      continue
    }
    index += 1
    if (first.length === 0) continue
    records.push({ path: first, status })
  }
  return records
}

/**
 * Read a hunk header and the number of parent columns its lines carry.
 *
 * A plain hunk reads `@@ -a,b +c,d @@` and one column; an unmerged path reads a
 * combined hunk `@@@ -a,b -c,d +e,f @@@` with one column per parent, so the
 * header must be measured rather than assumed.
 * @param line - the hunk header line.
 * @returns the header text, its trailing section, and the prefix width.
 */
function hunkHeader(line: string): { header: string; section: string; columns: number } {
  let ats = 0
  while (line.charAt(ats) === '@') ats += 1
  const close = line.indexOf('@'.repeat(ats), ats)
  const header = close < 0 ? line : line.slice(0, close + ats)
  return {
    header,
    section: close < 0 ? '' : line.slice(close + ats).trim(),
    columns: Math.max(1, ats - 1),
  }
}

/**
 * Classify one line of a hunk body by its column prefix.
 * @param line - the line without its newline.
 * @param columns - wide the prefix is: 1 for a plain hunk, one per parent for a combined hunk.
 * @returns the change kind and the line's text, or undefined when the line carries no content marker.
 */
function hunkLine(line: string, columns: number): DiffLine | undefined {
  const prefix = line.slice(0, columns)
  if (prefix.length < columns) return undefined
  const text = line.slice(columns)
  if (/^ *$/.test(prefix)) return { kind: 'context', text }
  if (/^\+*$/.test(prefix)) return { kind: 'added', text }
  if (/^-*$/.test(prefix)) return { kind: 'removed', text }
  // A combined line that is unchanged for one parent and changed for another still exists on both sides.
  return { kind: 'context', text }
}

/**
 * Parse one path's unified patch into hunks.
 *
 * Text before the first hunk header is ignored, and a second file section ends
 * the listing, so a path whose diff Git unexpectedly extended cannot merge two
 * files into one view. An unmerged path arrives as a combined diff whose lines
 * carry one prefix column per parent; those rows are classified by their whole
 * prefix, so the markers never leak into the rendered text.
 * @param text - standard output of `git diff -U3`.
 * @returns the hunks in order, empty when the patch holds none.
 */
export function parsePatch(text: string): DiffHunk[] {
  const hunks: DiffHunk[] = []
  let lines: DiffLine[] | undefined
  let columns = 1
  // The file the hunks below belong to. A commit's patch spans several files,
  // and the `diff --git` line that announces each one is the only place the
  // path appears before its hunks, so it is read rather than skipped.
  let fromGit: string | undefined
  let fromOld: string | undefined
  let fromNew: string | undefined
  for (const raw of text.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    if (line.startsWith('@@')) {
      const parsed = hunkHeader(line)
      columns = parsed.columns
      lines = []
      const path = fromNew ?? fromOld ?? fromGit
      hunks.push({
        header: parsed.header,
        ...(parsed.section.length === 0 ? {} : { section: parsed.section }),
        ...(path === undefined ? {} : { path }),
        lines,
      })
      continue
    }
    if (line.startsWith('diff --git ') || line.startsWith('diff --cc ')) {
      lines = undefined
      fromGit = gitPath(line)
      fromOld = undefined
      fromNew = undefined
      continue
    }
    if (line.startsWith('--- ')) {
      fromOld = sidePath(line.slice(4))
      continue
    }
    if (line.startsWith('+++ ')) {
      fromNew = sidePath(line.slice(4))
      continue
    }
    if (lines === undefined || line.length === 0) continue
    // Git's "no newline at end of file" marker describes the line above it. It
    // is not content, and counting it as a context line would shift every line
    // number after it — including the block boundaries the actions use.
    if (line.startsWith('\\')) continue
    const parsed = hunkLine(line, columns)
    if (parsed !== undefined) lines.push(parsed)
  }
  return hunks
}

/**
 * The path of a `--- a/x` or `+++ b/x` line.
 *
 * `/dev/null` is how Git names the side that does not exist, which happens for
 * an added or a deleted file; it carries no path, so the other side is used.
 * @param value - the line with its `---` or `+++` marker removed.
 * @returns the path, or undefined when the side does not exist.
 */
function sidePath(value: string): string | undefined {
  // Git appends a tab and a timestamp when the patch is not `-p` stripped.
  const name = value.split('\t')[0]?.trim() ?? ''
  if (name.length === 0 || name === '/dev/null') return undefined
  return name.replace(/^[ab]\//, '')
}

/**
 * The path a `diff --git a/x b/x` line names.
 *
 * The line is only a fallback: with a path holding a space it is ambiguous,
 * which is why the `---` and `+++` lines are preferred when they are present.
 * @param line - the `diff --git` line.
 * @returns the new-side path when the two sides agree, else the whole tail.
 */
function gitPath(line: string): string | undefined {
  const tail = line.replace(/^diff --git /, '')
  const match = /^a\/(.*) b\/(.*)$/.exec(tail)
  if (match === null) return tail.trim() === '' ? undefined : tail.trim()
  return match[2]
}
