/**
 * Commit history, branch listing, and the stashes, read from one checkout.
 *
 * Each reader answers a question the panel asks on screen, and each reports a
 * stated reason instead of throwing: the list, the picker, and the stash group
 * all render their own failure next to the control that produced it.
 */

import { stat } from 'node:fs/promises'
import type {
  BranchList, CommitEntry, CommitDetailArgs, HistoryArgs, HistoryPage, StashEntry,
} from '../shared.ts'
import type { HostContext, HostSession } from './context.ts'
import { GitFailure, gitIn } from './git.ts'
import type { GitConfig } from './git.ts'
import type { DiffConfig } from './diff.ts'
import { firstLine, parseName, parsePatch } from './parse.ts'
import { topLevel } from './status.ts'
import type { DiffPayload } from '../shared.ts'

/** Most commits one history page returns, whatever the client asks for. */
const MAX_HISTORY = 100

/** Field separator inside one log record, chosen so a subject cannot contain it. */
const FIELD = '\u001f'

/** Record separator between log entries. */
const RECORD = '\u001e'

/** Decorations Git prefixes to entries that are not plain branches. */
const DECORATION_PREFIX = 'HEAD -> '

/**
 * Read one page of the commit history.
 * @param ctx - context that provides the subprocess and sandbox services.
 * @param config - executable and process limits.
 * @param session - Session whose sandbox policy applies.
 * @param directory - absolute directory inside the checkout.
 * @param args - the page size and offset.
 * @param signal - cancellation of every command.
 * @returns the page and whether more commits follow it.
 */
export async function readHistory(
  ctx: HostContext,
  config: GitConfig,
  session: HostSession,
  directory: string,
  args: HistoryArgs,
  signal: AbortSignal,
): Promise<HistoryPage> {
  const limit = clamp(Math.trunc(args.limit), 1, MAX_HISTORY)
  const skip = Number.isFinite(args.skip) && args.skip > 0 ? Math.trunc(args.skip) : 0
  const git = gitIn(ctx, config, session, await topLevel(gitIn(ctx, config, session, directory, signal)), signal)
  const format = `--format=%H${FIELD}%h${FIELD}%s${FIELD}%an${FIELD}%aI${FIELD}%D${RECORD}`
  const log = await git('log', ['log', `--max-count=${limit + 1}`, `--skip=${skip}`, format])
  const records = log.stdout.split(RECORD).filter(record => record.trim().length > 0)
  const hasMore = records.length > limit
  const commits = records.slice(0, limit).map(parseCommit)
  return { commits, hasMore }
}

/**
 * Read one commit's own patch.
 * @param ctx - context that provides the subprocess and sandbox services.
 * @param config - executable, process, and rendering limits.
 * @param session - Session whose sandbox policy applies.
 * @param directory - absolute directory inside the checkout.
 * @param args - the commit to show.
 * @param signal - cancellation of every command.
 * @returns the patch as the viewer consumes it.
 */
