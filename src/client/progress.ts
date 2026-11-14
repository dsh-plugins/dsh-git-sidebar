/**
 * The refresh bar: the shell's 2px indeterminate progress line.
 *
 * It is a copy of `ProgressBar` from `src/vs/base/browser/ui/progressbar/`, and
 * its numbers are kept: the bit is 2% of a 2px track, one 4s sweep carries it
 * from 0% to 4900% of its own width, and it widens to 3× at the midpoint. After
 * ten seconds the animation changes to `steps(100)`, which is how VS Code stops
 * asking the compositor for a new frame on a run that is already clearly stuck.
 *
 * The track is always in the tree and only the bit hides, so the panel's rows
 * never move when a refresh starts or ends.
 */

import type { ReactLike } from './api.ts'
import { PREFIX } from './styles.ts'

/** How long a run must last before the animation drops to one frame per step. */
const LONG_RUNNING_MS = 10000

/** The pause `done()` keeps before the bar is cleared. */
const DONE_MS = 200

/** Props of the progress bar. */
export interface ProgressProps {
  /** Whether a refresh is running; the panel owns this. */
  readonly active: boolean
}

/** Where one run sits: hidden, sweeping, or fading out. */
type Phase = 'off' | 'active' | 'done'

/**
 * Build the progress bar.
 * @param React - the loader's React.
 * @returns the component the panel draws above its header.
 */
export function makeProgress(React: ReactLike): (props: ProgressProps) => unknown {
  return function Progress(props: ProgressProps): unknown {
    const [phase, setPhase] = React.useState<Phase>(props.active ? 'active' : 'off')
    const [longRunning, setLongRunning] = React.useState(false)
    // An effect sees only the prop's new value, so this cell remembers whether
    // the run being left was one the bar had actually started drawing.
    const [flow] = React.useState<{ running: boolean }>({ running: props.active })

    React.useEffect(() => {
      if (!props.active) {
        if (!flow.running) return undefined
        flow.running = false
        setPhase('done')
        const cleared = setTimeout(() => {
          setPhase('off')
          setLongRunning(false)
        }, DONE_MS)
        return () => { clearTimeout(cleared) }
      }
      flow.running = true
      setPhase('active')
      setLongRunning(false)
      const slow = setTimeout(() => { setLongRunning(true) }, LONG_RUNNING_MS)
      return () => { clearTimeout(slow) }
    }, [props.active])

    const sweeping = phase !== 'off'
    return React.createElement('div', {
      className: `${PREFIX}-progress`,
      'data-git-progress': '',
      'data-active': sweeping ? '' : undefined,
      'data-infinite': sweeping ? '' : undefined,
      'data-long-running': sweeping && longRunning ? '' : undefined,
      'data-done': phase === 'done' ? '' : undefined,
      'aria-hidden': 'true',
    },
    React.createElement('div', {
      className: `${PREFIX}-progress-bit`,
      'data-git-progress-bit': '',
      // VS Code fades the bit in place on `done()` rather than stopping the
      // animation, so the bar's last frame is what dims out.
      style: { opacity: phase === 'done' ? 0 : 1 },
    }))
  }
}
