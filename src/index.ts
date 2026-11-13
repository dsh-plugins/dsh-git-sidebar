/**
 * Host half of the Git sidebar bundle.
 *
 * The first version is a placeholder: the panel is drawn entirely in the
 * browser, and repository inspection (branch, status, recent commits) will be
 * added here as a Host-side capability behind `ctx.tools`-free services.
 * Keeping `apply` exported makes the package a loadable bundle row.
 */

export const name = '@dsh-plugin/dsh-git-sidebar'

export function apply(): void {}
