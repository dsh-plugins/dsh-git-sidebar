/**
 * The wording of every question the panel asks before it destroys something.
 *
 * What a question says lives here; how it is drawn lives in `dialog-host.ts`,
 * which renders the panel's own modal. A question states the file set it
 * applies to rather than a count, because the reader is confirming paths.
 */

import type { Translate } from './api.ts'
import { askConfirm, askText, showNotice, type DialogAsk } from './dialog-host.ts'

/** What one discard will touch. */
export interface DiscardPrompt {
  /** Every path the discard covers, in the order the panel lists them. */
  readonly files: readonly string[]
  /** The subset the discard deletes outright, because Git does not track it. */
  readonly untracked: readonly string[]
}

/**
 * Name a set of paths: one path verbatim, two to five all of them, and more
 * than five the first and the total.
 * @param t - the panel's translator.
 * @param paths - the paths to name.
 * @returns the paths to draw as a list.
 */
export function nameFiles(t: Translate, paths: readonly string[]): readonly string[] {
  const first = paths[0] ?? ''
  if (paths.length <= 1) return first === '' ? [] : [first]
  if (paths.length <= 5) return paths
  return [t('dialog.filesMany', { first, count: paths.length })]
}

/**
 * Compose the discard question.
 *
 * Untracked files get their own sentence because restoring them is impossible,
 * unlike a tracked file whose content survives in the object database.
 * @param t - the panel's translator.
 * @param prompt - the paths, and which of them are untracked.
 * @returns the question.
 */
export function discardAsk(t: Translate, prompt: DiscardPrompt): DialogAsk {
  return {
    title: t('dialog.discard.title'),
    body: t('dialog.discard.body'),
    lines: nameFiles(t, prompt.files),
    ...prompt.untracked.length === 0
      ? {}
      : { warning: `${t('dialog.discard.untracked')}\n${prompt.untracked.join('\n')}` },
    danger: true,
    confirm: t('dialog.confirm'),
    cancel: t('dialog.cancel'),
  }
}

/**
 * Ask before discarding.
 * @param t - the panel's translator.
 * @param prompt - the paths, and which of them are untracked.
 * @returns whether the reader agreed.
 */
export function confirmDiscard(t: Translate, prompt: DiscardPrompt): Promise<boolean> {
  return askConfirm(discardAsk(t, prompt))
}

/** One stash entry that is about to be destroyed or applied. */
export interface StashPrompt {
  /** Which removal the reader is confirming; `apply` never asks. */
  readonly action: 'pop' | 'drop'
  readonly subject: string
  readonly index: number
}

/**
 * Ask before a stash entry is removed.
 * @param t - the panel's translator.
 * @param prompt - the entry and the action.
 * @returns whether the reader agreed.
 */
export function confirmStash(t: Translate, prompt: StashPrompt): Promise<boolean> {
  const popping = prompt.action === 'pop'
  return askConfirm({
    title: t(popping ? 'dialog.stash.popTitle' : 'dialog.stash.dropTitle'),
    body: t(popping ? 'dialog.stash.popBody' : 'dialog.stash.dropBody'),
    lines: [`stash@{${prompt.index}}  ${prompt.subject}`],
    danger: !popping,
    confirm: t('dialog.confirm'),
    cancel: t('dialog.cancel'),
  })
}

/**
 * Ask before a network operation that writes to the remote.
 *
 * A fetch only reads, so it never asks. A pull moves the local branch and a push
 * publishes commits other people can see, and both are worth naming the upstream
 * they touch.
 * @param t - the panel's translator.
 * @param action - which operation is being confirmed.
 * @param upstream - the tracked ref, when the branch has one.
 * @returns whether the reader agreed.
 */
export function confirmSync(t: Translate, action: 'pull' | 'push', upstream: string | null): Promise<boolean> {
  const name = upstream ?? t('sync.noUpstream')
  const pulling = action === 'pull'
  return askConfirm({
    title: t(pulling ? 'dialog.pull.title' : 'dialog.push.title'),
    body: t(pulling ? 'dialog.pull.body' : 'dialog.push.body', { name }),
    confirm: t('dialog.confirm'),
    cancel: t('dialog.cancel'),
  })
}

/**
 * Ask before undoing a merge or a rebase.
 *
 * Aborting discards the resolution of every conflict in the operation, so the
 * question states what it throws away rather than asking a bare confirmation.
 * @param t - the panel's translator.
 * @param operation - the operation being aborted.
 * @returns whether the reader agreed.
 */
