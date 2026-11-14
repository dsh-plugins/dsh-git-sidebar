/**
 * Client half of the Git sidebar bundle.
 *
 * Three extension points, all in the right Sidebar:
 *
 * - `sidebarRightTabs.register` declares the panel's tab type: a page type (no
 *   resource patterns), opened by kind, whose `guide` entry is the button on the
 *   Start page. `order` 12 places it directly below Workspace files (10) and
 *   above Code review (15). No command id is set, so the button carries no
 *   shortcut.
 * - `sidebar.right.pane.tab`, keyed by the type's id, draws the panel body; the
 *   diff viewer's type and body register the same way under their own id.
 * - The `gitSidebar` Remote namespace is mounted here, so every body reads the
 *   same typed surface.
 *
 * No Harness Client package is loaded as a module. React arrives from the
 * shell's module table, zod arrives the same way for the Remote descriptors, and
 * each stylesheet is injected as a `<style>` element the plugin's effect owns.
 */

import type { CommitDetailArgs, DiffArgs, DiffPayload } from './shared.ts'
import { commitDiffAddress, DIFF_TAB_ID, diffAddress, PANEL_TAB_ID, PANEL_TAB_KIND } from './shared.ts'
import {
  mountGitRemote, resolveZod, type GitClientContext, type GitRemoteHandle, type ReactLike, type TabBodyProps,
} from './client/api.ts'
import { DIFF_DICTS, DIFF_LOCALE_NS, DIFF_STYLES, DIFF_TAB_DEFINITION, makeDiffBody } from './client/diff-tab.ts'
import { GitGuideIcon } from './client/icons.ts'
import { makePanel } from './client/panel.ts'
import { createPanelCache } from './client/panel-cache.ts'
import { clearDiffCache, readDiffCache, writeDiffCache } from './client/diff-cache.ts'
import { PANEL_STYLES } from './client/styles.ts'

/** This package's identity in the loader's module table and on the Remote contribution. */
const SOURCE = '@dsh-plugin/dsh-git-sidebar'

/** Copy namespace of the panel. */
const NS = 'gitSidebar'

/** The bundle's loader entry point, absent from the standard DOM typings. */
interface ModuleLoaderHost {
  __ModuleLoader__: {
    load(registration: { id: string; factory: (require: (name: string) => unknown) => unknown }): void
  }
}

const loader = (globalThis as unknown as ModuleLoaderHost).__ModuleLoader__

