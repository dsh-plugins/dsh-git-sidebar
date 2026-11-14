/**
 * The repository scan behind the panel's repository picker.
 *
 * A Session works inside one directory, but that directory can hold several
 * checkouts: a workspace of sibling projects, a monorepo with vendored copies, a
 * superproject whose submodules and linked worktrees are checkouts of their own.
 * The scan walks the directory tree to a configurable depth and reports every
 * top level it finds, so the panel can offer them.
 *
 * Everything here reads the file system only. No Git process runs per directory:
 * a checkout is a directory with a `.git` entry, and the kind of checkout is
 * decided by what that entry is. The one Git read the caller does — resolving the
 * checkout containing the Session directory — stays with the service, because it
 * is the same answer every other endpoint needs.
 */

import { readdir, readFile } from 'node:fs/promises'
import { basename, join, relative, sep } from 'node:path'
import type { RepositoryEntry, RepositoryKind } from '../shared.ts'

/** One checkout the scan found. */
export type ScannedRepository = RepositoryEntry

/** Limits and blacklist of one scan. */
export interface ScanConfig {
  /** Deepest level to inspect; the scan root is 0. */
  readonly maxDepth: number
  /** Extra blacklist rules, each a regular expression matched against a directory name. */
  readonly exclude: readonly string[]
  /** Apply {@link DEFAULT_EXCLUDES} as well. */
  readonly useDefaultExclude: boolean
  /** Largest number of directories one scan may visit. */
  readonly maxDirectories: number
}

/** What one scan found. */
export interface ScanResult {
  readonly entries: readonly ScannedRepository[]
  readonly truncated: boolean
  readonly warnings: readonly string[]
}

/**
 * Directory names a scan skips unless the reader turns the built-in list off.
 *
 * These are build outputs, dependency caches, and tool state: they are large,
 * they never hold the checkout a reader wants, and walking them is what makes a
 * workspace scan slow. Each entry is a regular expression matched against the
 * directory's own name, case-insensitively.
 */
export const DEFAULT_EXCLUDES: readonly string[] = [
  '^\\.git$',
  'node_modules',
  'bower_components',
  'jspm_packages',
  '^build$',
  '^dist$',
  '^out$',
  '^target$',
  '^bin$',
  '^obj$',
  '^\\.gradle$',
  '^\\.idea$',
  '^\\.vscode$',
  '^\\.vs$',
  '^__pycache__$',
  '^\\.venv$',
  '^venv$',
  '^\\.tox$',
  '^\\.mypy_cache$',
  '^\\.pytest_cache$',
  '^\\.ruff_cache$',
  '^\\.next$',
  '^\\.nuxt$',
  '^\\.svelte-kit$',
  '^\\.turbo$',
  '^\\.parcel-cache$',
  '^\\.cache$',
  '^\\.m2$',
  '^\\.pnpm-store$',
  '^\\.yarn$',
  '^coverage$',
  '^\\.nyc_output$',
  '^vendor$',
  '^Pods$',
  '^DerivedData$',
  '^\\.terraform$',
  '^\\.dart_tool$',
  '^\\.pub-cache$',
  '^CMakeFiles$',
  '^cmake-build-.*$',
]

/** A compiled blacklist and the rules it could not compile. */
export interface CompiledExcludes {
  readonly patterns: readonly RegExp[]
  readonly warnings: readonly string[]
}

/**
 * Compile the blacklist of one scan.
 *
 * A rule the reader mistyped is reported and skipped: a broken exclude must not
 * stop the scan, because the scan is how the reader finds out the rule is wrong.
 * @param exclude - rules the configuration supplied.
 * @param useDefaultExclude - whether {@link DEFAULT_EXCLUDES} applies too.
 * @returns the matchers and one warning per unusable rule.
 */
export function compileExcludes(exclude: readonly string[], useDefaultExclude: boolean): CompiledExcludes {
  const patterns: RegExp[] = []
  const warnings: string[] = []
  const rules = useDefaultExclude ? [...DEFAULT_EXCLUDES, ...exclude] : [...exclude]
  for (const rule of rules) {
    try {
      patterns.push(new RegExp(rule, 'i'))
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      warnings.push(`${rule}: ${reason}`)
    }
  }
  return { patterns, warnings }
}

/**
 * Read the label the picker prints for one checkout.
 * @param scanRoot - the Session's working directory.
 * @param root - the checkout's top level.
 * @returns a forward-slashed relative path, `.` for the scan root itself, and the
 * absolute path when the two sit on different drives.
 */
export function relativeLabel(scanRoot: string, root: string): string {
  const path = relative(scanRoot, root)
  if (path.length === 0) return '.'
  return path.split(sep).join('/')
}

/**
 * Decide what kind of checkout one top level is.
 *
 * An ordinary checkout keeps its repository in a `.git` directory. A submodule
 * and a linked worktree both replace that directory with a file naming a gitdir
 * elsewhere; which of the two it is comes from where that gitdir lives, which is
 * the one difference the reader cares about when picking.
 * @param root - the checkout's top level.
 * @returns the kind, defaulting to an ordinary checkout when `.git` cannot be read.
 */
