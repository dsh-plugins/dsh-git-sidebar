/**
 * The three regions of the panel body, each with a height the reader sets and a
 * collapse of its own.
 *
 * The change list, the commit box, and the history used to share the column by
 * content: a list that grew pushed the other two out of sight, and a short one
 * left a gap the other two did not use. A region now takes exactly the height
 * the reader gave it, whatever it holds, and folds to its title when the reader
 * asks for the room.
 *
 * Nothing here holds state: the panel owns the heights and the collapsed flags
 * and passes them in, so these helpers are plain functions the panel calls from
 * its own render. The drag is here because the window listeners it installs must
 * be removed by the call that installed them, which is what its return value
 * does.
 */

import type { ReactLike, Translate } from './api.ts'
import { Icon } from './icons.ts'
import { PREFIX } from './styles.ts'

/** One region of the panel body. */
export type PaneId = 'changes' | 'commit' | 'history'

/** Every region, in the order the column stacks them. */
export const PANE_IDS: readonly PaneId[] = ['changes', 'commit', 'history']

/** The height of each region, as the panel remembers it. */
export type PaneSizes = Record<PaneId, number>

/** Whether each region is folded to its title, as the panel remembers it. */
export type PaneCollapsed = Record<PaneId, boolean>

/**
 * The height each region starts at, and returns to when its handle is told Home.
 *
 * The commit region is the tallest of the three because its message field is a
 * fixed block: a region shorter than the box clips the field's last line, and the
 * reader has to scroll a region that looks like it should simply fit. The three
 * together still leave room inside the several hundred pixels a sidebar gives the
 * panel with the branch header above them.
 */
export const PANE_DEFAULTS: PaneSizes = { changes: 200, commit: 224, history: 240 }

/** Every region expanded: what a fresh panel starts with. */
export const PANES_EXPANDED: PaneCollapsed = { changes: false, commit: false, history: false }

/** The smallest height a region may be dragged or stepped to. */
export const PANE_MIN = 120

/** The largest height a region may take, so one handle cannot push the others away. */
export const PANE_MAX = 900

/** How far one arrow key moves a handle. */
export const PANE_STEP = 16

/** The class a drag puts on `body`, which is what keeps it from selecting text. */
export const DRAGGING_CLASS = `${PREFIX}-dragging`

/**
 * Hold one height inside the range every region shares.
 * @param size - the height asked for.
 * @returns the height a region can actually take.
 */
export function clampPaneSize(size: number): number {
  return Math.max(PANE_MIN, Math.min(PANE_MAX, Math.round(size)))
}

/**
 * The height one drag produces.
 * @param size - the height the drag started from.
 * @param delta - how far the pointer moved, positive for taller.
 * @returns the clamped height.
 */
export function resizePaneSize(size: number, delta: number): number {
  return clampPaneSize(size + delta)
}

/**
 * The height one key press produces.
 *
 * The handle sits on the region's top edge, so up is taller for it as well.
 * A key the handle does not own returns nothing, which is how the panel knows
 * to leave the event alone.
 * @param id - the region whose handle was pressed.
 * @param size - the region's height now.
 * @param key - the key the handle received.
 * @returns the new height, or undefined for a key the handle ignores.
 */
export function paneKeySize(id: PaneId, size: number, key: string): number | undefined {
  if (key === 'ArrowUp') return resizePaneSize(size, PANE_STEP)
  if (key === 'ArrowDown') return resizePaneSize(size, -PANE_STEP)
  if (key === 'Home') return PANE_DEFAULTS[id]
  return undefined
}

/** The two window calls a drag makes. */
export interface PaneWindow {
  addEventListener(type: 'pointermove' | 'pointerup' | 'pointercancel', listener: (event: PointerEvent) => void): void
  removeEventListener(
    type: 'pointermove' | 'pointerup' | 'pointercancel',
    listener: (event: PointerEvent) => void,
  ): void
}

/** What one drag needs to follow a pointer. */
export interface PaneDragOptions {
  /** The height the region had when the pointer went down. */
  readonly size: number
  /** Where the pointer went down, in client coordinates. */
  readonly startY: number
  readonly window: PaneWindow
  /** Called with every clamped height the gesture produces. */
  readonly onSize: (size: number) => void
}

