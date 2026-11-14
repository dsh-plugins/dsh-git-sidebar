/**
 * Grouping, folding, and selection for the change list.
 *
 * Pure functions only: the panel owns the state, so these decide what a list of
 * entries turns into rather than what it looks like.
 *
 * Grouping exists because a repository with forty changed files is unreadable as
 * a flat list. Selection exists because staging eleven files by clicking eleven
 * buttons is the same operation as staging one, repeated.
 */

import type { ChangeEntry } from '../shared.ts'

/** Files past this count start with their nested directories folded. */
export const FOLD_THRESHOLD = 20

/** How deep a directory must be to start folded when the list is long. */
export const FOLD_DEPTH = 1

/** One directory's worth of entries. */
export interface DirectoryGroup {
  /** The directory as the list prints it; the empty string is the repository root. */
  readonly directory: string
  readonly entries: readonly ChangeEntry[]
}

/** A selection is keyed by group and path, so the same path can be picked in both. */
export type SelectionKey = string

/**
 * Compose the key one row is selected under.
 * @param group - which group the row belongs to.
 * @param path - the repository-relative path.
 * @returns the key.
 */
export function selectionKey(group: string, path: string): SelectionKey {
  return `${group}:${path}`
}

/**
 * Split entries into directory groups, shallowest first.
 * @param entries - the entries to group.
 * @returns the groups in display order.
 */
export function byDirectory(entries: readonly ChangeEntry[]): DirectoryGroup[] {
  const groups = new Map<string, ChangeEntry[]>()
  for (const entry of entries) {
    const slash = entry.path.lastIndexOf('/')
    const directory = slash < 0 ? '' : entry.path.slice(0, slash)
    const bucket = groups.get(directory)
    if (bucket === undefined) groups.set(directory, [entry])
    else bucket.push(entry)
  }
  return [...groups.entries()]
    .map(([directory, list]) => ({ directory, entries: list }))
    .sort((left, right) => depthOf(left.directory) - depthOf(right.directory)
      || left.directory.localeCompare(right.directory))
}

/**
 * How many path segments a directory has; the repository root has none.
 * @param directory - the directory name.
 * @returns its depth.
 */
export function depthOf(directory: string): number {
  return directory === '' ? 0 : directory.split('/').length
}

/**
 * The directories that start folded for a list of this size.
 *
 * Folding is a default, not a rule: a short list shows everything, because
 * folding three rows hides more than it saves.
 * @param groups - the directory groups.
 * @returns the directory names to fold initially.
 */
export function foldedByDefault(groups: readonly DirectoryGroup[]): string[] {
  const total = groups.reduce((sum, group) => sum + group.entries.length, 0)
  if (total <= FOLD_THRESHOLD) return []
  return groups.filter(group => depthOf(group.directory) >= FOLD_DEPTH).map(group => group.directory)
}

/**
 * Keep the entries whose path contains the filter text.
 * @param entries - the entries to test.
 * @param filter - what the reader typed; an empty filter keeps everything.
 * @returns the matching entries in their original order.
 */
export function filterEntries(entries: readonly ChangeEntry[], filter: string): ChangeEntry[] {
  const needle = filter.trim().toLowerCase()
  if (needle === '') return [...entries]
  return entries.filter(entry => entry.path.toLowerCase().includes(needle))
}

/**
 * Add or remove one path from the commit picks.
 *
 * The picks are one set across both groups: the same path may appear in the
 * staged list and the changes list, and ticking either ticked it for the commit.
 * @param picks - the paths picked so far.
 * @param path - the path whose box changed.
 * @param picked - whether the box is now ticked.
 * @returns the new set of paths.
 */
export function togglePick(picks: readonly string[], path: string, picked: boolean): string[] {
  if (!picked) return picks.filter(existing => existing !== path)
  return picks.includes(path) ? [...picks] : [...picks, path]
}

/**
 * The entries a range selection covers, in list order.
 *
 * Shift-click means "everything between the two clicks", which requires the
 * order the list draws; an anchor that the filter has hidden yields just the
 * clicked entry rather than a surprise span.
 * @param entries - the entries as the list draws them.
 * @param anchor - the path the range starts at.
 * @param target - the path the reader just clicked.
 * @returns the paths the range selects, or only the target when the anchor is gone.
 */
export function rangeBetween(
  entries: readonly ChangeEntry[],
  anchor: string | null,
  target: string,
): string[] {
  if (anchor === null) return [target]
  const paths = entries.map(entry => entry.path)
  const from = paths.indexOf(anchor)
  const to = paths.indexOf(target)
  if (from < 0 || to < 0) return [target]
  const [start, end] = from <= to ? [from, to] : [to, from]
  return paths.slice(start, end + 1)
}
