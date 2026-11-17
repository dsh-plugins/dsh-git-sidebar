/**
 * The Monaco diff editor behind one diff tab.
 *
 * dsh-monaco publishes the client service `monacoEditor`: a ready promise and
 * the loaded Monaco namespace. This module builds one read-only diff editor
 * over that namespace and owns everything the service does not: the two
 * documents, the responsive side-by-side switch, and the per-hunk actions that
 * stage, unstage, or roll back one block.
 *
 * Two layouts, because a narrow Sidebar tab cannot show two panes:
 *
 * - wide enough for two panes, the editor renders side by side, and the action
 *   pair floats on the seam between them at the hunk's first line;
 * - otherwise it renders inline, and the action row sits in the line-number
 *   margin above the block, where the reader's eye already is.
 *
 * Both placements are anchored by the hunk's `@@ … +start,count @@` header, so
 * the position handed to the Host is the block Git reported, not a re-diffed
 * approximation of it.
 * @module git-sidebar/diff-monaco
 */

import type { Translate } from './api.ts'
import type { DiffHunk } from '../shared.ts'
import { parseHunkHeader } from './diff-parse.ts'
import type { DiffSide } from './hunk-controls.ts'
import { ICONS, VIEW_BOX, type IconName } from './icons.ts'
import { languageForPath } from './language-match.ts'

/** The language declaration Monaco reports for one language. */
export interface MonacoLanguageLike {
  readonly id: string
  readonly extensions?: readonly string[]
  readonly filenames?: readonly string[]
  readonly filenamePatterns?: readonly string[]
}

/** A document identity the diff editor accepts. */
export interface MonacoUriLike {
  toString(): string
}

/** One text document. */
export interface MonacoModelLike {
  getLineCount(): number
  dispose(): void
}

/** One view zone change set. */
export interface MonacoViewZoneAccessorLike {
  addZone(zone: MonacoViewZoneLike): string
  removeZone(id: string): void
}

/** One zone inserted between two lines. */
export interface MonacoViewZoneLike {
  afterLineNumber: number
  heightInPx: number
  domNode: HTMLElement
  suppressMouseDown?: boolean
}

/** One pane of the diff editor. */
export interface MonacoCodeEditorLike {
  getDomNode(): HTMLElement
  getScrollTop(): number
  getTopForLineNumber(line: number): number
  getModel(): MonacoModelLike | null
  onDidScrollChange(listener: () => void): { dispose(): void }
  onDidLayoutChange(listener: () => void): { dispose(): void }
  changeViewZones(callback: (accessor: MonacoViewZoneAccessorLike) => void): void
  layout(dimension: { readonly width: number; readonly height: number }): void
  updateOptions(options: Record<string, unknown>): void
}

/** The options this module sets on the diff editor. */
export interface MonacoDiffEditorOptions {
  readonly readOnly: boolean
  readonly originalEditable: boolean
  readonly renderSideBySide: boolean
  readonly useInlineViewWhenSpaceIsLimited: boolean
  readonly renderOverviewRuler: boolean
  readonly renderMarginRevertIcon: boolean
  readonly renderIndicators: boolean
  readonly glyphMargin: boolean
  readonly scrollBeyondLastLine: boolean
  readonly diffWordWrap: 'off' | 'on' | 'inherit'
  readonly automaticLayout: boolean
  readonly fontFamily: string
  readonly fontSize?: number
  readonly ariaLabel: string
}

/** The diff editor itself. */
export interface MonacoDiffEditorLike {
  setModel(model: { readonly original: MonacoModelLike; readonly modified: MonacoModelLike }): void
  getOriginalEditor(): MonacoCodeEditorLike
  getModifiedEditor(): MonacoCodeEditorLike
  onDidUpdateDiff(listener: () => void): { dispose(): void }
  updateOptions(options: Record<string, unknown>): void
  layout(dimension: { readonly width: number; readonly height: number }): void
  dispose(): void
}

/** The share of the Monaco namespace this module calls. */
export interface MonacoApiLike {
  readonly editor: {
    createDiffEditor(container: HTMLElement, options: MonacoDiffEditorOptions): MonacoDiffEditorLike
    createModel(value: string, language: string | undefined, uri: MonacoUriLike): MonacoModelLike
  }
  readonly languages: {
    getLanguages(): readonly MonacoLanguageLike[]
  }
  readonly Uri: {
    parse(value: string): MonacoUriLike
  }
}

