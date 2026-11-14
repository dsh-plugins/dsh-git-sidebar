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
  BranchList, BranchListArgs, CheckoutArgs, CommitArgs, CommitDetailArgs, CommitOutcome, CreateBranchArgs,
  DiffArgs, DiffPayload, DiscardArgs, HistoryArgs, HistoryPage, PathsArgs, StashApplyArgs, StashArgs, StashDropArgs,
  StashEntry, StashListArgs, StatusArgs, StatusSnapshot, SyncArgs, WriteOutcome,
} from '../shared.ts'
import { REMOTE_METHODS } from '../remote-descriptor.ts'
import {
  checkout, createBranch, hasTrackedChanges, isValidBranchName, isSyncAction, stashApply, stashDrop as stashDropEntry,
  stashPush, sync, validStashIndex,
} from './branch.ts'
import type { HostContext, HostSession } from './context.ts'
import { readDiff } from './diff.ts'
import type { DiffConfig } from './diff.ts'
import { GitFailure, GitMissingError, gitIn } from './git.ts'
import type { GitConfig, GitRunner } from './git.ts'
import { readBranches, readCommitDiff, readHistory, readStashes, readUpstream } from './refs.ts'
import { NoRepository, messageOf, readIdentity, readStatus, topLevel, unavailable } from './status.ts'
import { commitStaged, hasStagedChanges, write } from './write.ts'
import type { WriteKind } from './write.ts'

/** Prototype property the Typert runtime reads for the Remote method table. */
const REMOTE_METHOD_DESCRIPTOR = '@deepseek-ai/dsh-typert-protocol/remote-methods'

/** Resolved configuration of the six endpoints. */
export interface ServiceConfig extends DiffConfig {
  /** Git executable name or absolute path. */
  readonly gitCommand: string
  /** Deadline for one network command such as fetch, pull, or push. */
  readonly syncTimeoutMs: number
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
   * Read one page of the commit history.
   * @param args - the Session, the page size, and the offset.
   * @returns the page, or an empty one when the Session has no checkout.
   */
  async history(args?: HistoryArgs): Promise<HistoryPage> {
    const target = this.targetOf(args?.sessionId)
    if (target === undefined) return { commits: [], hasMore: false }
    try {
      return await readHistory(this.home, this.config, target.session, target.directory, {
        sessionId: target.session.id,
        limit: typeof args?.limit === 'number' ? args.limit : 20,
        skip: typeof args?.skip === 'number' ? args.skip : 0,
      }, this.signalOf())
    } catch {
      return { commits: [], hasMore: false }
    }
  }

  /**
   * Read one commit's own patch.
   * @param args - the Session and the commit to show.
   * @returns the patch, or the reason it is unavailable.
   */
  async commitDetail(args?: CommitDetailArgs): Promise<DiffPayload> {
    const target = this.targetOf(args?.sessionId)
    if (target === undefined || typeof args?.sha !== 'string') {
      return { kind: 'error', message: 'commitDetail requires a session and a commit' }
    }
    return await readCommitDiff(this.home, this.config, target.session, target.directory, {
      sessionId: target.session.id,
      sha: args.sha,
    }, this.signalOf())
  }

  /**
   * List the branches the Session's checkout offers.
   * @param args - the Session.
   * @returns the checked-out branch and both ref groups.
   */
  async branches(args?: BranchListArgs): Promise<BranchList> {
    const target = this.targetOf(args?.sessionId)
    if (target === undefined) return { current: null, local: [], remote: [] }
    try {
      return await readBranches(this.home, this.config, target.session, target.directory, this.signalOf())
    } catch {
      return { current: null, local: [], remote: [] }
    }
  }

  /**
   * Switch the checkout to an existing local branch.
   * @param args - the Session and the branch.
   * @returns the new snapshot, or the refusal.
   */
  async checkout(args?: CheckoutArgs): Promise<WriteOutcome> {
    const branch = typeof args?.branch === 'string' ? args.branch.trim() : ''
    if (branch.length === 0) return { ok: false, problem: 'no-paths', message: 'checkout needs a branch' }
    return await this.writeWith(args?.sessionId, async (git, session, directory) => {
      const listed = await readBranches(this.home, this.config, session, directory, this.signalOf())
      if (!listed.local.includes(branch)) {
        return { ok: false, problem: 'invalid-name', message: `no local branch is named ${branch}` }
      }
      if (await hasTrackedChanges(git)) {
        return { ok: false, problem: 'dirty', message: 'the working tree has changes a checkout would lose' }
      }
      await checkout(git, branch)
      return null
    })
  }

  /**
   * Create a branch and switch to it.
   * @param args - the Session, the new name, and the start point.
   * @returns the new snapshot, or the refusal.
   */
  async createBranch(args?: CreateBranchArgs): Promise<WriteOutcome> {
    const name = typeof args?.name === 'string' ? args.name.trim() : ''
    if (name.length === 0) return { ok: false, problem: 'no-paths', message: 'a branch needs a name' }
    const from = typeof args?.from === 'string' && args.from.trim().length > 0 ? args.from.trim() : undefined
    return await this.writeWith(args?.sessionId, async (git, session, directory) => {
      if (!(await isValidBranchName(git, name))) {
        return { ok: false, problem: 'invalid-name', message: `${name} is not a valid branch name` }
      }
      const listed = await readBranches(this.home, this.config, session, directory, this.signalOf())
      if (listed.local.includes(name)) {
        return { ok: false, problem: 'exists', message: `a branch named ${name} already exists` }
      }
      if (await hasTrackedChanges(git)) {
        return { ok: false, problem: 'dirty', message: 'the working tree has changes a checkout would lose' }
      }
      await createBranch(git, name, from)
      return null
    })
  }

