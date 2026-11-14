/**
 * Asking a model to word a commit message.
 *
 * The shape follows the Host's own auxiliary-call policy — the one behind
 * session titles: a small bounded request over an explicit route, with the
 * prompt owned by the caller and the execution controls owned by configuration.
 * Nothing here reaches a conversation; the answer is a string the reader can
 * edit before committing.
 *
 * The route is either configured outright or taken from the Session's own last
 * `request/header`, which is what the conversation is already running on. A
 * bundle that is configured with neither has no model to ask, and says so rather
 * than guessing.
 */

import type { HostContext } from './context.ts'
import { GitFailure, gitIn } from './git.ts'
import type { GitConfig } from './git.ts'
import { firstLine } from './parse.ts'
import { topLevel } from './status.ts'
import type { HostSession } from './context.ts'
import type { MessageDraft } from '../shared.ts'

/** What the model is asked to do, and under which limits. */
export interface MessageConfig extends GitConfig {
  /** Provider route; must be paired with `model`. */
  readonly provider?: string
  /** Exact model id; must be paired with `provider`. */
  readonly model?: string
  /** Instruction the model follows. */
  readonly prompt: string
  /** Largest patch sent to the model. */
  readonly maxInputBytes: number
  /** Output-token cap for the draft. */
  readonly maxOutputTokens: number
  /** End-to-end deadline for the draft. */
  readonly draftTimeoutMs: number
}

/** The route one request runs on. */
interface Route {
  readonly provider: string
  readonly model: string
}

/** One assembled request: the system instruction and the change summary. */
interface Prompt {
  readonly system: string
  readonly input: string
}

/** The slice of the Host's LLM service this module uses. */
interface LlmService {
  prepareCall(
    config: { readonly provider: string; readonly model: string; readonly maxTokens?: number },
    signal?: AbortSignal,
    configure?: (controls: Record<string, unknown>, model: Record<string, unknown>) => Record<string, unknown>,
  ): Promise<{ readonly config: Record<string, unknown>; readonly stream: StreamCall }>
}

/** The stream entry point one prepared call carries. */
interface StreamCall {
  (options: Record<string, unknown>): AsyncIterable<StreamChunk>
}

/** The slice of the Host stream-chunk protocol this module reads. */
interface StreamChunk {
  readonly type?: string
  readonly text?: string
  readonly reason?: {
    readonly kind?: string
    readonly failure?: { readonly message?: string }
  }
}

/** The LLM seam as the host context exposes it, when the bundle injected it. */
export interface DraftContext extends HostContext {
  readonly llm?: LlmService
}

/**
 * Read the route the Session is already running on.
 *
 * The conversation logs a `request/header` per epoch; the last one is the route
 * a new request would use. Reading it is what makes the draft follow the model
 * the reader chose for the conversation instead of a second configuration.
 * @param session - the Session whose log is read.
 * @returns the route, or undefined when the Session exposes no log.
 */
function sessionRoute(session: HostSession): Route | undefined {
  const events = (session as { readonly events?: readonly unknown[] }).events
  if (!Array.isArray(events)) return undefined
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index] as { type?: string; data?: { header?: { config?: Record<string, unknown> } } }
    if (event.type !== 'request/header') continue
    const config = event.data?.header?.config
    const provider = config?.['provider']
    const model = config?.['model']
    if (typeof provider === 'string' && typeof model === 'string') return { provider, model }
  }
  return undefined
}

/**
 * Resolve the route a draft runs on.
 * @param config - the plugin's configured route, when it has one.
 * @param session - the Session the panel is showing.
 * @returns the route, or undefined when neither source names one.
 */
function resolveRoute(config: MessageConfig, session: HostSession): Route | undefined {
  if (config.provider !== undefined && config.model !== undefined) {
    return { provider: config.provider, model: config.model }
  }
  return sessionRoute(session)
}

/**
 * Collect the change the message should describe.
 *
 * The patch is what a reviewer would read: the index when the reader staged
 * their work, the working tree otherwise. Untracked files are added to the index
 * view so a new file is described as a new file rather than omitted.
 * @param git - runner bound to the repository root.
 * @param staged - whether to describe the index instead of the working tree.
 * @returns the patch text and the paths it covers.
 */
async function changePatch(git: Awaited<ReturnType<typeof gitIn>>, staged: boolean): Promise<string> {
  const args = staged
    ? ['diff', '--cached', '--no-color', '--no-ext-diff', '-U3']
    : ['diff', '--no-color', '--no-ext-diff', '-U3']
  const patch = await git('diff', args, [0, 128])
  return patch.stdout
}

/**
 * Name the paths one side of the change touches, so the prompt can state the
 * file set even when the patch is trimmed.
 * @param git - runner bound to the repository root.
 * @param staged - whether to read the index.
 * @returns the status letters and paths, one per line.
 */