/**
 * The `monacoEditor` service dsh-monaco provides.
 *
 * Only the members this module uses are declared; the service itself is read
 * through `ctx.get`, so an installation without dsh-monaco simply has none.
 */
export interface MonacoEditorFace {
  readonly version: number
  readonly ready: Promise<void>
  readonly monaco: MonacoApiLike | undefined
}

/** The code font DSH's appearance settings produce. */
export interface CodeFont {
  /** A real font-family list, already resolved by the browser. */
  readonly family: string
  readonly size?: number
}

/** How the editor lays two documents out. */
export type DiffMode = 'side' | 'inline'

/** The hooks the editor view calls; the loader's React provides all of them. */
export interface MonacoHookSurface {
  useState<T>(initial: T): [T, (value: T | ((previous: T) => T)) => void]
  useEffect(effect: () => (() => void) | void, dependencies: readonly unknown[]): void
}

/** What the React surface needs; the loader's React provides all of it. */
export interface MonacoReactSurface extends MonacoHookSurface {
  createElement(type: unknown, props?: unknown, ...children: unknown[]): unknown
  useRef<T>(initial: T): { current: T }
}

/** Props of the rendered diff editor. */
export interface MonacoDiffProps {
  readonly api: MonacoApiLike
  /** Repository-relative path, used for the language and the document names. */
  readonly path: string
  readonly oldText: string
  readonly newText: string
  /** Hunks of the patch the Host rendered, which is what the actions act on. */
  readonly hunks: readonly DiffHunk[]
  readonly side: DiffSide
  readonly busy: boolean
  readonly t: Translate
  /** Move one block into the index, or out of it. */
  readonly move: (hunk: number, region: number, direction: 'stage' | 'unstage') => void
  /** Roll one block of the working tree back out of the file. */
  readonly discard?: (hunk: number, region: number) => void
  /** Subscribe to appearance changes, so a new code font reaches both panes. */
  readonly onThemeChange?: (listener: () => void) => () => void
}

/**
 * One changed block's place in the patch and in the modified document.
 *
 * A block is Git's hunk split where its context lines break it, which is the
 * granularity VS Code's own change actions use.
 */
interface BlockAnchor {
  /** The hunk's position in the file's patch. */
  readonly hunk: number
  /** The block's position inside that hunk. */
  readonly region: number
  /** First modified line the block occupies; for a pure deletion, the line after it. */
  readonly line: number
  /** Modified lines the block covers. */
  readonly added: number
  /** Original lines the block removes, which a pure deletion draws as space above its anchor. */
  readonly removed: number
}

/** The state one placement pass needs. */
interface WidgetConfig {
  readonly mode: DiffMode
  readonly hunks: readonly DiffHunk[]
  readonly side: DiffSide
  readonly busy: boolean
  readonly t: Translate
  readonly move: (hunk: number, region: number, direction: 'stage' | 'unstage') => void
  readonly discard?: (hunk: number, region: number) => void
}

/** The live editor, its widgets, and the operations the component drives. */
interface DiffEngine {
  resize(width: number, height: number): void
  update(config: WidgetConfig): void
  reposition(): void
  updateFont(font: CodeFont): void
  dispose(): void
}

/** Narrower than this, two panes would leave too little text on each side. */
const SIDE_BY_SIDE_MIN_WIDTH = 640

/** Side of one action icon, which is also the width the gutter column reserves. */
const ACTION_SIZE = 16

/** Glyph size inside one action button. */
const ACTION_ICON = 13

/** Gap between the two icons of one stack. */
const STACK_GAP = 1

/** Line height assumed before the panes have one to measure. */
const LINE_HEIGHT_FALLBACK = 20

/** Fallback code font when the appearance variables are not on the page. */
const FONT_FALLBACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

/** Appearance variables the editor follows. */
const CODE_FAMILY = '--ds-font-family-code'

/** Platform font stack, used when the code font variable is not declared. */
const CODE_FAMILY_FALLBACK = '--dsw-font-family'

