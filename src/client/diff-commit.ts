/**
 * A commit's diff, one file at a time, in the Monaco diff editor.
 *
 * A commit's patch spans every file it touches, while a diff editor compares
 * exactly one pair of documents. The tab therefore lists the commit's files in
 * a picker and shows the selected pair; the patch itself is only read by the
 * textual view, which this module replaces when the editor is available.
 *
 * The file list and each file's two sides are separate Host endpoints, so a
 * commit with many files costs one listing and one read of the file on screen.
 */

import type { CommitDetailArgs, CommitFile, CommitFilesPayload, CommitSidesArgs, DiffSides } from '../shared.ts'
import {
  useMonacoApiState, type MonacoApiLike, type MonacoApiState, type MonacoDiffProps, type MonacoHookSurface,
} from './diff-monaco.ts'

/** The share of the loader's React this module calls. */
export interface CommitReactSurface extends MonacoHookSurface {
  createElement(type: unknown, props?: unknown, ...children: unknown[]): unknown
}

/** What the commit body reads and draws with. */
export interface CommitEditorRuntime {
  /** The commit's files. */
  readonly requestFiles: (args: CommitDetailArgs, signal?: AbortSignal) => Promise<CommitFilesPayload>
  /** One file's two sides inside the commit. */
  readonly requestSides: (args: CommitSidesArgs, signal?: AbortSignal) => Promise<DiffSides>
  /** The Monaco diff editor component. */
  readonly diffView: (props: MonacoDiffProps) => unknown
  /** The loader for the Monaco namespace; pass the same reference every render. */
  readonly resolveApi: () => Promise<MonacoApiLike | undefined>
  readonly t: (key: string) => string
  readonly onThemeChange?: (listener: () => void) => () => void
}

/** What the diff tab hands the commit body. */
export interface CommitBodyProps {
  /** The Session whose checkout holds the commit. */
  readonly sessionId?: string
  /** The commit's object name. */
  readonly sha: string
  /** Navigation revision, which makes a repeat open read again. */
  readonly revision: number
  /** Aborted when the tab record disappears. */
  readonly signal?: AbortSignal
  /** Translate one copy key of the diff namespace. */
  readonly t: (key: string) => string
}

/** The files the picker offers, or the reason there are none. */
type FilesState =
  | { readonly status: 'loading' }
  | { readonly status: 'files'; readonly files: readonly CommitFile[]; readonly merge: boolean }
  | { readonly status: 'failed'; readonly message: string }

/** The selected file's two sides. */
type SidesState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly sides: DiffSides }
  | { readonly status: 'failed'; readonly message: string }

/** Class prefix shared with the diff viewer. */
const PREFIX = 'dsh-gsd'

/** The status letter the picker prefixes a path with. */
const STATUS_LETTERS: Readonly<Record<string, string>> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  untracked: '?',
  conflicted: 'U',
}

/**
 * Build the commit body the diff tab draws when the editor is available.
 * @param React - the loader's React.
 * @param runtime - the readers, the Monaco view, and copy.
 * @returns a component taking the commit identity.
 */
export function makeCommitDiffBody(React: unknown, runtime: CommitEditorRuntime): (props: CommitBodyProps) => unknown {
  const R = React as CommitReactSurface

  /** One commit: its file list, the chosen file, and that file's two sides. */
  return function CommitDiffBody(props: CommitBodyProps): unknown {
    const sessionId = props.sessionId
    const t = props.t
    const api = useMonacoApiState(R, runtime.resolveApi)
    const [files, setFiles] = R.useState<FilesState>({ status: 'loading' })
    const [selected, setSelected] = R.useState<string | undefined>(undefined)
    const [sides, setSides] = R.useState<SidesState>({ status: 'loading' })

    R.useEffect((): (() => void) | void => {
      if (sessionId === undefined) return
      let live = true
      setFiles({ status: 'loading' })
      void runtime.requestFiles({ sessionId, sha: props.sha }, props.signal).then((payload) => {
        if (!live) return
        if (payload.kind === 'error') setFiles({ status: 'failed', message: payload.message })
        else setFiles({ status: 'files', files: payload.files, merge: payload.merge === true })
      }, (error: unknown) => {
        if (live) setFiles({ status: 'failed', message: messageOf(error) })
      })
      return () => { live = false }
    }, [sessionId, props.sha, props.revision, props.signal])

    // The picker always names a file the commit has: a commit that changed its
    // first file away must not leave the pane pointing at a path it no longer
    // lists.
    const listed = files.status === 'files' ? files.files : undefined
    R.useEffect((): void => {
      if (listed === undefined) return
      if (selected !== undefined && listed.some(file => file.path === selected)) return
      setSelected(listed[0]?.path)
    }, [listed, selected])

    const entry = listed?.find(file => file.path === selected)
    R.useEffect((): (() => void) | void => {
      if (sessionId === undefined || entry === undefined || entry.binary) {
        setSides({ status: 'loading' })
        return
      }
      let live = true
      setSides({ status: 'loading' })
      void runtime.requestSides({ sessionId, sha: props.sha, path: entry.path }, props.signal).then((payload) => {
        if (live) setSides({ status: 'ready', sides: payload })
      }, (error: unknown) => {
        if (live) setSides({ status: 'failed', message: messageOf(error) })
      })
      return () => { live = false }
    }, [sessionId, props.sha, props.revision, props.signal, entry?.path, entry?.binary])

    return R.createElement('div', {
      className: PREFIX,
      'data-git-diff': props.sha,
      'data-git-diff-commit': props.sha,
    },
      head(R, t, props.sha, entry),
      // A merge has no single old side; saying which one the view took keeps the
      // file list, its counts, and the editor from implying otherwise.
      files.status === 'files' && files.merge
        ? R.createElement('p', { className: `${PREFIX}-truncated`, role: 'status' }, t('commit.merge'))
        : null,
      picker(R, t, listed, selected, (path: string) => { setSelected(path) }),
      body(R, t, {
        files,
        entry,
        sides,
        path: selected ?? props.sha,
        runtime,
        api,
      }),
    )
  }
}

