/**
 * Hunk-level staging: one hunk of one file moved into or out of the index.
 *
 * The write applies the very patch the viewer rendered, so the position the
 * browser sends names a hunk of that same text. Only the head of the patch and
 * the selected hunk are kept, which leaves a one-hunk patch Git can apply to
 * the index alone; the working tree is never touched in either direction.
 */

import { rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WriteProblem } from '../shared.ts'
import { GitFailure } from './git.ts'
import type { Git } from './git.ts'
import { firstLine } from './parse.ts'

/** Why a hunk write refused, in the terms the client acts on. */
export interface HunkRefusal {
  readonly ok: false
  readonly problem: WriteProblem
  readonly message: string
}

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
  const starts = lines.reduce<number[]>((found, line, index) => {
    if (line.startsWith('@@')) found.push(index)
    return found
  }, [])
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

/**
 * Apply a one-hunk patch to the index through a temporary file.
 *
 * `--unidiff-zero` is required because a patch holding one hunk of a longer
 * diff no longer carries the context run the file had, and `--cached` keeps the
 * write in the index, so the working tree reads back exactly as it did.
 * @param git - runner bound to the repository root.
 * @param patch - the one-hunk patch text.
 * @param reverse - remove the hunk from the index instead of adding it.
 * @returns null when Git applied the patch, or the refusal its diagnostic names.
 */
export async function applyHunk(git: Git, patch: string, reverse: boolean): Promise<HunkRefusal | null> {
  const file = join(tmpdir(), `dsh-git-sidebar-hunk-${process.pid}-${Date.now()}-${entropy()}.patch`)
  await writeFile(file, patch, 'utf8')
  try {
    const args = ['apply', '--cached', '--unidiff-zero']
    if (reverse) args.push('--reverse')
    args.push(file)
    await git('apply', args)
    return null
  } catch (error) {
    // A patch that no longer matches is the ordinary outcome of the file having
    // moved under the reader, so it reports the refresh the client should offer.
    if (error instanceof GitFailure) return { ok: false, problem: 'stale', message: firstLine(error.stderr) }
    throw error
  } finally {
    await rm(file, { force: true })
  }
}

/** A suffix that keeps two writes of the same process from sharing one file. */
function entropy(): string {
  return Math.random().toString(16).slice(2)
}