/** Code font size taken from the appearance settings. */
const CODE_SIZE = '--dsh-code-font-size'

/** SVG namespace every inline glyph is built in. */
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

/** Keeps two models of the same path from sharing one URI. */
let modelStamp = 0

/**
 * Read the code font DSH's appearance settings produce.
 *
 * The declared value is usually another variable or a composed stack, and
 * Monaco wants a resolved font list, so the value is handed to a temporary
 * element and read back from the browser's own computed style.
 * @returns the font family list and, when it resolves, the size in pixels.
 */
export function readCodeFont(): CodeFont {
  const family = resolvedFamily(CODE_FAMILY) ?? resolvedFamily(CODE_FAMILY_FALLBACK) ?? FONT_FALLBACK
  const host = document.body ?? document.documentElement
  const raw = host === null ? '' : getComputedStyle(host).getPropertyValue(CODE_SIZE).trim()
  const size = raw === '' ? Number.NaN : Number.parseFloat(raw)
  return Number.isFinite(size) && size > 0 ? { family, size } : { family }
}

/**
 * Resolve one CSS variable to the font list the browser computed for it.
 * @param variable - the variable name, leading `--` included.
 * @returns the resolved list, or undefined when the page does not declare it.
 */
function resolvedFamily(variable: string): string | undefined {
  const host = document.body ?? document.documentElement
  if (host === null) return undefined
  const probe = document.createElement('span')
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  probe.style.pointerEvents = 'none'
  probe.style.setProperty('font-family', `var(${variable}, 'dsh-git-sidebar-missing-font')`)
  host.appendChild(probe)
  try {
    const value = getComputedStyle(probe).fontFamily?.trim() ?? ''
    if (value.length === 0) return undefined
    if (value.replace(/\s+/gu, '').toLowerCase().includes('dsh-git-sidebar-missing-font')) return undefined
    return value
  } finally {
    probe.remove()
  }
}

/**
 * Pick the language a path belongs to.
 * @param api - the Monaco namespace, which carries the declared languages.
 * @param path - repository-relative path.
 * @returns the language id, or `plaintext` when nothing claims the file.
 */
function languageIdFor(api: MonacoApiLike, path: string): string {
  return languageForPath(api.languages.getLanguages(), path) ?? 'plaintext'
}

/**
 * Compose a document identity no other editor shares.
 * @param api - the Monaco namespace.
 * @param path - the file the document describes.
 * @param side - which side of the change it is.
 * @returns the URI to create the model with.
 */
function modelUri(api: MonacoApiLike, path: string, side: 'old' | 'new'): MonacoUriLike {
  modelStamp += 1
  const name = path.replaceAll('\\', '/').split('/').pop() ?? 'file'
  return api.Uri.parse(`inmemory://git-diff/${side}/${modelStamp}/${encodeURIComponent(name)}`)
}

/**
 * Build the editor options one mount needs.
 * @param mode - how the two panes are laid out.
 * @param font - the resolved code font.
 * @param label - the accessible name of the editor.
 * @returns the options to construct the editor with.
 */
function constructionOptions(mode: DiffMode, font: CodeFont, label: string): MonacoDiffEditorOptions {
  return {
    readOnly: true,
    originalEditable: false,
    renderSideBySide: mode === 'side',
    // The width this plugin decides the layout with is the same one Monaco
    // would otherwise decide for itself; leaving its own breakpoint on would
    // make the two disagree in the 640–900px range.
    useInlineViewWhenSpaceIsLimited: false,
    renderOverviewRuler: false,
    renderMarginRevertIcon: false,
    renderIndicators: true,
    // The action stack lives in the glyph margin, left of the line numbers, the
    // same column VS Code reserves for a change's actions.
    glyphMargin: true,
    scrollBeyondLastLine: false,
    diffWordWrap: 'off',
    automaticLayout: false,
    fontFamily: font.family,
    ...font.size === undefined ? {} : { fontSize: font.size },
    ariaLabel: label,
  }
}

