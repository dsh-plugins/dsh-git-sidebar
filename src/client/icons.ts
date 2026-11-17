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

/** The share of the loader's React an icon needs: one `createElement`. */
export interface IconReactSurface {
  createElement(type: unknown, props?: unknown, ...children: unknown[]): unknown
}

/** Material Symbols grid the paths below are authored on. */
export const VIEW_BOX = '0 -960 960 960'

/**
 * The panel's glyphs, keyed by what they mean rather than by their Material
 * name: refresh, stage (add), unstage (undo), discard (delete), diff, and the
 * marks the P1 surfaces added — more, chevron, expand, check, stash, apply,
 * pop, sync, pull, and push.
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
  more: 'M240-400q-33 0-56.5-23.5T160-480q0-33 23.5-56.5T240-560q33 0 56.5 23.5T320-480q0 33-23.5 56.5T240-400Z'
    + 'm240 0q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Z'
    + 'm240 0q-33 0-56.5-23.5T640-480q0-33 23.5-56.5T720-560q33 0 56.5 23.5T800-480q0 33-23.5 56.5T720-400Z',
  chevron: 'M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z',
  expand: 'M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z',
  check: 'M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z',
  eye: 'M480-320q75 0 127.5-52.5T660-500q0-75-52.5-127.5T480-680q-75 0-127.5 52.5T300-500q0 75 52.5 127.5T480-320Z'
    + 'm0-72q-45 0-76.5-31.5T372-500q0-45 31.5-76.5T480-608q45 0 76.5 31.5T588-500q0 45-31.5 76.5T480-392Zm0 192q-146'
    + ' 0-266-81.5T40-500q54-137 174-218.5T480-800q146 0 266 81.5T920-500q-54 137-174 218.5T480-200Z',
  undo: 'M280-200v-80h284q63 0 109.5-40T720-420q0-60-46.5-100T564-560H312l104 104-56 56-200-200 200-200 56 56-104'
    + ' 104h252q97 0 166.5 63T800-420q0 94-69.5 157T564-200H280Z',
  spark: 'M480-80 373-240H160v-213L0-560l160-107v-213h213L480-1040l107 160h213v213l160 107-160 107v213H587L480-80Z'
    + 'm0-108 86-127h174v-174l127-86-127-86v-174H546l-86-127-86 127H200v174l-127 86 127 86v174h174l86 127Z',
  clock: 'M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880'
    + 'q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227'
    + '-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm40-120v-200H360v80h80v120h80Z',
  stash: 'm480-240 160-160-56-56-64 64v-168h-80v168l-64-64-56 56 160 160ZM200-640v440h560v-440H200Zm0 520q-33 0-56.5'
    + '-23.5T120-200v-499q0-14 4.5-27t13.5-24l50-61q11-14 27.5-21.5T250-840h460q18 0 34.5 7.5T772-811l50 61q9'
    + ' 11 13.5 24t4.5 27v499q0 33-23.5 56.5T760-120H200Zm16-600h528l-34-40H250l-34 40Zm264 300Z',
  apply: 'M480-560 320-400l56 56 64-64v168h80v-168l64 64 56-56-160-160Zm-280-80v440h560v-440H200Zm0 520q-33 0-56.5'
    + '-23.5T120-200v-499q0-14 4.5-27t13.5-24l50-61q11-14 27.5-21.5T250-840h460q18 0 34.5 7.5T772-811l50 61q9'
    + ' 11 13.5 24t4.5 27v499q0 33-23.5 56.5T760-120H200Zm16-600h528l-34-40H250l-34 40Zm264 300Z',
  pop: 'M440-320h80v-166l64 62 56-56-160-160-160 160 56 56 64-62v166ZM280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200'
    + 'v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520Zm-400 0v520-520Z',
  sync: 'M160-160v-80h110l-16-14q-52-46-73-105t-21-119q0-111 66.5-197.5T400-790v84q-72 26-116 88.5T240-478q0 45 17'
    + ' 87.5t53 78.5l10 10v-98h80v240H160Zm400-10v-84q72-26 116-88.5T720-482q0-45-17-87.5T650-648l-10-10v98h-80'
    + 'v-240h240v80H690l16 14q49 49 71.5 106.5T800-482q0 111-66.5 197.5T560-170Z',
  pull: 'M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80'
    + 'v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z',
  push: 'M440-320v-326L336-542l-56-58 200-200 200 200-56 58-104-104v326h-80ZM240-160q-33 0-56.5-23.5T160-240v-120h80'
    + 'v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z',
  merge: 'M160-292q-39 0-66.5-27.5T66-386q0-39 27.5-66.5T160-480q22 0 41.5 9.5T233-444q30-16 51-42t33-60q-25-14-40'
    + '-39t-15-55q0-39 27.5-66.5T356-734q39 0 66.5 27.5T450-640q0 22-9.5 41.5T414-567q16 30 42 51t60 33q14-25 39-40t'
    + '55-15q39 0 66.5 27.5T704-444q0 39-27.5 66.5T610-350q-22 0-41.5-9.5T529-392q-30 16-51 42t-33 60q25 14 40 39t'
    + '15 55q0 39-27.5 66.5T356-102q-39 0-66.5-27.5T262-196q0-22 9.5-41.5T302-274q-16-30-42-51t-60-33q-14 25-39 40t-55'
    + ' 15Z',
  repo: 'M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33'
    + '-23.5 56.5T800-160H160Zm0-80h640v-400H447l-80-80H160v480Zm0 0v-480 480Z',
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
export function Icon(React: IconReactSurface, name: IconName, props: { size?: number; label?: string } = {}): unknown {
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
 * One gradient of the Start-page mark, on the mark's own 36-unit coordinates.
 * @param React - the loader's React.
 * @param id - gradient id, referenced by the shape that paints with it.
 * @param from - top or left stop colour.
 * @param to - bottom or right stop colour.
 * @param axis - start and end points of the ramp.
 * @returns the `linearGradient` element.
 */
