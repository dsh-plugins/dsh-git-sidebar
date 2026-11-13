/**
 * One file's patch for the diff viewer.
 *
 * The reader asks Git for the patch of exactly one repository-relative path,
 * on one side of the index, and turns it into either hunks or a stated reason
 * the viewer cannot show them. It never throws: every failure becomes an
 * `error` payload, because the viewer renders the reason next to the path.
 */

import type { DiffPayload } from '../shared.ts'
import type { HostContext, HostSession } from './context.ts'
import { GitFailure, gitIn } from './git.ts'
import type { GitConfig } from './git.ts'
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
  if (!insideCheckout(request.path)) return { kind: 'error', message: 'the path is not a repository-relative path' }
  try {
    const root = await topLevel(gitIn(ctx, config, session, directory, signal))
    const git = gitIn(ctx, { ...config, maxOutputBytes: captureBytes(config.maxDiffBytes) }, session, root, signal)
    const side = request.staged ? ['--staged'] : []
    const stat = await git('diff', ['diff', '--numstat', '-z', ...side, '--', request.path])
    if (isBinary(parseNumstat(stat.stdout))) return { kind: 'binary' }
    const patch = await git('diff', ['diff', ...DIFF_FLAGS, ...side, '--', request.path])
    return text(patch.stdout, patch.truncated, config.maxDiffBytes)
  } catch (error) {
    if (error instanceof GitFailure) return { kind: 'error', message: firstLine(error.stderr) }
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Turn captured patch text into a text payload, cutting it at the rendering limit.
 * @param output - standard output of the patch command.
 * @param lossy - whether the capture already dropped the head of the output.
 * @param maxBytes - the rendering limit, measured as UTF-8 bytes.
 * @returns the hunks and whether they are incomplete.
 */
function text(output: string, lossy: boolean, maxBytes: number): DiffPayload {
  if (lossy) return { kind: 'text', hunks: [], truncated: true }
  const bytes = Buffer.from(output, 'utf8')
  if (bytes.byteLength <= maxBytes) return { kind: 'text', hunks: parsePatch(output) }
  return { kind: 'text', hunks: parsePatch(bytes.subarray(0, maxBytes).toString('utf8')), truncated: true }
}

/**
 * Whether a diff path stays inside the checkout: relative, without NUL, and without a `..` segment.
 * @param path - the path from the browser.
 * @returns whether the path can be handed to Git after `--`.
 */
function insideCheckout(path: string): boolean {
  if (path.length === 0 || path.includes('\0') || path.startsWith('/') || /^[A-Za-z]:/.test(path)) return false
  return path.split(/[/\\]/).every(segment => segment !== '..')
}
