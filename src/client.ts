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

import type { DiffArgs, DiffPayload } from './shared.ts'
import { DIFF_TAB_ID, PANEL_TAB_ID, PANEL_TAB_KIND } from './shared.ts'
import {
  mountGitRemote, resolveZod, type GitClientContext, type GitRemoteHandle, type ReactLike, type TabBodyProps,
} from './client/api.ts'
import { DIFF_DICTS, DIFF_LOCALE_NS, DIFF_STYLES, DIFF_TAB_DEFINITION, makeDiffBody } from './client/diff-tab.ts'
import { GitGuideIcon } from './client/icons.ts'
import { makePanel } from './client/panel.ts'
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
    'branch.unknown': '未知分支',
    'group.staged': '暂存更改',
    'group.changes': '更改',
    'group.conflicts': '冲突',
    'group.stageAll': '全部暂存',
    'group.unstageAll': '全部取消暂存',
    'group.discardAll': '放弃全部更改',
    'group.discardStaged': '放弃全部暂存',
    'row.stage': '暂存',
    'row.unstage': '取消暂存',
    'row.discard': '放弃更改',
    'row.diff': '查看差异',
    'row.renamed': '{from} → {path}',
    'commit.placeholder': '提交信息（Ctrl+Enter 提交）',
    'commit.submit': '提交',
    'commit.hint': '已暂存 {count} 个文件',
    'commit.busy': '正在处理…',
    'commit.identityMissing': '未配置 Git 用户身份，请先设置 user.name 与 user.email',
    'commit.nothingStaged': '暂存区为空，请先暂存要提交的更改',
    'commit.emptyMessage': '请先填写提交信息',
    'notice.stageFailed': '暂存失败',
    'notice.unstageFailed': '取消暂存失败',
    'notice.discardFailed': '放弃更改失败',
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
  },
  en: {
    'panel.label': 'Git',
    'guide.title': 'Git panel',
    'guide.description': 'Inspect branches, working-tree status and commits',
    'refresh': 'Refresh',
    'branch.unknown': 'Unknown branch',
    'group.staged': 'Staged changes',
    'group.changes': 'Changes',
    'group.conflicts': 'Conflicts',
    'group.stageAll': 'Stage all',
    'group.unstageAll': 'Unstage all',
    'group.discardAll': 'Discard all changes',
    'group.discardStaged': 'Discard all staged',
    'row.stage': 'Stage',
    'row.unstage': 'Unstage',
    'row.discard': 'Discard changes',
    'row.diff': 'View diff',
    'row.renamed': '{from} → {path}',
    'commit.placeholder': 'Commit message (Ctrl+Enter to commit)',
    'commit.submit': 'Commit',
    'commit.hint': '{count} file(s) staged',
    'commit.busy': 'Working…',
    'commit.identityMissing': 'No Git author is configured; set user.name and user.email first',
    'commit.nothingStaged': 'Nothing is staged; stage the changes to commit',
    'commit.emptyMessage': 'Write a commit message first',
    'notice.stageFailed': 'Could not stage',
    'notice.unstageFailed': 'Could not unstage',
    'notice.discardFailed': 'Could not discard',
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
 * Read the Session's checkout once per mount; the diff body reads its own file.
 * @param remote - the mounted namespace, wrapped for the panel.
 * @returns the reader the diff body is given.
 */
function diffReader(remote: GitRemoteHandle): (args: DiffArgs) => Promise<DiffPayload> {
  return args => remote.ready.then(api => api.requestDiff(args))
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
        })

        // Stage two: the panel body under the type's id.
        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: PANEL_TAB_ID,
          locale: NS,
        }, Panel)), 'git-sidebar: panel body')

        // The diff viewer: the same two-stage path under its own id. Its body
        // is built with the loader's React and reads a file through the same
        // Remote namespace.
        const DiffBody = makeDiffBody(React, {
          requestDiff: diffReader(remote),
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
