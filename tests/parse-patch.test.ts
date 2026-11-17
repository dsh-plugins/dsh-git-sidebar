/**
 * The patch reader behind the viewer: it must hand the browser one content line
 * per line of the file, because every line number the blocks are anchored on is
 * counted from that listing.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePatch } from '../src/host/parse.ts'

const NO_NEWLINE = [
  'diff --git a/x.txt b/x.txt',
  'index 1111111..2222222 100644',
  '--- a/x.txt',
  '+++ b/x.txt',
  '@@ -1,2 +1,2 @@',
  ' first',
  '-last',
  '\\ No newline at end of file',
  '+last changed',
  '\\ No newline at end of file',
  '',
].join('\n')

test('leaves the no-newline marker out of the content lines', () => {
  const [hunk] = parsePatch(NO_NEWLINE)
  assert.deepEqual(hunk?.lines, [
    { kind: 'context', text: 'first' },
    { kind: 'removed', text: 'last' },
    { kind: 'added', text: 'last changed' },
  ])
})

test('reads each hunk of a patch in order', () => {
  const patch = [
    'diff --git a/y.txt b/y.txt',
    'index 1111111..2222222 100644',
    '--- a/y.txt',
    '+++ b/y.txt',
    '@@ -1,1 +1,1 @@ first',
    '-one',
    '+two',
    '@@ -8,1 +8,1 @@ second',
    '-eight',
    '+nine',
    '',
  ].join('\n')
  const hunks = parsePatch(patch)
  assert.deepEqual(hunks.map(hunk => hunk.header), ['@@ -1,1 +1,1 @@', '@@ -8,1 +8,1 @@'])
  assert.deepEqual(hunks[1]?.lines, [{ kind: 'removed', text: 'eight' }, { kind: 'added', text: 'nine' }])
})
