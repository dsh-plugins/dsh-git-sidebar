/**
 * The panel's own modal: a confirmation the shell draws, not the browser's.
 *
 * DSH gives a plugin no confirm service — its own surfaces each render their
 * dialog — so this is the panel's. A `window.confirm` would work, but it is
 * drawn in the browser's chrome rather than the page's: it ignores the theme,
 * it cannot show a list as a list, and on the Web it is a browser-styled box
 * floating over a product that has its own idea of a dialog.
 *
 * The store is module-level because a confirmation outlives the component that
 * asked for it: the panel may re-render, or unmount, while the question is open.
 * Exactly one question is on screen at a time; a second one settles the first as
 * cancelled, which is what a reader who clicked twice meant.
 */

import type { ReactLike } from './api.ts'
import { PREFIX } from './styles.ts'

/** One question, as the caller states it. */
export interface DialogAsk {
  /** The heading: what is about to happen. */
  readonly title: string
  /** One sentence under the heading, when the heading alone is not enough. */
  readonly body?: string
  /** Paths or refs the answer applies to, drawn as a list. */
  readonly lines?: readonly string[]
  /** A second sentence after the list, for what makes the action irreversible. */
  readonly warning?: string
  /** Whether the confirming button is the destructive one. */
  readonly danger?: boolean
  /** Ask for a line of text instead of a yes or no. */
  readonly input?: string
  readonly confirm: string
  /**
   * The dismissing button's label. Empty draws no second button, which is what a
   * notice — a question with one answer — wants.
   */
  readonly cancel: string
}

/** What an answer can be: a decision, a typed line, or a dismissal. */
type Answer = boolean | string | null

/** One open question, and the call waiting on it. */
interface Pending {
  readonly ask: DialogAsk
  readonly settle: (answer: Answer) => void
}

let pending: Pending | null = null
const listeners = new Set<() => void>()

/** Tell every mounted host that the question changed. */
function announce(): void {
  for (const listener of listeners) listener()
}

/**
 * Open a question and wait for its answer.
 * @param ask - what to ask.
 * @returns the reader's answer; a cancelled question answers null.
 */
function open(ask: DialogAsk): Promise<Answer> {
  pending?.settle(null)
  return new Promise<Answer>((settle) => {
    pending = { ask, settle }
    announce()
  })
}

/**
 * The question on screen, for a host that has to draw it.
 * @returns the open question, or null when nothing is being asked.
 */
export function currentAsk(): DialogAsk | null {
  return pending?.ask ?? null
}

/**
 * Subscribe to the open question changing.
 * @param listener - called after every open, answer, and dismissal.
 * @returns the unsubscribe.
 */
export function watchDialogs(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/**
 * Answer the open question.
 * @param answer - the decision, or the typed line.
 */
export function settleDialog(answer: Answer): void {
  const asking = pending
  if (asking === null) return
  pending = null
  announce()
  asking.settle(answer)
}

/**
 * Ask a yes-or-no question.
 * @param ask - what to ask.
 * @returns whether the reader agreed.
 */
export function askConfirm(ask: DialogAsk): Promise<boolean> {
  return open(ask).then(answer => answer === true)
}

/**
 * Ask for a line of text.
 * @param ask - what to ask; `input` seeds the field.
 * @returns the trimmed answer, or null when the reader cancelled or typed nothing.
 */
export function askText(ask: DialogAsk): Promise<string | null> {
  return open(ask).then((answer) => {
    if (typeof answer !== 'string') return null
    const text = answer.trim()
    return text === '' ? null : text
  })
}

/**
 * Report something the reader asked for that could not be done.
 * @param ask - the sentence, plus the one button that dismisses it.
 * @returns a promise that settles when the reader dismissed it.
 */
export function showNotice(ask: DialogAsk): Promise<void> {
  return open(ask).then(() => undefined)
}

/**
 * Build the modal.
 * @param React - the loader's React.
 * @returns the component the panel draws at its root.
 */
export function makeDialogHost(React: ReactLike): () => unknown {
  return function DialogHost(): unknown {
    const [ask, setAsk] = React.useState<DialogAsk | null>(currentAsk())
    const [draft, setDraft] = React.useState('')

    React.useEffect(() => {
      const read = (): void => {
        const next = currentAsk()
        setAsk(next)
        setDraft(next?.input ?? '')
      }
      read()
      return watchDialogs(read)
    }, [])

    if (ask === null) return null
    const typed = ask.input !== undefined
    const confirm = (): void => { settleDialog(typed ? draft : true) }
    const cancel = (): void => { settleDialog(typed ? null : false) }

    return React.createElement('div', {
      className: `${PREFIX}-dialog-layer`,
      'data-git-dialog': '',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': ask.title,
    },
    React.createElement('div', {
      className: `${PREFIX}-dialog-backdrop`,
      'data-git-dialog-dismiss': '',
      onClick: cancel,
    }),
    React.createElement('div', { className: `${PREFIX}-dialog` },
      React.createElement('h2', { className: `${PREFIX}-dialog-title` }, ask.title),
      ask.body === undefined ? null : React.createElement('p', { className: `${PREFIX}-dialog-body` }, ask.body),
      ask.lines === undefined || ask.lines.length === 0
        ? null
        : React.createElement('ul', { className: `${PREFIX}-dialog-list` },
          ...ask.lines.map(line => React.createElement('li', { key: line }, line))),
      ask.warning === undefined
        ? null
        : React.createElement('p', { className: `${PREFIX}-dialog-warning` }, ask.warning),
      typed
        ? React.createElement('input', {
          type: 'text',
          className: `${PREFIX}-dialog-input`,
          'data-git-dialog-input': '',
          value: draft,
          spellCheck: false,
          autoFocus: true,
          onChange: (event: { target: { value: string } }) => { setDraft(event.target.value) },
          onKeyDown: (event: DialogKeyEvent) => {
            if (event.key === 'Enter') confirm()
            if (event.key === 'Escape') cancel()
          },
        })
        : null,
      React.createElement('div', { className: `${PREFIX}-dialog-actions` },
        React.createElement('button', {
          type: 'button',
          className: `${PREFIX}-dialog-confirm`,
          'data-git-dialog-confirm': '',
          'data-danger': ask.danger === true ? '' : undefined,
          disabled: typed && draft.trim() === '',
          autoFocus: !typed,
          onClick: confirm,
        }, ask.confirm),
        ask.cancel === ''
          ? null
          : React.createElement('button', {
            type: 'button',
            className: `${PREFIX}-dialog-cancel`,
            'data-git-dialog-cancel': '',
            onClick: cancel,
          }, ask.cancel))),
    )
  }
}

/** The share of a key event the dialog reads. */
interface DialogKeyEvent {
  readonly key: string
}
