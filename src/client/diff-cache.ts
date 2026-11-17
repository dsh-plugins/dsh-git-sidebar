/**
 * A cache for diff payloads, keyed by the tab address.
 *
 * A diff tab's body unmounts when the tab closes, so a component-held cache
 * would die with it — and the whole point is that reopening the same file costs
 * nothing. The store therefore lives at module scope, which is the lifetime of
 * the plugin's client module rather than of one tab.
 *
 * The bound is an ordinary LRU over `Map`'s insertion order: a hit is deleted
 * and re-set so it moves to the tail, and the head — the least recently used
 * entry — is dropped once the size passes the limit. Fifty entries holds every
 * file a reader is likely to move between without keeping a stale payload for
 * work they abandoned an hour ago.
 *
 * A payload here is a value the Host produced, not a promise: only settled
 * reads are stored, so a rejected request never leaves a hole that later reads
 * as "already loaded".
 */

import type { DiffPayload } from '../shared.ts'

/** Most payloads the cache keeps before dropping the least recently used. */
const LIMIT = 50

/** One address's payload, oldest first in insertion order. */
const entries = new Map<string, DiffPayload>()

/**
 * Read one cached payload, marking it as the most recently used.
 * @param address - the tab address.
 * @returns the payload, or undefined when nothing is cached for that address.
 */
export function readDiffCache(address: string): DiffPayload | undefined {
  const payload = entries.get(address)
  if (payload === undefined) return undefined
  // Reinsert so this entry becomes the newest, which is what makes the
  // eviction below drop the truly least recently used one.
  entries.delete(address)
  entries.set(address, payload)
  return payload
}

/**
 * Store one payload, dropping the least recently used when the cache is full.
 * @param address - the tab address.
 * @param payload - what the Host answered.
 */
export function writeDiffCache(address: string, payload: DiffPayload): void {
  entries.delete(address)
  entries.set(address, payload)
  while (entries.size > LIMIT) {
    const oldest = entries.keys().next()
    if (oldest.done === true) return
    entries.delete(oldest.value)
  }
}

/**
 * Forget every payload.
 *
 * A write and a refresh both call this: each is the reader saying the
 * repository moved, and a stored patch is a statement about a tree that no
 * longer exists.
 */
export function clearDiffCache(): void {
  entries.clear()
}

/**
 * How many payloads are cached, for diagnostics and tests.
 * @returns the current size.
 */
export function diffCacheSize(): number {
  return entries.size
}
