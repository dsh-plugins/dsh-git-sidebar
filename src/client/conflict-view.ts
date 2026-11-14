/**
 * The conflict view: one conflicted file's regions, each with a choice.
 *
 * Git leaves both sides in the file between marker lines. Rather than asking
 * the reader to edit markers, the panel shows each region with three buttons —
 * keep ours, keep theirs, or keep both — and writes the pick back before
 * staging the path. A file the reader already cleaned up by hand reports as
 * resolved and only needs the index step.
 */

import type { ConflictChoice, ConflictContent, ConflictSegment, WriteOutcome } from '../shared.ts'
import type { ReactLike, Translate } from './api.ts'
import { Icon } from './icons.ts'
import { PREFIX } from './styles.ts'

/** Props of the conflict view. */
export interface ConflictViewProps {
  readonly path: string
  readonly content: ConflictContent | undefined
  readonly busy: boolean
  readonly t: Translate
  /** One choice per region, in file order; shorter lists leave the rest as is. */
  readonly choices: readonly ConflictChoice[]
  choose(index: number, choice: ConflictChoice): void
  submit(): void
  close(): void
}

/** The three ways one region can be resolved. */
const CHOICES: readonly { readonly id: ConflictChoice; readonly key: string }[] = [
  { id: 'ours', key: 'conflict.ours' },
  { id: 'theirs', key: 'conflict.theirs' },
  { id: 'both', key: 'conflict.both' },
]

/**
 * Build the conflict view.
 * @param React - the loader's React.
 * @returns the component the panel draws in place of the change list.
 */
export function makeConflictView(React: ReactLike): (props: ConflictViewProps) => unknown {
  /** One conflict region: both sides, and the three buttons that pick one. */
  function Region(props: {
    readonly segment: Extract<ConflictSegment, { kind: 'conflict' }>
    readonly index: number
    readonly choice: ConflictChoice
    readonly busy: boolean
    readonly t: Translate
    choose(index: number, choice: ConflictChoice): void
  }): unknown {
    const { segment, index, choice, busy, t } = props
    return React.createElement('div', {
      className: `${PREFIX}-conflict-region`,
      'data-git-conflict-region': String(index),
      'data-choice': choice,
    },
    React.createElement('div', { className: `${PREFIX}-conflict-side`, 'data-side': 'ours' },
      React.createElement('span', { className: `${PREFIX}-conflict-label` },
        segment.oursLabel === '' ? t('conflict.ours') : segment.oursLabel),
      React.createElement('pre', { className: `${PREFIX}-conflict-text` }, segment.ours.join('\n'))),
    React.createElement('div', { className: `${PREFIX}-conflict-side`, 'data-side': 'theirs' },
      React.createElement('span', { className: `${PREFIX}-conflict-label` },
        segment.theirsLabel === '' ? t('conflict.theirs') : segment.theirsLabel),
      React.createElement('pre', { className: `${PREFIX}-conflict-text` }, segment.theirs.join('\n'))),
    React.createElement('div', { className: `${PREFIX}-conflict-choices` },
      ...CHOICES.map(entry => React.createElement('button', {
        key: entry.id,
        type: 'button',
        className: `${PREFIX}-conflict-choice`,
        'data-git-conflict-choice': entry.id,
        'aria-pressed': choice === entry.id ? 'true' : 'false',
        'data-active': choice === entry.id ? '' : undefined,
        disabled: busy,
        onClick: () => { props.choose(index, entry.id) },
      }, t(entry.key)))),
    )
  }

  /** The view: the path, each region, and the controls that finish the file. */
  return function ConflictView(props: ConflictViewProps): unknown {
    const { path, content, busy, t, choices } = props
    const regions = content !== undefined && content.kind === 'marked'
      ? content.segments.filter((segment): segment is Extract<ConflictSegment, { kind: 'conflict' }> =>
        segment.kind === 'conflict')
      : []
    const head = React.createElement('div', { className: `${PREFIX}-conflict-head` },
      React.createElement('span', { className: `${PREFIX}-conflict-path`, title: path }, path),
      React.createElement('button', {
        type: 'button',
        className: `${PREFIX}-tool`,
        'aria-label': t('conflict.close'),
        title: t('conflict.close'),
        onClick: props.close,
      }, Icon(React, 'chevron', { size: 14 })))

    if (content === undefined) {
      return React.createElement('section', { className: `${PREFIX}-conflict`, 'data-git-conflict': path },
        head,
        React.createElement('p', { className: `${PREFIX}-state-line`, role: 'status' }, t('conflict.loading')))
    }
    if (content.kind === 'error') {
      return React.createElement('section', { className: `${PREFIX}-conflict`, 'data-git-conflict': path },
        head,
        React.createElement('p', { className: `${PREFIX}-state-line`, role: 'alert' }, content.message))
    }
    if (content.kind === 'resolved') {
      return React.createElement('section', { className: `${PREFIX}-conflict`, 'data-git-conflict': path },
        head,
        React.createElement('p', { className: `${PREFIX}-state-line`, role: 'status' }, t('conflict.clean')),
        React.createElement('div', { className: `${PREFIX}-conflict-actions` },
          React.createElement('button', {
            type: 'button',
            className: `${PREFIX}-commit-submit`,
            'data-git-conflict-submit': '',
            disabled: busy,
            onClick: props.submit,
          }, t('conflict.markResolved'))))
    }
    return React.createElement('section', { className: `${PREFIX}-conflict`, 'data-git-conflict': path },
      head,
      React.createElement('div', { className: `${PREFIX}-conflict-list` },
        ...regions.map((segment, index) => React.createElement(Region, {
          key: index,
          segment,
          index,
          choice: regionChoice(choices, index),
          busy,
          t,
          choose: props.choose,
        }))),
      React.createElement('div', { className: `${PREFIX}-conflict-actions` },
        React.createElement('button', {
          type: 'button',
          className: `${PREFIX}-commit-submit`,
          'data-git-conflict-submit': '',
          disabled: busy,
          onClick: props.submit,
        }, t('conflict.markResolved'))))
  }
}

/**
 * The choice made for one region, defaulting to keeping both sides.
 * @param choices - the recorded choices.
 * @param index - the region's position.
 * @returns the choice in force.
 */
export function regionChoice(choices: readonly ConflictChoice[], index: number): ConflictChoice {
  return choices[index] ?? 'both'
}

/**
 * Fold one resolved file's outcome into the notice the panel shows.
 * @param outcome - what the Host answered.
 * @param t - the panel's translator.
 * @returns the sentence to show, or the empty string when it succeeded.
 */
export function conflictNotice(outcome: WriteOutcome, t: Translate): string {
  return outcome.ok ? '' : outcome.message === '' ? t('notice.resolveFailed') : outcome.message
}