export async function readRepositoryKind(root: string): Promise<RepositoryKind> {
  let content: string
  try {
    content = await readFile(join(root, '.git'), 'utf8')
  } catch {
    // A directory read fails with EISDIR, which is exactly the ordinary checkout.
    return 'repository'
  }
  const match = /^\s*gitdir:\s*(.+)$/m.exec(content)
  if (match === null) return 'repository'
  const gitdir = (match[1] ?? '').trim().split('\\').join('/')
  return /\/modules\//.test(gitdir) ? 'submodule' : 'worktree'
}

/**
 * Describe one checkout the caller already resolved.
 * @param scanRoot - the Session's working directory, which the label is relative to.
 * @param root - the checkout's top level.
 * @returns the entry the picker draws.
 */
export async function describeRepository(scanRoot: string, root: string): Promise<ScannedRepository> {
  return {
    root,
    relative: relativeLabel(scanRoot, root),
    name: basename(root) || root,
    kind: await readRepositoryKind(root),
  }
}

/** Traversal state one scan carries while it walks. */
interface WalkState {
  readonly scanRoot: string
  readonly config: ScanConfig
  readonly patterns: readonly RegExp[]
  readonly found: ScannedRepository[]
  visited: number
  truncated: boolean
}

/**
 * Scan one directory tree for checkouts.
 * @param scanRoot - the directory that is depth 0.
 * @param config - depth, blacklist, and traversal budget.
 * @returns the checkouts found, whether the budget ran out, and unusable rules.
 */
export async function scanRepositories(scanRoot: string, config: ScanConfig): Promise<ScanResult> {
  const compiled = compileExcludes(config.exclude, config.useDefaultExclude)
  const state: WalkState = {
    scanRoot,
    config,
    patterns: compiled.patterns,
    found: [],
    visited: 0,
    truncated: false,
  }
  await walk(scanRoot, 0, state)
  const entries = [...state.found].sort((left, right) => compareEntries(left, right))
  return { entries, truncated: state.truncated, warnings: compiled.warnings }
}

/**
 * Merge the checkout containing the Session directory into a scan's result.
 *
 * The Session directory can sit inside a checkout whose top level is above the
 * scan root, in which case the walk never sees it. It is the checkout the panel
 * reads by default, so it is added unless the walk already found the same root;
 * the result keeps the scan root first and the rest in path order.
 * @param current - the checkout containing the Session directory, when there is one.
 * @param scanned - the checkouts the walk found.
 * @returns the entries in presentation order.
 */
export function mergeScanned(
  current: ScannedRepository | undefined,
  scanned: readonly ScannedRepository[],
): ScannedRepository[] {
  const entries: ScannedRepository[] = []
  const seen = new Set<string>()
  for (const entry of current === undefined ? scanned : [current, ...scanned]) {
    const key = identityOf(entry.root)
    if (seen.has(key)) continue
    seen.add(key)
    entries.push(entry)
  }
  return entries.sort((left, right) => compareEntries(left, right))
}

/**
 * Read one directory and, if it is a checkout, record it; then descend.
 *
 * A `.git` entry of either kind marks a checkout: the walk reports it and keeps
 * descending, because a checkout can hold another one. Symbolic links are not
 * followed — `isDirectory()` is false for them — and the depth limit bounds any
 * junction that reports itself as a directory.
 * @param directory - the directory to read.
 * @param depth - its level, the scan root being 0.
 * @param state - the scan's accumulated result.
 */
async function walk(directory: string, depth: number, state: WalkState): Promise<void> {
  if (state.visited >= state.config.maxDirectories) {
    state.truncated = true
    return
  }
  state.visited += 1
  let items
  try {
    items = await readdir(directory, { withFileTypes: true })
  } catch {
    return
  }
  const dotGit = items.find(item => item.name === '.git')
  if (dotGit !== undefined) {
    state.found.push({
      root: directory,
      relative: relativeLabel(state.scanRoot, directory),
      name: basename(directory),
      kind: await readRepositoryKind(directory),
    })
  }
  if (depth >= state.config.maxDepth) return
  for (const item of items) {
    if (!item.isDirectory()) continue
    if (item.name === '.git') continue
    if (isExcluded(item.name, state.patterns)) continue
    await walk(join(directory, item.name), depth + 1, state)
  }
}

/** Whether one directory name is blacklisted. */
function isExcluded(name: string, patterns: readonly RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(name))
}

/** Presentation order: the scan root first, then by path. */
function compareEntries(left: ScannedRepository, right: ScannedRepository): number {
  if (left.relative === right.relative) return 0
  if (left.relative === '.') return -1
  if (right.relative === '.') return 1
  return left.relative < right.relative ? -1 : 1
}

/** A path's identity for de-duplication; Windows treats case as insignificant. */
function identityOf(path: string): string {
  const normalized = path.split('\\').join('/').replace(/\/+$/, '')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}
