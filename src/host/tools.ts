/**
 * The agent-facing tools: what checkouts this Session's tree holds, and how to
 * put one of them on screen.
 *
 * Both tools answer questions the reader asks in words — "where are the
 * repositories here", "show me that one" — and both go through the same service
 * methods the panel's own controls call. Nothing is recomputed here: the scan,
 * the checkout validation, and the per-Session selection belong to
 * {@link GitSidebarService}, so a tool and a click cannot disagree about what a
 * repository is or which one is current.
 *
 * The definitions are built by hand rather than with `defineTool`: that helper's
 * value is TypeScript inference over the schema DSL, while this bundle stays free
 * of runtime dependencies on Host packages. The registry accepts a plain object
 * with the same fields, which is what {@link ToolDefinitionLike} declares.
 */

import type {
  OpenRepositoryResult, RepositoryList, RepositoryToolEntry, RepositoryToolList, SelectOutcome, StatusSnapshot,
} from '../shared.ts'
import { GIT_TOOL_NAMES } from '../shared.ts'

/** The service operations the tools call, by shape so a test can stand in. */
export interface GitToolsTarget {
  /**
   * Scan the Session's directory tree.
   * @param args - the Session to scan.
   * @returns the checkouts, and the selection the panel reads.
   */
  repositories(args: { readonly sessionId: string }): Promise<RepositoryList>
  /**
   * Read the panel from one checkout.
   * @param args - the Session and the checkout root.
   * @returns the new snapshot, or the refusal.
   */
  selectRepository(args: { readonly sessionId: string; readonly root?: string }): Promise<SelectOutcome>
}

/** The execution facts a tool body reads. */
export interface ToolRunLike {
  /** The Agent the call runs for; its id is the Session id. */
  readonly agent?: { readonly id: string } | undefined
  readonly signal?: AbortSignal | undefined
}

/** One model-facing content block. */
export interface ToolTextBlock {
  readonly type: 'text'
  readonly text: string
}

/** The fields a registry entry needs; the Host's own definition type has these and more. */
export interface ToolDefinitionLike {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
  readonly output: {
    readonly schema: Record<string, unknown>
    render(args: unknown, value: unknown): readonly ToolTextBlock[]
  }
  execute(args: unknown, exec: ToolRunLike): Promise<unknown>
}

/** How many alternatives an unresolved name lists before it stops. */
const MAX_SUGGESTIONS = 20

/** The description the model reads for the listing tool. */
const LIST_DESCRIPTION = [
  'List the Git repositories below the Session working directory.',
  'Each entry has an absolute root, a path relative to the working directory, a name,',
  'and a kind: repository, submodule, or worktree. The entry the panel is reading is marked current.',
].join(' ')

/** The description the model reads for the opening tool. */
const OPEN_DESCRIPTION = [
  'Show one Git repository in the Git panel and bring the panel up for the user.',
  'Pass the absolute root, the path relative to the working directory, or "." for the working directory itself;',
  'git_repositories lists the accepted values. The panel then reads that checkout, and every change, branch, history,',
  'and diff action applies to it.',
].join(' ')

/**
 * Build the two tool definitions.
 * @param service - the service whose scan and selection the tools reuse.
 * @returns the definitions, in registration order.
 */
export function createGitTools(service: GitToolsTarget): ToolDefinitionLike[] {
  return [listTool(service), openTool(service)]
}

/** The listing tool: the scan as the panel sees it. */
function listTool(service: GitToolsTarget): ToolDefinitionLike {
  return {
    name: GIT_TOOL_NAMES.list,
    description: LIST_DESCRIPTION,
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          scanRoot: { type: 'string' },
          depth: { type: 'number' },
          truncated: { type: 'boolean' },
          entries: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                root: { type: 'string' },
                relative: { type: 'string' },
                name: { type: 'string' },
                kind: { type: 'string' },
                current: { type: 'boolean' },
              },
              required: ['root', 'relative', 'name', 'kind', 'current'],
            },
          },
          warnings: { type: 'array', items: { type: 'string' } },
        },
        required: ['scanRoot', 'depth', 'truncated', 'entries', 'warnings'],
      },
      render: (_args, value) => [{ type: 'text', text: renderList(value as RepositoryToolList) }],
    },
    async execute(_args, exec) {
      const sessionId = sessionOf(exec)
      const list = await service.repositories({ sessionId })
      if (list.error !== undefined) throw new Error(`the repository scan failed: ${list.error}`)
      const current = list.selected ?? list.entries.find(entry => entry.relative === '.')?.root ?? null
      const result: RepositoryToolList = {
        scanRoot: list.scanRoot,
        depth: list.depth,
        entries: list.entries.map((entry): RepositoryToolEntry =>
          ({ ...entry, current: entry.root === current })),
        truncated: list.truncated,
        warnings: list.warnings,
      }
      return result
    },
  }
}

