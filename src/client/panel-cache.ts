/**
 * The panel's read-through cache.
 *
 * Three reads are expensive enough to be worth remembering: the snapshot, the
 * stash entries, and the first page of the history. All three are keyed by the
 * Session, because a Session is what owns a checkout, and all three are dropped
 * together when the reader asks for a refresh.
 *
 * The module holds no React and no Remote: it is a plain container the panel
 * mutates, so what is cached and when it goes stale is decided in one place
 * rather than spread across the effects that read it.
 *
 * Nothing here is authoritative. A cached snapshot is what the Host answered
 * last time; a write's own reply replaces it, and a refresh throws it away.
 */

import type { CommitEntry, StashEntry, StatusSnapshot } from '../shared.ts'

/** One page of the history, as the cache stores it. */
export interface CachedHistory {
  readonly commits: readonly CommitEntry[]
  readonly hasMore: boolean
  /** Every commit reachable from HEAD, so the header keeps naming the length. */
  readonly total: number
}

/** What the panel remembers between mounts and between Sessions. */
export interface PanelCache {
  /** Last snapshot read for a Session. */
  readonly status: Map<string, StatusSnapshot>
  /** Last stash list read for a Session. */
  readonly stashes: Map<string, readonly StashEntry[]>
  /** First page of the history read for a Session, extended as more pages arrive. */
  readonly history: Map<string, CachedHistory>
}

/**
 * Create an empty cache.
 *
 * One instance is created per plugin activation and handed to every panel body,
 * so closing the panel tab and opening it again reads what the previous mount
 * already asked for.
 * @returns the cache.
 */
export function createPanelCache(): PanelCache {
  return { status: new Map(), stashes: new Map(), history: new Map() }
}

/**
 * Forget everything cached for one Session.
 *
 * This is the refresh path, and the only one: writes do not call it, because a
 * write answers with the new snapshot and clearing first would make the panel
 * ask for the data it is about to be handed.
 * @param cache - the cache to clear.
 * @param sessionId - the Session whose entries go.
 */
export function invalidateSession(cache: PanelCache, sessionId: string): void {
  cache.status.delete(sessionId)
  cache.stashes.delete(sessionId)
  cache.history.delete(sessionId)
}

/**
 * Forget every Session's entries.
 *
 * The agent tools change the checkout a Session reads without the panel seeing a
 * write, so the next mount must not paint a snapshot that belongs to the
 * repository the reader just left. Clearing all Sessions is enough and needs no
 * Session identity, which a tool card does not carry.
 * @param cache - the cache to clear.
 */
export function invalidateAll(cache: PanelCache): void {
  cache.status.clear()
  cache.stashes.clear()
  cache.history.clear()
}

/**
 * Replace what is cached for one Session with a page that has just arrived.
 * @param cache - the cache to update.
 * @param sessionId - the Session the page belongs to.
 * @param snapshot - the snapshot the Host answered with.
 */
export function rememberStatus(cache: PanelCache, sessionId: string, snapshot: StatusSnapshot): void {
  cache.status.set(sessionId, snapshot)
}

/**
 * Replace the cached stash list for one Session.
 * @param cache - the cache to update.
 * @param sessionId - the Session the list belongs to.
 * @param entries - the entries the Host answered with.
 */
export function rememberStashes(cache: PanelCache, sessionId: string, entries: readonly StashEntry[]): void {
  cache.stashes.set(sessionId, entries)
}

/**
 * Drop the cached history for one Session, keeping its snapshot and stashes.
 *
 * A commit, a checkout, a merge, or a stash changes the newest rows of the log
 * but leaves the working tree snapshot the write already reported; only the
 * history has to be read again, and only when the panel draws it.
 * @param cache - the cache to update.
 * @param sessionId - the Session whose history goes.
 */
export function forgetHistory(cache: PanelCache, sessionId: string): void {
  cache.history.delete(sessionId)
}

/**
 * Append one page to the cached history.
 *
 * A page that starts at zero replaces what is stored, which is what a Session
 * switch or a first read does; any later page extends it. The stored page then
 * covers exactly the rows the list is showing, so reopening the panel renders
 * them without a request.
 * @param cache - the cache to update.
 * @param sessionId - the Session the page belongs to.
 * @param page - the commits and whether more follow.
 */
export function appendHistory(cache: PanelCache, sessionId: string, page: CachedHistory): void {
  cache.history.set(sessionId, page)
}
