/**
 * The branch header: the checked-out branch, how far it sits from its upstream,
 * the branch picker, and the menu of operations that change the checkout.
 *
 * Two dropdowns hang off the header. The picker lists local branches and offers
 * a new one at the foot of the list; the operations menu holds the network
 * commands and one stash. Both close through a full-window backdrop rather than a
 * document listener, so this module needs no ref to the header node.
 *
 * Opening the picker re-reads the branches every time: a checkout or a creation
 * changes which branch is current, and a cached list would keep the old mark.
 */

import type { BranchList, StatusSnapshot, SyncAction } from '../shared.ts'
import type { ReactLike, Translate } from './api.ts'
import { Icon } from './icons.ts'
import { PREFIX } from './styles.ts'

/** Props of the branch header. */
export interface BranchHeaderProps {
  readonly snapshot: StatusSnapshot | undefined
  /** A snapshot is on its way, so the refresh control turns. */
  readonly loading: boolean
  /** A write is running; every control that would start another stays off. */
  readonly busy: boolean
  readonly t: Translate
  refresh(): void
  /** Read the branches the picker offers; called each time the picker opens. */
  listBranches(): Promise<BranchList>
  checkout(branch: string): void
  createBranch(name: string): void
  sync(action: SyncAction): void
  stash(): void
  /** Undo the merge or rebase the checkout is between. */
  abort(): void
  /** Delete one local branch, after the picker's own confirmation. */
  deleteBranch(branch: string): void
  /** Merge one local branch into the checked-out one. */
  mergeBranch(branch: string): void
  /**
   * The repository picker, drawn where the header used to print the root path.
   *
   * The panel builds it because the scan belongs to the panel's Session; the
   * header only reserves the slot, so this module stays about branches.
   */
  repo?: unknown
}

/**
 * The branches the operations menu offers to merge.
 *
 * The checked-out branch is left out: merging a branch into itself is a no-op
 * Git reports as "Already up to date", which would read as a broken control.
 * @param branches - the listing the picker loaded, when it has loaded.
 * @returns the local branch names worth offering.
 */
function mergeable(branches: BranchList | undefined): string[] {
  if (branches === undefined) return []
  return branches.local.filter(name => name !== branches.current)
}

/** Which dropdown of the header is open, if any. */
type Menu = 'none' | 'branch' | 'more'

/** Width a menu reserves when it is placed, used to keep it inside the window. */
const MENU_W = 200

/** The share of a DOM node the menu needs to place itself. */
interface MenuAnchor {
  getBoundingClientRect(): { readonly bottom: number; readonly left: number }
}

/** The share of a click the menu buttons read. */
interface MenuClick {
  readonly currentTarget: MenuAnchor
}

/**
 * Where a menu hangs: under the control that opened it, and never past the
 * window's right edge.
 *
 * The header spans the whole panel, so anchoring to it — which is what a plain
 * `right: 6px` does — puts a dropdown from a left-hand control at the far right.
 * Measuring the control is what keeps the menu beside the thing it belongs to.
 * @param node - the button that opened the menu.
 * @returns the fixed position to draw at.
 */
function anchorUnder(node: MenuAnchor): { top: number; left: number } {
  const box = node.getBoundingClientRect()
  const widest = window.innerWidth - MENU_W - 8
  return { top: box.bottom + 4, left: Math.max(8, Math.min(box.left, widest)) }
}

/**
 * Build the branch header.
 * @param React - the loader's React.
 * @returns the component the panel draws above the change groups.
 */
