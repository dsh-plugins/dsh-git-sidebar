/**
 * The `@@`-header reader behind block staging: it lifts one changed run out of
 * a hunk as a context-free patch, which is what `git apply --unidiff-zero`
 * replays on its own.
 *
 * The patch text is the whole contract, so these cases pin the header's two
 * ranges: a wrong start or a wrong count would move a neighbouring line.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { regionPatch } from '../src/host/patch.ts'

/** A one-file patch with two changed runs, five context lines apart. */
const TWO_RUNS = [
  'diff --git a/demo.txt b/demo.txt',
  'index c4352f8..9367075 100644',
  '--- a/demo.txt',
  '+++ b/demo.txt',
  '@@ -1,12 +1,12 @@',
  ' line 1',
  ' line 2',
  '-line 3',
  '+line 3 changed',
  ' line 4',
  ' line 5',
  ' line 6',
  ' line 7',
  ' line 8',
  '-line 9',
  '+line 9 changed',
  ' line 10',
  ' line 11',
  ' line 12',
  '',
].join('\n')

/** The file header both synthesized patches carry. */
const HEAD = TWO_RUNS.split('\n').slice(0, 4).join('\n')

test('lifts the first block of a hunk with its own ranges', () => {
  assert.equal(regionPatch(TWO_RUNS, 0, 0), `${HEAD}\n@@ -3,1 +3,1 @@\n-line 3\n+line 3 changed\n`)
})

test('lifts a later block of the same hunk', () => {
  assert.equal(regionPatch(TWO_RUNS, 0, 1), `${HEAD}\n@@ -9,1 +9,1 @@\n-line 9\n+line 9 changed\n`)
})

test('reads a block that only adds lines from the line before it', () => {
  const patch = [
    'diff --git a/add.txt b/add.txt',
    'index 624b469..c695d6e 100644',
    '--- a/add.txt',
    '+++ b/add.txt',
    '@@ -1,6 +1,7 @@',
    ' line 1',
    ' line 2',
    ' line 3',
    '+brand new line',
    ' line 4',
    ' line 5',
    ' line 6',
    '',
  ].join('\n')
  assert.equal(
    regionPatch(patch, 0, 0),
    'diff --git a/add.txt b/add.txt\nindex 624b469..c695d6e 100644\n--- a/add.txt\n+++ b/add.txt\n'
      + '@@ -3,0 +4,1 @@\n+brand new line\n',
  )
})

test('reads a block that only removes lines as a zero-length new side', () => {
  const patch = [
    'diff --git a/gone.txt b/gone.txt',
    'index c4352f8..82d9353 100644',
    '--- a/gone.txt',
    '+++ b/gone.txt',
    '@@ -4,4 +4,2 @@',
    ' line 4',
    '-line 5',
    '-line 6',
    ' line 7',
    ' line 8',
    '',
  ].join('\n')
  assert.equal(
    regionPatch(patch, 0, 0),
    'diff --git a/gone.txt b/gone.txt\nindex c4352f8..82d9353 100644\n--- a/gone.txt\n+++ b/gone.txt\n'
      + '@@ -5,2 +4,0 @@\n-line 5\n-line 6\n',
  )
})

test('reports nothing for a block or hunk that is not there', () => {
  assert.equal(regionPatch(TWO_RUNS, 0, 2), undefined)
  assert.equal(regionPatch(TWO_RUNS, 3, 0), undefined)
})

test('reports nothing when the patch has no file header', () => {
  assert.equal(regionPatch('@@ -1,1 +1,1 @@\n-line\n+changed\n', 0, 0), undefined)
})

test('names the empty side of a whole-file change at position zero', () => {
  const added = [
    'diff --git a/new.txt b/new.txt',
    'new file mode 100644',
    'index 0000000..1111111',
    '--- /dev/null',
    '+++ b/new.txt',
    '@@ -0,0 +1,2 @@',
    '+first',
    '+second',
    '',
  ].join('\n')
  assert.equal(
    regionPatch(added, 0, 0),
    'diff --git a/new.txt b/new.txt\nnew file mode 100644\nindex 0000000..1111111\n'
      + '--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1,2 @@\n+first\n+second\n',
  )
  const deleted = [
    'diff --git a/gone.txt b/gone.txt',
    'deleted file mode 100644',
    '--- a/gone.txt',
    '+++ /dev/null',
    '@@ -1,2 +0,0 @@',
    '-first',
    '-second',
    '',
  ].join('\n')
  assert.equal(
    regionPatch(deleted, 0, 0),
    'diff --git a/gone.txt b/gone.txt\ndeleted file mode 100644\n--- a/gone.txt\n+++ /dev/null\n'
      + '@@ -1,2 +0,0 @@\n-first\n-second\n',
  )
})

test('keeps the no-newline marker with the block it closes', () => {
  const patch = [
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
  assert.equal(
    regionPatch(patch, 0, 0),
    'diff --git a/x.txt b/x.txt\nindex 1111111..2222222 100644\n--- a/x.txt\n+++ b/x.txt\n'
      + '@@ -2,1 +2,1 @@\n-last\n\\ No newline at end of file\n+last changed\n\\ No newline at end of file\n',
  )
})
