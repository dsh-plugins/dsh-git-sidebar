/**
 * The write-shaped branch operations: checkout, creation, deletion, merge,
 * stashing, the network sync, and aborting an interrupted operation.
 *
 * Each helper performs the Git calls one request needs and lets the service
 * decide the refusal code; none of them reads a snapshot, because the service
 * re-reads it once for every outcome.
 */

import type { OperationKind, SyncAction } from '../shared.ts'
import type { GitRunner } from './git.ts'
import { firstLine } from './parse.ts'

/** Longest a branch name may be, matching Git's own practical limit. */
const MAX_BRANCH_NAME = 240

/** The one line `git branch -d` prints when the branch holds unmerged commits. */
const NOT_FULLY_MERGED = /not fully merged/i

/** The marker Git prints, on either stream, when a merge stopped on a conflict. */
const CONFLICT = /\bCONFLICT\b/

/** What a branch deletion did. */
export type BranchDeletion =
  | { readonly kind: 'deleted' }
  | { readonly kind: 'unmerged'; readonly message: string }
  | { readonly kind: 'failed'; readonly message: string }

/** What a merge did: a clean result, a conflict left in the checkout, or a refusal. */
export type BranchMerge =
  | { readonly kind: 'merged' }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'failed'; readonly message: string }

/** Most stash entries the panel addresses by index. */
const MAX_STASH_INDEX = 999

/**
 * Switch the checkout to an existing local branch.
 *
 * No `--` separates the name: Git reads everything after `--` as a pathspec, so
 * `checkout -- other` restores files instead of switching branches. The name is
 * validated against the branch list before this runs, and `checkout -q` keeps a
 * detached name from being mistaken for a commit.
 * @param git - runner bound to the repository root.
 * @param branch - the branch to check out.
 * @returns nothing; the caller re-reads the snapshot.
 */
export async function checkout(git: GitRunner, branch: string): Promise<void> {
  await git('checkout', ['checkout', '--quiet', branch])
}

/**
 * Create a branch and switch to it.
 * @param git - runner bound to the repository root.
 * @param name - the new branch name.
 * @param from - the commit or branch to start from; HEAD when omitted.
 * @returns nothing; the caller re-reads the snapshot.
 */
export async function createBranch(git: GitRunner, name: string, from?: string): Promise<void> {
  const start = from === undefined || from.length === 0 ? [] : [from]
  await git('checkout', ['checkout', '--quiet', '-b', name, ...start])
}

/**
 * Report whether a branch name is well formed.
 * @param git - runner bound to the repository root.
 * @param name - the candidate name.
 * @returns whether `git check-ref-format --branch` accepts it.
 */
export async function isValidBranchName(git: GitRunner, name: string): Promise<boolean> {
  if (name.length === 0 || name.length > MAX_BRANCH_NAME) return false
  const check = await git('check-ref-format', ['check-ref-format', '--branch', name], [0, 1, 128])
  return check.exitCode === 0
}

/**
 * Delete a local branch, reporting an unmerged branch as its own outcome.
 *
 * The name is a positional argument, not a pathspec, so no `--` precedes it:
 * `git branch -d -- other` would read `other` as an option terminator. An
 * unmerged branch is not a failure of the request, because the user can retry
 * it with `force`; Git answers both cases with exit 1, so the diagnostic line
 * is what separates them.
 * @param git - runner bound to the repository root.
 * @param branch - the local branch to delete.
 * @param force - delete even when the branch holds unmerged commits.
 * @returns what became of the branch.
 */
export async function deleteBranch(git: GitRunner, branch: string, force: boolean): Promise<BranchDeletion> {
  const deletion = await git('branch', ['branch', force ? '-D' : '-d', branch], [0, 1, 128])
  if (deletion.exitCode === 0) return { kind: 'deleted' }
  const message = firstLine(deletion.stderr.length > 0 ? deletion.stderr : deletion.stdout)
  if (!force && NOT_FULLY_MERGED.test(message)) return { kind: 'unmerged', message }
  return { kind: 'failed', message }
}

/**
 * Merge a branch into the checked-out one, leaving a conflict in the checkout.
 *
 * A conflict is a normal result: Git exits 1 and stops mid-merge, with the
 * markers in the working tree and `MERGE_HEAD` set. The snapshot call that
 * follows then reports `operation: 'merge'` and the conflicted paths, which is
 * what the panel needs to offer the conflict view. Exit 1 alone is not enough
 * to claim a conflict, because an unknown revision also exits 1, so the merge
 * state is confirmed through `MERGE_HEAD`. `--no-edit` keeps Git from opening
 * an editor, and `--quiet` drops the stat summary it would otherwise print.
 * @param git - runner bound to the repository root.
 * @param branch - the branch to merge into the checkout.
 * @returns whether the merge finished, stopped on a conflict, or refused.
 */
