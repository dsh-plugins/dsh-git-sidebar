/**
 * The commit box under the change list.
 *
 * It owns no state of its own: the message and the busy flag belong to the panel
 * above it, which also re-reads the snapshot after a commit. What it owns is the
 * policy the reader sees — when the button is available, and which sentence
 * explains a disabled button.
 *
 * `Ctrl+Enter` (and `Cmd+Enter` on a Mac) submits from inside the textarea,
 * which is the gesture every Git client uses and the one a multi-line message
 * makes necessary.
 */

import type { ReactLike, Translate } from './api.ts'
import { PREFIX } from './styles.ts'

/** Props of the commit box. */
export interface CommitBoxProps {
  /** The message as typed. */
  readonly message: string
  /** Files in the index; the button is disabled while this is zero. */
  readonly stagedCount: number
  /** Whether the repository has a configured author. */
  readonly identityMissing: boolean
  /** Whether a commit is running. */
  readonly busy: boolean
  readonly t: Translate
  onChange(value: string): void
  onSubmit(): void
}

/**
 * The reason the commit button is unavailable, or `undefined` while it can run.
 * @param props - the commit box's facts.
 * @returns the catalogue key of the explanation, or undefined.
 */
export function blockedReasonKey(props: CommitBoxProps): string | undefined {
  if (props.busy) return 'commit.busy'
  if (props.stagedCount === 0) return 'commit.nothingStaged'
  if (props.message.trim() === '') return 'commit.emptyMessage'
  return undefined
}

/**
 * The text under the field: the reason the button is off, the missing author's
 * instruction, or how much is ready to go.
 *
 * A missing author does not disable the button: the Host decides whether a
 * commit can run, and a repository may name its author through a config file or
 * the environment that a snapshot read did not see.
 * @param props - the commit box's facts.
 * @returns the sentence to show.
 */
export function hintOf(props: CommitBoxProps): string {
  const blocked = blockedReasonKey(props)
  if (blocked !== undefined) return props.t(blocked)
  if (props.identityMissing) return props.t('commit.identityMissing')
  return props.t('commit.hint', { count: props.stagedCount })
}

/**
 * Render the commit box.
 * @param React - the loader's React.
 * @param props - the message, the index size, and the actions.
 * @returns the box.
 */
export function CommitBox(React: ReactLike, props: CommitBoxProps): unknown {
  const { t, busy, identityMissing } = props
  const blocked = blockedReasonKey(props)
  const submit = (): void => { if (blocked === undefined) props.onSubmit() }
  return React.createElement('div', { className: `${PREFIX}-commit` },
    React.createElement('textarea', {
      className: `${PREFIX}-commit-input`,
      value: props.message,
      placeholder: t('commit.placeholder'),
      'aria-label': t('commit.placeholder'),
      'data-git-message': '',
      rows: 3,
      spellCheck: false,
      disabled: busy,
      onChange: (event: { target: { value: string } }) => { props.onChange(event.target.value) },
      onKeyDown: (event: SubmitKeyEvent) => {
        if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) return
        event.preventDefault()
        submit()
      },
    }),
    React.createElement('div', { className: `${PREFIX}-commit-foot` },
      React.createElement('p', {
        className: `${PREFIX}-commit-hint`,
        'data-warn': identityMissing ? '' : undefined,
        role: blocked === undefined ? undefined : 'status',
      }, hintOf(props)),
      React.createElement('button', {
        type: 'button',
        className: `${PREFIX}-commit-submit`,
        'data-git-commit': '',
        disabled: blocked !== undefined,
        title: t('commit.submit'),
        onClick: submit,
      }, t('commit.submit')),
    ),
  )
}

/** The share of a textarea's keyboard event this module reads. */
interface SubmitKeyEvent {
  readonly key: string
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  preventDefault(): void
}
