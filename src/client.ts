/**
 * Client half of the Git sidebar bundle.
 *
 * The first version registers the two extension points the plugin needs and
 * renders a placeholder panel:
 *
 * - `sidebar.panellist` adds one navigation row (the Git icon) whose id is the
 *   matching `main` key, so selecting it swaps the centre column to this panel.
 * - `main` (keyed by panel id) draws the panel itself.
 *
 * Repository inspection is not implemented yet: the panel states what it will
 * show instead of claiming data it does not have. No Harness Client package is
 * loaded as a module; React arrives from the shell's module table.
 */

/** Panel id: both the `sidebar.panellist` list id and the `main` key. */
const PANEL_ID = 'git'
const NS = 'git-sidebar'
const SOURCE = '@dsh-plugin/dsh-git-sidebar'

/** Minimal React face the bundle uses (the real React arrives from the loader). */
interface ReactLike {
  createElement(type: unknown, props?: unknown, ...children: unknown[]): unknown
}

/** Restricted Cordis context face of a dynamic client bundle. */
interface ClientContext {
  effect(setup: () => (() => void) | void, label?: string): () => void
  locale: {
    register(ns: string, dicts: Record<string, Record<string, string>>): () => void
    bind(ns: string): (key: string) => string
  }
  slots: {
    inject(key: string, callback: () => (() => void) | Iterable<() => void>): () => void
    register(options: { name: string; key?: string; id?: string; order?: number; label?: string | (() => string); locale?: string }, component: unknown): () => void
  }
}

/** The loader-supplied synchronous module-table `require`. */
type BundleRequire = (name: 'react') => ReactLike

/** The page's loader entry point, absent from the standard DOM typings. */
interface ModuleLoaderHost {
  __ModuleLoader__: {
    load(registration: { id: string; factory: (require: BundleRequire) => unknown }): void
  }
}

const loader = (globalThis as unknown as ModuleLoaderHost).__ModuleLoader__

/** Copy the panel and its navigation row render. */
const DICTS: Record<string, Record<string, string>> = {
  zh: {
    'panel.label': 'Git',
    'panel.title': 'Git',
    'panel.emptyTitle': '尚未读取仓库',
    'panel.emptyBody': '这个面板将显示会话工作区所在仓库的分支、工作区状态与最近提交。仓库读取将在后续版本实现。',
  },
  en: {
    'panel.label': 'Git',
    'panel.title': 'Git',
    'panel.emptyTitle': 'No repository yet',
    'panel.emptyBody': 'This panel will show the branch, working-tree status, and recent commits of the session workspace. Repository inspection arrives in a later version.',
  },
}

/** Navigation-row glyph: a commit node on a branch line. */
function GitPanelIcon(React: ReactLike, size: number, active: boolean) {
  return React.createElement('svg', {
    viewBox: '0 0 36 36',
    width: size,
    height: size,
    'aria-hidden': true,
    style: { display: 'block' },
  },
  React.createElement('path', {
    d: 'M18 4.5v9M18 22.5v9',
    stroke: 'currentColor',
    strokeWidth: 2.2,
    strokeLinecap: 'round',
    fill: 'none',
    opacity: active ? 1 : 0.9,
  }),
  React.createElement('circle', { cx: 18, cy: 18, r: 5, fill: 'none', stroke: 'currentColor', strokeWidth: 2.2 }),
  React.createElement('circle', { cx: 18, cy: 18, r: 1.8, fill: 'currentColor' }),
  )
}

/** The placeholder panel rendered in the centre column. */
function GitPanel(React: ReactLike, t: (key: string) => string) {
  const style = {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '24px',
    color: 'var(--dsw-alias-label-primary)',
  }
  const titleStyle = { margin: 0, fontSize: '15px', fontWeight: 600 }
  const textStyle = {
    margin: 0,
    fontSize: '13px',
    lineHeight: 1.6,
    color: 'var(--dsw-alias-label-secondary)',
  }
  return function GitPanelView() {
    return React.createElement('section', { style },
      React.createElement('h2', { style: titleStyle }, t('panel.title')),
      React.createElement('p', { style: { ...textStyle, color: 'var(--dsw-alias-label-primary)' } }, t('panel.emptyTitle')),
      React.createElement('p', { style: textStyle }, t('panel.emptyBody')),
    )
  }
}

loader.load({
  id: SOURCE,
  factory(require: BundleRequire) {
    const React = require('react')

    return {
      inject: ['slots', 'locale'],
      apply(ctx: ClientContext) {
        ctx.effect(() => ctx.locale.register(NS, DICTS), 'git-sidebar: dictionaries')
        const t = ctx.locale.bind(NS)

        // The navigation row. Its list id is the `main` key below; the label is
        // the row title, accessible name, and collapsed-rail tooltip.
        ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 40,
          label: () => t('panel.label'),
          locale: NS,
        }, (props: { size: number; active: boolean }) => GitPanelIcon(React, props.size, props.active))), 'git-sidebar: sidebar row')

        // The panel shown in the centre column while its row is selected.
        ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
        }, GitPanel(React, t))), 'git-sidebar: main panel')
      },
    }
  },
})