/**
 * Split the hunks the Host rendered into the blocks the actions act on.
 *
 * Git puts every change within three lines of context into one hunk, so one
 * hunk can hold several separate changes. Those blocks are the unit VS Code's
 * own change actions work on, and splitting here keeps a reader's click on one
 * block from moving its neighbour.
 * @param hunks - the patch's hunks, in order.
 * @returns one anchor per changed block, in patch order.
 */
function blocksOf(hunks: readonly DiffHunk[]): BlockAnchor[] {
  const blocks: BlockAnchor[] = []
  for (let hunk = 0; hunk < hunks.length; hunk += 1) {
    const entry = hunks[hunk]
    if (entry === undefined) continue
    const range = parseHunkHeader(entry.header)
    if (range === undefined) continue
    let line = Math.max(range.newStart, 1)
    let region = -1
    let block: { line: number; added: number; removed: number } | undefined
    for (const inner of entry.lines) {
      if (inner.kind === 'context') {
        if (block !== undefined) {
          blocks.push({ hunk, region, ...block })
          block = undefined
        }
        line += 1
        continue
      }
      if (block === undefined) {
        region += 1
        block = { line, added: 0, removed: 0 }
      }
      if (inner.kind === 'added') {
        block.added += 1
        line += 1
      } else {
        block.removed += 1
      }
    }
    if (block !== undefined) blocks.push({ hunk, region, ...block })
  }
  return blocks
}

/**
 * Create the live editor and its widget layer.
 * @param api - the Monaco namespace.
 * @param host - the element the editor fills.
 * @param path - the file being compared.
 * @param texts - the two documents.
 * @param prefix - the class prefix of the diff viewer.
 * @param mode - the layout to start in.
 * @param font - the resolved code font.
 * @param label - the accessible name of the editor.
 * @returns the engine the component drives.
 */
