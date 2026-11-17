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

/** A resolved file or directory. The key is opaque to this bundle. */
export interface FileTarget {
  readonly targetKey: string
  readonly displayPath: string
}

/** What one `stat` reports: the entry kind and, for a file, its size. */
export interface FileInfo {
  readonly type: 'file' | 'directory' | 'other'
  readonly size?: number
}

/**
 * The filesystem seam the diff reader uses for the working-tree side.
 *
 * Git can hand over the index and committed blobs, but the working tree is a
 * file on disk: reading it through the provider keeps the path resolution, the
 * UTF-8 decoding, and the absent-target case in the platform's own hands.
 */
export interface FileService {
  /**
   * Resolve a path into a target the provider's reads accept.
   * @param path - absolute path, or one relative to `cwd`.
   * @param options - cwd override and cancellation.
   * @returns the stable target.
   */
  resolve(path: string, options?: { readonly cwd?: string; readonly signal?: AbortSignal }): Promise<FileTarget>
  /**
   * Read target metadata.
   * @param target - the resolved target.
   * @param signal - cancellation of the metadata round-trip.
   * @returns the metadata, or undefined when the target does not exist.
   */
  stat(target: FileTarget, signal?: AbortSignal): Promise<FileInfo | undefined>
  /**
   * Read a regular text file whole.
   * @param target - the resolved target.
   * @param signal - cancellation of the read.
   * @returns the decoded content.
   */
  readText(target: FileTarget, signal?: AbortSignal): Promise<string>
}

/** The share of the tool registry this bundle registers into. */
export interface ToolsService {
  /**
   * Add one tool definition.
   * @param definition - name, description, schema, renderer, and body.
   * @param options - activation options the registry understands, such as `when`.
   * @returns the disposer that withdraws the tool.
   */
  register(definition: object, options?: object): () => void
}

/** The Cordis context face the host half consumes. */
export interface HostContext {
  readonly subprocess: SubprocessService
  readonly sandbox: SandboxService
  readonly sandboxPolicy: SandboxPolicyService
  readonly workingDirectory: WorkingDirectoryService
  readonly sessions: SessionStoreService
  /** Reads the working-tree side of a file diff. */
  readonly fs: FileService
  /**
   * Run a registration against services that may not exist in every profile.
   *
   * The panel must keep working where no tool registry is mounted, so the tools
   * are added through this rather than through the plugin's required `inject`
   * list; the callback's registrations live as long as they are held there.
   */
  readonly inject?: (deps: readonly string[], callback: (scoped: ToolScope) => void) => void
  /** The Remote call this context was derived for; absent outside a call. */
  readonly invocation?: { readonly signal: AbortSignal } | undefined
}

/** The services a tool registration callback receives. */
export interface ToolScope {
  readonly tools?: ToolsService | undefined
}
