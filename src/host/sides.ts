/**
 * Both sides of a change, for the diff editor.
 *
 * A patch says where lines differ; the Monaco diff editor compares two whole
 * documents. This reader therefore asks Git for the two blobs a change implies
 * and, for the working-tree side, reads the file through the platform's own
 * filesystem provider. Which sides exist is decided by the name-status Git
 * reports for the same side of the index, so an addition's old side and a
 * deletion's new side are empty by construction rather than by a failed read.
 *
 * Nothing here truncates: a side above the reader's cap is reported with the
 * size it measured, because half a document would compare as a different change.
 */

import { join } from 'node:path'
import type { ChangeStatus, CommitFile, CommitFilesPayload, DiffSides } from '../shared.ts'
import type { FileService, HostContext, HostSession } from './context.ts'
import { insideCheckout } from './diff.ts'
import { GitFailure, gitIn } from './git.ts'
import type { GitConfig, GitRunner } from './git.ts'
import { binaryPaths, firstLine, isBinary, parseNameStatus, parseNumstat } from './parse.ts'
import type { NameStatusRecord } from './parse.ts'
import { topLevel } from './status.ts'

/** Limits the side reader adds to the Git configuration. */
export interface SidesConfig extends GitConfig {
  /** Largest text one side may carry; a side above it is reported, never cut. */
  readonly maxSideBytes: number
}

/** Largest capture one side read may request, whatever `maxSideBytes` asks for. */
const MAX_CAPTURE_BYTES = 67_108_864

/** One side's text, or why there is none. */
type SideText =
  | { readonly kind: 'text'; readonly text: string }
  /** The side does not exist for this change, which the status already said. */
  | { readonly kind: 'missing' }
  | { readonly kind: 'too-large'; readonly bytes: number }
  | { readonly kind: 'error'; readonly message: string }

/** What Git says changed about one path. */
interface SideChange {
  readonly status: ChangeStatus
  /** Original path of a rename or copy; absent otherwise. */
  readonly from?: string
}

/** One path's change, or the reason it could not be read. */
type ChangeLookup =
  | { readonly kind: 'change'; readonly change: SideChange }
  | { readonly kind: 'binary' }
  | { readonly kind: 'error'; readonly message: string }

/**
 * Capture limit one blob read gets: one byte past the cap is enough to refuse.
 * @param config - the side limits.
 * @returns the byte ceiling to give this read.
 */
function captureBytes(config: SidesConfig): number {
  return Math.min(config.maxSideBytes + 1, MAX_CAPTURE_BYTES)
}

/**
 * Bind a runner whose capture fits one side, so an oversized side is seen rather than reported as Git's failure.
 * @param ctx - context that provides the subprocess and sandbox services.
 * @param config - executable, process, and side limits.
 * @param session - Session whose sandbox policy applies.
 * @param root - absolute repository root.
 * @param signal - cancellation of every command.
 * @returns the runner to read blobs with.
 */
function sideRunner(
  ctx: HostContext,
  config: SidesConfig,
  session: HostSession,
  root: string,
  signal: AbortSignal,
): GitRunner {
  return gitIn(ctx, { ...config, maxOutputBytes: captureBytes(config) }, session, root, signal)
}

/**
 * Read one file's two sides on one side of the index.
 * @param ctx - context that provides the subprocess, sandbox, and filesystem services.
 * @param config - executable, process, and side limits.
 * @param session - Session whose sandbox policy applies.
 * @param directory - absolute directory inside the checkout.
 * @param request - the path and the side of the index to read.
 * @param signal - cancellation of every command.
 * @returns the two texts, a binary notice, or the reason they are unavailable.
 */