function createEngine(
  api: MonacoApiLike,
  host: HTMLElement,
  path: string,
  texts: { readonly oldText: string; readonly newText: string },
  prefix: string,
  mode: DiffMode,
  font: CodeFont,
  label: string,
): DiffEngine {
  const language = languageIdFor(api, path)
  const editor = api.editor.createDiffEditor(host, constructionOptions(mode, font, label))
  const original = api.editor.createModel(texts.oldText, language, modelUri(api, path, 'old'))
  const modifiedModel = api.editor.createModel(texts.newText, language, modelUri(api, path, 'new'))
  editor.setModel({ original, modified: modifiedModel })
  const modifiedEditor = editor.getModifiedEditor()
  const layer = document.createElement('div')
  layer.className = `${prefix}-monaco-actions`
  host.appendChild(layer)
  const tags = new Map<string, HTMLDivElement>()
  let current: WidgetConfig | undefined
  let layout: DiffMode = mode
  let codeFont = font

  /** The model's last line, which is where the gutter's arithmetic stops. */
  const lastLine = (): number => modifiedEditor.getModel()?.getLineCount() ?? 1

  /** Drop every widget of the previous placement. */
  const clearWidgets = (): void => {
    for (const node of tags.values()) node.remove()
    tags.clear()
  }

  /**
   * The line height the panes are laid out with.
   *
   * View zones make two arbitrary line tops differ by more than one line, so the
   * smallest gap over the first lines is the one every other gap is built on.
   * @returns the measured line height, or the editor default when nothing could be measured.
   */
  const measureLineHeight = (): number => {
    const last = lastLine()
    let smallest = Number.POSITIVE_INFINITY
    for (let line = 1; line < Math.min(last, 20); line += 1) {
      const gap = modifiedEditor.getTopForLineNumber(line + 1) - modifiedEditor.getTopForLineNumber(line)
      if (gap > 0 && gap < smallest) smallest = gap
    }
    return Number.isFinite(smallest) ? smallest : LINE_HEIGHT_FALLBACK
  }

  /**
   * Place one tagged block per changed run in the gutter column.
   *
   * The column is where VS Code puts a change's actions: left of the line
   * numbers. Side by side that is the modified pane's gutter, which is the seam
   * between the two panes; inline, the modified pane sits after the collapsed
   * original one, so the tag moves to the host's left edge and the original
   * pane's numbers line up behind it. Each block draws the rule that shows how
   * tall it is, with its actions centred on that rule.
   * @param config - the hunks and the actions they carry.
   */
  const placeGutter = (config: WidgetConfig): void => {
    const hostRect = host.getBoundingClientRect()
    const anchored = layout === 'side' ? modifiedEditor : editor.getOriginalEditor()
    const left = anchored.getDomNode().getBoundingClientRect().left - hostRect.left
    const viewTop = modifiedEditor.getDomNode().getBoundingClientRect().top - hostRect.top
    const scroll = modifiedEditor.getScrollTop()
    const lineHeight = measureLineHeight()
    const last = lastLine()
    const topOf = (line: number): number => {
      const at = Math.min(Math.max(line, 1), last)
      return modifiedEditor.getTopForLineNumber(at) + (line > last ? lineHeight : 0)
    }
    const wanted = new Set<string>()
    for (const block of blocksOf(config.hunks)) {
      const key = `${block.hunk}:${block.region}`
      wanted.add(key)
      let node = tags.get(key)
      if (node === undefined) {
        node = blockTag(prefix, config, block)
        tags.set(key, node)
        layer.appendChild(node)
      }
      const start = topOf(block.line)
      let blockTop: number
      let height: number
      if (block.added > 0) {
        blockTop = start
        height = Math.max(topOf(block.line + block.added) - start, lineHeight)
      } else {
        // A block with no new lines is drawn by the pane as filler where the
        // lines were removed, which is exactly the space above its anchor.
        height = Math.max(block.removed * lineHeight, lineHeight)
        blockTop = Math.max(start - height, 0)
        height = Math.max(start - blockTop, lineHeight)
      }
      const top = viewTop + blockTop - scroll
      if (top + height < 0 || top > hostRect.height) {
        node.style.display = 'none'
        continue
      }
      node.style.display = ''
      node.style.height = `${height}px`
      node.style.transform = `translate(${left}px, ${top}px)`
    }
    for (const [key, node] of tags) {
      if (wanted.has(key)) continue
      node.remove()
      tags.delete(key)
    }
  }

  /**
   * What a widget set is drawn from, besides the callbacks that build it.
   *
   * A re-render hands over fresh closures every time, but the widgets only have
   * to be rebuilt when what they show changes; comparing this keeps a plain
   * re-render from tearing the stacks down.
   * @param config - the configuration a placement pass uses.
   * @returns a string that changes exactly when the drawn widgets must.
   */
  const signatureOf = (config: WidgetConfig): string => [
    config.side, config.busy, config.t('hunk.stage'), config.t('hunk.unstage'), config.t('hunk.discard'),
    config.hunks.map(hunk => hunk.header).join('~'),
  ].join('|')

  let signature = ''

  const disposeScroll = modifiedEditor.onDidScrollChange(() => {
    if (current !== undefined) placeGutter(current)
  })
  const disposeLayout = modifiedEditor.onDidLayoutChange(() => {
    if (current !== undefined) placeGutter(current)
  })
  const disposeDiff = editor.onDidUpdateDiff(() => {
    if (current !== undefined) placeGutter(current)
  })

  return {
    resize(width: number, height: number): void {
      if (width === 0 || height === 0) return
      editor.layout({ width, height })
      if (current !== undefined) placeGutter(current)
    },
    update(config: WidgetConfig): void {
      current = config
      if (config.mode !== layout) {
        layout = config.mode
        editor.updateOptions({ renderSideBySide: layout === 'side' })
        editor.layout({ width: host.clientWidth, height: host.clientHeight })
      }
      const next = signatureOf(config)
      if (next !== signature) {
        signature = next
        clearWidgets()
      }
      placeGutter(config)
    },
    reposition(): void {
      if (current !== undefined) placeGutter(current)
    },
    updateFont(next: CodeFont): void {
      codeFont = next
      editor.updateOptions({ fontFamily: codeFont.family, ...codeFont.size === undefined ? {} : { fontSize: codeFont.size } })
    },
    dispose(): void {
      disposeScroll.dispose()
      disposeLayout.dispose()
      disposeDiff.dispose()
      clearWidgets()
      layer.remove()
      // The editor first: it holds the models, and disposing them under a live
      // editor leaves the pane painting a model that no longer exists.
      editor.dispose()
      original.dispose()
      modifiedModel.dispose()
    },
  }
}