/**
 * Follow one pointer until it is released.
 *
 * The listeners are on the window rather than on the handle: a pointer that
 * leaves the six-pixel strip mid-drag must keep resizing, which is the whole
 * reason the strip exists. The returned function removes them, and the panel
 * calls it from the cleanup of the effect that owns the drag, so a panel closed
 * mid-drag leaves nothing listening.
 * @param options - the starting height, the starting pointer, and the callback.
 * @returns the function that ends the drag.
 */
export function startPaneDrag(options: PaneDragOptions): () => void {
  const { size, startY, onSize } = options
  const host = options.window
  let ended = false
  const move = (event: PointerEvent): void => {
    onSize(resizePaneSize(size, startY - event.clientY))
  }
  const stop = (): void => {
    if (ended) return
    ended = true
    host.removeEventListener('pointermove', move)
    host.removeEventListener('pointerup', stop)
    host.removeEventListener('pointercancel', stop)
    setDragging(false)
  }
  host.addEventListener('pointermove', move)
  host.addEventListener('pointerup', stop)
  host.addEventListener('pointercancel', stop)
  setDragging(true)
  return stop
}

/**
 * Turn the no-select treatment on or off while a drag runs.
 *
 * Without it a drag across the list selects every row label it passes over,
 * which the reader then has to clear by hand.
 * @param on - whether a drag is running.
 */
export function setDragging(on: boolean): void {
  if (typeof document === 'undefined' || document.body === null) return
  if (on) document.body.classList.add(DRAGGING_CLASS)
  else document.body.classList.remove(DRAGGING_CLASS)
}

/** The share of a pointer event a handle reads. */
export interface PanePointerEvent {
  readonly clientY: number
  preventDefault?(): void
}

/** The share of a key event a handle reads. */
export interface PaneKeyEvent {
  readonly key: string
  preventDefault?(): void
}

/** What one region draws, and what the panel wants told when the reader acts. */
export interface PaneProps {
  readonly id: PaneId
  /** What the region is called in its title row. */
  readonly title: string
  readonly size: number
  readonly collapsed: boolean
  readonly t: Translate
  /** What the region holds; drawn only while it is expanded. */
  readonly content: unknown
  onToggle(): void
  onResizeStart(event: PanePointerEvent): void
  onResizeKey(event: PaneKeyEvent): void
}

/**
 * Draw one region: its resize strip, its title, and what it holds.
 *
 * A plain function rather than a component: the panel owns the heights and the
 * collapsed flags, so this must not hold hooks of its own.
 * @param React - the loader's React.
 * @param props - the region's facts and the callbacks its controls fire.
 * @returns the region.
 */
export function gitPane(React: ReactLike, props: PaneProps): unknown {
  const { id, size, collapsed, t } = props
  return React.createElement('section', {
    className: `${PREFIX}-pane`,
    'data-git-pane': id,
    'data-git-pane-size': String(size),
    'data-collapsed': collapsed ? '' : undefined,
    style: collapsed ? undefined : { flex: `0 0 ${size}px` },
  },
  React.createElement('div', {
    className: `${PREFIX}-pane-resize`,
    'data-git-pane-handle': id,
    role: 'separator',
    'aria-orientation': 'horizontal',
    'aria-label': t('pane.resize'),
    'aria-valuenow': String(size),
    'aria-valuemin': String(PANE_MIN),
    'aria-valuemax': String(PANE_MAX),
    tabIndex: 0,
    onPointerDown: props.onResizeStart,
    onKeyDown: props.onResizeKey,
  }),
  React.createElement('div', { className: `${PREFIX}-pane-head` },
    React.createElement('button', {
      type: 'button',
      className: `${PREFIX}-pane-toggle`,
      'data-git-pane-toggle': id,
      'aria-expanded': collapsed ? 'false' : 'true',
      title: t(collapsed ? 'pane.expand' : 'pane.collapse'),
      onClick: props.onToggle,
    },
    Icon(React, collapsed ? 'chevron' : 'expand', { size: 16 }),
    React.createElement('h3', { className: `${PREFIX}-group-title` }, props.title))),
  React.createElement('div', { className: `${PREFIX}-pane-body` },
    collapsed ? null : props.content),
  )
}
