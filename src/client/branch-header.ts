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
   * The branch the panel is showing the log of without checking it out, if any.
   *
   * A preview is a reading state, not a checkout: the header and the history
   * describe this branch while the working tree and HEAD stay where they were.
   */
  readonly preview: string | null
  /** Show one branch's history without moving the checkout. */
  previewBranch(branch: string): void
  /** Go back to describing the checkout. */
  exitPreview(): void
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
const MENU_W = 340

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
    const checkedOut = !usable ? null : snapshot.branch ?? snapshot.commit ?? t('branch.unknown')
    const preview = usable ? props.preview : null
    // A preview renames what the header and the log describe; the title and the
    // bar under the row are what keep the real checkout visible beside it.
    const label = !usable ? '' : preview ?? checkedOut ?? t('branch.unknown')
    const root = snapshot?.root
    // The upstream counts belong to the checkout, so a preview hides them rather
    // than pairing another branch's name with this one's numbers.
    const upstream = usable && preview === null ? snapshot.upstream ?? null : null
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
            'data-git-preview': preview === null ? undefined : '',
            'aria-haspopup': 'menu',
            'aria-expanded': menu === 'branch' ? 'true' : 'false',
            title: headerTitle(t, label, preview, checkedOut, root),
            onClick: (event: MenuClick) => { openMenu('branch', event.currentTarget) },
          },
          React.createElement('span', { className: `${PREFIX}-branch-name` }, label),
          preview === null
            ? null
            : React.createElement('span', {
              className: `${PREFIX}-preview-badge`,
              'data-git-preview-badge': '',
            }, t('branch.previewBadge')),
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
      preview === null ? null : previewBar(React, t, preview, checkedOut, props.exitPreview),
      operation === null ? null : operationBar(React, t, operation, busy, props.abort),
    )
  }
}

/**
 * The tooltip of the branch button, which has up to three facts to state.
 *
 * A preview is the case that needs all three: the branch the panel describes,
 * the branch Git actually has checked out, and the checkout's path.
 * @param t - the panel's translator.
 * @param label - the name the button shows.
 * @param preview - the previewed branch, or null when the header describes HEAD.
 * @param checkedOut - the branch or commit HEAD names.
 * @param root - the checkout's top level, when it has one.
 * @returns the tooltip text.
 */
function headerTitle(
  t: Translate,
  label: string,
  preview: string | null,
  checkedOut: string | null,
  root: string | undefined,
): string {
  const lines = [label]
  if (preview !== null) lines.push(t('branch.previewHint', { current: checkedOut ?? '' }))
  if (root !== undefined) lines.push(root)
  return lines.join('\n')
}

/**
 * The bar a preview shows under the header.
 *
 * The point of the bar is the contradiction a preview creates: the branch name
 * and the log describe another branch, while everything that writes — staging,
 * stashing, committing — still happens on the checkout. Saying so where the
 * reader is looking beats leaving it to a tooltip.
 * @param React - the loader's React.
 * @param t - the panel's translator.
 * @param preview - the branch being previewed.
 * @param checkedOut - the branch or commit HEAD names.
 * @param exit - the handler that goes back to describing the checkout.
 * @returns the bar.
 */
function previewBar(
  React: ReactLike,
  t: Translate,
  preview: string,
  checkedOut: string | null,
  exit: () => void,
): unknown {
  return React.createElement('div', {
    className: `${PREFIX}-preview-bar`,
    'data-git-preview-bar': preview,
    role: 'status',
  },
  React.createElement('span', {
    className: `${PREFIX}-preview-text`,
    title: t('branch.previewBar', { branch: preview, current: checkedOut ?? '' }),
  }, t('branch.previewBar', { branch: preview, current: checkedOut ?? '' })),
  React.createElement('button', {
    type: 'button',
    className: `${PREFIX}-preview-exit`,
    'data-git-preview-exit': '',
    title: t('branch.previewExit'),
    onClick: exit,
  }, t('branch.previewExit')),
  )
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
  const preview = props.preview
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
        ...local.map(name => branchRow(React, props, name, current, preview, busy, pick, (branch) => {
          // The reader picked a branch to read, so the list has served its
          // purpose: leaving it open would cover the log it just switched.
          close()
          props.previewBranch(branch)
        })),
      ),
  preview === null
    ? null
    : React.createElement('button', {
      type: 'button',
      className: `${PREFIX}-menu-item`,
      'data-git-preview-clear': '',
      role: 'menuitem',
      title: t('branch.previewExit'),
      onClick: () => {
        close()
        props.exitPreview()
      },
    }, Icon(React, 'eye'), React.createElement('span', null, t('branch.previewExit'))),
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

/**
 * One branch in the picker: what it is called, and the two things to do with it.
 *
 * The name button checks the branch out, which is what the picker did before the
 * preview existed; preview sits beside it as its own control, because changing
 * what the panel describes must not be mistaken for changing the checkout.
 * @param React - the loader's React.
 * @param props - the header's callbacks.
 * @param name - the branch.
 * @param current - the checked-out branch, when Git reports one.
 * @param preview - the branch the panel describes without checking it out.
 * @param busy - whether a write is running.
 * @param pick - the checkout handler.
 * @returns the row.
 */
function branchRow(
  React: ReactLike,
  props: BranchHeaderProps,
  name: string,
  current: string | null,
  preview: string | null,
  busy: boolean,
  pick: (branch: string) => void,
  previewPick: (branch: string) => void,
): unknown {
  const { t } = props
  const checkedOut = name === current
  const previewing = name === preview
  return React.createElement('li', {
    key: name,
    className: `${PREFIX}-branch-item`,
    'data-current': checkedOut ? '' : undefined,
    'data-previewed': previewing ? '' : undefined,
  },
  // One fixed slot for the mark, so every row starts its name at the same
  // column whether it is the checkout, the preview, or neither.
  React.createElement('span', { className: `${PREFIX}-branch-space` },
    checkedOut
      ? Icon(React, 'check', { size: 16 })
      : previewing ? Icon(React, 'eye', { size: 16 }) : null),
  // The name is a label, not a control: the row acts through the three buttons
  // beside it, so a click on the text does nothing at all.
  React.createElement('span', {
    className: `${PREFIX}-branch-option-name`,
    'data-git-branch-name': name,
    title: name,
  }, name),
  React.createElement('button', {
    type: 'button',
    className: `${PREFIX}-branch-act`,
    'data-act': 'checkout',
    'data-git-branch-option': name,
    'data-git-branch-checkout': name,
    role: 'menuitem',
    disabled: busy || checkedOut,
    title: `${t('branch.checkout')} ${name}`,
    onClick: () => { pick(name) },
  }, t('branch.checkout')),
  React.createElement('button', {
    type: 'button',
    className: `${PREFIX}-branch-act`,
    'data-act': 'preview',
    'data-git-branch-preview': name,
    'data-active': previewing ? '' : undefined,
    role: 'menuitem',
    disabled: busy || checkedOut || previewing,
    title: `${t('branch.preview')} ${name}`,
    onClick: () => { previewPick(name) },
  }, t('branch.preview')),
  // The checked-out branch has no delete control: Git refuses it, so offering
  // the button would only produce a refusal.
  checkedOut ? null : React.createElement('button', {
    type: 'button',
    className: `${PREFIX}-branch-act`,
    'data-act': 'delete',
    'data-git-branch-delete': name,
    role: 'menuitem',
    disabled: busy,
    title: t('branch.delete'),
    onClick: () => { props.deleteBranch(name) },
  }, t('branch.remove')))
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
