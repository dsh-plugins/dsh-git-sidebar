/**
 * The conversation rows our agent tools draw.
 *
 * A tool call is rendered by the Client package that owns its wire name, so
 * these two rows replace the generic card. The opening tool's row is also the
 * one place a Host tool can put the panel on screen: DSH forwards no Host event
 * a plugin may extend, and every way into the right Sidebar is a Client call, so
 * the row itself asks the navigation controller to open the tab once its call
 * settles.
 *
 * Opening is claimed per call id, because the conversation re-renders a settled
 * call on every scroll and replay, and a panel that jumped on each of those
 * would be unusable.
 */

import type { ReactLike, Translate } from './api.ts'
import { Icon } from './icons.ts'
import { PREFIX } from './styles.ts'

/** The share of a tool call's stage data a row reads. */
export interface ToolBlockLike {
  readonly name?: string
  /** The recorded result content, when the call has settled. */
  readonly result?: { readonly content?: readonly unknown[] } | undefined
}

/** Props the Tool view slot hands one atomic call. */
export interface ToolCardProps {
  readonly callId: string
  readonly toolName: string
  readonly phase: 'preparing' | 'start' | 'result'
  readonly block?: ToolBlockLike | undefined
}

/** What the rows do beyond drawing. */
export interface ToolCardDeps {
  readonly t: Translate
  /**
   * Bring the panel up: clear what belongs to another checkout, then open the tab.
   * @returns true when the tab was asked for; false when no Session is on screen
   * yet, which leaves the call unclaimed so a later render can try again.
   */
  openPanel(): boolean
}

/** Call ids whose panel has already been opened, so a replay does not open it again. */
const opened = new Set<string>()

/** How many call ids the claim set remembers before it is emptied. */
const MAX_CLAIMS = 200

/**
 * Build the row for one tool name.
 * @param React - the loader's React.
 * @param deps - the panel opener and the copy lookup.
 * @param kind - which tool the row belongs to.
 * @returns the component the Tool view slot renders.
 */
export function makeGitToolRow(
  React: ReactLike,
  deps: ToolCardDeps,
  kind: 'open' | 'list',
): (props: ToolCardProps) => unknown {
  return function GitToolRow(props: ToolCardProps): unknown {
    const { t, openPanel } = deps

    React.useEffect(() => {
      if (kind !== 'open' || props.phase !== 'result') return
      if (opened.has(props.callId)) return
      // The plan review opens the same way: a component effect asks the
      // navigation controller for its tab, and the controller refuses while no
      // Session is on screen. Leaving the call unclaimed is what lets the render
      // that brings a Conversation back open the panel.
      if (!openPanel()) return
      if (opened.size >= MAX_CLAIMS) opened.clear()
      opened.add(props.callId)
    }, [props.callId, props.phase])

    const settled = props.phase === 'result'
    const title = kind === 'open' ? t('gitTool.open.title') : t('gitTool.list.title')
    const summary = settled ? resultText(props.block) : t('gitTool.running')
    return React.createElement('div', {
      className: `${PREFIX}-tool-row`,
      'data-git-tool-row': props.toolName,
      'data-git-tool-call': props.callId,
      'data-git-tool-phase': props.phase,
    },
    Icon(React, kind === 'open' ? 'repo' : 'merge', { size: 16 }),
    React.createElement('div', { className: `${PREFIX}-tool-body` },
      React.createElement('span', { className: `${PREFIX}-tool-title` }, title),
      React.createElement('span', { className: `${PREFIX}-tool-summary` }, summary)),
    kind !== 'open'
      ? null
      : React.createElement('button', {
        type: 'button',
        className: `${PREFIX}-tool-open`,
        'data-git-tool-open': '',
        disabled: !settled,
        title: t('gitTool.open.action'),
        onClick: openPanel,
      }, t('gitTool.open.action')))
  }
}

/**
 * Read the first text block of a settled call's recorded result.
 * @param block - the call's stage data.
 * @returns the text, or the failure sentence when the call carries none.
 */
function resultText(block: ToolBlockLike | undefined): string {
  for (const item of block?.result?.content ?? []) {
    const text = (item as { readonly text?: unknown } | undefined)?.text
    if (typeof text === 'string' && text.length > 0) return text
  }
  return ''
}
