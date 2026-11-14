/**
 * The one dialog the panel asks before it destroys anything.
 *
 * `window.confirm` is used deliberately: it is modal, keyboard-dismissible, and
 * owned by the browser, so a confirmation can never be missed behind the panel
 * or left open by a re-render. What this module owns is the wording — which
 * files are affected, and the extra sentence untracked files need.
 */

import type { Translate } from './api.ts'

/** What one discard will touch. */
export interface DiscardPrompt {
  /** Every path the discard covers, in the order the panel lists them. */
  readonly files: readonly string[]
  /** The subset the discard deletes outright, because Git does not track it. */
  readonly untracked: readonly string[]
}

/**
 * Name a set of paths in one line: one path verbatim, two to five all of them,
 * and more than five the first and the total.
 * @param t - the panel's translator.
 * @param paths - the paths to name.
 * @returns the catalogued phrase.
 */
export function nameFiles(t: Translate, paths: readonly string[]): string {
  const first = paths[0] ?? ''
  if (paths.length <= 1) return first
  if (paths.length <= 5) return paths.join('\n')
  return t('dialog.filesMany', { first, count: paths.length })
}

/**
 * Compose the discard dialog's text.
 *
 * The list of affected paths is the point of the dialog: the reader confirms a
 * file set, not a count. Untracked files get their own paragraph because
 * restoring them is impossible, unlike a tracked file whose content survives in
 * the object database.
 * @param t - the panel's translator.
 * @param prompt - the paths, and which of them are untracked.
 * @returns the message `window.confirm` shows.
 */
export function formatDiscardPrompt(t: Translate, prompt: DiscardPrompt): string {
  const lines = [t('dialog.discard.title'), '', t('dialog.discard.body'), '', nameFiles(t, prompt.files)]
  if (prompt.untracked.length > 0) {
    lines.push('', t('dialog.discard.untracked'), '', nameFiles(t, prompt.untracked))
  }
  return lines.join('\n')
}

/**
 * Ask before discarding, and report the answer.
 * @param t - the panel's translator.
 * @param prompt - the paths, and which of them are untracked.
 * @returns true when the reader confirmed; false when they cancelled or reused their last dismissal.
 */
export function confirmDiscard(t: Translate, prompt: DiscardPrompt): boolean {
  return window.confirm(formatDiscardPrompt(t, prompt))
}

/** One stash entry that is about to be destroyed or applied. */
export interface StashPrompt {
  /** Which removal the reader is confirming; `apply` never asks. */
  readonly action: 'pop' | 'drop'
  readonly subject: string
  readonly index: number
}

/**
 * Compose the text of a stash confirmation.
 *
 * The entry is named by its position and by the message the reader wrote when
 * storing it, because the two together are what identify one row of the group.
 * @param t - the panel's translator.
 * @param prompt - the entry and the action.
 * @returns the message `window.confirm` shows.
 */
export function formatStashPrompt(t: Translate, prompt: StashPrompt): string {
  const lines = [
    t(prompt.action === 'pop' ? 'dialog.stash.popTitle' : 'dialog.stash.dropTitle'),
    '',
    t(prompt.action === 'pop' ? 'dialog.stash.popBody' : 'dialog.stash.dropBody'),
    '',
    `stash@{${prompt.index}}  ${prompt.subject}`,
  ]
  return lines.join('\n')
}

/**
 * Ask before a stash entry is removed, and report the answer.
 * @param t - the panel's translator.
 * @param prompt - the entry and the action.
 * @returns true when the reader confirmed.
 */
export function confirmStash(t: Translate, prompt: StashPrompt): boolean {
  return window.confirm(formatStashPrompt(t, prompt))
}

/**
 * Compose the text of a network-operation confirmation.
 *
 * A fetch only reads, so it never asks. A pull moves the local branch and a
 * push publishes commits other people can see, and both are worth one sentence
 * naming the upstream they touch.
 * @param t - the panel's translator.
 * @param action - which operation is being confirmed.
 * @param upstream - the tracked ref, when the branch has one.
 * @returns the message `window.confirm` shows.
 */
export function formatSyncPrompt(t: Translate, action: 'pull' | 'push', upstream: string | null): string {
  const name = upstream ?? t('sync.noUpstream')
  return [
    t(action === 'pull' ? 'dialog.pull.title' : 'dialog.push.title'),
    '',
    t(action === 'pull' ? 'dialog.pull.body' : 'dialog.push.body', { name }),
  ].join('\n')
}

/**
 * Ask before a network operation that writes to the remote, and report the answer.
 * @param t - the panel's translator.
 * @param action - which operation is being confirmed.
 * @param upstream - the tracked ref, when the branch has one.
 * @returns true when the reader confirmed.
 */
export function confirmSync(t: Translate, action: 'pull' | 'push', upstream: string | null): boolean {
  return window.confirm(formatSyncPrompt(t, action, upstream))
}

/**
 * Ask before undoing a merge or a rebase.
 *
 * The operation may have taken real work to reach, and aborting discards the
 * resolution of every conflict in it, so the choice is stated with what it
 * throws away rather than as a bare confirmation.
 * @param t - the panel's translator.
 * @param operation - the operation being aborted.
 * @returns whether the reader agreed.
 */
export function confirmAbort(t: Translate, operation: string): boolean {
  return window.confirm(t('dialog.abort', { operation }))
}

/**
 * Report a refusal the reader asked for and Git declined.
 *
 * Switching branches over a dirty tree is the case this exists for: the request
 * looked reasonable, so silence would read as a bug, and the panel's own notice
 * line is easy to miss beside a header that did not change.
 * @param message - the sentence to show.
 */
export function notify(message: string): void {
  window.alert(message)
}