  /**
   * List the stash entries of the Session's checkout.
   * @param args - the Session.
   * @returns the entries, newest first.
   */
  async stashes(args?: StashListArgs): Promise<readonly StashEntry[]> {
    const target = this.targetOf(args?.sessionId)
    if (target === undefined) return []
    try {
      return await readStashes(this.home, this.config, target.session, target.directory, this.signalOf())
    } catch {
      return []
    }
  }

  /**
   * Store the working tree in a new stash entry.
   * @param args - the Session and the optional message.
   * @returns the new snapshot, or the refusal.
   */
  async stash(args?: StashArgs): Promise<WriteOutcome> {
    const message = typeof args?.message === 'string' ? args.message : undefined
    return await this.writeWith(args?.sessionId, async (git) => {
      await stashPush(git, message)
      return null
    })
  }

  /**
   * Apply or pop one stash entry.
   * @param args - the Session, the entry's index, and whether to remove it.
   * @returns the new snapshot, or the refusal.
   */
  async stashApply(args?: StashApplyArgs): Promise<WriteOutcome> {
    if (!validStashIndex(args?.index)) {
      return { ok: false, problem: 'invalid-name', message: 'the stash index is not a possible entry' }
    }
    const index = args.index
    const drop = args.drop === true
    return await this.writeWith(args?.sessionId, async (git) => {
      await stashApply(git, index, drop)
      return null
    })
  }

  /**
   * Remove one stash entry without applying it.
   * @param args - the Session and the entry's index.
   * @returns the new snapshot, or the refusal.
   */
  async stashDrop(args?: StashDropArgs): Promise<WriteOutcome> {
    if (!validStashIndex(args?.index)) {
      return { ok: false, problem: 'invalid-name', message: 'the stash index is not a possible entry' }
    }
    const index = args.index
    return await this.writeWith(args?.sessionId, async (git) => {
      await stashDropEntry(git, index)
      return null
    })
  }

  /**
   * Run one network operation against the branch's upstream.
   * @param args - the Session and which operation to run.
   * @returns the new snapshot, or the refusal.
   */
  async sync(args?: SyncArgs): Promise<WriteOutcome> {
    if (!isSyncAction(args?.action)) {
      return { ok: false, problem: 'failed', message: 'sync needs fetch, pull, or push' }
    }
    const action = args.action
    return await this.writeWith(args?.sessionId, async (git, session, directory) => {
      // A network command gets the longer deadline: a fetch or push routinely
      // outlives the limit that is right for a local read.
      const network = gitIn(
        this.home,
        { ...this.config, timeoutMs: this.config.syncTimeoutMs },
        session,
        directory,
        this.signalOf(),
      )
      await sync(network, action)
      return null
    })
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
    const wanted = Array.isArray(paths) ? paths.filter((path): path is string => typeof path === 'string') : []
    if (wanted.length === 0) return { ok: false, problem: 'no-paths', message: 'no paths were given' }
    return await this.writeWith(sessionId, async (git) => {
      await write(git, kind, { paths: wanted, includeUntracked })
      return null
    })
  }

  /**
   * Run one write behind the shared Session, root, and failure handling.
   *
   * A helper that returns a refusal keeps it; one that returns null succeeded,
   * and the outcome then carries the snapshot this read produced.
   * @param sessionId - the Session from the wire.
   * @param action - the Git work to perform.
   * @returns the new snapshot, or the refusal.
   */
  private async writeWith(
    sessionId: unknown,
    action: (git: GitRunner, session: HostSession, directory: string) => Promise<WriteOutcome | null>,
  ): Promise<WriteOutcome> {
    const target = this.targetOf(sessionId)
    if (target === undefined) {
      return { ok: false, problem: 'failed', message: 'the session has no working directory' }
    }
    try {
      const root = await this.rootOf(target.session, target.directory)
      const refusal = await action(gitIn(this.home, this.config, target.session, root, this.signalOf()),
        target.session, root)
      if (refusal !== null) return refusal
      return { ok: true, snapshot: await this.snapshot(target.session, root) }
    } catch (error) {
      return { ok: false, problem: 'failed', message: messageOf(error) }
    }
  }

  /** Resolve a Session and its directory together, for the read endpoints that need both. */
  private targetOf(sessionId: unknown): Target | undefined {
    const session = this.sessionOf(sessionId)
    if (session === undefined) return undefined
    const directory = this.directoryOf(session)
    return directory === undefined ? undefined : { session, directory }
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
  /**
   * Resolve the repository root of one directory.
   *
   * A write needs the root, not a whole snapshot: reading the snapshot here
   * would run the upstream and operation probes on every staging call for a
   * value this method only discards.
   */
  private async rootOf(session: HostSession, directory: string): Promise<string> {
    return await topLevel(gitIn(this.home, this.config, session, directory, this.signalOf()))
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
