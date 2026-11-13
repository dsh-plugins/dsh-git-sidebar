/**
 * Structural face of the Host services the Git panel consumes.
 *
 * The panel depends on the subprocess, sandbox, sandbox-policy,
 * working-directory, and session-store services by shape rather than by
 * package, so this bundle carries no runtime dependency on the Host's service
 * packages and stays loadable against any Host build that provides them.
 */

/** One Session as the Git runner needs it: an identity the Session services key on. */
export interface HostSession {
  readonly id: string
}

/** File-effect policy resolved for one command, mirroring the Host's own vocabulary. */
export interface SandboxExecutionPolicy {
  readonly mode: 'read-only' | 'workspace-write' | 'danger-full-access'
  readonly workspaceRoot: string
  readonly additionalWritableRoots?: readonly string[]
  readonly sessionId?: string
}

/** Confining policy: every mode except the unconfined one. */
export type ConfinedPolicy = SandboxExecutionPolicy & { readonly mode: 'read-only' | 'workspace-write' }

/** One collected output stream, read by whole-stream byte offset. */
export interface CollectedOutput {
  /**
   * Read everything captured since `fromByte`.
   * @param fromByte - whole-stream offset; 0 reads the retained buffer.
   * @returns the delta text, the next offset, and whether the head was dropped.
   */
  readFrom(fromByte: number): { readonly text: string; readonly nextOffset: number; readonly lossy: boolean }
}

/** Exit facts of one finished process. */
export interface ProcessOutcome {
  readonly exitCode: number | null
  readonly signal: string | null
}

/** A live child process and its provider-managed range. */
export interface SubprocessHandle {
  readonly collected: { readonly stdout?: CollectedOutput | undefined; readonly stderr?: CollectedOutput | undefined }
  readonly done: Promise<ProcessOutcome>
  terminate(): void
  waitForExit(signal?: AbortSignal): Promise<boolean>
}

/** Bounded collection for one output stream. */
export interface CollectMode {
  readonly maxBytes: number
}

/** A fully specified spawn request; argv is never shell-interpreted. */
export interface SpawnSpec {
  readonly argv: readonly string[]
  readonly cwd: string
  readonly stdio: {
    readonly stdin: 'ignore' | 'pipe' | { readonly data: string }
    readonly stdout: 'pipe' | 'inherit' | CollectMode
    readonly stderr: 'pipe' | 'inherit' | CollectMode
  }
  readonly graceMs: number
  readonly signal?: AbortSignal | undefined
  readonly env?: NodeJS.ProcessEnv | undefined
}

/** The subprocess seam: executable resolution and bounded spawn-and-collect. */
export interface SubprocessService {
  /**
   * Resolve one configured executable in the provider's execution world.
   * @param command - configured name or path.
   * @param env - explicit environment overrides for the lookup.
   * @param signal - cancellation of the lookup.
   * @returns the canonical executable path.
   */
  resolveExecutable(command: string, env?: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<string>
  /**
   * Start one process.
   * @param spec - argv, directory, stdio, grace, cancellation, and environment.
   * @returns the live handle.
   */
  spawn(spec: SpawnSpec): SubprocessHandle
}

/** The process-confinement seam. */
export interface SandboxService {
  /**
   * Wrap argv so it runs confined under `policy`.
   * @param argv - executable and arguments.
   * @param policy - the confining policy.
   * @param signal - cancellation of the wrapping.
   * @returns the argv to spawn instead.
   */
  confine(argv: readonly string[], policy: ConfinedPolicy, signal?: AbortSignal): Promise<{ readonly argv: string[] }>
}

/** The sandbox-policy seam. */
export interface SandboxPolicyService {
  /**
   * Resolve the policy for one call.
   * @param request - the calling Session.
   * @returns the resolved mode and workspace root.
   */
  resolve(request?: { readonly session?: HostSession; readonly mode?: string }): SandboxExecutionPolicy
}

/** The working-directory seam. */
export interface WorkingDirectoryService {
  /**
   * Read a Session's effective absolute directory.
   * @param session - Session whose directory is requested.
   * @returns the absolute directory.
   */
  get(session: HostSession): string
}

/** The session-store seam. */
export interface SessionStoreService {
  /**
   * Read one live Session by id.
   * @param id - the session id from the wire.
   * @returns the Session, or undefined when it is not loaded.
   */
  get(id: string): HostSession | undefined
}

/** The Cordis context face the host half consumes. */
export interface HostContext {
  readonly subprocess: SubprocessService
  readonly sandbox: SandboxService
  readonly sandboxPolicy: SandboxPolicyService
  readonly workingDirectory: WorkingDirectoryService
  readonly sessions: SessionStoreService
  /** The Remote call this context was derived for; absent outside a call. */
  readonly invocation?: { readonly signal: AbortSignal } | undefined
}
