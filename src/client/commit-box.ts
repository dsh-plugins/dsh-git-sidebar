/**
 * The commit panel, laid out the way JetBrains lays it out.
 *
 * Reading order is top to bottom and matches the gesture: amend first (because
 * it changes what the button will do), then the message, then the two ways to
 * send it. Putting the buttons under the field is what makes a multi-line
 * message read as one block rather than as a field with controls stuck to it.
 *
 * Two send actions rather than one. `Commit` is the everyday path; `Commit and
 * Push` is the same write followed by a push, and it exists because that is the
 * pair a reader performs together far more often than they perform either alone.
 *
 * `Ctrl+Enter` (and `Cmd+Enter` on a Mac) commits from inside the textarea,
 * which is the gesture every Git client uses and the one a multi-line message
 * makes necessary.
 */

import type { ReactLike, Translate } from './api.ts'
import { Icon } from './icons.ts'
import { PREFIX } from './styles.ts'

/** Props of the commit panel. */
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
  /** Recent commit subjects, newest first, offered as one-click messages. */
  readonly recent: readonly string[]
  /** Whether the recent-messages menu is open; the panel owns this. */
  readonly recentOpen: boolean
  readonly t: Translate
  onChange(value: string): void
  onAmendChange(value: boolean): void
  onRecentToggle(): void
  /** Commit the index, or stage everything first when nothing is staged. */
  onSubmit(stageAll: boolean): void
  /** Commit, then push the branch. */
  onSubmitAndPush(stageAll: boolean): void
}

/**
 * The reason the commit button is unavailable, or `undefined` while it can run.
 * @param props - the commit panel's facts.
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
 * The text beside the buttons: the reason they are off, the missing author's
 * instruction, or how much is ready to go.
 *
 * A missing author does not disable the buttons: the Host decides whether a
 * commit can run, and a repository may name its author through a config file or
 * the environment that a snapshot read did not see.
 * @param props - the commit panel's facts.
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
 * Render the commit panel.
 *
 * A plain function rather than a component: the panel calls it inside its own
 * render, so it must not hold hooks. The one piece of state it shows — whether
 * the recent-messages menu is open — is owned above and passed in.
 * @param React - the loader's React.
 * @param props - the message, the index size, and the actions.
 * @returns the panel.
 */
export function CommitBox(React: ReactLike, props: CommitBoxProps): unknown {
  const { t, busy, identityMissing, canAmend, recent, recentOpen } = props
  const blocked = blockedReasonKey(props)
  const stageAll = props.stagedCount === 0
  const submit = (): void => { if (blocked === undefined) props.onSubmit(stageAll) }
  const submitAndPush = (): void => { if (blocked === undefined) props.onSubmitAndPush(stageAll) }

  return React.createElement('div', { className: `${PREFIX}-commit` },
    // Amend first: it changes what the buttons below will do, so it belongs
    // above the thing it modifies rather than beside the result.
    React.createElement('div', { className: `${PREFIX}-commit-head` },
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
      canAmend && recent.length > 0
        ? React.createElement('button', {
          type: 'button',
          className: `${PREFIX}-commit-recent`,
          'data-git-recent': '',
          'aria-haspopup': 'menu',
          'aria-expanded': recentOpen ? 'true' : 'false',
          title: t('commit.recent'),
          'aria-label': t('commit.recent'),
          disabled: busy,
          onClick: () => { props.onRecentToggle() },
        }, Icon(React, 'clock', { size: 14 }))
        : null,
      recentOpen && recent.length > 0
        ? React.createElement('div', { className: `${PREFIX}-commit-recent-menu`, 'data-git-recent-menu': '', role: 'menu' },
          ...recent.map((subject) => React.createElement('button', {
            key: subject,
            type: 'button',
            className: `${PREFIX}-commit-recent-item`,
            role: 'menuitem',
            title: subject,
            onClick: () => {
              props.onChange(subject)
              props.onRecentToggle()
            },
          }, subject)))
        : null,
    ),
    React.createElement('textarea', {
      className: `${PREFIX}-commit-input`,
      value: props.message,
      placeholder: t('commit.placeholder'),
      'aria-label': t('commit.placeholder'),
      'data-git-message': '',
      rows: 4,
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
      React.createElement('button', {
        type: 'button',
        className: `${PREFIX}-commit-submit`,
        'data-git-commit': '',
        disabled: blocked !== undefined,
        title: stageAll ? t('commit.stageAllSubmit') : t('commit.submit'),
        onClick: submit,
      }, stageAll ? t('commit.stageAllSubmit') : t('commit.submit')),
      React.createElement('button', {
        type: 'button',
        className: `${PREFIX}-commit-push`,
        'data-git-commit-push': '',
        disabled: blocked !== undefined,
        title: t('commit.pushTitle'),
        onClick: submitAndPush,
      }, t('commit.push')),
      React.createElement('p', {
        className: `${PREFIX}-commit-hint`,
        'data-warn': identityMissing ? '' : undefined,
        role: blocked === undefined ? undefined : 'status',
      }, hintOf(props)),
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