async function changeSummary(git: Awaited<ReturnType<typeof gitIn>>, staged: boolean): Promise<string> {
  const args = staged
    ? ['diff', '--cached', '--name-status', '--no-color']
    : ['diff', '--name-status', '--no-color']
  const listed = await git('diff', args, [0, 128])
  const tracked = listed.stdout.trim()
  if (tracked.length > 0) return tracked
  const untracked = await git('ls-files', ['ls-files', '--others', '--exclude-standard'], [0, 128])
  return untracked.stdout
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => `A\t${line}`)
    .join('\n')
}

/**
 * Trim a patch to a byte budget, cutting on a hunk boundary when one is near.
 * @param text - the patch.
 * @param maxBytes - the budget.
 * @returns the patch, and whether anything was dropped.
 */
function trim(text: string, maxBytes: number): { readonly text: string; readonly cut: boolean } {
  const bytes = Buffer.from(text, 'utf8')
  if (bytes.byteLength <= maxBytes) return { text, cut: false }
  const sliced = bytes.subarray(0, maxBytes).toString('utf8')
  const lastHunk = sliced.lastIndexOf('\ndiff --git ')
  return { text: lastHunk > 0 ? sliced.slice(0, lastHunk) : sliced, cut: true }
}

/**
 * Build the two halves of the request.
 * @param config - the configured instruction.
 * @param summary - the file set, one `status<TAB>path` per line.
 * @param patch - the change itself, already trimmed.
 * @param cut - whether the patch was trimmed.
 * @returns the system instruction and the user input.
 */
function promptOf(config: MessageConfig, summary: string, patch: string, cut: boolean): Prompt {
  const input = [
    'Changed files:',
    summary.length === 0 ? '(none)' : summary,
    '',
    'Patch:',
    patch.length === 0 ? '(no textual change)' : patch,
    ...cut ? ['', '(the patch is truncated; describe what is shown)'] : [],
  ].join('\n')
  return { system: config.prompt, input }
}

/**
 * Join the text one stream produced.
 *
 * The protocol is flat: visible text arrives as `text-delta` chunks, and one
 * terminal `finish` closes the stream. A failed or aborted finish throws, so
 * the reader is told the provider's own sentence instead of getting a draft
 * that merely looks empty.
 * @param chunks - the streamed chunks.
 * @returns the answer with surrounding whitespace removed.
 * @throws {Error} when the stream ends in a failure or an abort.
 */
async function collect(chunks: AsyncIterable<StreamChunk>): Promise<string> {
  const parts: string[] = []
  for await (const chunk of chunks) {
    if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
      parts.push(chunk.text)
      continue
    }
    if (chunk.type !== 'finish') continue
    const kind = chunk.reason?.kind
    if (kind !== 'error' && kind !== 'aborted') continue
    const failure = chunk.reason?.failure?.message
    throw new Error(typeof failure === 'string' && failure.length > 0 ? failure : 'the model call failed')
  }
  return parts.join('').trim()
}

/**
 * Ask the configured model for a commit message.
 * @param ctx - context carrying the LLM service.
 * @param config - route, prompt, and limits.
 * @param session - the Session the panel is showing.
 * @param directory - absolute directory inside the checkout.
 * @param staged - whether to describe the index.
 * @param signal - cancellation of every command.
 * @returns the draft, or the reason it could not be written.
 */
export async function draftMessage(
  ctx: DraftContext,
  config: MessageConfig,
  session: HostSession,
  directory: string,
  staged: boolean,
  signal: AbortSignal,
): Promise<MessageDraft> {
  const llm = ctx.llm
  if (llm === undefined) {
    return { ok: false, problem: 'not-configured', message: 'the Host exposes no LLM service to this bundle' }
  }
  const route = resolveRoute(config, session)
  if (route === undefined) {
    return {
      ok: false,
      problem: 'not-configured',
      message: 'set provider and model in this bundle\'s configuration, or open a Session that has used a model',
    }
  }
  try {
    const root = await topLevel(gitIn(ctx, config, session, directory, signal))
    const git = gitIn(ctx, config, session, root, signal)
    const summary = await changeSummary(git, staged)
    if (summary.trim().length === 0) {
      return { ok: false, problem: 'no-changes', message: 'there is nothing to describe' }
    }
    const patch = await changePatch(git, staged)
    const trimmed = trim(patch, config.maxInputBytes)
    const prompt = promptOf(config, summary, trimmed.text, trimmed.cut)
    if (Buffer.byteLength(prompt.input, 'utf8') > config.maxInputBytes) {
      return { ok: false, problem: 'too-large', message: 'the change does not fit in the configured input budget' }
    }
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(config.draftTimeoutMs)])
    const call = await llm.prepareCall({ ...route, maxTokens: config.maxOutputTokens }, deadline)
    const message = await collect(call.stream({
      ...call.config,
      system: prompt.system,
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: prompt.input }],
      }],
      signal: deadline,
    }))
    if (message.length === 0) {
      return { ok: false, problem: 'failed', message: 'the model returned no text' }
    }
    return { ok: true, message }
  } catch (error) {
    if (error instanceof GitFailure) return { ok: false, problem: 'failed', message: firstLine(error.stderr) }
    return { ok: false, problem: 'failed', message: error instanceof Error ? error.message : String(error) }
  }
}
