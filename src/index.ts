/**
 * Host half of the Git panel bundle.
 *
 * Serves the panel's Remote namespace: it reads the Session's checkout through
 * the subprocess, sandbox, and working-directory services, and exposes status,
 * diff, staging, discard, and commit as direct Remote endpoints. The browser
 * half calls them through the hand-authored table in `remote-descriptor.ts`.
 *
 * This file is the plugin's registration surface. The git work itself lives
 * under `host/`.
 */

import z from '@deepseek-ai/schemastery'
import type { HostContext } from './host/context.ts'
import { GitSidebarService, type ServiceConfig } from './host/service.ts'

/** Stable Cordis plugin name. */
export const name = '@dsh-plugin/dsh-git-sidebar'

/** Services required before the endpoints can run. */
export const inject = ['subprocess', 'sandbox', 'sandboxPolicy', 'workingDirectory', 'sessions', 'llm']

/** Instruction the model follows when wording a commit message. */
const DEFAULT_DRAFT_PROMPT = [
  'Write a commit message for the supplied change.',
  'Follow the Conventional Commits style: a type, an optional scope, then a summary.',
  'Use the imperative mood, describe what the change does rather than which files moved,',
  'and keep the first line under 72 characters.',
  'Return only the message, in plain text, with no quotes, code fence, or explanation.',
].join(' ')

/** Git executable and process limits; every field applies without a restart. */
export const Config = z.object({
  gitCommand: z.string().default('git').description('Git executable name or absolute path.'),
  timeoutMs: z.number().min(1000).max(120000).default(15000).description('Deadline for one git command.'),
  syncTimeoutMs: z.number().min(5000).max(600000).default(60000)
    .description('Deadline for one network command such as fetch, pull, or push.'),
  maxOutputBytes: z.number().min(65536).max(67108864).default(4194304)
    .description('Largest captured stdout or stderr per command.'),
  graceMs: z.number().min(0).max(30000).default(2000).description('Termination grace for each process.'),
  maxDiffBytes: z.number().min(65536).max(16777216).default(1048576)
    .description('Largest patch the diff viewer renders before truncating.'),
  draftProvider: z.string().description('LLM provider for the commit-message draft; pair with draftModel.'),
  draftModel: z.string().description('Exact model id for the draft; pair with draftProvider.'),
  draftPrompt: z.string().default(DEFAULT_DRAFT_PROMPT).description('Instruction the model follows.'),
  draftMaxInputBytes: z.number().min(1024).max(1048576).default(24576)
    .description('Largest patch sent to the model.'),
  draftMaxOutputTokens: z.number().min(16).max(8192).default(512)
    .description('Output-token cap for the draft.'),
  draftTimeoutMs: z.number().min(1000).max(300000).default(45000).description('Deadline for one draft.'),
})

/** Resolved configuration handed to the service. */
export type GitSidebarConfig = {
  gitCommand: string
  timeoutMs: number
  syncTimeoutMs: number
  maxOutputBytes: number
  graceMs: number
  maxDiffBytes: number
  draftProvider?: string
  draftModel?: string
  draftPrompt: string
  draftMaxInputBytes: number
  draftMaxOutputTokens: number
  draftTimeoutMs: number
}

/**
 * Fold the flat configuration into the service's shape.
 *
 * The route is passed on only when both halves are set: a provider without a
 * model names nothing, and the Host falls back to the Session's own route.
 * @param config - resolved plugin configuration.
 * @returns the service configuration.
 */
function serviceConfig(config: GitSidebarConfig): ServiceConfig {
  const paired = typeof config.draftProvider === 'string' && config.draftProvider.trim().length > 0
    && typeof config.draftModel === 'string' && config.draftModel.trim().length > 0
  return {
    ...config,
    draft: {
      ...config,
      ...paired
        ? { provider: config.draftProvider?.trim(), model: config.draftModel?.trim() }
        : {},
      prompt: config.draftPrompt,
      maxInputBytes: config.draftMaxInputBytes,
      maxOutputTokens: config.draftMaxOutputTokens,
      draftTimeoutMs: config.draftTimeoutMs,
    },
  }
}

/**
 * Register the Remote service.
 *
 * The service is constructed directly rather than mounted as a class plugin,
 * so a misconfigured registration fails this plugin's activation instead of
 * disappearing into a parked child fiber.
 * @param ctx - owning Cordis context.
 * @param config - resolved plugin configuration.
 */
export function apply(ctx: HostContext, config: GitSidebarConfig): void {
  const resolved = config ?? Config({})
  if (typeof resolved.gitCommand !== 'string' || resolved.gitCommand.trim().length === 0) {
    throw new Error('git-sidebar: gitCommand must not be empty')
  }
  new GitSidebarService(ctx, serviceConfig(resolved))
}
