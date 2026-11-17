/**
 * Hunk controls for the diff viewer.
 *
 * A hunk's own header carries the actions that act on it, and each side of the
 * index offers the ones that side can perform: the working tree can be staged
 * into the index or rolled back out of the file, while a staged block can only
 * be taken back out of the index. Rolling back is the destructive one, which is
 * why it exists only beside the text it would remove.
 *
 * A commit's diff is history: there is no index to move a block of it into.
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
  /**
   * Move one hunk — or one block of it — into the index, or out of it.
   * @param hunk - the hunk's position in the file's patch.
   * @param region - the block inside that hunk, or undefined for all of it.
   * @param direction - which way the block moves.
   */
  move(hunk: number, region: number | undefined, direction: 'stage' | 'unstage'): void
  /**
   * Roll one hunk — or one block of it — back out of the working tree.
   * @param hunk - the hunk's position in the file's patch.
   * @param region - the block inside that hunk, or undefined for all of it.
   */
  discard?(hunk: number, region: number | undefined): void
}

/**
 * Render the buttons for one hunk header.
 * @param React - the loader's React.
 * @param controls - the side, the busy flag, copy, and the actions.
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
  return React.createElement('span', { className: `${prefix}-hunk-actions` },
    button(React, prefix, controls, index, staging ? 'stage' : 'unstage', staging ? 'hunk.stage' : 'hunk.unstage'),
    staging && controls.discard !== undefined
      ? button(React, prefix, controls, index, 'discard', 'hunk.discard')
      : null,
  )
}

/**
 * One hunk action.
 * @param React - the loader's React.
 * @param prefix - the diff viewer's class prefix.
 * @param controls - the side, the busy flag, copy, and the actions.
 * @param index - the hunk's position in the file's patch.
 * @param action - which action this button performs.
 * @param label - the copy key naming it.
 * @returns the button element.
 */
function button(
  React: HunkReactSurface,
  prefix: string,
  controls: HunkControls,
  index: number,
  action: 'stage' | 'unstage' | 'discard',
  label: string,
): unknown {
  const name = controls.t(label)
  return React.createElement('button', {
    type: 'button',
    className: `${prefix}-hunk-action`,
    'data-git-hunk-action': action,
    'data-git-hunk': String(index),
    disabled: controls.busy,
    title: name,
    'aria-label': name,
    onClick: () => {
      if (action === 'discard') controls.discard?.(index, undefined)
      else controls.move(index, undefined, action)
    },
  }, Icon(React, action === 'discard' ? 'discard' : action))
}
