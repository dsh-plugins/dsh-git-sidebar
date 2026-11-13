/**
 * The panel's glyphs, as Material Symbols path data.
 *
 * The shell draws its own icons from an icon package this bundle may not import,
 * so the five marks the panel needs are carried here as path data and rendered
 * inline. Nothing is fetched: no font file, no stylesheet, no network request.
 * The paths come from the Material Symbols outlined set, which draws on a
 * 960-unit grid with the origin at `0 -960` — hence the negative view box.
 */

import type { ReactLike } from './api.ts'

/** Material Symbols grid the paths below are authored on. */
const VIEW_BOX = '0 -960 960 960'

/**
 * The panel's glyphs, keyed by what they mean rather than by their Material
 * name: refresh, stage (add), unstage (undo), discard (delete), and diff.
 */
export const ICONS = {
  refresh: 'M480-160q-133 0-226.5-93.5T160-480q0-133 93.5-226.5T480-800q85 0 149 34.5T740-671v-129h60v254H546'
    + 'v-60h168q-38-60-97-97t-137-37q-109 0-184.5 75.5T220-480q0 109 75.5 184.5T480-220q83 0 152-47.5T728-393h62'
    + 'q-29 105-115 169t-195 64Z',
  stage: 'M450-450H200v-60h250v-250h60v250h250v60H510v250h-60v-250Z',
  unstage: 'M259-200v-60h310q70 0 120.5-46.5T740-422q0-69-50.5-115.5T569-584H274l114 114-42 42-186-186 186-186'
    + ' 42 42-114 114h294q95 0 163.5 64T800-422q0 94-68.5 158T568-200H259Z',
  discard: 'M261-120q-24.75 0-42.37-17.63Q201-155.25 201-180v-570h-41v-60h188v-30h264v30h188v60h-41v570q0 24-18 42'
    + 't-42 18H261Zm438-630H261v570h438v-570ZM367-266h60v-399h-60v399Zm166 0h60v-399h-60v399Z',
  diff: 'M490-526h60v-84h84v-60h-84v-84h-60v84h-84v60h84v84Zm-84 156h228v-60H406v60ZM260-160q-24 0-42-18'
    + 't-18-42v-640q0-24 18-42t42-18h348l232 232v468q0 24-18 42t-42 18H260Zm0-60h520v-442L578-860H260v640Z'
    + 'M140-40q-24 0-42-18t-18-42v-619h60v619h498v60H140Zm120-180v-640 640Z',
} as const

/** A glyph of {@link ICONS}. */
export type IconName = keyof typeof ICONS

/**
 * Draw one glyph in the current text colour.
 *
 * 20px is the panel's default action size; `currentColor` lets the button's own
 * ink decide, which is how a destructive action turns red on hover.
 * @param React - the loader's React.
 * @param name - which glyph to draw.
 * @param props - optional size override and accessible name.
 * @returns the SVG element.
 */
export function Icon(React: ReactLike, name: IconName, props: { size?: number; label?: string } = {}): unknown {
  const labelled = props.label !== undefined
  return React.createElement('svg', {
    viewBox: VIEW_BOX,
    width: props.size ?? 20,
    height: props.size ?? 20,
    fill: 'currentColor',
    focusable: false,
    ...labelled ? { role: 'img', 'aria-label': props.label } : { 'aria-hidden': true },
  }, React.createElement('path', { d: ICONS[name] }))
}

/**
 * Draw the plugin's Start-page mark: a two-line Git fork with commit nodes.
 *
 * Geometry matches `icon.svg`, which Plugin Manager shows in its own rows, so
 * the Start-page button and the plugin inventory draw the same mark. The ink
 * spans roughly 16×23 of the 36-unit box; at the Start page's 26px it lands
 * near the optical size of the neighbouring folder and terminal glyphs.
 * @param React - the loader's React.
 * @returns the Start-page icon component.
 */
export function GitGuideIcon(React: ReactLike): unknown {
  return function GitGuideArtwork(props: { size?: number; className?: string }): unknown {
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
    React.createElement('path', {
      d: 'M13 9.7v16.6',
      stroke: ink,
      strokeWidth: 2.7,
      strokeLinecap: 'round',
      fill: 'none',
    }),
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
