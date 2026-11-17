/**
 * One file's patch for the diff viewer and for the hunk-level staging writes.
 *
 * The reader asks Git for the patch of exactly one repository-relative path, on
 * one side of the index, and captures it once. The viewer parses that text into
 * hunks, and a hunk write lifts one hunk out of the same text, so the position
 * the browser sends always names the hunk the browser rendered. It never
 * throws: every failure becomes a stated `error`, because the viewer renders
 * the reason next to the path.
 */

import type { DiffPayload } from '../shared.ts'
import type { HostContext, HostSession } from './context.ts'
import { GitFailure, gitIn } from './git.ts'
import type { Git, GitConfig, GitRunner } from './git.ts'
import { firstLine, isBinary, parseNumstat, parsePatch } from './parse.ts'
import { topLevel } from './status.ts'

/** Limits the diff reader adds to the Git configuration. */
export interface DiffConfig extends GitConfig {
  /** Largest patch the viewer renders before truncating, in bytes. */
  readonly maxDiffBytes: number
}

/** Options that select one side of one path. */
export interface DiffRequest {
  /** Path relative to the repository root, in Git's forward-slashed form. */
  readonly path: string
  /** True reads HEAD..index; false reads index..worktree. */
  readonly staged: boolean
}

/** One path's patch, captured whole and cut at the rendering limit. */
export type PatchCapture =
  | {
    readonly kind: 'text'
    /** Patch text the viewer parses; cut at the rendering limit when it was longer. */
    readonly patch: string
    /** True when the patch lost its tail, so the last hunk may be incomplete. */
    readonly truncated: boolean
    /** True when the capture dropped the head too, leaving no usable text. */
    readonly lossy: boolean
  }
  | { readonly kind: 'binary' }
  | { readonly kind: 'error'; readonly message: string }

/** The diff flags every read shares: no external helpers, no colour, three context lines. */
const DIFF_FLAGS = ['--no-color', '--no-ext-diff', '-U3'] as const

/** Largest capture one patch read may request, whatever `maxDiffBytes` asks for. */
const MAX_CAPTURE_BYTES = 67_108_864

/**
 * Capture enough of a patch that the rendered head stays complete when it is cut.
 * @param maxDiffBytes - the rendering limit.
 * @returns the capture limit, twice the rendering limit and never above the maximum.
 */
function captureBytes(maxDiffBytes: number): number {
  return Math.min(maxDiffBytes * 2, MAX_CAPTURE_BYTES)
}

/**
 * Bind a runner whose capture limit fits one whole patch.
 * @param ctx - context that provides the subprocess and sandbox services.
 * @param config - executable, process, and rendering limits.
 * @param session - Session whose sandbox policy applies.
 * @param root - absolute repository root.
 * @param signal - cancellation of every command.
 * @returns the runner to capture patches with.
 */
export function patchRunner(
  ctx: HostContext,
  config: DiffConfig,
  session: HostSession,
  root: string,
  signal: AbortSignal,
): GitRunner {
  return gitIn(ctx, { ...config, maxOutputBytes: captureBytes(config.maxDiffBytes) }, session, root, signal)
}

/**
 * Read one file's patch.
 * @param ctx - context that provides the subprocess and sandbox services.
 * @param config - executable, process, and rendering limits.
 * @param session - Session whose sandbox policy applies.
 * @param directory - absolute directory inside the checkout.
 * @param request - the path and the side of the index to read.
 * @param signal - cancellation of every command.
 * @returns the hunks, a binary notice, or the reason the patch is unavailable.
 */
export async function readDiff(
  ctx: HostContext,
  config: DiffConfig,
  session: HostSession,
  directory: string,
  request: DiffRequest,
  signal: AbortSignal,
): Promise<DiffPayload> {
  try {
    const root = await topLevel(gitIn(ctx, config, session, directory, signal))
    const capture = await readPatch(patchRunner(ctx, config, session, root, signal), request, config.maxDiffBytes)
    return payloadOf(capture)
  } catch (error) {
    if (error instanceof GitFailure) return { kind: 'error', message: firstLine(error.stderr) }
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Capture one file's patch on one side of the index.
 * @param git - runner bound to the repository root, carrying the patch capture limit.
 * @param request - the path and the side of the index to read.
 * @param maxBytes - the rendering limit, measured as UTF-8 bytes.
 * @returns the captured text, a binary notice, or the reason the read failed.
 */
export async function readPatch(git: Git, request: DiffRequest, maxBytes: number): Promise<PatchCapture> {
  if (!insideCheckout(request.path)) {
    return { kind: 'error', message: 'the path is not a repository-relative path' }
  }
  try {
    const side = request.staged ? ['--staged'] : []
    const stat = await git('diff', ['diff', '--numstat', '-z', ...side, '--', request.path])
    if (isBinary(parseNumstat(stat.stdout))) return { kind: 'binary' }
    const patch = await git('diff', ['diff', ...DIFF_FLAGS, ...side, '--', request.path])
    return { kind: 'text', ...cut(patch.stdout, patch.truncated, maxBytes) }
  } catch (error) {
    if (error instanceof GitFailure) return { kind: 'error', message: firstLine(error.stderr) }
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Turn a capture into the payload the viewer renders.
 * @param capture - the captured patch, or the reason there is none.
 * @returns the hunks and whether they are incomplete, a binary notice, or the reason.
 */
function payloadOf(capture: PatchCapture): DiffPayload {
  if (capture.kind === 'error') return capture
  if (capture.kind === 'binary') return capture
  const truncated = capture.truncated ? { truncated: true } : {}
  if (capture.lossy) return { kind: 'text', hunks: [], ...truncated }
  return { kind: 'text', hunks: parsePatch(capture.patch), ...truncated }
}

/**
 * Cut captured patch text at the rendering limit.
 * @param output - standard output of the patch command.
 * @param lossy - whether the capture already dropped the head of the output.
 * @param maxBytes - the rendering limit, measured as UTF-8 bytes.
 * @returns the text the viewer parses, and how it was cut.
 */
function cut(output: string, lossy: boolean, maxBytes: number): { patch: string; truncated: boolean; lossy: boolean } {
  if (lossy) return { patch: '', truncated: true, lossy: true }
  const bytes = Buffer.from(output, 'utf8')
  if (bytes.byteLength <= maxBytes) return { patch: output, truncated: false, lossy: false }
  return { patch: bytes.subarray(0, maxBytes).toString('utf8'), truncated: true, lossy: false }
}

/**
 * Whether a diff path stays inside the checkout: relative, without NUL, and without a `..` segment.
 * @param path - the path from the browser.
 * @returns whether the path can be handed to Git after `--`.
 */
export function insideCheckout(path: string): boolean {
  if (path.length === 0 || path.includes('\0') || path.startsWith('/') || /^[A-Za-z]:/.test(path)) return false
  return path.split(/[/\\]/).every(segment => segment !== '..')
}
