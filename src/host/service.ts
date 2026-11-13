/**
 * The Remote service behind the Git panel: six direct endpoints over one
 * Session's checkout.
 *
 * `status` and `diff` answer questions and therefore fold every failure into
 * their payload; `stage`, `unstage`, `discard`, and `commit` answer requests and
 * report a refusal code the client can act on. Only a malformed request (no
 * Session, no argument object) throws, because the client cannot retry it.
 */

import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  CommitArgs, CommitOutcome, DiffArgs, DiffPayload, DiscardArgs, PathsArgs, StatusArgs, StatusSnapshot, WriteOutcome,
} from '../shared.ts'
import { REMOTE_METHODS } from '../remote-descriptor.ts'
import type { HostContext, HostSession } from './context.ts'
import { readDiff } from './diff.ts'
import type { DiffConfig } from './diff.ts'
import { GitMissingError, gitIn } from './git.ts'
import type { Git, GitConfig } from './git.ts'
import { NoRepository, messageOf, readIdentity, readStatus, unavailable } from './status.ts'
import { commitStaged, hasStagedChanges, write } from './write.ts'
import type { WriteKind } from './write.ts'

/** Prototype property the Typert runtime reads for the Remote method table. */
const REMOTE_METHOD_DESCRIPTOR = '@deepseek-ai/dsh-typert-protocol/remote-methods'

/** Resolved configuration of the six endpoints. */
export interface ServiceConfig extends DiffConfig {
  /** Git executable name or absolute path. */
  readonly gitCommand: string
}

/** One resolved Session and its directory. */
interface Target {
  readonly session: HostSession
  readonly directory: string
}

/**
 * The panel's Host service. `status` and `diff` take the Session id from the
 * wire and resolve it themselves, because a missing Session is a snapshot
 * problem rather than a failed call.
 */
export class GitSidebarService extends TypertRemoteService {
  private readonly home: HostContext
  private readonly config: ServiceConfig

  constructor(ctx: HostContext, config: ServiceConfig) {
    super(ctx as never, 'gitSidebar')
    this.home = ctx
    this.config = config
  }

  /**
   * Read the Session's repository snapshot; never throws for a Git or lookup failure.
   * @param args - the Session whose checkout to read.
   * @returns the snapshot, or the reason the panel cannot show one.
   */
  async status(args?: StatusArgs): Promise<StatusSnapshot> {
    const session = this.sessionOf(args?.sessionId)
    if (session === undefined) return unavailable('no-directory')
    const directory = this.directoryOf(session)
    if (directory === undefined) return unavailable('no-directory')
    return await this.snapshot(session, directory)
  }

  /**
   * Read one file's patch on one side of the index.
   * @param args - the Session, the path, and which side to read.
   * @returns the hunks, a binary notice, or the reason they are unavailable.
   */
  async diff(args?: DiffArgs): Promise<DiffPayload> {
    const session = this.sessionOf(args?.sessionId)
    if (session === undefined || typeof args?.path !== 'string') {
      return { kind: 'error', message: 'diff requires a session and a path' }
    }
    const directory = this.directoryOf(session)
    if (directory === undefined) return { kind: 'error', message: 'the session has no working directory' }
    return await readDiff(
      this.home,
      this.config,
      session,
      directory,
      { path: args.path, staged: args.staged === true },
      this.signalOf(),
    )
  }

  /**
   * Stage every change of the given paths.
   * @param args - the Session and the paths to stage.
   * @returns the new snapshot, or the refusal.
   */
  async stage(args?: PathsArgs): Promise<WriteOutcome> {
    return await this.applyWrite('stage', args?.sessionId, args?.paths, false)
  }

  /**
   * Remove every change of the given paths from the index.
   * @param args - the Session and the paths to unstage.
   * @returns the new snapshot, or the refusal.
   */
  async unstage(args?: PathsArgs): Promise<WriteOutcome> {
    return await this.applyWrite('unstage', args?.sessionId, args?.paths, false)
  }

  /**
   * Restore the given paths from the index, optionally removing untracked files.
   * @param args - the Session, the paths, and whether untracked files go too.
   * @returns the new snapshot, or the refusal.
   */
  async discard(args?: DiscardArgs): Promise<WriteOutcome> {
    return await this.applyWrite('discard', args?.sessionId, args?.paths, args?.includeUntracked === true)
  }