export async function readFileSides(
  ctx: HostContext,
  config: SidesConfig,
  session: HostSession,
  directory: string,
  request: { readonly path: string; readonly staged: boolean },
  signal: AbortSignal,
): Promise<DiffSides> {
  if (!insideCheckout(request.path)) {
    return { kind: 'error', message: 'the path is not a repository-relative path' }
  }
  try {
    const root = await topLevel(gitIn(ctx, config, session, directory, signal))
    const git = sideRunner(ctx, config, session, root, signal)
    const side = request.staged ? ['--staged'] : []
    const lookup = await changeOfFile(git, side, request.path)
    if (lookup.kind !== 'change') return lookup
    const change = lookup.change
    const oldPath = change.from ?? request.path
    const oldRead = change.status === 'added'
      ? missing()
      : await blobText(git, `${request.staged ? 'HEAD' : ''}:${oldPath}`, config)
    const newRead = change.status === 'deleted'
      ? missing()
      : request.staged
        ? await blobText(git, `:${request.path}`, config)
        : await worktreeText(ctx.fs, config, root, request.path, signal)
    return combined(oldRead, newRead)
  } catch (error) {
    return { kind: 'error', message: messageOf(error) }
  }
}

/**
 * Read one file's two sides inside one commit.
 * @param ctx - context that provides the subprocess and sandbox services.
 * @param config - executable, process, and side limits.
 * @param session - Session whose sandbox policy applies.
 * @param directory - absolute directory inside the checkout.
 * @param request - the commit and the path to read.
 * @param signal - cancellation of every command.
 * @returns the two texts, a binary notice, or the reason they are unavailable.
 */
export async function readCommitFileSides(
  ctx: HostContext,
  config: SidesConfig,
  session: HostSession,
  directory: string,
  request: { readonly sha: string; readonly path: string },
  signal: AbortSignal,
): Promise<DiffSides> {
  if (!isObjectName(request.sha)) return { kind: 'error', message: 'the commit name is not an object name' }
  if (!insideCheckout(request.path)) {
    return { kind: 'error', message: 'the path is not a repository-relative path' }
  }
  try {
    const root = await topLevel(gitIn(ctx, config, session, directory, signal))
    const git = sideRunner(ctx, config, session, root, signal)
    const commit = await parentsOf(git, request.sha)
    const parent = commit.parents[0]
    const lookup = await changeOfCommit(git, parent, commit.sha, request.path)
    if (lookup.kind !== 'change') return lookup
    const change = lookup.change
    const oldPath = change.from ?? request.path
    const oldRead = change.status === 'added' || parent === undefined
      ? missing()
      : await blobText(git, `${parent}:${oldPath}`, config)
    const newRead = change.status === 'deleted'
      ? missing()
      : await blobText(git, `${commit.sha}:${request.path}`, config)
    return combined(oldRead, newRead)
  } catch (error) {
    return { kind: 'error', message: messageOf(error) }
  }
}

/**
 * List the files one commit changes, with what the picker shows about each.
 * @param ctx - context that provides the subprocess and sandbox services.
 * @param config - executable, process, and side limits.
 * @param session - Session whose sandbox policy applies.
 * @param directory - absolute directory inside the checkout.
 * @param sha - the commit to describe.
 * @param signal - cancellation of every command.
 * @returns the files, or the reason they are unavailable.
 */
export async function readCommitFiles(
  ctx: HostContext,
  config: SidesConfig,
  session: HostSession,
  directory: string,
  sha: string,
  signal: AbortSignal,
): Promise<CommitFilesPayload> {
  if (!isObjectName(sha)) return { kind: 'error', message: 'the commit name is not an object name' }
  try {
    const root = await topLevel(gitIn(ctx, config, session, directory, signal))
    const git = gitIn(ctx, config, session, root, signal)
    const commit = await parentsOf(git, sha)
    const parent = commit.parents[0]
    const label = parent === undefined ? 'diff-tree' : 'diff'
    const listed = await git(label, commitListing(parent, commit.sha, '--name-status'))
    if (listed.truncated) {
      return { kind: 'error', message: 'the commit changes more files than the reader may list' }
    }
    const stats = await git(label, commitListing(parent, commit.sha, '--numstat'))
    const numbers = parseNumstat(stats.stdout)
    const binary = binaryPaths(numbers)
    const counts = new Map(numbers.map(record => [record.path, record]))
    const files = parseNameStatus(listed.stdout).map((record): CommitFile => {
      const numbers = counts.get(record.path)
      const beyond = record.from === undefined ? {} : { from: record.from }
      return {
        path: record.path,
        status: record.status,
        ...beyond,
        binary: binary.has(record.path),
        added: integerOr(numbers?.additions),
        removed: integerOr(numbers?.deletions),
      }
    })
    return commit.parents.length > 1 ? { kind: 'files', files, merge: true } : { kind: 'files', files }
  } catch (error) {
    return { kind: 'error', message: messageOf(error) }
  }
}