/**
 * Build the tag of one changed block: its height rule and its actions.
 *
 * The rule spans the block, so a reader can see which lines one action covers,
 * and the buttons sit centred on it — the arrangement VS Code draws in the same
 * column.
 * @param prefix - the class prefix of the diff viewer.
 * @param config - the actions and their copy.
 * @param block - the block the tag belongs to.
 * @returns the element to position in the gutter.
 */
function blockTag(prefix: string, config: WidgetConfig, block: BlockAnchor): HTMLDivElement {
  const node = document.createElement('div')
  node.className = `${prefix}-monaco-block`
  node.dataset.gitHunk = String(block.hunk)
  node.dataset.gitRegion = String(block.region)
  const rule = document.createElement('span')
  rule.className = `${prefix}-monaco-rule`
  node.appendChild(rule)
  const stack = document.createElement('span')
  stack.className = `${prefix}-monaco-stack`
  for (const button of actionsOf(prefix, config, block)) stack.appendChild(button)
  node.appendChild(stack)
  return node
}

/**
 * Build the buttons one block offers on this side of the index.
 * @param prefix - the class prefix of the diff viewer.
 * @param config - the actions and their copy.
 * @param block - the block the buttons act on.
 * @returns the buttons in stack order; empty for a commit.
 */
function actionsOf(prefix: string, config: WidgetConfig, block: BlockAnchor): HTMLButtonElement[] {
  if (config.side === 'commit') return []
  if (config.side === 'staged') {
    return [actionButton(prefix, config, block, 'unstage', config.t('hunk.unstage'))]
  }
  const buttons = [actionButton(prefix, config, block, 'stage', config.t('hunk.stage'))]
  if (config.discard !== undefined) {
    // The rollback sits on top, the way VS Code orders revert over stage.
    buttons.unshift(actionButton(prefix, config, block, 'discard', config.t('hunk.discard')))
  }
  return buttons
}

/**
 * Build one action button.
 *
 * The explanation is the button's `title`: the platform draws tooltips itself,
 * and a second bubble drawn by this stylesheet would stack on top of it.
 * @param prefix - the class prefix of the diff viewer.
 * @param config - the actions and their copy.
 * @param block - the block the button acts on.
 * @param action - which action it performs.
 * @param label - its accessible name and tooltip.
 * @returns the button element.
 */
function actionButton(
  prefix: string,
  config: WidgetConfig,
  block: BlockAnchor,
  action: 'stage' | 'unstage' | 'discard',
  label: string,
): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `${prefix}-monaco-action`
  button.dataset.gitHunkAction = action
  button.dataset.gitHunk = String(block.hunk)
  button.dataset.gitRegion = String(block.region)
  button.disabled = config.busy
  button.title = label
  button.setAttribute('aria-label', label)
  button.appendChild(glyph(action === 'discard' ? 'undo' : action))
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (action === 'discard') config.discard?.(block.hunk, block.region)
    else config.move(block.hunk, block.region, action)
  })
  return button
}

/**
 * Build one inline glyph.
 * @param name - which glyph to draw.
 * @returns the SVG element.
 */
function glyph(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg')
  svg.setAttribute('viewBox', VIEW_BOX)
  svg.setAttribute('width', String(ACTION_ICON))
  svg.setAttribute('height', String(ACTION_ICON))
  svg.setAttribute('fill', 'currentColor')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  const path = document.createElementNS(SVG_NAMESPACE, 'path')
  path.setAttribute('d', ICONS[name])
  svg.appendChild(path)
  return svg
}

/** Where the editor namespace stands: loading, usable, or not coming. */
export type MonacoApiState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly api: MonacoApiLike }
  | { readonly status: 'failed' }

/**
 * Resolve the editor namespace once per mount.
 *
 * The namespace lives behind dsh-monaco's ready promise, so the first render of
 * a tab has none. A tab draws the patch until the promise settles; a failure is
 * a real state rather than an endless wait, because a broken editor must not
 * hold a diff hostage.
 * @param R - the loader's React hooks.
 * @param resolve - the namespace loader; pass the same reference every render.
 * @returns the current state of the namespace.
 */