/** The opening tool: select one checkout, and let the client present its panel. */
function openTool(service: GitToolsTarget): ToolDefinitionLike {
  return {
    name: GIT_TOOL_NAMES.open,
    description: OPEN_DESCRIPTION,
    parameters: {
      type: 'object',
      properties: {
        repository: {
          type: 'string',
          description: 'Checkout to show: an absolute root, a path relative to the working directory, or ".".',
        },
      },
      required: ['repository'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string' },
          relative: { type: 'string' },
          branch: { type: 'string' },
          detached: { type: 'boolean' },
          staged: { type: 'number' },
          unstaged: { type: 'number' },
          conflicts: { type: 'number' },
        },
        required: ['root', 'relative', 'branch', 'detached', 'staged', 'unstaged', 'conflicts'],
      },
      render: (_args, value) => [{ type: 'text', text: renderOpen(value as OpenRepositoryResult) }],
    },
    async execute(args, exec) {
      const sessionId = sessionOf(exec)
      const wanted = repositoryOf(args)
      const list = await service.repositories({ sessionId })
      const root = resolveRepository(wanted, list)
      const outcome = await service.selectRepository({ sessionId, root })
      if (!outcome.ok) throw new Error(outcome.message)
      return describe(root, list, outcome.snapshot)
    },
  }
}

/**
 * Read the Session id from the call.
 * @param exec - the execution facts.
 * @returns the Agent's id, which is the Session id.
 * @throws Error when the call has no Agent, which a Session-scoped tool cannot use.
 */
function sessionOf(exec: ToolRunLike): string {
  const sessionId = exec.agent?.id
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new Error('this tool needs a Session; call it from an agent turn')
  }
  return sessionId
}

/**
 * Read the repository argument.
 * @param args - the model's arguments.
 * @returns the trimmed value.
 * @throws Error when the argument is missing or blank.
 */
function repositoryOf(args: unknown): string {
  const input = args as { readonly repository?: unknown } | undefined
  const value = input?.repository
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('repository must be a non-empty string')
  }
  return value.trim()
}

/**
 * Resolve one repository reference to an absolute root.
 *
 * An absolute path is passed through: the Host validates it with Git, and its
 * refusal names the reason better than a scan could. Everything else is matched
 * against the scan, by the path relative to the working directory first and by
 * directory name second, so `.` and `run/demo-app` both work.
 * @param wanted - the reference the model supplied.
 * @param list - the scan the panel would offer.
 * @returns the absolute root to select.
 * @throws Error listing the alternatives when nothing matches, or when a name is ambiguous.
 */
function resolveRepository(wanted: string, list: RepositoryList): string {
  if (/^([A-Za-z]:[\\/]|[\\/])/.test(wanted)) return wanted
  const normalized = wanted.split('\\').join('/').replace(/\/+$/, '')
  const byPath = list.entries.filter(entry => entry.relative.toLowerCase() === normalized.toLowerCase())
  const matches = byPath.length > 0
    ? byPath
    : list.entries.filter(entry => entry.name.toLowerCase() === normalized.toLowerCase())
  const [first, second] = matches
  if (first === undefined) {
    const known = list.entries.slice(0, MAX_SUGGESTIONS)
      .map(entry => `${entry.relative} (${entry.kind})`).join(', ')
    const omitted = list.entries.length > MAX_SUGGESTIONS ? `, and ${list.entries.length - MAX_SUGGESTIONS} more` : ''
    throw new Error(`no repository matches ${JSON.stringify(wanted)}; known repositories: ${known}${omitted}`)
  }
  if (second !== undefined) {
    const candidates = matches.map(entry => entry.relative).join(', ')
    throw new Error(`${JSON.stringify(wanted)} is ambiguous: ${candidates}`)
  }
  return first.root
}

/**
 * Describe the selected checkout for the model and the card.
 * @param root - its absolute top level.
 * @param list - the scan it was resolved from.
 * @param snapshot - the snapshot the switch returned.
 * @returns the tool's canonical value.
 */
function describe(root: string, list: RepositoryList, snapshot: StatusSnapshot): OpenRepositoryResult {
  const entry = list.entries.find(candidate => candidate.root === root)
  return {
    root,
    relative: entry?.relative ?? root,
    branch: snapshot.branch ?? '',
    detached: snapshot.branch === null,
    staged: snapshot.staged.length,
    unstaged: snapshot.unstaged.length,
    conflicts: snapshot.conflicts.length,
  }
}

/**
 * Render the listing as the compact lines a model reads.
 * @param list - the canonical value.
 * @returns the text.
 */
function renderList(list: RepositoryToolList): string {
  if (list.entries.length === 0) {
    return `No Git repository below ${list.scanRoot} (scanned to depth ${list.depth}).`
  }
  const lines = list.entries.map(entry => [
    entry.current ? '*' : '-',
    entry.relative,
    `(${entry.kind})`,
    entry.root,
  ].join(' '))
  const notes = [`Scanned ${list.scanRoot} to depth ${list.depth}.`]
  if (list.truncated) notes.push('The scan hit its directory limit, so this list may be incomplete.')
  if (list.warnings.length > 0) notes.push(`Unusable exclude rules: ${list.warnings.join('; ')}`)
  return [...lines, '', ...notes].join('\n')
}

/**
 * Render one selection.
 * @param result - the canonical value.
 * @returns the text.
 */
function renderOpen(result: OpenRepositoryResult): string {
  const branch = result.detached ? 'detached HEAD' : `branch ${result.branch}`
  const changes = result.staged + result.unstaged + result.conflicts
  return [
    `Showing ${result.root} (${result.relative}) in the Git panel.`,
    `${branch}; ${changes === 0 ? 'no changes' : `${changes} changed file(s)`}.`,
  ].join('\n')
}