/** Every string the panel and its dialogs show, in the two shipped languages. */
const DICTS: Record<string, Record<string, string>> = {
  zh: {
    'panel.label': 'Git',
    'guide.title': 'Git 面板',
    'guide.description': '查看分支、工作区状态与提交',
    'refresh': '刷新',
    'more.actions': '更多操作',
    'branch.unknown': '未知分支',
    'branch.selector': '切换分支',
    'branch.loading': '正在读取分支…',
    'branch.empty': '没有本地分支',
    'branch.newPlaceholder': '新建分支',
    'branch.delete': '删除分支',
    'branch.create': '创建',
    'branch.mergeInto': '合并到当前分支',
    'notice.deleteFailed': '删除分支失败',
    'notice.mergeFailed': '合并失败',
    'dialog.deleteBranch': '删除分支 {branch}？',
    'dialog.forceDeleteBranch': '{branch} 上有未合并的提交，强制删除会丢失这些提交。继续？',
    'dialog.merge': '把 {branch} 合并到 {current}？',
    'upstream.title': '上游 {name}',
    'operation.merge': '正在进行合并（merge）',
    'operation.rebase': '正在进行变基（rebase）',
    'operation.cherry-pick': '正在挑选提交（cherry-pick）',
    'operation.abort': '中止',
    'operation.abortLater': '中止操作将在下一版本提供',
    'sync.fetch': '获取（fetch）',
    'sync.pull': '拉取（pull）',
    'sync.push': '推送（push）',
    'sync.noUpstream': '当前分支没有上游',
    'history.title': '历史',
    'history.count': '{count} 个提交',
    'history.empty': '还没有提交',
    'history.loading': '正在加载…',
    'history.more': '加载更多',
    'history.end': '已到最早一条',
    'history.failed': '无法读取提交历史',
    'history.expand': '展开历史',
    'history.collapse': '收起历史',
    'history.justNow': '刚刚',
    'history.minutesAgo': '{count} 分钟前',
    'history.hoursAgo': '{count} 小时前',
    'history.daysAgo': '{count} 天前',
    'history.monthsAgo': '{count} 个月前',
    'history.yearsAgo': '{count} 年前',
    'stash.group': '储藏',
    'stash.empty': '没有储藏',
    'stash.current': '储藏当前改动',
    'stash.currentDisabled': '工作区干净，没有可储藏的改动',
    'stash.apply': '应用',
    'stash.pop': '弹出',
    'stash.drop': '删除',
    'group.staged': '暂存更改',
    'group.changes': '更改',
    'list.filter': '过滤文件',
    'list.selected': '已选择 {count} 个文件',
    'list.clear': '取消选择',
    'group.conflicts': '冲突',
    'group.stageAll': '全部暂存',
    'group.unstageAll': '全部取消暂存',
    'group.discardAll': '放弃全部更改',
    'group.discardStaged': '放弃全部暂存',
    'row.stage': '暂存',
    'row.unstage': '取消暂存',
    'row.discard': '放弃更改',
    'row.diff': '查看差异',
    'row.resolve': '解决冲突',
    'row.renamed': '{from} → {path}',
    'commit.placeholder': '提交信息（Ctrl+Enter 提交）',
    'commit.submit': '提交',
    'commit.hint': '已暂存 {count} 个文件',
    'commit.busy': '正在处理…',
    'commit.identityMissing': '未配置 Git 用户身份，请先设置 user.name 与 user.email',
    'commit.nothingStaged': '暂存区为空，请先暂存要提交的更改',
    'commit.emptyMessage': '请先填写提交信息',
    'commit.clean': '工作区没有改动；可勾选「改写上次提交」修改提交信息',
    'commit.amend': '改写上次提交',
    'commit.amendHint': '将改写上一次提交',
    'commit.stageAllHint': '提交时会先暂存 {count} 个文件',
    'commit.stageAllSubmit': '暂存全部并提交',
    'notice.stageFailed': '暂存失败',
    'notice.unstageFailed': '取消暂存失败',
    'notice.discardFailed': '放弃更改失败',
    'notice.checkoutFailed': '切换分支失败',
    'notice.createBranchFailed': '创建分支失败',
    'notice.stashFailed': '储藏失败',
    'notice.stashApplyFailed': '应用储藏失败',
    'notice.stashPopFailed': '弹出储藏失败',
    'notice.stashDropFailed': '删除储藏失败',
    'notice.syncFailed': '同步失败',
    'notice.resolveFailed': '解决冲突失败',
    'notice.abortFailed': '中止操作失败',
    'conflict.ours': '保留当前',
    'conflict.theirs': '保留传入',
    'conflict.both': '两者都保留',
    'conflict.loading': '正在读取冲突内容…',
    'conflict.clean': '这个文件已没有冲突标记；标记为已解决即可暂存。',
    'conflict.markResolved': '标记为已解决',
    'conflict.close': '关闭',
    'dialog.abort': '中止正在进行的 {operation}？已解决的冲突会全部丢失。',
    'notice.syncDone': '{action} 完成',
    'notice.dirty': '有未提交的改动，无法切换分支',
    'notice.exists': '同名分支已存在',
    'notice.invalidName': '这个名称不是有效的分支名',
    'notice.stale': '差异已变化，请刷新后重试',
    'state.noSession.title': '没有可用的会话',
    'state.noSession.body': '打开一个会话后，这里会显示该会话工作目录的 Git 状态。',
    'state.clean.title': '没有未提交的更改',
    'state.clean.body': '工作区与暂存区都与当前提交一致。',
    'state.no-repository.title': '这里不是 Git 仓库',
    'state.no-repository.body': '可以在该目录的终端里执行 git init 创建一个仓库，或切换到其他工作目录。',
    'state.no-directory.title': '没有可用的工作目录',
    'state.no-directory.body': '请为会话选择一个工作目录，再回到这里。',
    'state.git-missing.title': '找不到 git',
    'state.git-missing.body': '请安装 Git 并确保它位于 PATH 中，然后刷新。',
    'state.failed.title': '无法读取仓库状态',
    'state.failed.body': '读取 Git 状态时失败，下一条信息是具体原因。',
    'dialog.discard.title': '放弃这些更改？',
    'dialog.discard.body': '未暂存的内容将被还原到最近一次提交，此操作无法撤销。',
    'dialog.discard.untracked': '其中包含未跟踪的文件：它们会被直接删除，无法恢复。',
    'dialog.filesMany': '{first} 等 {count} 个文件',
    'dialog.stash.popTitle': '弹出这条储藏？',
    'dialog.stash.popBody': '改动会回到工作区，储藏记录将被删除。',
    'dialog.stash.dropTitle': '删除这条储藏？',
    'dialog.stash.dropBody': '储藏记录将被删除，其中的改动不会再回到工作区。',
    'dialog.pull.title': '拉取远端？',
    'dialog.pull.body': '会把 {name} 合入当前分支，可能产生冲突或改写工作区。',
    'dialog.push.title': '推送到远端？',
    'dialog.push.body': '会把当前分支的提交推送到 {name}，其他人会看到这些提交。',
  },
  en: {
    'panel.label': 'Git',
    'guide.title': 'Git panel',
    'guide.description': 'Inspect branches, working-tree status and commits',
    'refresh': 'Refresh',
    'more.actions': 'More actions',
    'branch.unknown': 'Unknown branch',
    'branch.selector': 'Switch branch',
    'branch.loading': 'Reading branches…',
    'branch.empty': 'No local branches',
    'branch.newPlaceholder': 'New branch',
    'branch.delete': 'Delete branch',
    'branch.mergeInto': 'Merge into the current branch',
    'notice.deleteFailed': 'Could not delete the branch',
    'notice.mergeFailed': 'Could not merge the branch',
    'dialog.deleteBranch': 'Delete the branch {branch}?',
    'dialog.forceDeleteBranch': '{branch} holds unmerged commits; forcing the delete loses them. Continue?',
    'dialog.merge': 'Merge {branch} into {current}?',
    'branch.create': 'Create',
    'upstream.title': 'Tracking {name}',
    'operation.merge': 'A merge is in progress',
    'operation.rebase': 'A rebase is in progress',
    'operation.cherry-pick': 'A cherry-pick is in progress',
    'operation.abort': 'Abort',
    'operation.abortLater': 'Aborting arrives in the next version',
    'sync.fetch': 'Fetch',
    'sync.pull': 'Pull',
    'sync.push': 'Push',
    'sync.noUpstream': 'the current branch has no upstream',
    'history.title': 'History',
    'history.count': '{count} commits',
    'history.empty': 'No commits yet',
    'history.loading': 'Loading…',
    'history.more': 'Load more',
    'history.end': 'That is the first commit',
    'history.failed': 'Could not read the commit history',
    'history.expand': 'Expand the history',
    'history.collapse': 'Collapse the history',
    'history.justNow': 'just now',
    'history.minutesAgo': '{count}m ago',
    'history.hoursAgo': '{count}h ago',
    'history.daysAgo': '{count}d ago',
    'history.monthsAgo': '{count}mo ago',
    'history.yearsAgo': '{count}y ago',
    'stash.group': 'Stashes',
    'stash.empty': 'No stashes',
    'stash.current': 'Stash current changes',
    'stash.currentDisabled': 'The working tree is clean, so there is nothing to stash',
    'stash.apply': 'Apply',
    'stash.pop': 'Pop',
    'stash.drop': 'Drop',
    'group.staged': 'Staged changes',
    'group.changes': 'Changes',
    'list.filter': 'Filter files',
    'list.selected': '{count} file(s) selected',
    'list.clear': 'Clear',
    'group.conflicts': 'Conflicts',
    'group.stageAll': 'Stage all',
    'group.unstageAll': 'Unstage all',
    'group.discardAll': 'Discard all changes',
    'group.discardStaged': 'Discard all staged',
    'row.stage': 'Stage',
    'row.unstage': 'Unstage',
    'row.discard': 'Discard changes',
    'row.diff': 'View diff',
    'row.resolve': 'Resolve conflict',
    'row.renamed': '{from} → {path}',
    'commit.placeholder': 'Commit message (Ctrl+Enter to commit)',
    'commit.submit': 'Commit',
    'commit.hint': '{count} file(s) staged',
    'commit.busy': 'Working…',
    'commit.identityMissing': 'No Git author is configured; set user.name and user.email first',
    'commit.nothingStaged': 'Nothing is staged; stage the changes to commit',
    'commit.emptyMessage': 'Write a commit message first',
    'commit.clean': 'The tree is clean; tick Amend to rewrite the message',
    'commit.amend': 'Amend the last commit',
    'commit.amendHint': 'The last commit is rewritten',
    'commit.stageAllHint': 'Committing stages {count} file(s) first',
    'commit.stageAllSubmit': 'Stage all and commit',
    'notice.stageFailed': 'Could not stage',
    'notice.unstageFailed': 'Could not unstage',
    'notice.discardFailed': 'Could not discard',
    'notice.checkoutFailed': 'Could not switch branches',
    'notice.createBranchFailed': 'Could not create the branch',
    'notice.stashFailed': 'Could not stash',
    'notice.stashApplyFailed': 'Could not apply the stash',
    'notice.stashPopFailed': 'Could not pop the stash',
    'notice.stashDropFailed': 'Could not drop the stash',
    'notice.syncFailed': 'Sync failed',
    'notice.resolveFailed': 'Could not resolve the conflict',
    'notice.abortFailed': 'Could not abort the operation',
    'conflict.ours': 'Keep ours',
    'conflict.theirs': 'Keep theirs',
    'conflict.both': 'Keep both',
    'conflict.loading': 'Reading the conflict…',
    'conflict.clean': 'This file holds no conflict markers; mark it resolved to stage it.',
    'conflict.markResolved': 'Mark resolved',
    'conflict.close': 'Close',
    'dialog.abort': 'Abort the {operation} in progress? Every resolution in it is lost.',
    'notice.syncDone': '{action} finished',
    'notice.dirty': 'The working tree has uncommitted changes, so the branch was not switched',
    'notice.exists': 'A branch with that name already exists',
    'notice.invalidName': 'That is not a valid branch name',
    'notice.stale': 'The diff changed; refresh and try again',
    'state.noSession.title': 'No Session to read',
    'state.noSession.body': 'Open a Session and this panel shows the Git state of its working directory.',
    'state.clean.title': 'No uncommitted changes',
    'state.clean.body': 'The working tree and the index both match the current commit.',
    'state.no-repository.title': 'This is not a Git repository',
    'state.no-repository.body': 'Run git init in a terminal at that directory, or switch to another working directory.',
    'state.no-directory.title': 'No working directory',
    'state.no-directory.body': 'Choose a working directory for the Session, then come back.',
    'state.git-missing.title': 'git was not found',
    'state.git-missing.body': 'Install Git and make sure it is on PATH, then refresh.',
    'state.failed.title': 'Could not read the repository',
    'state.failed.body': 'Reading the Git state failed; the line below is the reason.',
    'dialog.discard.title': 'Discard these changes?',
    'dialog.discard.body': 'Unstaged content returns to the last commit. This cannot be undone.',
    'dialog.discard.untracked': 'Untracked files are among them: they are deleted outright and cannot be restored.',
    'dialog.filesMany': '{first} and {count} files in all',
    'dialog.stash.popTitle': 'Pop this stash entry?',
    'dialog.stash.popBody': 'The changes return to the working tree and the entry is removed.',
    'dialog.stash.dropTitle': 'Drop this stash entry?',
    'dialog.stash.dropBody': 'The entry is removed and its changes never return to the working tree.',
    'dialog.pull.title': 'Pull from the upstream?',
    'dialog.pull.body': 'Brings {name} into the current branch, which can conflict or rewrite the working tree.',
    'dialog.push.title': 'Push to the upstream?',
    'dialog.push.body': 'Publishes this branch’s commits to {name}, where other people will see them.',
  },
}

