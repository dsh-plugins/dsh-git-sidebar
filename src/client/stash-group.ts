/**
 * The stash group, listed under the change groups.
 *
 * A stash entry is a saved working tree, so its row offers the three ways to
 * deal with one: apply it and keep the entry, pop it and remove the entry, or
 * drop it outright. Pop and drop both destroy a record, so each asks first.
 *
 * The group's own button stores the current changes. It is disabled while the
 * tree is clean, because `git stash push` would then either do nothing or fail,
 * and a control that cannot act should say so by being off.
 */

import type { StashEntry } from '../shared.ts'
import type { ReactLike, Translate } from './api.ts'
import { confirmStash, type StashPrompt } from './dialog.ts'
import { Icon, type IconName } from './icons.ts'
import { PREFIX } from './styles.ts'

/** Props of the stash group. */
export interface StashProps {
  readonly entries: readonly StashEntry[]
  /** Whether the working tree has anything to store. */
  readonly canStash: boolean
  readonly busy: boolean
  readonly t: Translate
  stash(): void
  apply(index: number): void
  pop(index: number): void
  drop(index: number): void
}

/** One row's action: which ink and glyph it takes, and what it does. */
interface EntryAction {
  readonly id: 'apply' | 'pop' | 'drop'
  readonly icon: IconName
  readonly label: string
  readonly danger?: boolean
  run(): void
}

/**
 * Build the stash group.
 * @param React - the loader's React.
 * @returns the component the panel draws under the change groups.
 */
export function makeStashGroup(React: ReactLike): (props: StashProps) => unknown {
  /** One stash entry as a row, with the three actions that apply to it. */
  function StashRow(props: { entry: StashEntry } & StashProps): unknown {
    const { entry, t, busy } = props
    const ask = (prompt: StashPrompt, run: () => void): void => {
      if (!confirmStash(t, prompt)) return
      run()
    }
    const actions: readonly EntryAction[] = [{
      id: 'apply',
      icon: 'apply',
      label: t('stash.apply'),
      run: () => { props.apply(entry.index) },
    }, {
      id: 'pop',
      icon: 'pop',
      label: t('stash.pop'),
      run: () => {
        ask({ action: 'pop', subject: entry.subject, index: entry.index }, () => { props.pop(entry.index) })
      },
    }, {
      id: 'drop',
      icon: 'discard',
      label: t('stash.drop'),
      danger: true,
      run: () => {
        ask({ action: 'drop', subject: entry.subject, index: entry.index }, () => { props.drop(entry.index) })
      },
    }]
    return React.createElement('li', {
      className: `${PREFIX}-row ${PREFIX}-stash-row`,
      'data-git-stash-row': String(entry.index),
    },
    React.createElement('span', { className: `${PREFIX}-stash-open`, title: entry.subject },
      React.createElement('span', { className: `${PREFIX}-sha` }, `stash@{${entry.index}}`),
      React.createElement('span', { className: `${PREFIX}-stash-subject` }, entry.subject)),
    React.createElement('span', { className: `${PREFIX}-actions` },
      ...actions.map(action => React.createElement('button', {
        key: action.id,
        type: 'button',
        className: `${PREFIX}-action`,
        'aria-label': action.label,
        title: action.label,
        'data-git-stash-action': action.id,
        ...action.danger === true ? { 'data-danger': '' } : {},
        disabled: busy,
        onClick: action.run,
      }, Icon(React, action.icon)))),
    )
  }

  /** The group: its head, its store button, and the entries. */
  function StashGroup(props: StashProps): unknown {
    const { entries, canStash, busy, t } = props
    if (entries.length === 0 && !canStash) return null
    return React.createElement('section', {
      className: `${PREFIX}-group ${PREFIX}-stash-group`,
      'data-git-stash': '',
      'data-count': entries.length,
    },
    React.createElement('div', { className: `${PREFIX}-group-head` },
      React.createElement('h3', { className: `${PREFIX}-group-title` }, t('stash.group')),
      React.createElement('span', { className: `${PREFIX}-count` }, String(entries.length)),
      React.createElement('span', { className: `${PREFIX}-group-actions` },
        React.createElement('button', {
          type: 'button',
          className: `${PREFIX}-action`,
          'aria-label': t('stash.current'),
          title: canStash ? t('stash.current') : t('stash.currentDisabled'),
          'data-action': 'stash-current',
          'data-git-action': 'stash-current',
          'data-git-stash-current': '',
          disabled: busy || !canStash,
          onClick: props.stash,
        }, Icon(React, 'stash')))),
    entries.length === 0
      ? React.createElement('p', { className: `${PREFIX}-group-note`, role: 'status' }, t('stash.empty'))
      : React.createElement('ul', { className: `${PREFIX}-list` },
        ...entries.map(entry => React.createElement(StashRow, {
          key: `${entry.index}:${entry.subject}`,
          entry,
          ...props,
        }))),
    )
  }

  return StashGroup
}
