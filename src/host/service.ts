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
import {
  BranchList, BranchListArgs, CheckoutArgs, CommitArgs, CommitDetailArgs, CommitOutcome, ConflictArgs,
  ConflictChoice, ConflictContent, CreateBranchArgs, DeleteBranchArgs, DiffArgs, DiffPayload, DiscardArgs,
  GenerateMessageArgs, HistoryArgs, HistoryPage, HunkArgs, MergeBranchArgs, MessageDraft, PathsArgs,
  RepositoriesArgs, RepositoryList, ResolveConflictArgs, AbortArgs, SelectOutcome, SelectRepositoryArgs,
  StashApplyArgs, StashArgs, StashDropArgs, StashEntry, StashListArgs, StatusArgs, StatusSnapshot, SyncArgs, WriteOutcome,
} from '../shared.ts'
import { REMOTE_METHODS } from '../remote-descriptor.ts'
import {
  abort, checkout, createBranch, deleteBranch as deleteBranchEntry, hasTrackedChanges, isValidBranchName,
  isSyncAction, mergeBranch as mergeBranchEntry, stashApply, stashDrop as stashDropEntry, stashPush, sync,
  validStashIndex,
} from './branch.ts'
import { readConflict, writeResolved } from './conflict.ts'
import type { HostContext, HostSession } from './context.ts'
import { readDiff, patchRunner, readPatch } from './diff.ts'
import type { DiffConfig } from './diff.ts'
import { GitFailure, GitMissingError, gitIn } from './git.ts'
import type { GitConfig, GitRunner } from './git.ts'
import { applyHunk, hunkPatch } from './hunk.ts'
import { draftMessage, type DraftContext, type MessageConfig } from './message.ts'
import { readBranches, readCommitDiff, readHistory, readOperation, readStashes, readUpstream } from './refs.ts'
import {
  describeRepository, mergeScanned, scanRepositories,
  type ScanConfig, type ScannedRepository,
} from './repos.ts'
import { NoRepository, messageOf, readIdentity, readStatus, topLevel, unavailable } from './status.ts'
import { commitPaths, commitStaged, hasStagedChanges, write } from './write.ts'
import type { WriteKind } from './write.ts'

/** Prototype property the Typert runtime reads for the Remote method table. */
const REMOTE_METHOD_DESCRIPTOR = '@deepseek-ai/dsh-typert-protocol/remote-methods'

/** Resolved configuration of the six endpoints. */
export interface ServiceConfig extends DiffConfig {
  /** Git executable name or absolute path. */
  readonly gitCommand: string
  /** Deadline for one network command such as fetch, pull, or push. */
  readonly syncTimeoutMs: number
  /** Route, prompt, and limits for the commit-message draft. */
  readonly draft: MessageConfig
  /** Depth, blacklist, and budget of the repository scan. */
  readonly scan: ScanConfig
}

/** One resolved Session, its directory, and the checkout the endpoints read. */
interface Target {
  readonly session: HostSession
  /** The Session's working directory, which is depth 0 of the scan. */
  readonly directory: string
  /** The checkout every endpoint reads: the picked one, or the working directory. */
  readonly base: string
}

/**
 * The panel's Host service. `status` and `diff` take the Session id from the
 * wire and resolve it themselves, because a missing Session is a snapshot
 * problem rather than a failed call.
 */