/**
 * Mount one stylesheet as a `<style>` element the plugin's effect owns, so a
 * disabled or reloaded plugin leaves no rules behind. The sidebar's own module
 * system claims and removes the tags a factory injects, which is why the plugin
 * and the sheet are both tagged.
 * @param ctx - the bundle's context.
 * @param sheet - the rules to mount.
 * @param name - the sheet's identity within this package.
 */
function installStyles(ctx: GitClientContext, sheet: string, name: string): void {
  ctx.effect(() => {
    if (typeof document === 'undefined') return
    const tag = document.createElement('style')
    tag.dataset.plugin = SOURCE
    tag.dataset.pluginCss = `${SOURCE}/${name}`
    tag.textContent = sheet
    document.head.appendChild(tag)
    return () => { tag.remove() }
  }, `git-sidebar: ${name}`)
}

/**
 * Read one file's diff, through the cache when that address has been read.
 *
 * The cache is keyed by the address rather than by the arguments, so the same
 * key the tab system uses is the key the payload is stored under: reopening a
 * closed tab asks for the address it already had, and the cache answers.
 * @param remote - the mounted namespace, wrapped for the panel.
 * @returns the reader the diff body is given.
 */
function diffReader(remote: GitRemoteHandle): (args: DiffArgs) => Promise<DiffPayload> {
  return (args) => {
    const address = diffAddress(args.path, args.staged)
    const cached = readDiffCache(address)
    if (cached !== undefined) return Promise.resolve(cached)
    return remote.ready
      .then(api => api.requestDiff(args))
      .then((payload) => {
        // Only a settled payload is stored: a failure would otherwise read as
        // "already loaded" on the next open and hide the retry.
        if (payload.kind !== 'error') writeDiffCache(address, payload)
        return payload
      })
  }
}