/** Flags every `diff-tree` listing of a root commit shares: recurse, compare against the empty tree, detect renames. */
const TREE_FLAGS = ['--no-commit-id', '-r', '-M', '--root'] as const

/**
 * Compose the argv of one commit-versus-parent listing.
 *
 * A merge has no single old side, so the whole commit view — its file list, its
 * counts, and each file's two texts — is read against the first parent. Doing
 * that consistently is what keeps the picker, the numbers, and the editor from
 * describing three different changes.
 * @param parent - the first parent, or undefined for a root commit.
 * @param sha - the commit being described.
 * @param mode - `--name-status` or `--numstat`.
 * @param path - optional repository-relative pathspec.
 * @returns the argv to run, subcommand first.
 */
function commitListing(parent: string | undefined, sha: string, mode: string, path?: string): string[] {
  const scoped = path === undefined ? [] : ['--', path]
  if (parent === undefined) return ['diff-tree', ...TREE_FLAGS, mode, '-z', sha, ...scoped]
  return ['diff', '--no-ext-diff', mode, '-z', '-M', parent, sha, ...scoped]
}

/**
 * Read what Git says changed about one path on one side of the index.
 * @param git - runner bound to the repository root.
 * @param side - the index flags of the requested side.
 * @param path - repository-relative path.
 * @returns the change, a binary notice, or the reason the path is not readable.
 */
async function changeOfFile(git: GitRunner, side: readonly string[], path: string): Promise<ChangeLookup> {
  const base = ['diff', '--no-ext-diff', ...side]
  const stats = await git('diff', [...base, '--numstat', '-z', '--', path])
  if (isBinary(parseNumstat(stats.stdout))) return { kind: 'binary' }
  const names = await git('diff', [...base, '--name-status', '-z', '-M', '--', path])
  return pickChange(parseNameStatus(names.stdout), path)
}

/**
 * Read what Git says changed about one path inside one commit.
 * @param git - runner bound to the repository root.
 * @param parent - the commit's first parent, or undefined for a root commit.
 * @param sha - the commit to read.
 * @param path - repository-relative path, the new side of a rename.
 * @returns the change, a binary notice, or the reason the path is not readable.
 */
async function changeOfCommit(
  git: GitRunner,
  parent: string | undefined,
  sha: string,
  path: string,
): Promise<ChangeLookup> {
  const label = parent === undefined ? 'diff-tree' : 'diff'
  const stats = await git(label, commitListing(parent, sha, '--numstat', path))
  if (isBinary(parseNumstat(stats.stdout))) return { kind: 'binary' }
  const names = await git(label, commitListing(parent, sha, '--name-status', path))
  return pickChange(parseNameStatus(names.stdout), path)
}

/**
 * Pick the record that describes the requested path.
 * @param records - what Git listed for the path.
 * @param path - the requested path, as the repository-relative new path.
 * @returns the record, or the reason it is not there.
 */
function pickChange(records: readonly NameStatusRecord[], path: string): ChangeLookup {
  const record = records.find(entry => entry.path === path) ?? (records.length === 1 ? records[0] : undefined)
  if (record === undefined) {
    return { kind: 'error', message: `"${path}" has no change on this side` }
  }
  return { kind: 'change', change: record }
}

/**
 * Read one blob by Git's `<rev>:<path>` spelling.
 * @param git - runner bound to the repository root, with the side capture limit.
 * @param spec - `HEAD:path`, `:path`, or `<sha>:path`.
 * @param config - the side limits.
 * @returns the text, or the reason there is none.
 */
async function blobText(git: GitRunner, spec: string, config: SidesConfig): Promise<SideText> {
  try {
    const output = await git.with('show', ['show', spec], { maxOutputBytes: captureBytes(config) })
    return within(output.stdout, output.truncated, config)
  } catch (error) {
    if (error instanceof GitFailure) return { kind: 'error', message: firstLine(error.stderr) }
    return { kind: 'error', message: messageOf(error) }
  }
}

