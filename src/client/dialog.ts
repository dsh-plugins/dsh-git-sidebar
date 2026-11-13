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