/**
 * Read one commit's own patch, through the same cache.
 * @param remote - the mounted namespace, wrapped for the panel.
 * @returns the reader the diff body is given for a `commit/` address.
 */
function commitReader(remote: GitRemoteHandle): (args: CommitDetailArgs) => Promise<DiffPayload> {
  return (args) => {
    const address = commitDiffAddress(args.sha)
    const cached = readDiffCache(address)
    if (cached !== undefined) return Promise.resolve(cached)
    return remote.ready
      .then(api => api.requestCommit(args))
      .then((payload) => {
        if (payload.kind !== 'error') writeDiffCache(address, payload)
        return payload
      })
  }
}

loader.load({
  id: SOURCE,
  factory(requireModule) {
    const React = requireModule('react') as ReactLike
    const zod = resolveZod(requireModule('zod'))
    const GuideIcon = GitGuideIcon(React)

    return {
      inject: ['remote', 'slots', 'locale', 'sidebarRightTabs'],
      apply(ctx: GitClientContext) {
        ctx.effect(() => ctx.locale.register(NS, DICTS), 'git-sidebar: dictionaries')
        ctx.effect(() => ctx.locale.register(DIFF_LOCALE_NS, DIFF_DICTS), 'git-sidebar: diff dictionaries')
        const t = ctx.locale.bind(NS)
        installStyles(ctx, PANEL_STYLES, 'panel.css')
        installStyles(ctx, DIFF_STYLES, 'diff.css')

        if (zod === undefined) {
          // The namespace cannot be mounted without the descriptor codecs, so
          // the panel says so instead of failing every call at draw time.
          console.error(`git-sidebar: the loader module table has no zod; ${SOURCE} mounts no Remote`)
        }
        const remote: GitRemoteHandle = zod === undefined
          ? { ready: Promise.reject(new Error('git-sidebar: zod is unavailable')) }
          : mountGitRemote(ctx, zod)
        void remote.ready.catch(() => undefined)
        // The panel's read-through cache lives as long as this activation, which
        // is what lets a closed and reopened tab paint without asking again.
        const panelCache = createPanelCache()
        // Stage one: what the panel's tab type is, plus its Start-page button.
        // A page type names no resource patterns and is opened by kind.
        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: PANEL_TAB_ID,
          kind: PANEL_TAB_KIND,
          title: () => t('panel.label'),
          guide: [{
            id: 'open',
            // Workspace files is 10 and Code review 15: 12 sits directly below
            // the first button.
            order: 12,
            title: () => t('guide.title'),
            description: () => t('guide.description'),
            icon: GuideIcon,
          }],
        }), 'git-sidebar: tab type')

        const Panel = makePanel(React, {
          api: remote,
          t,
          tab: (props: TabBodyProps) => (props.useTabInfo === undefined ? undefined : props.useTabInfo().tab),
          // One cache per activation: closing the panel tab unmounts its body,
          // and the next mount is what has to read this instead of the Host.
          cache: panelCache,
          clearDiffCache,
        })

        // Stage two: the panel body under the type's id.
        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: PANEL_TAB_ID,
          locale: NS,
        }, Panel)), 'git-sidebar: panel body')

        // The diff viewer: the same two-stage path under its own id. Its body
        // is built with the loader's React and reads a file, or a commit's own
        // patch, through the same Remote namespace.
        const DiffBody = makeDiffBody(React, {
          requestDiff: diffReader(remote),
          requestCommit: commitReader(remote),
          moveHunk: (args, direction) => remote.ready.then(api =>
            direction === 'unstage' ? api.unstageHunk(args) : api.stageHunk(args)),
          t: ctx.locale.bind(DIFF_LOCALE_NS),
          stylesInstalled: true,
        })
        ctx.effect(() => ctx.sidebarRightTabs.register(DIFF_TAB_DEFINITION), 'git-sidebar: diff tab type')
        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: DIFF_TAB_ID,
          locale: DIFF_LOCALE_NS,
        }, DiffBody)), 'git-sidebar: diff body')
      },
    }
  },
})
