/**
 * The three staging writes and the commit: every Git invocation is an argv
 * array with the paths after `--`, so a path from the browser can never be
 * read as an option or joined into a shell command.
 *
 * The service owns argument validation, the refusal codes, and re-reading the
 * snapshot; these helpers only decide the Git calls one operation needs.
 */

import { rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Git } from './git.ts'

/** Which staging operation one request asks for. */
export type WriteKind = 'stage' | 'unstage' | 'discard'

/** Options of one staging or discard call. */
export interface WriteRequest {
  /** Paths relative to the repository root, in the caller's order. */
  readonly paths: readonly string[]
  /** Whether a discard also removes untracked files under those paths. */
  readonly includeUntracked: boolean
}

/**
 * Run one staging operation.
 * @param git - runner bound to the repository root.
 * @param kind - which operation to perform.
 * @param request - the paths, and whether a discard includes untracked files.
 */
export async function write(git: Git, kind: WriteKind, request: WriteRequest): Promise<void> {
  switch (kind) {
    case 'stage':
      await git('add', ['add', '-A', '--', ...request.paths])
      return
    case 'unstage':
      // An unborn branch has no HEAD to restore from, so its index entries are removed instead.
      if (await hasHead(git)) await git('restore', ['restore', '--staged', '--', ...request.paths])
      else await git('rm', ['rm', '--cached', '--', ...request.paths])
      return
    case 'discard': {
      const tracked = await trackedPaths(git, request.paths)
      if (tracked.length > 0) await git('restore', ['restore', '--', ...tracked])
      if (request.includeUntracked) await git('clean', ['clean', '-fd', '--', ...request.paths])
      return
    }
  }
}

/** Whether HEAD names a commit; false on an unborn branch, whose index holds every staged path. */
async function hasHead(git: Git): Promise<boolean> {
  const head = await git('rev-parse', ['rev-parse', '--verify', '--quiet', 'HEAD'], [0, 1, 128])
  return head.exitCode === 0
}

/**
 * Keep only the paths the index knows, which is the set `git restore` accepts.
 *
 * `git restore` fails the whole call when one pathspec matches nothing, so an
 * untracked path listed next to a modified one would otherwise block the
 * discard of both.
 * @param git - runner bound to the repository root.
 * @param paths - the paths from the browser.
 * @returns the tracked subset, in the requested order.
 */
async function trackedPaths(git: Git, paths: readonly string[]): Promise<string[]> {
  const listed = await git('ls-files', ['ls-files', '-z', '--cached', '--', ...paths])
  const known = new Set(listed.stdout.split('\0').filter(path => path.length > 0))
  return paths.filter(path => known.has(path))
}

/**
 * Report whether the index holds a change against HEAD, which is what a commit needs.
 * @param git - runner bound to the repository root.
 * @returns whether `git diff --cached --quiet` reported a difference.
 */
export async function hasStagedChanges(git: Git): Promise<boolean> {
  const diff = await git('diff', ['diff', '--cached', '--quiet'], [0, 1])
  return diff.exitCode === 1
}

/**
 * Commit the index with a message passed through a temporary file, then delete it.
 * @param git - runner bound to the repository root.
 * @param message - the commit message, already trimmed and non-empty.
 * @param amend - rewrite the previous commit instead of adding one.
 * @returns the abbreviated object name of the new commit, or null when HEAD stayed unreadable.
 */
export async function commitStaged(git: Git, message: string, amend = false): Promise<string | null> {
  return await withMessageFile(message, async (file) => {
    await git('commit', amend ? ['commit', '--amend', '-F', file] : ['commit', '-F', file])
    return await shortHead(git)
  })
}

/**
 * Commit the given paths only, staging them first so an untracked file is in the index.
 *
 * `--only` makes the named paths the whole content of the new commit: work that
 * is already staged but was not picked stays in the index instead of riding
 * along. `--amend` keeps that same narrowing for a rewrite.
 * @param git - runner bound to the repository root.
 * @param message - the commit message, already trimmed and non-empty.
 * @param paths - repository-relative paths, already validated by the caller.
 * @param amend - rewrite the previous commit instead of adding one.
 * @returns the abbreviated object name of the new commit, or null when HEAD stayed unreadable.
 */
export async function commitPaths(
  git: Git,
  message: string,
  paths: readonly string[],
  amend = false,
): Promise<string | null> {
  await git('add', ['add', '--', ...paths])
  return await withMessageFile(message, async (file) => {
    const amendFlag = amend ? ['--amend'] : []
    await git('commit', ['commit', '--only', '-F', file, ...amendFlag, '--', ...paths])
    return await shortHead(git)
  })
}

/**
 * Run one Git call with the message in a temporary file, then remove the file.
 *
 * A message holds paragraphs, and Git would read those as breaks in an argument.
 * @param message - the text to hand Git.
 * @param run - the call that reads the file.
 * @returns whatever the call returned.
 */
async function withMessageFile<T>(message: string, run: (file: string) => Promise<T>): Promise<T> {
  const file = join(
    tmpdir(),
    `dsh-git-sidebar-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`,
  )
  await writeFile(file, message, 'utf8')
  try {
    return await run(file)
  } finally {
    await rm(file, { force: true })
  }
}

/**
 * Read the abbreviated object name HEAD now names.
 * @param git - runner bound to the repository root.
 * @returns the abbreviation, or null when HEAD is unreadable.
 */
async function shortHead(git: Git): Promise<string | null> {
  const head = await git('rev-parse', ['rev-parse', '--short', 'HEAD'], [0, 128])
  const [commit] = head.stdout.split(/\r?\n/)
  return head.exitCode === 0 && commit !== undefined && commit.length > 0 ? commit : null
}