  /**
   * Commit the index with the given message.
   * @param args - the Session and the commit message.
   * @returns the new commit and snapshot, or the refusal.
   */
  async commit(args?: CommitArgs): Promise<CommitOutcome> {
    const session = this.sessionOf(args?.sessionId)
    const directory = session === undefined ? undefined : this.directoryOf(session)
    if (session === undefined || directory === undefined) {
      return { ok: false, problem: 'failed', message: 'the session has no working directory' }
    }
    const message = typeof args?.message === 'string' ? args.message.trim() : ''
    if (message.length === 0) return { ok: false, problem: 'empty-message', message: 'a commit needs a message' }
    try {
      const root = await this.rootOf(session, directory)
      const git = gitIn(this.home, this.config, session, root, this.signalOf())
      const identity = await readIdentity(git)
      if (identity.name === null || identity.email === null) {
        return {
          ok: false,
          problem: 'identity-missing',
          message: 'set user.name and user.email before committing',
        }
      }
      if (!(await hasStagedChanges(git))) {
        return { ok: false, problem: 'nothing-staged', message: 'the index holds no change to commit' }
      }
      const commit = await commitStaged(git, message)
      return { ok: true, commit, snapshot: await this.snapshot(session, root) }
    } catch (error) {
      return { ok: false, problem: 'failed', message: messageOf(error) }
    }
  }

  /** Run one staging write and report the new snapshot. */
  private async applyWrite(
    kind: WriteKind,
    sessionId: unknown,
    paths: unknown,
    includeUntracked: boolean,
  ): Promise<WriteOutcome> {
    const session = this.sessionOf(sessionId)
    const directory = session === undefined ? undefined : this.directoryOf(session)
    if (session === undefined || directory === undefined) {
      return { ok: false, problem: 'failed', message: 'the session has no working directory' }
    }
    const wanted = Array.isArray(paths) ? paths.filter((path): path is string => typeof path === 'string') : []
    if (wanted.length === 0) return { ok: false, problem: 'no-paths', message: 'no paths were given' }
    try {
      const root = await this.rootOf(session, directory)
      await write(gitIn(this.home, this.config, session, root, this.signalOf()), kind, {
        paths: wanted,
        includeUntracked,
      })
      return { ok: true, snapshot: await this.snapshot(session, root) }
    } catch (error) {
      return { ok: false, problem: 'failed', message: messageOf(error) }
    }
  }

  /** Read a snapshot, folding every failure into the unavailable shape. */
  private async snapshot(session: HostSession, directory: string): Promise<StatusSnapshot> {
    try {
      return await readStatus(this.home, this.config, session, directory, this.signalOf())
    } catch (error) {
      if (error instanceof NoRepository) return unavailable('no-repository')
      if (error instanceof GitMissingError) return unavailable('git-missing', messageOf(error))
      return unavailable('failed', messageOf(error))
    }
  }

  /** Resolve the repository root, or fail the same way the snapshot does. */
  private async rootOf(session: HostSession, directory: string): Promise<string> {
    const snapshot = await this.snapshot(session, directory)
    if (snapshot.kind === 'repository' && snapshot.root !== undefined) return snapshot.root
    throw new Error(snapshot.message ?? 'the session has no Git repository')
  }

  /** Resolve one Session id from the wire; an unknown id reads as no Session. */
  private sessionOf(sessionId: unknown): HostSession | undefined {
    if (typeof sessionId !== 'string' || sessionId.length === 0) return undefined
    try {
      return this.home.sessions.get(sessionId)
    } catch {
      return undefined
    }
  }

  /** Read one Session's directory, or undefined when it has none. */
  private directoryOf(session: HostSession): string | undefined {
    try {
      const directory = this.home.workingDirectory.get(session)
      return typeof directory === 'string' && directory.length > 0 ? directory : undefined
    } catch {
      return undefined
    }
  }

  /** Cancellation of the Remote call this method runs in, or an unabortable signal outside one. */
  private signalOf(): AbortSignal {
    return this.home.invocation?.signal ?? new AbortController().signal
  }
}

Object.defineProperty(GitSidebarService.prototype, REMOTE_METHOD_DESCRIPTOR, {
  configurable: true,
  value: Object.freeze({
    version: 1,
    methods: Object.freeze(REMOTE_METHODS.map(method =>
      Object.freeze({ method, invocation: Object.freeze({ kind: 'direct' }) }))),
  }),
})