/** The pane's head: the commit, and the selected file's line counts. */
function head(
  React: CommitReactSurface,
  t: (key: string) => string,
  sha: string,
  entry: CommitFile | undefined,
): unknown {
  return React.createElement('div', { className: `${PREFIX}-head` },
    React.createElement('span', { className: `${PREFIX}-path`, title: sha }, sha),
    React.createElement('span', { className: `${PREFIX}-side` }, t('commit')),
    entry === undefined
      ? null
      : React.createElement('span', { className: `${PREFIX}-counts` },
        React.createElement('span', { className: `${PREFIX}-tally ${PREFIX}-up` }, `+${entry.added}`),
        React.createElement('span', { className: `${PREFIX}-tally ${PREFIX}-down` }, `-${entry.removed}`)),
  )
}

/** The file picker: one row above the editor, naming every file the commit changes. */
function picker(
  React: CommitReactSurface,
  t: (key: string) => string,
  files: readonly CommitFile[] | undefined,
  selected: string | undefined,
  choose: (path: string) => void,
): unknown {
  if (files === undefined) return null
  if (files.length <= 1) {
    return React.createElement('div', { className: `${PREFIX}-files` },
      React.createElement('span', { className: `${PREFIX}-files-label` }, t('commit.files'), ` ${files.length}`),
    )
  }
  return React.createElement('div', { className: `${PREFIX}-files` },
    React.createElement('label', { className: `${PREFIX}-files-label` }, t('commit.files')),
    React.createElement('select', {
      className: `${PREFIX}-files-select`,
      'data-git-diff-file-select': '',
      value: selected ?? '',
      onChange: (event: { target: { value: string } }) => { choose(event.target.value) },
    }, ...files.map(file => React.createElement('option', {
      key: file.path,
      value: file.path,
    }, `${STATUS_LETTERS[file.status] ?? '?'} ${file.path}`))),
  )
}

/** The editor area: the selected file's two sides, or why they cannot be shown. */
function body(
  React: CommitReactSurface,
  t: (key: string) => string,
  state: {
    readonly files: FilesState
    readonly entry: CommitFile | undefined
    readonly sides: SidesState
    readonly path: string
    readonly runtime: CommitEditorRuntime
    readonly api: MonacoApiState
  },
): unknown {
  if (state.files.status === 'loading') return skeleton(React)
  if (state.files.status === 'failed') return note(React, t('commitFailed'), state.files.message)
  if (state.files.files.length === 0) return note(React, t('empty'))
  if (state.entry === undefined) return skeleton(React)
  if (state.entry.binary) return note(React, t('binary'), state.entry.path)
  if (state.sides.status === 'loading') return skeleton(React)
  if (state.sides.status === 'failed') return note(React, t('failed'), state.sides.message)
  const sides = state.sides.sides
  if (sides.kind === 'binary') return note(React, t('binary'), state.path)
  if (sides.kind === 'too-large') return note(React, t('editor.tooLarge'), bytesOf(sides.bytes))
  if (sides.kind === 'error') return note(React, t('failed'), sides.message)
  if (state.api.status === 'failed') return note(React, t('editor.unavailable'))
  if (state.api.status === 'loading') return skeleton(React)
  // Rendered as an element, never called: the view is a component and its hooks
  // belong to its own fiber, not to this pane's render.
  return React.createElement(state.runtime.diffView, {
    api: state.api.api,
    path: state.path,
    oldText: sides.oldText,
    newText: sides.newText,
    hunks: [],
    side: 'commit',
    busy: false,
    t,
    move: () => undefined,
    ...state.runtime.onThemeChange === undefined ? {} : { onThemeChange: state.runtime.onThemeChange },
  })
}

/** The placeholder shown while a read runs. */
function skeleton(React: CommitReactSurface): unknown {
  const widths = [62, 40, 74, 51, 33, 68, 45]
  return React.createElement('div', { className: `${PREFIX}-body`, 'aria-busy': 'true' },
    ...widths.map((width, index) => React.createElement('div', {
      key: index,
      className: `${PREFIX}-skeleton`,
      style: { width: `${width}%` },
    })),
  )
}

/** A line of explanation, with an optional detail under it. */
function note(React: CommitReactSurface, message: string, detail?: string): unknown {
  const repeat = detail === undefined || detail === '' || detail === message
  return React.createElement('div', { className: `${PREFIX}-note`, role: 'status' },
    React.createElement('p', { className: `${PREFIX}-line-note` }, message),
    repeat ? null : React.createElement('p', { className: `${PREFIX}-detail` }, detail ?? ''),
  )
}

/**
 * Read one byte count as a size a person reads at a glance.
 * @param bytes - the measured size.
 * @returns a decimal size such as `2.1 MiB`.
 */
export function bytesOf(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit] ?? 'B'}`
}

/**
 * Narrow a thrown value to one line worth showing.
 * @param error - what a promise rejected with.
 * @returns the message, or the value's own text.
 */
function messageOf(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message
  return String(error)
}