export class GitSidebarService extends TypertRemoteService {
  private readonly home: HostContext
  private readonly config: ServiceConfig
  /**
   * The checkout each Session reads, when the reader picked one below its
   * working directory. Absent means the working directory's own checkout, which
   * is what every endpoint read before the picker existed.
   */
  private readonly selected = new Map<string, string>()

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
    return await this.snapshot(session, this.baseOf(session, directory))
  }

  /**
   * Scan below the Session's working directory for checkouts.
   *
   * The picker asks for this when it opens, so a panel that never switches
   * repository never pays for the walk.
   * @param args - the Session whose directory to scan.
   * @returns the checkouts found and which one the panel reads.
   */
  async repositories(args?: RepositoriesArgs): Promise<RepositoryList> {
    const target = this.targetOf(args?.sessionId)
    const depth = this.config.scan.maxDepth
    if (target === undefined) return { scanRoot: '', depth, selected: null, entries: [], truncated: false, warnings: [] }
    try {
      const current = await this.currentRepository(target)
      const scan = await scanRepositories(target.directory, this.config.scan)
      return {
        scanRoot: target.directory,
        depth,
        selected: this.selected.get(target.session.id) ?? null,
        entries: mergeScanned(current, scan.entries),
        truncated: scan.truncated,
        warnings: scan.warnings,
      }
    } catch (error) {
      return {
        scanRoot: target.directory,
        depth,
        selected: this.selected.get(target.session.id) ?? null,
        entries: [],
        truncated: false,
        warnings: [],
        error: messageOf(error),
      }
    }
  }

  /**
   * Read the panel from another checkout of the Session's directory tree.
   *
   * The choice is remembered per Session and applies to every endpoint, so the
   * diff viewer follows it too: a patch address carries no repository, and a
   * selection kept on the client would leave the two halves disagreeing.
   * @param args - the Session and the checkout root; omit the root to go back.
   * @returns the new snapshot, or the refusal.
   */
  async selectRepository(args?: SelectRepositoryArgs): Promise<SelectOutcome> {
    const target = this.targetOf(args?.sessionId)
    if (target === undefined) {
      return { ok: false, problem: 'failed', message: 'the session has no working directory' }
    }
    const wanted = typeof args?.root === 'string' ? args.root.trim() : ''
    if (wanted.length === 0) {
      this.selected.delete(target.session.id)
      return { ok: true, snapshot: await this.snapshot(target.session, target.directory) }
    }
    try {
      const root = await topLevel(gitIn(this.home, this.config, target.session, wanted, this.signalOf()))
      if (!samePath(root, wanted)) {
        return { ok: false, problem: 'no-repository', message: `${wanted} is not the top level of a checkout` }
      }
      this.selected.set(target.session.id, root)
      return { ok: true, snapshot: await this.snapshot(target.session, root) }
    } catch (error) {
      if (error instanceof NoRepository) {
        return { ok: false, problem: 'no-repository', message: `${wanted} is not inside a Git checkout` }
      }
      return { ok: false, problem: 'failed', message: messageOf(error) }
    }
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
      this.baseOf(session, directory),
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
    if (target === undefined) return { commits: [], hasMore: false, total: 0 }
    const branch = typeof args?.branch === 'string' ? args.branch.trim() : ''
    try {
      return await readHistory(this.home, this.config, target.session, target.base, {
        sessionId: target.session.id,
        limit: typeof args?.limit === 'number' ? args.limit : 20,
        skip: typeof args?.skip === 'number' ? args.skip : 0,
        ...branch.length === 0 ? {} : { branch },
      }, this.signalOf())
    } catch {
      return { commits: [], hasMore: false, total: 0 }
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
    return await readCommitDiff(this.home, this.config, target.session, target.base, {
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
      return await readBranches(this.home, this.config, target.session, target.base, this.signalOf())
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
   * Delete a local branch.
   * @param args - the Session, the branch, and whether an unmerged branch goes too.
   * @returns the new snapshot, or the refusal.
   */
  async deleteBranch(args?: DeleteBranchArgs): Promise<WriteOutcome> {
    const branch = typeof args?.branch === 'string' ? args.branch.trim() : ''
    if (branch.length === 0) return { ok: false, problem: 'no-paths', message: 'a branch needs a name' }
    const force = args?.force === true
    return await this.writeWith(args?.sessionId, async (git, session, directory) => {
      const listed = await readBranches(this.home, this.config, session, directory, this.signalOf())
      if (branch === listed.current) {
        return { ok: false, problem: 'current-branch', message: `cannot delete the checked-out branch ${branch}` }
      }
      if (!listed.local.includes(branch)) {
        return { ok: false, problem: 'invalid-name', message: `no local branch is named ${branch}` }
      }
      // The helpers report a named outcome instead of returning a refusal,
      // because an unmerged branch is the one case the client retries.
      const deleted = await deleteBranchEntry(git, branch, force)
      switch (deleted.kind) {
        case 'deleted':
          return null
        case 'unmerged':
          return { ok: false, problem: 'unmerged', message: deleted.message }
        case 'failed':
          return { ok: false, problem: 'failed', message: deleted.message }
      }
    })
  }

  /**
   * Merge a branch into the checked-out one.
   *
   * A conflict is reported as success: the merge is in progress and the
   * snapshot says so, which is how the client offers the conflict view. Only a
   * merge that never started is a refusal.
   * @param args - the Session and the branch to merge.
   * @returns the new snapshot, or the refusal.
   */
  async mergeBranch(args?: MergeBranchArgs): Promise<WriteOutcome> {
    const branch = typeof args?.branch === 'string' ? args.branch.trim() : ''
    if (branch.length === 0) return { ok: false, problem: 'no-paths', message: 'a branch needs a name' }
    return await this.writeWith(args?.sessionId, async (git, session, directory) => {
      const listed = await readBranches(this.home, this.config, session, directory, this.signalOf())
      if (!listed.local.includes(branch)) {
        return { ok: false, problem: 'invalid-name', message: `no local branch is named ${branch}` }
      }
      const merge = await mergeBranchEntry(git, branch)
      if (merge.kind === 'failed') return { ok: false, problem: 'failed', message: merge.message }
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
      return await readStashes(this.home, this.config, target.session, target.base, this.signalOf())
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
   * Read one conflicted file's regions.
   * @param args - the Session and the conflicted path.
   * @returns the regions, a resolved notice, or the reason it is unavailable.
   */
  async conflict(args?: ConflictArgs): Promise<ConflictContent> {
    const target = this.targetOf(args?.sessionId)
    if (target === undefined || typeof args?.path !== 'string') {
      return { kind: 'error', message: 'conflict requires a session and a path' }
    }
    try {
      const root = await this.rootOf(target.session, target.base)
      return await readConflict(root, args.path)
    } catch (error) {
      return { kind: 'error', message: messageOf(error) }
    }
  }

  /**
   * Write a file with one side chosen per conflicted region, then mark it resolved.
   * @param args - the Session, the path, and one choice per region.
   * @returns the new snapshot, or the refusal.
   */
  async resolveConflict(args?: ResolveConflictArgs): Promise<WriteOutcome> {
    const path = typeof args?.path === 'string' ? args.path : ''
    if (path.length === 0) return { ok: false, problem: 'no-paths', message: 'no path was given' }
    const choices = Array.isArray(args?.choices)
      ? args.choices.filter((choice): choice is ConflictChoice =>
        choice === 'ours' || choice === 'theirs' || choice === 'both')
      : []
    return await this.writeWith(args?.sessionId, async (git, session, directory) => {
      const root = await this.rootOf(session, directory)
      const content = await readConflict(root, path)
      if (content.kind === 'error') return { ok: false, problem: 'failed', message: content.message }
      if (content.kind === 'resolved') {
        // Nothing left to choose: the reader resolved it by hand, so only the
        // index step remains.
        await git('add', ['add', '--', path])
        return null
      }
      if (!(await writeResolved(root, path, content.segments, choices))) {
        return { ok: false, problem: 'failed', message: 'the resolved file could not be written' }
      }
      await git('add', ['add', '--', path])
      return null
    })
  }

  /**
   * Abort the merge, rebase, cherry-pick, or revert the checkout is between.
   * @param args - the Session.
   * @returns the new snapshot, or the refusal.
   */
  async abortOperation(args?: AbortArgs): Promise<WriteOutcome> {
    return await this.writeWith(args?.sessionId, async (git) => {
      const operation = await readOperation(git)
      if (operation === null) {
        return { ok: false, problem: 'failed', message: 'no operation is in progress' }
      }
      await abort(git, operation)
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
   * Stage one hunk of a file's unstaged diff.
   * @param args - the Session, the path, and the hunk's position.
   * @returns the new snapshot, or the refusal.
   */
  async stageHunk(args?: HunkArgs): Promise<WriteOutcome> {
    return await this.applyHunkWrite(args, false)
  }

  /**
   * Remove one hunk of a file's staged diff from the index.
   * @param args - the Session, the path, and the hunk's position.
   * @returns the new snapshot, or the refusal.
   */
  async unstageHunk(args?: HunkArgs): Promise<WriteOutcome> {
    return await this.applyHunkWrite(args, true)
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
   * Commit the index, or only the paths the reader picked, with the given message.
   * @param args - the Session, the commit message, and the picked paths when any.
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
    const amend = args?.amend === true
    const stageAll = args?.stageAll === true
    const paths = Array.isArray(args?.paths)
      ? args.paths.filter((path): path is string => typeof path === 'string')
      : []
    if (!paths.every(isRepositoryPath)) {
      return { ok: false, problem: 'failed', message: 'a picked path is outside the repository' }
    }
    const only = paths.length > 0
    try {
      const root = await this.rootOf(session, this.baseOf(session, directory))
      const git = gitIn(this.home, this.config, session, root, this.signalOf())
      if (!amend) {
        const identity = await readIdentity(git)
        if (identity.name === null || identity.email === null) {
          return {
            ok: false,
            problem: 'identity-missing',
            message: 'set user.name and user.email before committing',
          }
        }
      }
      if (stageAll && !only) await write(git, 'stage', { paths: await allPaths(git), includeUntracked: false })
      // An amend may fold nothing new into the commit, so the index check only
      // applies when a new commit is being made. Picked paths are the commit's
      // whole content, so what the index holds says nothing about them either.
      if (!only && !amend && !(await hasStagedChanges(git))) {
        return { ok: false, problem: 'nothing-staged', message: 'the index holds no change to commit' }
      }
      const commit = only
        ? await commitPaths(git, message, paths, amend)
        : await commitStaged(git, message, amend)
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
   * Move one hunk of one file into or out of the index.
   *
   * The patch is read again here rather than taken from the browser, so a hunk
   * index always refers to the diff as Git reports it now: an index past the
   * end means the file changed under the reader, which is exactly the stale
   * case the client refreshes for. The side to read and the direction to apply
   * flip together, because a staged hunk is removed by reversing its own patch.
   * @param args - the Session, the path, and the hunk's position.
   * @param reverse - remove the hunk from the index instead of adding it.
   * @returns the new snapshot, or the refusal.
   */
  private async applyHunkWrite(args: HunkArgs | undefined, reverse: boolean): Promise<WriteOutcome> {
    const path = typeof args?.path === 'string' ? args.path : ''
    if (path.length === 0) return { ok: false, problem: 'no-paths', message: 'no path was given' }
    if (typeof args?.hunk !== 'number' || !Number.isInteger(args.hunk) || args.hunk < 0) return staleHunk()
    const hunk = args.hunk
    return await this.writeWith(args.sessionId, async (git, session, root) => {
      const patcher = patchRunner(this.home, this.config, session, root, this.signalOf())
      const capture = await readPatch(patcher, { path, staged: reverse }, this.config.maxDiffBytes)
      if (capture.kind === 'error') return { ok: false, problem: 'failed', message: capture.message }
      if (capture.kind === 'binary') {
        return { ok: false, problem: 'failed', message: 'the file has no textual diff to apply' }
      }
      if (capture.lossy) return staleHunk()
      const patch = hunkPatch(capture.patch, hunk)
      if (patch === undefined) return staleHunk()
      return await applyHunk(git, patch, reverse)
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
      const root = await this.rootOf(target.session, target.base)
      const refusal = await action(gitIn(this.home, this.config, target.session, root, this.signalOf()),
        target.session, root)
      if (refusal !== null) return refusal
      return { ok: true, snapshot: await this.snapshot(target.session, root) }
    } catch (error) {
      return { ok: false, problem: 'failed', message: messageOf(error) }
    }
  }

  /** Resolve a Session and its directory together, for the read endpoints that need both. */
  /**
   * Ask the configured model for a commit message.
   *
   * The answer is a draft: the reader edits it before committing, so nothing
   * here writes to the repository.
   * @param args - the Session, and which side of the change to describe.
   * @returns the draft, or the reason it could not be written.
   */
  async generateMessage(args?: GenerateMessageArgs): Promise<MessageDraft> {
    const target = this.targetOf(args?.sessionId)
    if (target === undefined) {
      return { ok: false, problem: 'failed', message: 'no Session is open for this request' }
    }
    return await draftMessage(
      this.home as DraftContext,
      this.config.draft,
      target.session,
      target.base,
      args?.staged === true,
      this.signalOf(),
    )
  }

  private targetOf(sessionId: unknown): Target | undefined {
    const session = this.sessionOf(sessionId)
    if (session === undefined) return undefined
    const directory = this.directoryOf(session)
    return directory === undefined ? undefined : { session, directory, base: this.baseOf(session, directory) }
  }

  /** The checkout every endpoint reads for one Session. */
  private baseOf(session: HostSession, directory: string): string {
    return this.selected.get(session.id) ?? directory
  }

  /**
   * Resolve the checkout containing the Session's working directory.
   *
   * The walk below the working directory cannot see a top level above it, so the
   * default checkout is read from Git once per scan. A directory outside every
   * checkout, or a missing Git, leaves the walk's own result as the whole list.
   * @param target - the Session and its directory.
   * @returns the default checkout, or undefined when the directory has none.
   */
  private async currentRepository(target: Target): Promise<ScannedRepository | undefined> {
    try {
      const root = await topLevel(gitIn(this.home, this.config, target.session, target.directory, this.signalOf()))
      return await describeRepository(target.directory, root)
    } catch {
      return undefined
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

/** Every tracked change in the working tree, relative to the repository root. */
async function allPaths(git: GitRunner): Promise<string[]> {
  const status = await git('status', ['status', '--porcelain=v1', '-z', '--untracked-files=no'])
  return status.stdout
    .split('\0')
    .map(entry => entry.slice(3).trim())
    .filter(path => path.length > 0)
}

/**
 * Whether a path from the browser names something inside the repository.
 *
 * Git runs at the top level, so an absolute path or one that climbs out with
 * `..` would name a file the panel never listed.
 * @param path - the path the browser sent.
 * @returns whether Git may be given it after `--`.
 */
function isRepositoryPath(path: string): boolean {
  if (path.length === 0) return false
  if (path.startsWith('/') || path.startsWith('\\')) return false
  if (/^[A-Za-z]:/.test(path)) return false
  return path.split(/[\\/]/).every(segment => segment !== '..')
}

/** The refusal a hunk write returns when the diff it was asked about is no longer the current one. */
function staleHunk(): WriteOutcome {
  return { ok: false, problem: 'stale', message: '差异已变化，请刷新后重试' }
}

/**
 * Compare two paths as the platform does.
 *
 * Git prints the top level with the separators and casing the file system uses,
 * so a root the browser sent with other separators or another case is the same
 * checkout; Windows compares case-insensitively, POSIX does not.
 * @param left - one path.
 * @param right - the other.
 * @returns whether the two name the same directory.
 */
function samePath(left: string, right: string): boolean {
  const normalize = (path: string): string => {
    const unified = path.split('\\').join('/').replace(/\/+$/, '')
    return process.platform === 'win32' ? unified.toLowerCase() : unified
  }
  return normalize(left) === normalize(right)
}

Object.defineProperty(GitSidebarService.prototype, REMOTE_METHOD_DESCRIPTOR, {
  configurable: true,
  value: Object.freeze({
    version: 1,
    methods: Object.freeze(REMOTE_METHODS.map(method =>
      Object.freeze({ method, invocation: Object.freeze({ kind: 'direct' }) }))),
  }),
})