export function makeBranchHeader(React: ReactLike): (props: BranchHeaderProps) => unknown {
  return function BranchHeader(props: BranchHeaderProps): unknown {
    const { snapshot, loading, busy, t } = props
    const [menu, setMenu] = React.useState<Menu>('none')
    const [menuAt, setMenuAt] = React.useState<{ top: number; left: number } | null>(null)
    const [branches, setBranches] = React.useState<BranchList | undefined>(undefined)
    const [draft, setDraft] = React.useState('')

    React.useEffect(() => {
      // Both menus name branches: the picker lists them, and the operations menu
      // offers them to merge, so either open reads the list.
      if (menu === 'none') return
      let live = true
      setBranches(undefined)
      void props.listBranches()
        .then((list) => { if (live) setBranches(list) })
        .catch(() => { if (live) setBranches(undefined) })
      return () => { live = false }
    }, [menu])

    const close = (): void => { setMenu('none') }

    /**
     * Open a menu under the control that asked for it, or close the open one.
     * @param kind - which menu.
     * @param node - the button, measured to place the menu.
     */
    const openMenu = (kind: Menu, node: MenuAnchor): void => {
      if (menu === kind) {
        setMenu('none')
        return
      }
      setMenuAt(anchorUnder(node))
      setMenu(kind)
    }
    const detached = snapshot?.branch === null
    const usable = snapshot !== undefined && snapshot.kind === 'repository'
    const label = !usable
      ? ''
      : snapshot.branch ?? snapshot.commit ?? t('branch.unknown')
    const root = snapshot?.root
    const upstream = usable ? snapshot.upstream ?? null : null
    const operation = usable ? snapshot.operation ?? null : null

    const pick = (branch: string): void => {
      setMenu('none')
      props.checkout(branch)
    }
    const create = (): void => {
      const name = draft.trim()
      if (name === '') return
      setMenu('none')
      setDraft('')
      props.createBranch(name)
    }

    return React.createElement('div', { className: `${PREFIX}-header-wrap` },
      React.createElement('div', { className: `${PREFIX}-header` },
        snapshot === undefined || !usable
          ? React.createElement('span', {
            className: `${PREFIX}-branch`,
            'data-git-branch': '',
            'data-git-branch-button': '',
            'data-unusable': '',
            'aria-busy': 'true',
          }, snapshot === undefined ? (loading ? '…' : '') : label)
          : React.createElement('button', {
            type: 'button',
            className: `${PREFIX}-branch ${PREFIX}-branch-btn`,
            'data-git-branch': '',
            'data-git-branch-button': '',
            'data-detached': detached ? '' : undefined,
            'aria-haspopup': 'menu',
            'aria-expanded': menu === 'branch' ? 'true' : 'false',
            title: root === undefined ? label : `${label}\n${root}`,
            onClick: (event: MenuClick) => { openMenu('branch', event.currentTarget) },
          },
          React.createElement('span', { className: `${PREFIX}-branch-name` }, label),
          Icon(React, 'chevron', { size: 14 })),
        upstreamSits(React, t, upstream),
        props.repo ?? null,
        React.createElement('button', {
          type: 'button',
          className: `${PREFIX}-tool`,
          'aria-label': t('more.actions'),
          title: t('more.actions'),
          'data-git-more': '',
          'aria-haspopup': 'menu',
          'aria-expanded': menu === 'more' ? 'true' : 'false',
          disabled: !usable || busy,
          onClick: (event: MenuClick) => { openMenu('more', event.currentTarget) },
        }, Icon(React, 'more')),
        React.createElement('button', {
          type: 'button',
          className: `${PREFIX}-tool`,
          'aria-label': t('refresh'),
          title: t('refresh'),
          'data-git-refresh': '',
          'data-turning': loading ? '' : undefined,
          disabled: loading,
          onClick: props.refresh,
        }, Icon(React, 'refresh')),
        menu === 'none' ? null : React.createElement('div', {
          className: `${PREFIX}-backdrop`,
          'data-git-dismiss': '',
          onClick: close,
        }),
        menu === 'branch' ? picker(React, props, branches, draft, setDraft, create, pick, busy, close, menuAt) : null,
        menu === 'more' ? operations(React, props, usable, busy, () => {
          setMenu('none')
          props.sync('fetch')
        }, (action) => {
          setMenu('none')
          props.sync(action)
        }, () => {
          setMenu('none')
          props.stash()
        }, mergeable(branches), (branch) => {
          setMenu('none')
          props.mergeBranch(branch)
        }, menuAt) : null,
      ),
      operation === null ? null : operationBar(React, t, operation, busy, props.abort),
    )
  }
}

