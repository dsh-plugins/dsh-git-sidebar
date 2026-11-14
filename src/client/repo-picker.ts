/**
 * The repository picker: which checkout of the Session's directory tree the panel
 * reads, and the menu that switches to another.
 *
 * A Session works inside one directory, but that directory can hold several
 * checkouts. The panel reads one at a time, and this control is where the reader
 * says which: the button names the current checkout, and opening it scans the
 * tree so the reader can move to a sibling project, a submodule, or a linked
 * worktree.
 *
 * The scan runs on open rather than on mount: a panel that never switches pays
 * nothing, and reopening the tab stays free of requests, which is what the
 * panel's cache is there for.
 */

import type { RepositoryEntry, RepositoryKind, RepositoryList, StatusSnapshot } from '../shared.ts'
import type { ReactLike, Translate } from './api.ts'
import { Icon } from './icons.ts'
import { PREFIX } from './styles.ts'

/** Props of the repository button. */
export interface RepoBarProps {
  /** The checkout the panel is reading, when it has one. */
  readonly root: string | undefined
  /** The snapshot is on its way, so the label shows a placeholder instead of "none". */
  readonly loading: boolean
  /** A write or a switch is running. */
  readonly busy: boolean
  /** False when the tab has no Session, which leaves nothing to scan. */
  readonly enabled: boolean
  readonly t: Translate
  /** Scan the Session's directory; called each time the menu opens. */
  list(): Promise<RepositoryList>
  /** Read another checkout; undefined returns to the working directory's own. */
  select(root: string | undefined): void
}

/** Width the menu reserves when it is placed, used to keep it inside the window. */
const MENU_W = 260

/** The share of a DOM node the menu needs to place itself. */
interface MenuAnchor {
  getBoundingClientRect(): { readonly bottom: number; readonly left: number }
}

/** The share of a click the buttons read. */
interface MenuClick {
  readonly currentTarget: MenuAnchor
}

/**
 * Where the menu hangs: under the button that opened it, and never past the
 * window's right edge. The header spans the panel, so measuring the button is
 * what keeps the menu beside it.
 * @param node - the button that opened the menu.
 * @returns the fixed position to draw at.
 */
function anchorUnder(node: MenuAnchor): { top: number; left: number } {
  const box = node.getBoundingClientRect()
  const widest = window.innerWidth - MENU_W - 8
  return { top: box.bottom + 4, left: Math.max(8, Math.min(box.left, widest)) }
}

/** The last segment of a filesystem path, for the narrow label. */
function lastSegment(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return cut < 0 ? trimmed : trimmed.slice(cut + 1)
}

/** The badge a checkout kind carries; an ordinary checkout needs none. */
const KIND_KEY: Record<RepositoryKind, string> = {
  repository: '',
  submodule: 'repo.submodule',
  worktree: 'repo.worktree',
}

/**
 * The label one checkout carries.
 *
 * A path relative to the Session directory is what tells two checkouts apart, but
 * the working directory's own checkout would read as a bare dot; its directory
 * name says the same thing and is what a reader recognises.
 * @param entry - the checkout to label.
 * @returns its relative path, or its name when it is the working directory.
 */
function labelOf(entry: RepositoryEntry): string {
  return entry.relative === '.' ? entry.name : entry.relative
}

/**
 * Build the repository button and its menu.
 * @param React - the loader's React.
 * @returns the control the panel draws at the head of its header row.
 */
export function makeRepoBar(React: ReactLike): (props: RepoBarProps) => unknown {
  return function RepoBar(props: RepoBarProps): unknown {
    const { t, root, busy, enabled } = props
    const [open, setOpen] = React.useState(false)
    const [at, setAt] = React.useState<{ top: number; left: number } | null>(null)
    const [list, setList] = React.useState<RepositoryList | undefined>(undefined)

    React.useEffect(() => {
      if (!open) return
      let live = true
      setList(undefined)
      void props.list()
        .then((next) => { if (live) setList(next) })
        .catch(() => { if (live) setList(undefined) })
      return () => { live = false }
    }, [open])

    /**
     * Open the menu under the button, or close it when it is already open.
     * @param node - the button, measured to place the menu.
     */
    const toggle = (node: MenuAnchor): void => {
      if (open) {
        setOpen(false)
        return
      }
      setAt(anchorUnder(node))
      setOpen(true)
    }

    const close = (): void => { setOpen(false) }
    const pick = (next: string | undefined): void => {
      setOpen(false)
      if (next !== root) props.select(next)
    }

    // The list answers with the label the scan computed, which is relative to the
    // Session directory and therefore clearer than a bare directory name; until
    // the menu has been opened, the checkout's own name is all there is.
    const known = list?.entries.find(entry => entry.root === root)
    const label = root === undefined
      ? (props.loading ? '…' : t('repo.none'))
      : known === undefined ? lastSegment(root) : labelOf(known)

    return React.createElement('div', { className: `${PREFIX}-repo-wrap` },
      React.createElement('button', {
        type: 'button',
        className: `${PREFIX}-repo`,
        'data-git-repo': '',
        'data-git-repo-button': '',
        'data-git-repo-root': root ?? '',
        'aria-haspopup': 'menu',
        'aria-expanded': open ? 'true' : 'false',
        'aria-label': t('repo.selector'),
        title: root === undefined ? t('repo.selector') : `${t('repo.selector')}\n${root}`,
        disabled: !enabled || busy,
        onClick: (event: MenuClick) => { toggle(event.currentTarget) },
      },
      Icon(React, 'repo', { size: 14 }),
      React.createElement('span', { className: `${PREFIX}-repo-name` }, label),
      Icon(React, 'chevron', { size: 14 })),
      open
        ? React.createElement('div', {
          className: `${PREFIX}-backdrop`,
          'data-git-dismiss': '',
          onClick: close,
        })
        : null,
      open
        ? menu(React, t, list, root, at, busy, pick, close)
        : null,
    )
  }
}