export function useMonacoApiState(
  R: MonacoHookSurface,
  resolve: () => Promise<MonacoApiLike | undefined>,
): MonacoApiState {
  const [state, setState] = R.useState<MonacoApiState>({ status: 'loading' })
  R.useEffect((): (() => void) => {
    let live = true
    void resolve().then((api) => {
      if (!live) return
      setState(api === undefined ? { status: 'failed' } : { status: 'ready', api })
    }, (error: unknown) => {
      console.warn('git-sidebar: the diff editor namespace failed to resolve (%s); diffs stay textual',
        error instanceof Error ? error.message : String(error))
      if (live) setState({ status: 'failed' })
    })
    return () => { live = false }
  }, [resolve])
  return state
}

/**
 * Describe one placement pass from the props on screen.
 * @param props - the documents and the actions they carry.
 * @param mode - how the panes are laid out right now.
 * @returns the configuration the engine places widgets from.
 */
function widgetConfig(props: MonacoDiffProps, mode: DiffMode): WidgetConfig {
  return {
    mode,
    hunks: props.hunks,
    side: props.side,
    busy: props.busy,
    t: props.t,
    ...props.discard === undefined ? {} : { discard: props.discard },
    move: props.move,
  }
}

/**
 * Build the component that holds one Monaco diff editor.
 * @param React - the loader's React.
 * @param prefix - the class prefix of the diff viewer.
 * @returns a component taking the documents and the hunk actions.
 */
export function makeMonacoDiffView(React: unknown, prefix: string): (props: MonacoDiffProps) => unknown {
  const R = React as MonacoReactSurface
  return function MonacoDiffView(props: MonacoDiffProps): unknown {
    const hostRef = R.useRef<HTMLDivElement | null>(null)
    const engineRef = R.useRef<DiffEngine | null>(null)
    const [mode, setMode] = R.useState<DiffMode>('inline')
    const [broken, setBroken] = R.useState(false)
    const configRef = R.useRef<WidgetConfig>(widgetConfig(props, 'inline'))

    // The editor itself: rebuilt only when the documents it compares change.
    // A reused tab body can be handed a different file, so the new engine is
    // given the current configuration at once — its update effect has already
    // run for this render and would not run again for the new documents.
    R.useEffect((): (() => void) | void => {
      const host = hostRef.current
      if (host === null) return
      let engine: DiffEngine
      try {
        engine = createEngine(props.api, host, props.path, props, prefix, mode,
          readCodeFont(), props.t('editor.label'))
      } catch (error) {
        // A failed construction is stated inside the pane rather than thrown at
        // the slot entry, which would take the whole tab down with it.
        console.warn('git-sidebar: the Monaco diff editor could not be created (%s)',
          error instanceof Error ? error.message : String(error))
        setBroken(true)
        return
      }
      engineRef.current = engine
      const config = widgetConfig(props, mode)
      configRef.current = config
      engine.update(config)
      const observer = new ResizeObserver(() => {
        const width = host.clientWidth
        const height = host.clientHeight
        if (width === 0 || height === 0) return
        engine.resize(width, height)
        const next: DiffMode = width >= SIDE_BY_SIDE_MIN_WIDTH ? 'side' : 'inline'
        setMode((previous) => (previous === next ? previous : next))
      })
      observer.observe(host)
      return () => {
        observer.disconnect()
        engine.dispose()
        engineRef.current = null
      }
    }, [props.api, props.path, props.oldText, props.newText])

    // Layout and widget updates: everything that changes without a new document.
    R.useEffect((): void => {
      const config = widgetConfig(props, mode)
      configRef.current = config
      engineRef.current?.update(config)
    }, [mode, props.hunks, props.side, props.busy, props.t, props.move, props.discard])

    R.useEffect((): (() => void) | void => {
      if (props.onThemeChange === undefined) return
      return props.onThemeChange(() => { engineRef.current?.updateFont(readCodeFont()) })
    }, [props.onThemeChange])

    if (broken) {
      return R.createElement('div', { className: `${prefix}-note`, role: 'status' },
        R.createElement('p', { className: `${prefix}-line-note` }, props.t('editor.unavailable')),
      )
    }
    return R.createElement('div', { className: `${prefix}-monaco`, ref: hostRef })
  }
}