/** The `↑n ↓m` reading, or nothing when the branch tracks no upstream or has nothing to report. */
function upstreamSits(
  React: ReactLike,
  t: Translate,
  upstream: StatusSnapshot['upstream'],
): unknown {
  if (upstream === null || upstream === undefined) return null
  if (upstream.ahead === 0 && upstream.behind === 0) return null
  return React.createElement('span', {
    className: `${PREFIX}-upstream`,
    'data-git-upstream': '',
    title: t('upstream.title', { name: upstream.name }),
  },
  upstream.ahead === 0
    ? null
    : React.createElement('span', { className: `${PREFIX}-ahead`, 'data-count': 'ahead' }, `↑${upstream.ahead}`),
  upstream.behind === 0
    ? null
    : React.createElement('span', { className: `${PREFIX}-behind`, 'data-count': 'behind' }, `↓${upstream.behind}`))
}

/** The bar a checkout in the middle of a merge or a rebase shows under the header. */
function operationBar(
  React: ReactLike,
  t: Translate,
  operation: string,
  busy: boolean,
  abort: () => void,
): unknown {
  return React.createElement('div', { className: `${PREFIX}-operation`, 'data-git-operation': operation },
    React.createElement('span', { className: `${PREFIX}-operation-text` },
      t(`operation.${operation}`, { operation })),
    React.createElement('button', {
      type: 'button',
      className: `${PREFIX}-operation-abort`,
      'data-git-abort': '',
      disabled: busy,
      title: t('operation.abort'),
      onClick: abort,
    }, t('operation.abort')),
  )
}

/** The branch picker: local branches, then the new-branch row. */
function picker(
  React: ReactLike,
  props: BranchHeaderProps,
  branches: BranchList | undefined,
  draft: string,
  setDraft: (value: string) => void,
  create: () => void,
  pick: (branch: string) => void,
  busy: boolean,
  close: () => void,
  at: { top: number; left: number } | null,
): unknown {
  const { t } = props
  const current = branches?.current ?? null
  const local = branches?.local ?? []
  return React.createElement('div', {
    className: `${PREFIX}-menu ${PREFIX}-branch-menu`,
    'data-git-branch-menu': '',
    role: 'menu',
    style: at === null ? undefined : { top: `${at.top}px`, left: `${at.left}px` },
  },
  React.createElement('p', { className: `${PREFIX}-menu-title` }, t('branch.selector')),
  branches === undefined
    ? React.createElement('p', { className: `${PREFIX}-menu-note`, role: 'status' }, t('branch.loading'))
    : local.length === 0
      ? React.createElement('p', { className: `${PREFIX}-menu-note`, role: 'status' }, t('branch.empty'))
      : React.createElement('ul', { className: `${PREFIX}-branch-list` },
        ...local.map(name => React.createElement('li', { key: name, className: `${PREFIX}-branch-item` },
          React.createElement('button', {
            type: 'button',
            className: `${PREFIX}-branch-option`,
            'data-git-branch-option': name,
            'data-current': name === current ? '' : undefined,
            role: 'menuitemradio',
            'aria-checked': name === current ? 'true' : 'false',
            disabled: busy || name === current,
            title: name,
            onClick: () => { pick(name) },
          },
          name === current ? Icon(React, 'check', { size: 16 }) : React.createElement('span', {
            className: `${PREFIX}-branch-space`,
          }),
          React.createElement('span', { className: `${PREFIX}-branch-option-name` }, name)),
          // The checked-out branch has no delete control: Git refuses it, so
          // offering the button would only produce a refusal.
          name === current ? null : React.createElement('button', {
            type: 'button',
            className: `${PREFIX}-branch-delete`,
            'data-git-branch-delete': name,
            disabled: busy,
            title: t('branch.delete'),
            'aria-label': t('branch.delete'),
            onClick: () => { props.deleteBranch(name) },
          }, Icon(React, 'discard', { size: 16 })))),
      ),
  React.createElement('div', { className: `${PREFIX}-new-branch` },
    React.createElement('input', {
      type: 'text',
      className: `${PREFIX}-new-branch-input`,
      'data-git-new-branch': '',
      value: draft,
      placeholder: t('branch.newPlaceholder'),
      'aria-label': t('branch.newPlaceholder'),
      spellCheck: false,
      disabled: busy,
      onChange: (event: { target: { value: string } }) => { setDraft(event.target.value) },
      onKeyDown: (event: BranchKeyEvent) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          create()
        } else if (event.key === 'Escape') {
          event.preventDefault()
          close()
        }
      },
    }),
    React.createElement('button', {
      type: 'button',
      className: `${PREFIX}-new-branch-create`,
      'data-git-create-branch': '',
      disabled: busy || draft.trim() === '',
      title: t('branch.create'),
      onClick: create,
    }, t('branch.create'))),
  )
}

