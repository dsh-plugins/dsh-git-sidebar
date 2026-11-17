/**
 * Path-to-language matching for the diff editor.
 *
 * Monaco declares every language it knows by the files it applies to, and a
 * plugin that registers its own language appends to that same list. The list is
 * ordered oldest first, so a later entry is the more specific declaration for a
 * file and wins a tie against an earlier one.
 * @module git-sidebar/language-match
 */

/** One language's file description, as Monaco reports it. */
export interface LanguagePoint {
  readonly id: string
  /** Extensions with a leading dot, such as `.ts`. */
  readonly extensions?: readonly string[]
  /** Whole file names, such as `Dockerfile`, matched case-insensitively. */
  readonly filenames?: readonly string[]
  /** Regular expressions for naming conventions an extension cannot express. */
  readonly filenamePatterns?: readonly string[]
}

/**
 * Pick the language one path belongs to.
 * @param languages - the declarations to match, oldest first.
 * @param path - the file path, with either separator.
 * @returns the language id, or undefined when no declaration claims the file.
 */
export function languageForPath(languages: readonly LanguagePoint[], path: string): string | undefined {
  const normalized = path.replaceAll('\\', '/')
  const name = normalized.slice(normalized.lastIndexOf('/') + 1).toLowerCase()
  if (name.length === 0) return undefined
  for (let index = languages.length - 1; index >= 0; index -= 1) {
    const declared = languages[index]
    if (declared?.filenames?.some(filename => filename.toLowerCase() === name) === true) return declared.id
  }
  let best: { readonly id: string; readonly length: number } | undefined
  for (let index = languages.length - 1; index >= 0; index -= 1) {
    const declared = languages[index]
    if (declared === undefined) continue
    for (const extension of declared.extensions ?? []) {
      const suffix = extension.toLowerCase()
      if (!suffix.startsWith('.') || !name.endsWith(suffix)) continue
      // A later declaration wins a tie, which is why the first match at the
      // longest suffix length is kept rather than overwritten.
      if (best === undefined || suffix.length > best.length) best = { id: declared.id, length: suffix.length }
    }
  }
  if (best !== undefined) return best.id
  for (let index = languages.length - 1; index >= 0; index -= 1) {
    for (const pattern of languages[index]?.filenamePatterns ?? []) {
      if (matches(pattern, normalized.slice(normalized.lastIndexOf('/') + 1))) return languages[index]?.id
    }
  }
  return undefined
}

/**
 * Test one filename pattern, reporting a malformed one instead of failing the read.
 *
 * Matching ignores case: a naming convention such as `CMakeLists.txt` is the
 * same file however the path was spelled, and a pattern that spelled it out in
 * capitals would otherwise only match one spelling of it.
 * @param pattern - the regular expression source a language declared.
 * @param name - the basename to test, as the path spelled it.
 * @returns whether the pattern matches.
 */
function matches(pattern: string, name: string): boolean {
  try {
    return new RegExp(pattern, 'iu').test(name)
  } catch (error) {
    console.warn('git-sidebar: a language declared an unreadable filenamePattern "%s": %s',
      pattern, error instanceof Error ? error.message : String(error))
    return false
  }
}
