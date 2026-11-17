/**
 * The `--name-status -z` reader, which decides how many fields a record owns.
 *
 * Git writes one record per changed path, with a rename carrying two paths, so
 * the status field has to be read before the paths rather than after them.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { binaryPaths, parseNameStatus, parseNumstat } from '../src/host/parse.ts'

test('reads one record per changed path', () => {
  const records = parseNameStatus('M\0src/a.ts\0A\0src/b.ts\0D\0src/c.ts\0')
  assert.deepEqual(records, [
    { path: 'src/a.ts', status: 'modified' },
    { path: 'src/b.ts', status: 'added' },
    { path: 'src/c.ts', status: 'deleted' },
  ])
})

test('reads a rename as one record naming both paths', () => {
  const records = parseNameStatus('R100\0old/name.ts\0new/name.ts\0M\0next.ts\0')
  assert.deepEqual(records, [
    { path: 'new/name.ts', status: 'renamed', from: 'old/name.ts' },
    { path: 'next.ts', status: 'modified' },
  ])
})

test('reads a copy as a record with its source', () => {
  assert.deepEqual(parseNameStatus('C75\0from.ts\0to.ts\0'), [
    { path: 'to.ts', status: 'added', from: 'from.ts' },
  ])
})

test('reads an unmerged path as a conflict', () => {
  assert.deepEqual(parseNameStatus('U\0both.ts\0'), [{ path: 'both.ts', status: 'conflicted' }])
})

test('drops a record it cannot classify and keeps reading', () => {
  assert.deepEqual(parseNameStatus('X\0skipped.ts\0M\0kept.ts\0'), [{ path: 'kept.ts', status: 'modified' }])
})

test('reads nothing from an empty listing', () => {
  assert.deepEqual(parseNameStatus(''), [])
})

test('reports the binary paths of a numstat listing', () => {
  const records = parseNumstat('12\t3\tsrc/a.ts\0-\t-\timg.png\0')
  assert.deepEqual([...binaryPaths(records)], ['img.png'])
})