/** The operations menu: fetch, pull, push, one stash, and merges. */
function operations(
  React: ReactLike,
  props: BranchHeaderProps,
  usable: boolean,
  busy: boolean,
  fetch: () => void,
  sync: (action: SyncAction) => void,
  stash: () => void,
  localBranches: readonly string[],
  merge: (branch: string) => void,
  at: { top: number; left: number } | null,
): unknown {
  const { t } = props
  const items = [
    { id: 'fetch' as const, icon: 'sync' as const, label: t('sync.fetch'), run: fetch },
    { id: 'pull' as const, icon: 'pull' as const, label: t('sync.pull'), run: () => { sync('pull') } },
    { id: 'push' as const, icon: 'push' as const, label: t('sync.push'), run: () => { sync('push') } },
  ]
  return React.createElement('div', {
    className: `${PREFIX}-menu ${PREFIX}-more-menu`,
    'data-git-more-menu': '',
    role: 'menu',
    style: at === null ? undefined : { top: `${at.top}px`, left: `${at.left}px` },
  },
  ...items.map(item => React.createElement('button', {
    key: item.id,
    type: 'button',
    className: `${PREFIX}-menu-item`,
    'data-git-sync': item.id,
    role: 'menuitem',
    disabled: busy || !usable,
    onClick: item.run,
  }, Icon(React, item.icon), React.createElement('span', null, item.label))),
  React.createElement('span', { className: `${PREFIX}-menu-sep`, role: 'separator' }),
  React.createElement('button', {
    type: 'button',
    className: `${PREFIX}-menu-item`,
    'data-git-stash-new': '',
    role: 'menuitem',
    disabled: busy || !usable,
    onClick: stash,
  }, Icon(React, 'stash'), React.createElement('span', null, t('stash.current'))),
  React.createElement('span', { className: `${PREFIX}-menu-sep`, role: 'separator' }),
  ...(localBranches.length === 0
    ? []
    : [React.createElement('p', { key: 'merge-label', className: `${PREFIX}-menu-title` }, t('branch.mergeInto'))]),
  ...localBranches.map(name => React.createElement('button', {
    key: `merge:${name}`,
    type: 'button',
    className: `${PREFIX}-menu-item`,
    'data-git-merge': name,
    role: 'menuitem',
    disabled: busy || !usable,
    onClick: () => { merge(name) },
  }, Icon(React, 'merge'), React.createElement('span', null, name))),
  )
}

/** The share of a text input's keyboard event this module reads. */
interface BranchKeyEvent {
  readonly key: string
  preventDefault(): void
}