export async function readCommitDiff(
  ctx: HostContext,
  config: DiffConfig,
  session: HostSession,
  directory: string,
  args: CommitDetailArgs,
  signal: AbortSignal,
): Promise<DiffPayload> {
  if (!/^[0-9a-f]{4,40}$/i.test(args.sha)) {
    return { kind: 'error', message: 'the commit name is not an object name' }
  }
  try {
    const root = await topLevel(gitIn(ctx, config, session, directory, signal))
    const git = gitIn(
      ctx,
      { ...config, maxOutputBytes: Math.min(config.maxDiffBytes * 2, 67_108_864) },
      session,
      root,
      signal,
    )
    const show = await git('show', ['show', '--format=', '--patch', '--no-color', '--no-ext-diff', args.sha])
    return await renderCommitPatch(git, args.sha, show.stdout, config.maxDiffBytes)
  } catch (error) {
    if (error instanceof GitFailure) return { kind: 'error', message: firstLine(error.stderr) }
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Turn a commit's patch text into a payload, reusing the per-path reader's parser.
 * @param git - runner bound to the repository root.
 * @param sha - the commit the patch came from.
 * @param output - the patch text.
 * @param maxBytes - the rendering limit in bytes.
 * @returns the payload the viewer renders.
 */
async function renderCommitPatch(
  git: Awaited<ReturnType<typeof gitIn>>,
  sha: string,
  output: string,
  maxBytes: number,
): Promise<DiffPayload> {
  const binary = await git('diff-tree', ['diff-tree', '--numstat', '-z', '--no-commit-id', '-r', sha])
  if (binary.stdout.split('\0').some(field => field === '-\t-')) return { kind: 'binary' }
  const bytes = Buffer.from(output, 'utf8')
  const truncated = bytes.byteLength > maxBytes
  const text = truncated ? bytes.subarray(0, maxBytes).toString('utf8') : output
  return { kind: 'text', hunks: parsePatch(text), truncated }
}

/**
 * List the branches a checkout offers.
 * @param ctx - context that provides the subprocess and sandbox services.
 * @param config - executable and process limits.
 * @param session - Session whose sandbox policy applies.
 * @param directory - absolute directory inside the checkout.
 * @param signal - cancellation of every command.
 * @returns the checked-out branch and both ref groups.
 */
export async function readBranches(
  ctx: HostContext,
  config: GitConfig,
  session: HostSession,
  directory: string,
  signal: AbortSignal,
): Promise<BranchList> {
  const root = await topLevel(gitIn(ctx, config, session, directory, signal))
  const git = gitIn(ctx, config, session, root, signal)
  const format = '--format=%(refname:lstrip=2)'
  const [head, local, remote] = await Promise.all([
    git('symbolic-ref', ['symbolic-ref', '--quiet', '--short', 'HEAD'], [0, 1, 128]),
    git('for-each-ref', ['for-each-ref', format, 'refs/heads/']),
    git('for-each-ref', ['for-each-ref', format, 'refs/remotes/']),
  ])
  return {
    current: head.exitCode === 0 ? parseName(head.stdout) : null,
    local: lines(local.stdout),
    remote: lines(remote.stdout),
  }
}

/**
 * List the stash entries of a checkout.
 * @param ctx - context that provides the subprocess and sandbox services.
 * @param config - executable and process limits.
 * @param session - Session whose sandbox policy applies.
 * @param directory - absolute directory inside the checkout.
 * @param signal - cancellation of every command.
 * @returns the entries, newest first.
 */
export async function readStashes(
  ctx: HostContext,
  config: GitConfig,
  session: HostSession,
  directory: string,
  signal: AbortSignal,
): Promise<readonly StashEntry[]> {
  const root = await topLevel(gitIn(ctx, config, session, directory, signal))
  const git = gitIn(ctx, config, session, root, signal)
  const list = await git('stash', ['stash', 'list', `--format=%gd${FIELD}%gs`], [0, 128])
  return list.stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map((line, index) => {
      const [gd = '', ...rest] = line.split(FIELD)
      const position = Number(/^stash@\{(\d+)\}$/.exec(gd)?.[1] ?? index)
      return { index: Number.isFinite(position) ? position : index, subject: rest.join(FIELD) }
    })
}

/**
 * Read whether the checkout is in the middle of an operation, and which one.
 *
 * The markers live in the Git directory, so the answer comes from asking Git
 * whether each marker resolves rather than from composing a path by hand: a
 * linked worktree keeps its own Git directory, and guessing would read the
 * wrong one.
 * @param git - runner bound to the repository root.
 * @returns the operation, or null when the checkout is between operations.
 */
export async function readOperation(
  git: Awaited<ReturnType<typeof gitIn>>,
): Promise<'merge' | 'rebase' | 'cherry-pick' | 'revert' | null> {
  const [merge, rebase, rebaseApply, cherry, revert] = await Promise.all([
    git('rev-parse', ['rev-parse', '--verify', '--quiet', 'MERGE_HEAD'], [0, 1, 128]),
    git('rev-parse', ['rev-parse', '--git-path', 'rebase-merge'], [0, 128]),
    git('rev-parse', ['rev-parse', '--git-path', 'rebase-apply'], [0, 128]),
    git('rev-parse', ['rev-parse', '--verify', '--quiet', 'CHERRY_PICK_HEAD'], [0, 1, 128]),
    git('rev-parse', ['rev-parse', '--verify', '--quiet', 'REVERT_HEAD'], [0, 1, 128]),
  ])
  if (merge.exitCode === 0) return 'merge'
  if (await exists(rebase.stdout) || await exists(rebaseApply.stdout)) return 'rebase'
  if (cherry.exitCode === 0) return 'cherry-pick'
  if (revert.exitCode === 0) return 'revert'
  return null
}

/** Whether a path Git printed names something on disk. */
async function exists(path: string): Promise<boolean> {
  const target = path.trim()
  if (target.length === 0) return false
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

/**
 * Read the upstream a branch tracks and how far apart the two sides are.
 * @param git - runner bound to the repository root.
 * @returns the tracked ref with its counts, or null when the branch tracks none.
 */
export async function readUpstream(
  git: Awaited<ReturnType<typeof gitIn>>,
): Promise<{ name: string; ahead: number; behind: number } | null> {
  const name = await git('upstream', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], [0, 128])
  const tracked = name.exitCode === 0 ? parseName(name.stdout) : null
  if (tracked === null) return null
  const counts = await git('rev-list', ['rev-list', '--left-right', '--count', `HEAD...${tracked}`], [0, 128])
  if (counts.exitCode !== 0) return { name: tracked, ahead: 0, behind: 0 }
  const [ahead = '0', behind = '0'] = counts.stdout.trim().split(/\s+/)
  return { name: tracked, ahead: Number(ahead) || 0, behind: Number(behind) || 0 }
}

/** Split one multi-line name list into trimmed non-empty names. */
function lines(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
}

/** Read one log record into a commit entry. */
function parseCommit(record: string): CommitEntry {
  const [sha = '', short = '', subject = '', author = '', when = '', decorations = ''] =
    record.split(FIELD)
  return { sha, short, subject, author, when, refs: refsOf(decorations) }
}

/** Split a `%D` decoration list into ref names, dropping the `HEAD -> ` pointer syntax. */
function refsOf(decorations: string): string[] {
  return decorations
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0)
    .map(entry => entry.startsWith(DECORATION_PREFIX) ? entry.slice(DECORATION_PREFIX.length) : entry)
}

/** Keep a number inside an inclusive range. */
function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, min), max) : min
}
