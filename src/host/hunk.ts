/**
 * Applying one hunk, or one block of a hunk, to the index or the working tree.
 *
 * The patch itself is lifted in `patch.ts`; what is left here is the write: a
 * temporary file, `git apply --unidiff-zero`, and the refusal the client acts
 * on. The target decides where the write lands: the index keeps the working
 * tree reading back exactly as it did, while the working tree is how a block is
 * rolled back.
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
 * Apply a one-hunk or one-block patch through a temporary file.
 *
 * `--unidiff-zero` is required because a patch holding one hunk of a longer
 * diff no longer carries the context run the file had — and a block lifted out
 * of a hunk carries no context at all.
 * @param git - runner bound to the repository root.
 * @param patch - the one-hunk or one-block patch text.
 * @param reverse - remove the change from the target instead of adding it.
 * @param target - `index` writes the index alone; `worktree` writes the file.
 * @returns null when Git applied the patch, or the refusal its diagnostic names.
 */
export async function applyHunk(
  git: Git,
  patch: string,
  reverse: boolean,
  target: 'index' | 'worktree' = 'index',
): Promise<HunkRefusal | null> {
  const file = join(tmpdir(), `dsh-git-sidebar-hunk-${process.pid}-${Date.now()}-${entropy()}.patch`)
  await writeFile(file, patch, 'utf8')
  try {
    const args = ['apply', '--unidiff-zero']
    if (target === 'index') args.push('--cached')
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
