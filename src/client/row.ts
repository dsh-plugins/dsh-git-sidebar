/**
 * One changed file, as a list row.
 *
 * The row states what Git says about the path, offers the actions that apply to
 * the group it sits in, and opens the path's diff. Its controls are hidden until
 * the row is hovered or holds keyboard focus, and stay shown on a touch screen
 * where there is no hover to reveal them. Every control names itself twice: an
 * `aria-label` for assistive technology and a `title` for the pointer.
 */

import type { ChangeEntry, ChangeStatus } from '../shared.ts'
import type { ReactLike, Translate } from './api.ts'
import { Icon, type IconName } from './icons.ts'
import { PREFIX } from './styles.ts'

/** The one-character mark of each change state. */
const LETTERS: Readonly<Record<ChangeStatus, string>> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  untracked: 'U',
  conflicted: 'U',
}

/** Characters at the end of a path that stay legible while its head shortens. */
const KEPT_END = 12

/** Shortest head worth keeping before the tail alone is written. */
const MIN_HEAD = 8

/** One row action: what it does, how it is labelled, and which glyph draws it. */
export interface RowAction {
  readonly id: 'stage' | 'unstage' | 'discard' | 'diff' | 'resolve'
  readonly icon: IconName
  readonly label: string
  /** Destructive actions take the error ink on hover. */
  readonly danger?: boolean
  readonly disabled?: boolean
  run(): void
}

/** Props of one row. */
export interface RowProps {
  readonly entry: ChangeEntry
  readonly actions: readonly RowAction[]
  readonly t: Translate
  /** Whether this row is part of the current selection. */
  readonly selected?: boolean
  /** Handle a click that is about selection rather than opening the row. */
  readonly onSelect?: (event: { readonly shiftKey: boolean; readonly metaKey: boolean; readonly ctrlKey: boolean }) => void
}

/** A path split into the head that gives up space and the tail that stays whole. */
interface SplitPath {
  readonly head: string
  readonly tail: string
}

/**
 * Split a path so the middle is what gets lost when the row is narrow.
 * @param path - the text to split.
 * @returns the head and the kept tail; the tail is empty for a short path.
 */
export function shortenPath(path: string): SplitPath {
  const characters = Array.from(path)
  if (characters.length <= KEPT_END + MIN_HEAD) return { head: path, tail: '' }
  return { head: characters.slice(0, -KEPT_END).join(''), tail: characters.slice(-KEPT_END).join('') }
}

/**
 * Split a repository-relative path at its last separator.
 * @param path - the path.
 * @returns its directory and its file name.
 */
export function pathParts(path: string): { directory: string; name: string } {
  const slash = path.lastIndexOf('/')
  if (slash < 0) return { directory: '', name: path }
  return { directory: path.slice(0, slash), name: path.slice(slash + 1) }
}

/**
 * The row's text: the file's name, the directory after it in smaller subdued
 * type, and a rename's full origin folded into the name.
 * @param t - the panel's translator.
 * @param entry - the change.
 * @returns the name, the directory, and the tooltip.
 */
export function labelOf(t: Translate, entry: ChangeEntry): { name: string; directory: string; title: string } {
  const from = entry.from
  if (entry.status === 'renamed' && from !== undefined) {
    return {
      name: `${from} → ${entry.path}`,
      directory: '',
      title: t('row.renamed', { from, path: entry.path }),
    }
  }
  const parts = pathParts(entry.path)
  return { name: parts.name, directory: parts.directory, title: entry.path }
}

/**
 * Build the row component.
 * @param React - the loader's React.
 * @returns the component the panel lists.
 */
export function makeFileRow(React: ReactLike): (props: RowProps) => unknown {
  return function FileRow(props: RowProps): unknown {
    const { entry, actions, t } = props
    const label = labelOf(t, entry)
    return React.createElement('li', {
      className: `${PREFIX}-row`,
      'data-git-row': entry.path,
      'data-status': entry.status,
      'data-selected': props.selected === true ? '' : undefined,
      'aria-selected': props.selected === true ? 'true' : undefined,
    },
    React.createElement('button', {
      type: 'button',
      className: `${PREFIX}-open`,
      title: label.title,
      'aria-label': label.title,
      onClick: (event: RowSelectEvent) => {
        // A modified click is about selection, not about opening: the reader is
        // building the set of files the next group action applies to.
        if (event.shiftKey || event.metaKey || event.ctrlKey) {
          props.onSelect?.(event)
          return
        }
        // A conflicted row opens its resolver, not its diff: the diff shows the
        // same two sides with markers, which is not what finishes the file.
        const open = actions.find(action => action.id === 'resolve')
          ?? actions.find(action => action.id === 'diff')
        if (open !== undefined) open.run()
      },
    },
    React.createElement('span', {
      className: `${PREFIX}-letter`,
      'data-status': entry.status,
      'aria-hidden': true,
    }, LETTERS[entry.status]),
    shortened(React, `${PREFIX}-name`, label.name),
    label.directory === '' ? null : shortened(React, `${PREFIX}-dir`, label.directory),
    ),
    React.createElement('span', { className: `${PREFIX}-actions` },
      ...actions.map(action => actionButton(React, action))),
    )
  }
}

/** The share of a click this module reads. */
export interface RowSelectEvent {
  readonly shiftKey: boolean
  readonly metaKey: boolean
  readonly ctrlKey: boolean
}

/** One text whose middle gives way: an overflowing head, then a whole tail. */
function shortened(React: ReactLike, className: string, text: string): unknown {
  const parts = shortenPath(text)
  return React.createElement('span', { className },
    React.createElement('span', { className: `${PREFIX}-head` }, parts.head),
    parts.tail === '' ? null : React.createElement('span', { className: `${PREFIX}-tail` }, parts.tail))
}

/** One row action as an icon button, labelled for pointer and assistive technology. */
function actionButton(React: ReactLike, action: RowAction): unknown {
  return React.createElement('button', {
    key: action.id,
    type: 'button',
    className: `${PREFIX}-action`,
    'aria-label': action.label,
    title: action.label,
    'data-action': action.id,
    'data-git-row-action': action.id,
    ...action.danger === true ? { 'data-danger': '' } : {},
    ...action.disabled === true ? { disabled: true } : {},
    onClick: () => { action.run() },
  }, Icon(React, action.icon))
}
