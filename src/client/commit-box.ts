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
  /** Tracked files the working tree still holds; zero hides the stage-all option. */
  readonly unstagedCount: number
  /** Whether the repository has a configured author. */
  readonly identityMissing: boolean
  /** Whether a commit is running. */
  readonly busy: boolean
  /** Whether the working tree and index both match HEAD. */
  readonly clean: boolean
  /** Whether the repository has a commit to amend. */
  readonly canAmend: boolean
  readonly amend: boolean
  readonly t: Translate
  onChange(value: string): void
  onAmendChange(value: boolean): void
  /** Commit the index, or stage everything first when nothing is staged. */
  onSubmit(stageAll: boolean): void
}

/**
 * The reason the commit button is unavailable, or `undefined` while it can run.
 * @param props - the commit box's facts.
 * @returns the catalogue key of the explanation, or undefined.
 */
export function blockedReasonKey(props: CommitBoxProps): string | undefined {
  if (props.busy) return 'commit.busy'
  // A clean tree without an amend has nothing to write: staging everything
  // would stage nothing, and amending is the only operation left.
  if (props.clean && !props.amend) return 'commit.clean'
  // Staging everything is what the button does when the index is empty, so the
  // index size only blocks a commit when there is nothing to stage either. An
  // amend rewrites the previous commit, which needs no index at all.
  if (props.stagedCount === 0 && !props.amend && props.unstagedCount === 0) return 'commit.nothingStaged'
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
  if (props.amend) return props.t('commit.amendHint')
  if (props.stagedCount === 0) return props.t('commit.stageAllHint', { count: props.unstagedCount })
  return props.t('commit.hint', { count: props.stagedCount })
}

/**
 * Render the commit box.
 * @param React - the loader's React.
 * @param props - the message, the index size, and the actions.
 * @returns the box.
 */
export function CommitBox(React: ReactLike, props: CommitBoxProps): unknown {
  const { t, busy, identityMissing, canAmend } = props
  const blocked = blockedReasonKey(props)
  const submit = (): void => { if (blocked === undefined) props.onSubmit(props.stagedCount === 0) }
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
      canAmend
        ? React.createElement('label', { className: `${PREFIX}-commit-amend` },
          React.createElement('input', {
            type: 'checkbox',
            'data-git-amend': '',
            checked: props.amend,
            disabled: busy,
            onChange: (event: { target: { checked: boolean } }) => {
              props.onAmendChange(event.target.checked)
            },
          }),
          React.createElement('span', null, t('commit.amend')))
        : null,
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
        title: props.stagedCount === 0 ? t('commit.stageAllSubmit') : t('commit.submit'),
        onClick: submit,
      }, props.stagedCount === 0 ? t('commit.stageAllSubmit') : t('commit.submit')),
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
