/**
 * Path-to-language matching for the diff editor.
 *
 * Monaco's language list is ordered oldest first and plugin registrations are
 * appended, so the later declaration of the same file is the one to trust.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { languageForPath } from '../src/client/language-match.ts'

test('matches an extension case-insensitively', () => {
  const languages = [{ id: 'typescript', extensions: ['.ts'] }]
  assert.equal(languageForPath(languages, 'src/Thing.TS'), 'typescript')
})

test('prefers the longest extension', () => {
  const languages = [
    { id: 'typescript', extensions: ['.ts'] },
    { id: 'typescriptreact', extensions: ['.tsx'] },
  ]
  assert.equal(languageForPath(languages, 'src/view.tsx'), 'typescriptreact')
})

test('prefers a later declaration over an earlier one for the same suffix', () => {
  const languages = [
    { id: 'plain-ts', extensions: ['.ts'] },
    { id: 'plugin-ts', extensions: ['.ts'] },
  ]
  assert.equal(languageForPath(languages, 'src/view.ts'), 'plugin-ts')
})

test('matches a whole file name before an extension', () => {
  const languages = [
    { id: 'shell', extensions: ['.sh'] },
    { id: 'dockerfile', filenames: ['Dockerfile'] },
  ]
  assert.equal(languageForPath(languages, 'docker/Dockerfile'), 'dockerfile')
})

test('matches a filename pattern when no extension claims the file', () => {
  const languages = [{ id: 'cmake', filenamePatterns: ['^CMakeLists\\.txt$'] }]
  assert.equal(languageForPath(languages, 'CMakeLists.txt'), 'cmake')
})

test('reports no language for a path nothing claims', () => {
  assert.equal(languageForPath([{ id: 'json', extensions: ['.json'] }], 'data.bin'), undefined)
})

test('ignores a declaration whose pattern cannot compile', () => {
  const languages = [{ id: 'broken', filenamePatterns: ['('] }]
  assert.equal(languageForPath(languages, 'anything'), undefined)
})
