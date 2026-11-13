/**
 * The repository snapshot the panel renders.
 *
 * `readStatus` reads the checkout containing one directory and never decides
 * presentation: it reports either repository facts or the structured
 * {@link NoRepository} refusal. Every Git failure other than that refusal
 * escapes to the caller so its `problem` can be classified in one place.
 */

import type { ChangeEntry, GitIdentity, StatusSnapshot } from '../shared.ts'
import type { HostContext, HostSession } from './context.ts'
import { GitFailure, gitIn } from './git.ts'
import type { Git, GitConfig } from './git.ts'
import { firstLine, parseName, parseStatus, parseTopLevel } from './parse.ts'
import { readOperation, readUpstream } from './refs.ts'

/** Raised when the directory is not inside a Git checkout. */
export class NoRepository extends Error {
  override name = 'NoRepository'

  constructor(message = 'the directory is not inside a Git checkout') {
    super(message)
  }
}

/** The one line Git prints outside a checkout, in every locale the panel pins. */
const NOT_A_CHECKOUT = /not a git repository|must be run in a work tree/i

/** A snapshot that reports nothing but why no repository is available. */
export const UNAVAILABLE_IDENTITY: GitIdentity = { name: null, email: null }

/**
 * Read the checkout containing `directory`.
 * @param ctx - context that provides the subprocess and sandbox services.
 * @param config - executable and process limits.
 * @param session - Session whose sandbox policy applies.
 * @param directory - absolute directory inside the checkout.
 * @param signal - cancellation of every command.
 * @returns the repository snapshot.
 * @throws {@link NoRepository} outside a checkout, or the Git failure that ended the read.
 */
export async function readStatus(
  ctx: HostContext,
  config: GitConfig,
  session: HostSession,
  directory: string,
  signal: AbortSignal,
): Promise<StatusSnapshot> {
  const root = await topLevel(gitIn(ctx, config, session, directory, signal))
  const git = gitIn(ctx, config, session, root, signal)
  const [status, branch, commit, identity, upstream, operation] = await Promise.all([
    git('status', ['status', '--porcelain=v2', '-z', '--untracked-files=all']),
    git('symbolic-ref', ['symbolic-ref', '--quiet', '--short', 'HEAD'], [0, 1, 128]),
    git('rev-parse', ['rev-parse', '--short', 'HEAD'], [0, 128]),
    readIdentity(git),
    readUpstream(git),
    readOperation(git),
  ])
  const parsed = parseStatus(status.stdout, status.truncated)
  return {
    kind: 'repository',
    branch: branch.exitCode === 0 ? parseName(branch.stdout) : null,
    commit: commit.exitCode === 0 ? parseName(commit.stdout) : null,
    root,
    staged: parsed.staged,
    unstaged: parsed.unstaged,
    conflicts: parsed.conflicts,
    identity,
    upstream,
    operation,
  }
}

/**
 * Read the repository root that contains one directory.
 * @param git - runner bound to the directory.
 * @returns the absolute top-level directory.
 * @throws {@link NoRepository} when Git reports the directory is outside a checkout,
 * and {@link GitFailure} when it fails for any other reason.
 */
export async function topLevel(git: Git): Promise<string> {
  const top = await git('rev-parse', ['rev-parse', '--show-toplevel'], [0, 128])
  if (top.exitCode !== 0) {
    if (NOT_A_CHECKOUT.test(top.stderr)) throw new NoRepository()
    throw new GitFailure('rev-parse', top.exitCode, top.stderr)
  }
  const root = parseTopLevel(top.stdout)
  if (root.length === 0) throw new GitFailure('rev-parse', 0, 'git rev-parse printed no directory')
  return root
}

/** Read the configured committer identity; an unset or empty value stays null. */
export async function readIdentity(git: Git): Promise<GitIdentity> {
  const [name, email] = await Promise.all([
    git('config', ['config', '--get', 'user.name'], [0, 1]),
    git('config', ['config', '--get', 'user.email'], [0, 1]),
  ])
  return { name: valueOf(name.exitCode, name.stdout), email: valueOf(email.exitCode, email.stdout) }
}

/** Read one `git config --get` result as a value, or null when it is unset or blank. */
function valueOf(exitCode: number, stdout: string): string | null {
  if (exitCode !== 0) return null
  const value = stdout.trim()
  return value.length === 0 ? null : value
}

/**
 * Build a snapshot that reports why no repository is available.
 * @param problem - the reason the panel can act on.
 * @param message - human-readable detail; omitted when the reason speaks for itself.
 * @returns the unavailable snapshot.
 */
export function unavailable(
  problem: 'no-repository' | 'no-directory' | 'git-missing' | 'failed',
  message?: string,
): StatusSnapshot {
  return {
    kind: 'unavailable',
    problem,
    staged: [],
    unstaged: [],
    conflicts: [],
    identity: UNAVAILABLE_IDENTITY,
    ...(message === undefined ? {} : { message }),
  }
}

/**
 * Report the first line of a failure as the message for a snapshot or outcome.
 * @param error - the failure.
 * @returns the diagnostic line, or the error's own message.
 */
export function messageOf(error: unknown): string {
  if (error instanceof GitFailure) return firstLine(error.stderr)
  return error instanceof Error ? error.message : String(error)
}

/** Re-export so callers that only need the entry shape do not import the wire module. */
export type { ChangeEntry }