/**
 * The menu: every checkout the scan found, the current one marked.
 * @param React - the loader's React.
 * @param t - the copy lookup.
 * @param list - the scan result, or undefined while it runs.
 * @param root - the checkout the panel is reading.
 * @param at - where to draw the menu.
 * @param busy - whether a write or a switch is running.
 * @param pick - the handler for one checkout, or for the working directory.
 * @param close - the handler that dismisses the menu.
 * @returns the menu element.
 */
function menu(
  React: ReactLike,
  t: Translate,
  list: RepositoryList | undefined,
  root: string | undefined,
  at: { top: number; left: number } | null,
  busy: boolean,
  pick: (next: string | undefined) => void,
  close: () => void,
): unknown {
  const entries = list?.entries ?? []
  return React.createElement('div', {
    className: `${PREFIX}-menu ${PREFIX}-repo-menu`,
    'data-git-repo-menu': '',
    role: 'menu',
    style: at === null ? undefined : { top: `${at.top}px`, left: `${at.left}px` },
  },
  React.createElement('p', { className: `${PREFIX}-menu-title` }, t('repo.selector')),
  list === undefined
    ? React.createElement('p', { className: `${PREFIX}-menu-note`, role: 'status' }, t('repo.loading'))
    : list.error !== undefined
      ? React.createElement('p', { className: `${PREFIX}-menu-note`, role: 'status' },
        `${t('repo.failed')}: ${list.error}`)
      : entries.length === 0
        ? React.createElement('p', { className: `${PREFIX}-menu-note`, role: 'status' }, t('repo.empty'))
        : React.createElement('ul', { className: `${PREFIX}-repo-list` },
          ...entries.map(entry => React.createElement('li', { key: entry.root },
            React.createElement('button', {
              type: 'button',
              className: `${PREFIX}-repo-option`,
              'data-git-repo-option': entry.root,
              'data-current': entry.root === root ? '' : undefined,
              role: 'menuitemradio',
              'aria-checked': entry.root === root ? 'true' : 'false',
              disabled: busy,
              title: entry.root,
              onClick: () => { pick(entry.root) },
            },
            // One fixed slot for the check, so every row starts at the same
            // column whether or not it is the current checkout.
            React.createElement('span', { className: `${PREFIX}-branch-space` },
              entry.root === root ? Icon(React, 'check', { size: 16 }) : null),
            React.createElement('span', { className: `${PREFIX}-repo-path` }, labelOf(entry)),
            KIND_KEY[entry.kind] === ''
              ? null
              : React.createElement('span', {
                className: `${PREFIX}-repo-badge`,
                'data-kind': entry.kind,
              }, t(KIND_KEY[entry.kind])))))),
  React.createElement('span', { className: `${PREFIX}-menu-sep`, role: 'separator' }),
  ...footer(React, t, list, pick, close),
  )
}

/**
 * The notes under the list: how far the scan went, what it could not read, and
 * the way back to the working directory's own checkout.
 * @param React - the loader's React.
 * @param t - the copy lookup.
 * @param list - the scan result, or undefined while it runs.
 * @param pick - the handler for the working directory.
 * @param close - the handler that dismisses the menu.
 * @returns the footer elements.
 */
function footer(
  React: ReactLike,
  t: Translate,
  list: RepositoryList | undefined,
  pick: (next: string | undefined) => void,
  close: () => void,
): unknown[] {
  if (list === undefined) return []
  const parts: unknown[] = [React.createElement('p', {
    key: 'scanned',
    className: `${PREFIX}-menu-note`,
  }, t('repo.scanned', { count: list.entries.length, depth: list.depth }))]
  if (list.truncated) {
    parts.push(React.createElement('p', { key: 'truncated', className: `${PREFIX}-menu-note` }, t('repo.truncated')))
  }
  if (list.warnings.length > 0) {
    parts.push(React.createElement('p', { key: 'warnings', className: `${PREFIX}-menu-note` },
      t('repo.warnings', { count: list.warnings.length })))
  }
  if (list.selected !== null) {
    parts.push(React.createElement('button', {
      key: 'reset',
      type: 'button',
      className: `${PREFIX}-menu-item`,
      'data-git-repo-reset': '',
      role: 'menuitem',
      title: list.scanRoot,
      onClick: () => {
        close()
        pick(undefined)
      },
    }, Icon(React, 'undo'), React.createElement('span', null, t('repo.reset'))))
  }
  return parts
}
