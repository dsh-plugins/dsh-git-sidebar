/**
 * Fixed environment and argument preamble for every Git command the panel runs.
 *
 * The Host process may itself be launched from inside a Git command (a hook, a
 * rebase script), so the inherited repository selectors are cleared instead of
 * trusted. Prompts, optional index writes, and locale-dependent text are turned
 * off so one machine-readable format is parsed everywhere.
 */

/** Repository, configuration, and replacement-ref selectors cleared for each command. */
export const GIT_ENV: NodeJS.ProcessEnv = {
  ...Object.fromEntries([
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_COMMON_DIR',
    'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_CONFIG',
    'GIT_CONFIG_PARAMETERS',
    'GIT_CONFIG_COUNT',
    'GIT_PREFIX',
    'GIT_ATTR_SOURCE',
  ].map(key => [key, undefined])),
  GIT_TERMINAL_PROMPT: '0',
  GIT_OPTIONAL_LOCKS: '0',
  LC_ALL: 'C',
}

/** Arguments before every subcommand: no index refresh writes, hooks, or filesystem monitor. */
export const GIT_PREFIX = ['--no-optional-locks', '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false'] as const
