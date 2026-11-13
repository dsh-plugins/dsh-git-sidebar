/**
 * Client half of the Git sidebar bundle.
 *
 * Two extension points, both in the right Sidebar:
 *
 * - `sidebarRightTabs.register` declares the tab type: a page type (no resource
 *   patterns), opened by kind, whose `guide` entry is the button on the Start
 *   page. `order` 12 places it directly below Workspace files (10) and above
 *   Code review (15). No command id is set, so the button carries no shortcut.
 * - `sidebar.right.pane.tab`, keyed by the type's id, draws the page body.
 *
 * The body is a placeholder: it states what the panel will show rather than
 * inventing data. No Harness Client package is loaded as a module; React
 * arrives from the shell's module table.
 */

/** This implementation's identity in the tab system, and the key its body registers under. */
const TAB_ID = '@dsh-plugin/dsh-git-sidebar'
/** The tab kind, opened by name. */
const TAB_KIND = 'git-panel'
const NS = 'git-sidebar'
const SOURCE = '@dsh-plugin/dsh-git-sidebar'

/** Minimal React face the bundle uses (the real React arrives from the loader). */
interface ReactLike {
  createElement(type: unknown, props?: unknown, ...children: unknown[]): unknown
}

/** The loader-supplied synchronous module-table `require`. */
type BundleRequire = (name: 'react') => ReactLike

/** One Start-page entry contributed by this tab type. */
interface GuideEntry {
  id: string
  order: number
  title(): string
  description?(): string
  icon?: unknown
}

/** The tab type declaration this bundle registers. */
interface TabDefinition {
  id: string
  kind: string
  title(address?: string): string
  guide?: readonly GuideEntry[]
}

/** Restricted Cordis context face of a dynamic client bundle. */
interface ClientContext {
  effect(setup: () => (() => void) | void, label?: string): () => void
  locale: {
    register(ns: string, dicts: Record<string, Record<string, string>>): () => void
    bind(ns: string): (key: string) => string
  }
  sidebarRightTabs: {
    register(definition: TabDefinition): () => void
  }
  slots: {
    inject(key: string, callback: () => (() => void) | Iterable<() => void>): () => void
    register(options: { name: string; key?: string; id?: string; order?: number; locale?: string }, component: unknown): () => void
  }
}

/** The page's loader entry point, absent from the standard DOM typings. */
interface ModuleLoaderHost {
  __ModuleLoader__: {
    load(registration: { id: string; factory: (require: BundleRequire) => unknown }): void
  }
}

const loader = (globalThis as unknown as ModuleLoaderHost).__ModuleLoader__

/** Copy the Start-page button and the panel render. */
const DICTS: Record<string, Record<string, string>> = {
  zh: {
    'panel.label': 'Git',
    'guide.title': 'Git 面板',
    'guide.description': '查看分支、工作区状态与提交',
    'panel.status': '仓库状态即将可用',
    'panel.emptyBody': '这个面板将显示当前仓库的分支、工作区状态与最近提交。仓库读取将在后续版本实现。',
  },
  en: {
    'panel.label': 'Git',
    'guide.title': 'Git panel',
    'guide.description': 'Inspect branches, working-tree status and commits',
    'panel.status': 'Repository status coming soon',
    'panel.emptyBody': 'This panel will show the current repository branch, working-tree status, '
      + 'and recent commits. Repository inspection arrives in a later version.',
  },
}

/**
 * Start-page glyph: a two-line Git fork with commit nodes.
 *
 * Geometry is identical to `icon.svg`, which Plugin Manager shows in its own
 * rows, so the Start-page button and the plugin inventory draw the same mark.
 * The ink spans roughly 16×23 of the 36-unit box; at the Start page's 26px it
 * lands near the optical size of the neighbouring folder and terminal glyphs.
 */
function GitGuideIcon(React: ReactLike) {
  return function GitGuideArtwork(props: { size?: number; className?: string }) {
    const size = props.size ?? 26
    const ink = '#e5522f'
    return React.createElement('svg', {
      viewBox: '0 0 36 36',
      width: size,
      height: size,
      className: props.className,
      'aria-hidden': true,
      style: { display: 'block' },
    },
    // Main line.
    React.createElement('path', {
      d: 'M13 9.7v16.6',
      stroke: ink,
      strokeWidth: 2.7,
      strokeLinecap: 'round',
      fill: 'none',
    }),
    // The branch leaves the upper-right commit and rejoins the main line.
    React.createElement('path', {
      d: 'M23 9.7v5.4c0 3.3-2.5 5.8-6 5.8H13',
      stroke: ink,
      strokeWidth: 2.7,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      fill: 'none',
    }),
    React.createElement('circle', { cx: 13, cy: 9.7, r: 2.7, fill: ink }),
    React.createElement('circle', { cx: 23, cy: 9.7, r: 2.7, fill: ink }),
    React.createElement('circle', { cx: 13, cy: 26.3, r: 2.7, fill: ink }),
    )
  }
}

/** The placeholder page rendered in the right Sidebar. */
function GitPanel(React: ReactLike, t: (key: string) => string) {
  const outer = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '20px',
    color: 'var(--dsw-alias-label-primary)',
  }
  // No heading: the tab chip already says "Git", so the body leads with the
  // status line and explains it, matching the pane header's own type scale.
  const statusStyle = { margin: 0, fontSize: '13px', fontWeight: 600 }
  const bodyStyle = {
    margin: 0,
    fontSize: '13px',
    lineHeight: 1.6,
    color: 'var(--dsw-alias-label-secondary)',
  }
  return React.createElement('section', { style: outer },
    React.createElement('p', { style: statusStyle }, t('panel.status')),
    React.createElement('p', { style: bodyStyle }, t('panel.emptyBody')),
  )
}

loader.load({
  id: SOURCE,
  factory(require: BundleRequire) {
    const React = require('react')
    const GuideIcon = GitGuideIcon(React)

    return {
      inject: ['slots', 'locale', 'sidebarRightTabs'],
      apply(ctx: ClientContext) {
        ctx.effect(() => ctx.locale.register(NS, DICTS), 'git-sidebar: dictionaries')
        const t = ctx.locale.bind(NS)

        // Stage one: what the tab type is, plus its Start-page button. A page
        // type names no resource patterns and is opened by kind.
        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: TAB_ID,
          kind: TAB_KIND,
          title: () => t('panel.label'),
          guide: [{
            id: 'open',
            // Workspace files is 10 and Code review 15: 12 sits directly below
            // the first button.
            order: 12,
            title: () => t('guide.title'),
            description: () => t('guide.description'),
            icon: GuideIcon,
          }],
        }), 'git-sidebar: tab type')

        // Stage two: the page body under the type's id.
        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: TAB_ID,
          locale: NS,
        }, function GitPanelView() {
          return GitPanel(React, t)
        })), 'git-sidebar: panel body')
      },
    }
  },
})
