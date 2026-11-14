/**
 * Hunk controls for the diff viewer.
 *
 * A hunk's own header carries the two actions that act on it: stage the block
 * into the index, or take it back out. The Host applies the very patch the
 * viewer drew, so the position sent is the position on screen.
 *
 * Only the working-tree and index sides get controls. A commit's diff is
 * history: there is no index to move a block of it into.
 */

import type { Translate } from './api.ts'
import { Icon } from './icons.ts'

/** The share of the loader's React this module calls. */
export interface HunkReactSurface {
  createElement(type: unknown, props?: unknown, ...children: unknown[]): unknown
}

/** Which side of the index a viewer is showing. */
export type DiffSide = 'staged' | 'worktree' | 'commit'

/** The actions one hunk header offers, when it offers any. */
export interface HunkControls {
  readonly side: DiffSide
  readonly busy: boolean
  readonly t: Translate
  /** Move one hunk into the index, or out of it. */
  move(index: number, direction: 'stage' | 'unstage'): void
}

/**
 * Render the buttons for one hunk header.
 * @param React - the loader's React.
 * @param controls - the side, the busy flag, copy, and the action.
 * @param index - the hunk's position in the file's patch.
 * @param prefix - the diff viewer's class prefix.
 * @returns the buttons, or null when this side has none.
 */
export function hunkButtons(
  React: HunkReactSurface,
  controls: HunkControls | undefined,
  index: number,
  prefix: string,
): unknown {
  if (controls === undefined || controls.side === 'commit') return null
  const staging = controls.side === 'worktree'
  const key = staging ? 'hunk.stage' : 'hunk.unstage'
  return React.createElement('span', { className: `${prefix}-hunk-actions` },
    React.createElement('button', {
      type: 'button',
      className: `${prefix}-hunk-action`,
      'data-git-hunk-action': staging ? 'stage' : 'unstage',
      'data-git-hunk': String(index),
      disabled: controls.busy,
      title: controls.t(key),
      'aria-label': controls.t(key),
      onClick: () => { controls.move(index, staging ? 'stage' : 'unstage') },
    }, Icon(React, staging ? 'stage' : 'unstage')))
}
