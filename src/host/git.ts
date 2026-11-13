/**
 * The Git runner: one Session's checkout executed through the Host's
 * subprocess, sandbox, and sandbox-policy services.
 *
 * Every command is an argv array (never a shell string), runs under the
 * Session's resolved file-effect policy with a scrubbed environment, and ends
 * inside a deadline. Exit codes outside the caller's allow-list raise
 * {@link GitFailure}, and an unresolvable executable raises
 * {@link GitMissingError} so the panel can say Git is not installed.
 */

import type { ConfinedPolicy, HostContext, HostSession, SandboxExecutionPolicy } from './context.ts'
import { GIT_ENV, GIT_PREFIX } from './env.ts'
import { firstLine } from './parse.ts'

/** Resolved Git executable and process limits. */
export interface GitConfig {
  /** Git executable name or absolute path. */
  readonly gitCommand: string
  /** Deadline in milliseconds for one command, including executable lookup and confinement. */
  readonly timeoutMs: number
  /** Largest captured stdout or stderr per command, in bytes. */
  readonly maxOutputBytes: number
  /** Termination grace for each process, in milliseconds. */
  readonly graceMs: number
}

/** Complete output of one Git command that exited with an allowed code. */
export interface GitOutput {
  /** Captured standard output. */
  readonly stdout: string
  /** Captured standard error. */
  readonly stderr: string
  /** The exit code the command reported. */
  readonly exitCode: number
  /** True when standard output was longer than the capture limit and lost its head. */
  readonly truncated: boolean
}

/**
 * Run one Git subcommand.
 * @param name - short command label used in error messages.
 * @param args - the subcommand and its arguments, prefix excluded.
 * @param allowedExitCodes - exit codes that are not failures; defaults to `[0]`.
 * @returns the captured output and exit code.
 */
export type Git = (name: string, args: readonly string[], allowedExitCodes?: readonly number[]) => Promise<GitOutput>

/** Thrown when the configured Git executable cannot be resolved in this execution world. */
export class GitMissingError extends Error {
  override name = 'GitMissingError'

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
  }
}

/** Thrown when Git ran but exited with a code the caller did not allow. */
export class GitFailure extends Error {
  override name = 'GitFailure'

  constructor(
    /** Command label, such as `status`. */
    readonly command: string,
    /** Exit code, or null when a signal ended the process. */
    readonly exitCode: number | null,
    /** Raw standard error, whose first non-empty line is the diagnostic. */
    readonly stderr: string,
  ) {
    super(`git ${command} failed (${exitCode ?? 'signal'}): ${firstLine(stderr)}`)
  }
}

/** Thrown when one command outlives `timeoutMs`. */
export class GitTimeout extends Error {
  override name = 'GitTimeout'

  constructor(readonly timeoutMs: number) {
    super(`git did not finish within ${timeoutMs}ms`)
  }
}

/** Timeout code carried on the abort reason, matching the Host's timeout vocabulary. */
const TIMEOUT_CODE = 'GIT_SIDEBAR_GIT_TIMEOUT'

/** A deadline signal plus the cleanup that clears its timer. */
interface Deadline {
  readonly signal: AbortSignal
  dispose(): void
}

/**
 * Fuse upstream cancellation with a timer.
 * @param upstream - the caller's cancellation.
 * @param timeoutMs - positive deadline in milliseconds.
 * @returns the fused signal and its disposer.
 */
function deadline(upstream: AbortSignal, timeoutMs: number): Deadline {
  const timer = new AbortController()
  const id = setTimeout(() => timer.abort(new GitTimeout(timeoutMs)), timeoutMs)
  return {
    signal: AbortSignal.any([upstream, timer.signal]),
    dispose: () => clearTimeout(id),
  }
}

/**
 * Bind the runner to one Session and directory.
 * @param ctx - context that provides `subprocess`, `sandbox`, and `sandboxPolicy`.
 * @param config - executable and process limits.
 * @param session - Session whose sandbox policy applies.
 * @param directory - working directory of every command.
 * @param signal - cancellation of every command.
 * @returns the runner.
 */
export function gitIn(
  ctx: HostContext,
  config: GitConfig,
  session: HostSession,
  directory: string,
  signal: AbortSignal,
): Git {
  const policy = ctx.sandboxPolicy.resolve({ session })
  return async (name, args, allowedExitCodes = [0]) =>
    await runGit(ctx, config, policy, directory, name, args, signal, allowedExitCodes)
}

async function runGit(
  ctx: HostContext,
  config: GitConfig,
  policy: SandboxExecutionPolicy,
  cwd: string,
  name: string,
  args: readonly string[],
  signal: AbortSignal,
  allowedExitCodes: readonly number[],
): Promise<GitOutput> {
  const timeout = deadline(signal, config.timeoutMs)
  try {
    const program = await resolve(ctx, config.gitCommand, timeout.signal)
    const command = [program, ...GIT_PREFIX, ...args]
    const argv = policy.mode === 'danger-full-access'
      ? command
      : (await ctx.sandbox.confine(command, { ...policy, mode: policy.mode } as ConfinedPolicy, timeout.signal)).argv
    timeout.signal.throwIfAborted()
    const child = ctx.subprocess.spawn({
      argv,
      cwd,
      env: GIT_ENV,
      signal: timeout.signal,
      graceMs: config.graceMs,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: config.maxOutputBytes },
        stderr: { maxBytes: config.maxOutputBytes },
      },
    })
    try {
      const outcome = await child.done
      timeout.signal.throwIfAborted()
      const stdout = child.collected.stdout?.readFrom(0)
      const stderr = child.collected.stderr?.readFrom(0)
      const stderrText = stderr?.text ?? ''
      if (outcome.exitCode === null || !allowedExitCodes.includes(outcome.exitCode)) {
        throw new GitFailure(name, outcome.exitCode, stderrText)
      }
      return { stdout: stdout?.text ?? '', stderr: stderrText, exitCode: outcome.exitCode, truncated: stdout?.lossy ?? false }
    } finally {
      child.terminate()
      await child.waitForExit()
    }
  } finally {
    timeout.dispose()
  }
}

/** Resolve the configured executable, reporting every lookup failure as Git missing. */
async function resolve(ctx: HostContext, command: string, signal: AbortSignal): Promise<string> {
  try {
    return await ctx.subprocess.resolveExecutable(command, undefined, signal)
  } catch (error) {
    throw new GitMissingError(
      `git executable ${JSON.stringify(command)} is not available: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
}