export function confirmAbort(t: Translate, operation: string): Promise<boolean> {
  return askConfirm({
    title: t('dialog.abort.title'),
    body: t('dialog.abort', { operation }),
    danger: true,
    confirm: t('dialog.confirm'),
    cancel: t('dialog.cancel'),
  })
}

/**
 * Ask before deleting a local branch.
 * @param t - the panel's translator.
 * @param branch - the branch to delete.
 * @returns whether the reader agreed.
 */
export function confirmDeleteBranch(t: Translate, branch: string): Promise<boolean> {
  return askConfirm({
    title: t('dialog.deleteBranch.title'),
    body: t('dialog.deleteBranch', { branch }),
    danger: true,
    confirm: t('dialog.confirm'),
    cancel: t('dialog.cancel'),
  })
}

/**
 * Ask again when the branch holds commits that are in no other branch.
 * @param t - the panel's translator.
 * @param branch - the unmerged branch.
 * @returns whether the reader agreed to lose those commits.
 */
export function confirmForceDelete(t: Translate, branch: string): Promise<boolean> {
  return askConfirm({
    title: t('dialog.forceDeleteBranch.title'),
    body: t('dialog.forceDeleteBranch', { branch }),
    danger: true,
    confirm: t('dialog.confirm'),
    cancel: t('dialog.cancel'),
  })
}

/**
 * Ask before merging one branch into the checked-out one.
 * @param t - the panel's translator.
 * @param branch - the branch being merged in.
 * @param current - the branch receiving the merge, when there is one.
 * @returns whether the reader agreed.
 */
export function confirmMerge(t: Translate, branch: string, current: string | null): Promise<boolean> {
  return askConfirm({
    title: t('dialog.merge.title'),
    body: t('dialog.merge', { branch, current: current ?? '' }),
    confirm: t('dialog.confirm'),
    cancel: t('dialog.cancel'),
  })
}

/**
 * Ask before leaving the branch to look at one commit.
 *
 * A detached head is the one checkout a reader can land in without noticing: the
 * header still names a commit, but a commit made there belongs to no branch.
 * @param t - the panel's translator.
 * @param short - the abbreviated object name being checked out.
 * @returns whether the reader agreed.
 */
export function confirmDetach(t: Translate, short: string): Promise<boolean> {
  return askConfirm({
    title: t('dialog.detach.title'),
    body: t('dialog.detach', { short }),
    confirm: t('dialog.confirm'),
    cancel: t('dialog.cancel'),
  })
}

/**
 * Ask for the name of a branch that starts at one commit.
 * @param t - the panel's translator.
 * @param short - the abbreviated object name the branch starts at.
 * @returns the name, or null when the reader cancelled.
 */
export function askBranchName(t: Translate, short: string): Promise<string | null> {
  return askText({
    title: t('dialog.branchFrom.title'),
    body: t('dialog.branchFrom', { short }),
    input: '',
    confirm: t('dialog.confirm'),
    cancel: t('dialog.cancel'),
  })
}

/**
 * Ask before acting on a branch the panel is only previewing.
 *
 * A preview moves nothing: the branch name and the log change, the checkout does
 * not. An operation that names the previewed branch therefore cannot run as it
 * stands, so the question is the step that turns the preview into a real
 * checkout — and the labels say so instead of asking a bare confirmation.
 * @param t - the panel's translator.
 * @param preview - the branch being previewed.
 * @param current - the branch actually checked out, when Git reports one.
 * @returns whether the reader agreed to check the previewed branch out.
 */
export function confirmPreviewCheckout(t: Translate, preview: string, current: string | null): Promise<boolean> {
  return askConfirm({
    title: t('dialog.previewCheckout.title'),
    body: t('dialog.previewCheckout.body', { preview, current: current ?? '' }),
    confirm: t('dialog.previewCheckout.confirm'),
    cancel: t('dialog.cancel'),
  })
}

/**
 * Report a refusal the reader asked for and Git declined.
 *
 * Switching branches over a dirty tree is the case this exists for: the request
 * looked reasonable, so silence would read as a bug.
 * @param t - the panel's translator.
 * @param message - the sentence to show.
 * @returns a promise that settles when the reader dismissed it.
 */
export function notify(t: Translate, message: string): Promise<void> {
  return showNotice({
    title: t('dialog.refused.title'),
    body: message,
    confirm: t('dialog.ok'),
    // A notice has one answer, so the second button is left out entirely rather
    // than repeating the same word twice.
    cancel: '',
  })
}