/**
 * Read the working-tree side through the filesystem provider.
 * @param fs - the provider.
 * @param config - the side limits.
 * @param root - absolute repository root.
 * @param path - repository-relative path.
 * @param signal - cancellation of the read.
 * @returns the text, or the reason there is none.
 */
async function worktreeText(
  fs: FileService,
  config: SidesConfig,
  root: string,
  path: string,
  signal: AbortSignal,
): Promise<SideText> {
  try {
    const target = await fs.resolve(join(root, path), { cwd: root, signal })
    const info = await fs.stat(target, signal)
    if (info === undefined) return { kind: 'error', message: `"${path}" is not on disk any more` }
    if (info.type !== 'file') return { kind: 'error', message: `"${path}" is not a regular file` }
    if (info.size !== undefined && info.size > config.maxSideBytes) {
      return { kind: 'too-large', bytes: info.size }
    }
    return within(await fs.readText(target, signal), false, config)
  } catch (error) {
    return { kind: 'error', message: messageOf(error) }
  }
}

/**
 * Apply the side cap to text that was read whole.
 * @param text - the decoded side.
 * @param lossy - whether the capture stopped early and kept only its tail.
 * @param config - the side limits.
 * @returns the text, or how large it was.
 */
function within(text: string, lossy: boolean, config: SidesConfig): SideText {
  const bytes = Buffer.byteLength(text, 'utf8')
  if (lossy || bytes > config.maxSideBytes) {
    return { kind: 'too-large', bytes: Math.max(bytes, config.maxSideBytes + 1) }
  }
  return { kind: 'text', text }
}

/**
 * Combine the two reads into the payload the viewer consumes.
 *
 * A side the change's status declares absent arrives as `missing`, and the
 * empty document is what it is: an addition has no old text.
 * @param oldRead - the old side.
 * @param newRead - the new side.
 * @returns the two texts, or the one reason they cannot be shown.
 */
function combined(oldRead: SideText, newRead: SideText): DiffSides {
  for (const read of [oldRead, newRead]) {
    if (read.kind === 'error') return read
    if (read.kind === 'too-large') return { kind: 'too-large', bytes: read.bytes }
  }
  return {
    kind: 'text',
    oldText: oldRead.kind === 'text' ? oldRead.text : '',
    newText: newRead.kind === 'text' ? newRead.text : '',
  }
}

/** One commit and the parents Git lists for it, first parent first. */
interface CommitParents {
  /** The commit's full object name. */
  readonly sha: string
  /** Every parent, in Git's order; empty for a root commit. */
  readonly parents: readonly string[]
}

/**
 * Resolve one commit and its parents.
 *
 * The parent list is what tells a root commit (no parent, so every file is new)
 * from a merge (several parents, so only the first one can serve as the old
 * side), and `git rev-list` is also what proves the name still resolves.
 * @param git - runner bound to the repository root.
 * @param sha - the commit to resolve.
 * @returns the full object name and its parents.
 */
async function parentsOf(git: GitRunner, sha: string): Promise<CommitParents> {
  const listed = await git('rev-list', ['rev-list', '--parents', '-n', '1', `--end-of-options`, sha])
  const [commit = '', ...parents] = listed.stdout.trim().split(/\s+/)
  if (!isObjectName(commit)) throw new Error(`the commit "${sha}" does not resolve`)
  return { sha: commit, parents: parents.filter(parent => isObjectName(parent)) }
}

/**
 * Read one object name from the wire.
 * @param value - the value the browser sent.
 * @returns whether it can name a commit.
 */
function isObjectName(value: string): boolean {
  return /^[0-9a-f]{4,40}$/i.test(value)
}

/** A side the change's status declares absent. */
function missing(): SideText {
  return { kind: 'missing' }
}

/**
 * A numstat column as a count.
 * @param value - the column, `-` for binary content.
 * @returns the count, or 0 when the column is not a number.
 */
function integerOr(value: string | undefined): number {
  const parsed = value === undefined ? Number.NaN : Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Narrow a thrown value to one line worth showing.
 * @param error - what a promise rejected with.
 * @returns the message, or one placeholder.
 */
function messageOf(error: unknown): string {
  if (error instanceof GitFailure) return firstLine(error.stderr)
  return error instanceof Error ? error.message : String(error)
}
