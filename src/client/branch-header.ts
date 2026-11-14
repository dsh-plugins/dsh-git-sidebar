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
}

/** Which dropdown of the header is open, if any. */
type Menu = 'none' | 'branch' | 'more'

/**
 * Build the branch header.
 * @param React - the loader's React.
 * @returns the component the panel draws above the change groups.
 */
export function makeBranchHeader(React: ReactLike): (props: BranchHeaderProps) => unknown {
  return function BranchHeader(props: BranchHeaderProps): unknown {
    const { snapshot, loading, busy, t } = props
    const [menu, setMenu] = React.useState<Menu>('none')
    const [branches, setBranches] = React.useState<BranchList | undefined>(undefined)
    const [draft, setDraft] = React.useState('')

    React.useEffect(() => {
      if (menu !== 'branch') return
      let live = true
      setBranches(undefined)
      void props.listBranches()
        .then((list) => { if (live) setBranches(list) })
        .catch(() => { if (live) setBranches(undefined) })
      return () => { live = false }
    }, [menu])

    const close = (): void => { setMenu('none') }
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
            onClick: () => { setMenu(menu === 'branch' ? 'none' : 'branch') },
          },
          React.createElement('span', { className: `${PREFIX}-branch-name` }, label),
          Icon(React, 'chevron', { size: 14 })),
        upstreamSits(React, t, upstream),
        root === undefined
          ? null
          : React.createElement('span', {
            className: `${PREFIX}-sub`,
            title: root,
            // The column is narrow, so the reading shows the last segment while
            // the tooltip keeps the whole path.
            'data-full': root,
          }, lastSegment(root)),
        React.createElement('button', {
          type: 'button',
          className: `${PREFIX}-tool`,
          'aria-label': t('more.actions'),
          title: t('more.actions'),
          'data-git-more': '',
          'aria-haspopup': 'menu',
          'aria-expanded': menu === 'more' ? 'true' : 'false',
          disabled: !usable || busy,
          onClick: () => { setMenu(menu === 'more' ? 'none' : 'more') },
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
        menu === 'branch' ? picker(React, props, branches, draft, setDraft, create, pick, busy, close) : null,
        menu === 'more' ? operations(React, props, usable, busy, () => {
          setMenu('none')
          props.sync('fetch')
        }, (action) => {
          setMenu('none')
          props.sync(action)
        }, () => {
          setMenu('none')
          props.stash()
        }) : null,
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
): unknown {
  const { t } = props
  const current = branches?.current ?? null
  const local = branches?.local ?? []
  return React.createElement('div', {
    className: `${PREFIX}-menu ${PREFIX}-branch-menu`,
    'data-git-branch-menu': '',
    role: 'menu',
  },
  React.createElement('p', { className: `${PREFIX}-menu-title` }, t('branch.selector')),
  branches === undefined
    ? React.createElement('p', { className: `${PREFIX}-menu-note`, role: 'status' }, t('branch.loading'))
    : local.length === 0
      ? React.createElement('p', { className: `${PREFIX}-menu-note`, role: 'status' }, t('branch.empty'))
      : React.createElement('ul', { className: `${PREFIX}-branch-list` },
        ...local.map(name => React.createElement('li', { key: name },
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
          React.createElement('span', { className: `${PREFIX}-branch-option-name` }, name)))),
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

/** The operations menu: fetch, pull, push, and one stash. */
function operations(
  React: ReactLike,
  props: BranchHeaderProps,
  usable: boolean,
  busy: boolean,
  fetch: () => void,
  sync: (action: SyncAction) => void,
  stash: () => void,
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
  )
}

/** The last segment of a filesystem path, for the narrow repository label. */
function lastSegment(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return cut < 0 ? trimmed : trimmed.slice(cut + 1)
}

/** The share of a text input's keyboard event this module reads. */
interface BranchKeyEvent {
  readonly key: string
  preventDefault(): void
}