function markGradient(
  React: IconReactSurface,
  id: string,
  from: string,
  to: string,
  axis: readonly [number, number, number, number],
): unknown {
  const [x1, y1, x2, y2] = axis
  return React.createElement('linearGradient', { id, x1, y1, x2, y2, gradientUnits: 'userSpaceOnUse' },
    React.createElement('stop', { stopColor: from }),
    React.createElement('stop', { offset: 1, stopColor: to }))
}

/**
 * Draw the plugin's Start-page mark: a two-line Git fork with commit nodes.
 *
 * Geometry and colours match `icon.svg`, which Plugin Manager shows in its own
 * rows, so the Start-page button and the plugin inventory draw the same mark.
 * The main line's two commits sit on the light-to-deep brand blue, and the
 * branch that merges into it carries the teal accent. The ink spans roughly
 * 18×24 of the 36-unit box; at the Start page's 26px it lands near the optical
 * size of the neighbouring folder and terminal glyphs.
 * @param React - the loader's React.
 * @returns the Start-page icon component.
 */
export function GitGuideIcon(React: ReactLike): unknown {
  return function GitGuideArtwork(props: { size?: number; className?: string }): unknown {
    const size = props.size ?? 26
    // One gradient id per rendered artwork: the guide can mount in more than
    // one pane, and a shared id would blank the copies still mounted once the
    // first one unmounts.
    const unique = React.useId?.().replaceAll(':', '')
    const uid = unique === undefined ? 'git-sidebar-guide' : `git-sidebar-guide-${unique}`
    const ink = `url(#${uid}-ink)`
    return React.createElement('svg', {
      viewBox: '0 0 36 36',
      width: size,
      height: size,
      className: props.className,
      fill: 'none',
      'aria-hidden': true,
      style: { display: 'block' },
    },
    React.createElement('path', {
      d: 'M13 10V26',
      stroke: ink,
      strokeWidth: 3.4,
      strokeLinecap: 'round',
    }),
    React.createElement('path', {
      d: 'M23 10V14.6C23 17.5 20.9 19.8 17.8 19.8H14.7',
      stroke: `url(#${uid}-branch)`,
      strokeWidth: 3.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
    React.createElement('circle', { cx: 13, cy: 10, r: 3.8, fill: ink }),
    React.createElement('circle', { cx: 23, cy: 10, r: 3.8, fill: `url(#${uid}-side)` }),
    React.createElement('circle', { cx: 13, cy: 26, r: 3.8, fill: ink }),
    React.createElement('defs', null,
      markGradient(React, `${uid}-ink`, '#69B9FF', '#324DE2', [13, 6.2, 13, 29.8]),
      markGradient(React, `${uid}-branch`, '#51CFDB', '#497BEE', [23, 10, 14.7, 19.8]),
      markGradient(React, `${uid}-side`, '#51CFDB', '#108792', [19.8, 6.2, 26.2, 13.8])),
    )
  }
}