export async function mergeBranch(git: GitRunner, branch: string): Promise<BranchMerge> {
  const merge = await git('merge', ['merge', '--no-edit', '--quiet', branch], [0, 1, 128])
  if (merge.exitCode === 0) return { kind: 'merged' }
  // Exit 1 is Git's answer both to a conflict and to a name it cannot merge, so
  // the conflict claim also needs the marker or the merge state Git leaves behind.
  if (merge.exitCode === 1 && (CONFLICT.test(`${merge.stdout}${merge.stderr}`) || await mergingIn(git))) {
    return { kind: 'conflict' }
  }
  const message = firstLine(merge.stderr.length > 0 ? merge.stderr : merge.stdout)
  return { kind: 'failed', message }
}

/**
 * Report whether the checkout is between a merge whose result is not committed.
 * @param git - runner bound to the repository root.
 * @returns whether `MERGE_HEAD` resolves.
 */
async function mergingIn(git: GitRunner): Promise<boolean> {
  const head = await git('rev-parse', ['rev-parse', '--verify', '--quiet', 'MERGE_HEAD'], [0, 1, 128])
  return head.exitCode === 0
}

/**
 * Report whether a path is already a file or directory in the working tree.
 * @param git - runner bound to the repository root.
 * @param path - a repository-relative path.
 * @returns whether the index knows the path.
 */
export async function trackedOrPresent(git: GitRunner, path: string): Promise<boolean> {
  const listed = await git('ls-files', ['ls-files', '-z', '--', path])
  return listed.stdout.split('\0').some(entry => entry.length > 0)
}

/**
 * Report whether the working tree holds a change that a checkout would lose.
 *
 * Untracked files do not block a checkout, so only index and working-tree
 * changes of tracked paths count.
 * @param git - runner bound to the repository root.
 * @returns whether any tracked path differs from HEAD.
 */
export async function hasTrackedChanges(git: GitRunner): Promise<boolean> {
  const status = await git('status', ['status', '--porcelain', '--untracked-files=no'])
  return status.stdout.trim().length > 0
}

/**
 * Store the working tree in a new stash entry.
 * @param git - runner bound to the repository root.
 * @param message - the message to store; Git's default when empty.
 * @returns nothing; the caller re-reads the snapshot.
 */
export async function stashPush(git: GitRunner, message?: string): Promise<void> {
  const text = message?.trim() ?? ''
  await git('stash', text.length === 0 ? ['stash', 'push'] : ['stash', 'push', '-m', text])
}

/**
 * Apply one stash entry, optionally removing it.
 * @param git - runner bound to the repository root.
 * @param index - the entry's position, newest being 0.
 * @param drop - true pops (apply and remove), false only applies.
 * @returns nothing; the caller re-reads the snapshot.
 */
export async function stashApply(git: GitRunner, index: number, drop: boolean): Promise<void> {
  const ref = `stash@{${index}}`
  await git('stash', ['stash', drop ? 'pop' : 'apply', ref])
}

/**
 * Remove one stash entry without touching the working tree.
 * @param git - runner bound to the repository root.
 * @param index - the entry's position, newest being 0.
 * @returns nothing; the caller re-reads the snapshot.
 */
export async function stashDrop(git: GitRunner, index: number): Promise<void> {
  await git('stash', ['stash', 'drop', `stash@{${index}}`])
}

/**
 * Report whether a stash index is one the panel can address.
 * @param index - the wire value.
 * @returns whether it names a possible entry.
 */
export function validStashIndex(index: unknown): index is number {
  return typeof index === 'number' && Number.isInteger(index) && index >= 0 && index <= MAX_STASH_INDEX
}

/**
 * Run one network operation against the branch's upstream.
 *
 * A pull is `--ff-only` on purpose: the panel has no merge editor, so producing
 * a merge commit behind the reader's back would be worse than reporting that a
 * fast-forward is impossible.
 * @param git - runner bound to the repository root.
 * @param action - which operation to run.
 */
export async function sync(git: GitRunner, action: SyncAction): Promise<void> {
  switch (action) {
    case 'fetch':
      await git('fetch', ['fetch'])
      return
    case 'pull':
      await git('pull', ['pull', '--ff-only'])
      return
    case 'push':
      await git('push', ['push'])
      return
  }
}

/**
 * Report whether a wire value names a sync action.
 * @param action - the wire value.
 * @returns whether it is one of the three operations.
 */
export function isSyncAction(action: unknown): action is SyncAction {
  return action === 'fetch' || action === 'pull' || action === 'push'
}

/**
 * Undo the operation the checkout is between.
 * @param git - runner bound to the repository root.
 * @param operation - which operation to abort.
 * @returns nothing; the caller re-reads the snapshot.
 */
export async function abort(git: GitRunner, operation: OperationKind): Promise<void> {
  switch (operation) {
    case 'merge':
      await git('merge', ['merge', '--abort'])
      return
    case 'rebase':
      await git('rebase', ['rebase', '--abort'])
      return
    case 'cherry-pick':
      await git('cherry-pick', ['cherry-pick', '--abort'])
      return
    case 'revert':
      await git('revert', ['revert', '--abort'])
      return
  }
}
