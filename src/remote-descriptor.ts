/**
 * Hand-authored Remote descriptors for the Git panel.
 *
 * A static client bundle cannot import the generated `/remote` artifact the
 * Typert pipeline would produce, so the method table is written here by hand in
 * the same shape the generated one has. The Host half marks its service methods
 * with the matching direct-invocation table, so a method renamed on one side
 * fails the `run/contract.mjs` check instead of failing at call time.
 *
 * Only the browser half uses this module; the Host imports `shared.ts` types
 * alone.
 */

import {
  DIFF_TAB_ID, PACKAGE_NAME, REMOTE_NAMESPACE,
} from './shared.ts'

/** The zod face the descriptor codecs need; the shell supplies the real zod. */
export interface ZodLike {
  object(shape: Record<string, unknown>): unknown
  strictObject(shape: Record<string, unknown>): unknown
  string(): { optional(): unknown }
  boolean(): { optional(): unknown }
  number(): unknown
  array(item: unknown): unknown
}

/** Wire codec metadata carried on every Remote value. */
interface RemoteCodec {
  mode: 'strict'
  typeSymbol: string
  create: () => unknown
}

/** One positional parameter of a direct Remote method. */
interface RemoteParameter {
  name: string
  wire: string
  source: 'json'
  codec: RemoteCodec
  strictCodec: RemoteCodec
}

/** One Remote method descriptor for the client gateway's contribution mount. */
export interface RemoteDescriptor {
  id: string
  service: string
  namespace: string
  method: string
  invocation: { kind: 'direct' }
  parameters: readonly RemoteParameter[]
  result: RemoteCodec
}

/** The contribution `ctx.remote.$mount` accepts. */
export interface RemoteContribution {
  package: string
  descriptors: readonly RemoteDescriptor[]
}

/** Method names in the order the contract check expects to find them. */
export const REMOTE_METHODS = [
  'status', 'diff', 'stage', 'unstage', 'discard', 'commit',
  'history', 'commitDetail', 'branches', 'checkout', 'createBranch',
  'stashes', 'stash', 'stashApply', 'stashDrop', 'sync',
  'conflict', 'resolveConflict', 'abortOperation',
  'stageHunk', 'unstageHunk',
  'deleteBranch', 'mergeBranch',
] as const

/** One method of the mounted namespace. */
export type RemoteMethodName = typeof REMOTE_METHODS[number]

/**
 * Build the contribution for this package.
 *
 * Every endpoint takes exactly one named-argument object. The result codec is
 * intentionally permissive: results are values the Host produced, and the
 * client re-validates the fields it reads.
 * @param zod - the shell's zod seed.
 * @returns the contribution to mount.
 */
export function gitSidebarContribution(zod: ZodLike): RemoteContribution {
  const resultCodec = (method: string): RemoteCodec => ({
    mode: 'strict',
    typeSymbol: `${PACKAGE_NAME}/shared#${method}`,
    create: () => zod.object({}),
  })

  const descriptor = (method: RemoteMethodName, shape: () => Record<string, unknown>): RemoteDescriptor => ({
    id: `${PACKAGE_NAME}#${REMOTE_NAMESPACE}/${method}`,
    service: REMOTE_NAMESPACE,
    namespace: REMOTE_NAMESPACE,
    method,
    invocation: { kind: 'direct' },
    parameters: [{
      name: 'args',
      wire: 'args',
      source: 'json',
      codec: {
        mode: 'strict',
        typeSymbol: `${PACKAGE_NAME}/shared#${method}Args`,
        create: () => zod.object(shape()),
      },
      strictCodec: {
        mode: 'strict',
        typeSymbol: `${PACKAGE_NAME}/shared#${method}Args`,
        create: () => zod.strictObject(shape()),
      },
    }],
    result: resultCodec(method),
  })

  const strings = (): unknown => zod.array(zod.string())

  return {
    package: PACKAGE_NAME,
    descriptors: [
      descriptor('status', () => ({ sessionId: zod.string() })),
      descriptor('diff', () => ({ sessionId: zod.string(), path: zod.string(), staged: zod.boolean() })),
      descriptor('stage', () => ({ sessionId: zod.string(), paths: strings() })),
      descriptor('unstage', () => ({ sessionId: zod.string(), paths: strings() })),
      descriptor('discard', () => ({ sessionId: zod.string(), paths: strings(), includeUntracked: zod.boolean() })),
      descriptor('commit', () => ({
        sessionId: zod.string(),
        message: zod.string(),
        amend: zod.boolean().optional(),
        stageAll: zod.boolean().optional(),
      })),
      descriptor('history', () => ({ sessionId: zod.string(), limit: zod.number(), skip: zod.number() })),
      descriptor('commitDetail', () => ({ sessionId: zod.string(), sha: zod.string() })),
      descriptor('branches', () => ({ sessionId: zod.string() })),
      descriptor('checkout', () => ({ sessionId: zod.string(), branch: zod.string() })),
      descriptor('createBranch', () => ({ sessionId: zod.string(), name: zod.string(), from: zod.string().optional() })),
      descriptor('stashes', () => ({ sessionId: zod.string() })),
      descriptor('stash', () => ({ sessionId: zod.string(), message: zod.string().optional() })),
      descriptor('stashApply', () => ({
        sessionId: zod.string(),
        index: zod.number(),
        drop: zod.boolean(),
      })),
      descriptor('stashDrop', () => ({ sessionId: zod.string(), index: zod.number() })),
      descriptor('sync', () => ({ sessionId: zod.string(), action: zod.string() })),
      descriptor('conflict', () => ({ sessionId: zod.string(), path: zod.string() })),
      descriptor('resolveConflict', () => ({
        sessionId: zod.string(),
        path: zod.string(),
        choices: strings(),
      })),
      descriptor('abortOperation', () => ({ sessionId: zod.string() })),
      descriptor('stageHunk', () => ({ sessionId: zod.string(), path: zod.string(), hunk: zod.number() })),
      descriptor('unstageHunk', () => ({ sessionId: zod.string(), path: zod.string(), hunk: zod.number() })),
      descriptor('deleteBranch', () => ({ sessionId: zod.string(), branch: zod.string(), force: zod.boolean() })),
      descriptor('mergeBranch', () => ({ sessionId: zod.string(), branch: zod.string() })),
    ],
  }
}

/** Identity the diff tab type registers under; re-exported for the client entry. */
export const DIFF_KEY = DIFF_TAB_ID
