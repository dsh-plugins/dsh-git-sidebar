/**
 * Every rule this bundle draws, as one string.
 *
 * A dynamic client bundle cannot import CSS Modules, so the sheet is injected
 * as a `<style>` element owned by the plugin's effect and removed with it. Only
 * `--dsw-*` tokens are used, so light and dark themes follow the shell; tints
 * are mixed into transparency rather than written as hex.
 */

/** Class prefix every rule and element of this bundle shares. */
export const PREFIX = 'gs'

/** The panel's stylesheet. */
export const PANEL_STYLES = `
.gs-root {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  color: var(--dsw-alias-label-primary);
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: 1.5;
}

/*
 * The refresh bar, copied from VS Code's progressbar: a 2px track whose bit is
 * 2% wide and sweeps to 4900% of its own width. The track is always drawn and
 * only the bit hides, so the header below never moves.
 */
.gs-progress {
  box-sizing: border-box;
  width: 100%;
  height: 2px;
  overflow: hidden; /* keep progress bit in bounds */
  position: relative;
  flex: none;
}

.gs-progress-bit {
  position: absolute;
  left: 0;
  width: 2%;
  height: 2px;
  display: none;
  background: var(--dsw-alias-brand-primary);
}

.gs-progress[data-active] .gs-progress-bit {
  display: block;
}

.gs-progress[data-infinite] .gs-progress-bit {
  animation-name: gs-progress;
  animation-duration: 4s;
  animation-iteration-count: infinite;
  animation-timing-function: linear;
  transform: translate3d(0, 0, 0);
}

/*
 * VS Code switches to steps(100) past ten seconds, which keeps a stuck run from
 * asking the compositor for every frame.
 */
.gs-progress[data-infinite][data-long-running] .gs-progress-bit {
  animation-timing-function: steps(100);
}

@keyframes gs-progress {
  from { transform: translateX(0%) scaleX(1); }
  50%  { transform: translateX(2500%) scaleX(3); }
  to   { transform: translateX(4900%) scaleX(1); }
}

.gs-header {
  display: flex;
  flex: 0 0 auto;
  gap: 4px;
  align-items: center;
  box-sizing: border-box;
  height: 38px;
  padding: 0 6px 0 12px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l3);
}

.gs-branch {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--dsw-alias-brand-primary);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-branch[data-detached] {
  color: var(--dsw-alias-state-warn-primary);
}

.gs-repo-wrap {
  flex: none;
  max-width: 40%;
}

/* The repository picker: the header's path reading, now a control. */
.gs-repo {
  display: inline-flex;
  gap: 2px;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  padding: 2px 4px;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-size: 11px;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-xs);
  cursor: pointer;
}

.gs-repo:hover:not(:disabled) {
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-2);
}

.gs-repo:disabled {
  cursor: default;
}

.gs-repo-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-repo-menu {
  min-width: 240px;
}

.gs-repo-list {
  display: flex;
  flex-direction: column;
  margin: 0 0 4px;
  padding: 0;
  list-style: none;
}

.gs-repo-option {
  display: flex;
  flex: 1 1 auto;
  gap: 6px;
  align-items: center;
  box-sizing: border-box;
  min-width: 0;
  min-height: 28px;
  padding: 3px 8px 3px 4px;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  text-align: start;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-xs);
  cursor: pointer;
}

.gs-repo-option:hover:not(:disabled) {
  background: var(--dsw-alias-bg-layer-2);
}

.gs-repo-option[data-current] {
  color: var(--dsw-alias-brand-primary);
  font-weight: 600;
}

.gs-repo-option:disabled {
  color: var(--dsw-alias-label-dimmed);
  cursor: default;
}

.gs-repo-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-repo-badge {
  flex: none;
  margin-left: auto;
  padding: 0 4px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
  line-height: 16px;
  background: var(--dsw-alias-bg-layer-2);
  border-radius: var(--dsw-radius-xs);
}

/* The agent tools' conversation rows: one line of title and summary, plus the
   control that puts the panel back on screen. */
.gs-tool-row {
  display: flex;
  gap: 8px;
  align-items: center;
  box-sizing: border-box;
  padding: 6px 8px;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
}

.gs-tool-row > svg {
  flex: none;
  color: var(--dsw-alias-label-secondary);
}

.gs-tool-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.gs-tool-title {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-tool-summary {
  overflow: hidden;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-tool-open {
  flex: none;
  padding: 3px 8px;
  color: var(--dsw-alias-brand-primary);
  font: inherit;
  font-size: 11px;
  background: transparent;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
}

.gs-tool-open:hover:not(:disabled) {
  background: var(--dsw-alias-bg-layer-2);
}

.gs-tool-open:disabled {
  color: var(--dsw-alias-label-dimmed);
  cursor: default;
}

.gs-tool-open:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -1px;
}

.gs-graph-arrow {
  pointer-events: none;
}

/* The arrow's click area: invisible, and wide enough to hit without aiming. */
.gs-graph-jump {
  fill: transparent;
  cursor: pointer;
}

.gs-tool {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 4px;
  color: var(--dsw-alias-label-secondary);
  line-height: 1;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
}

.gs-tool svg {
  width: 20px;
  height: 20px;
}

.gs-tool[data-turning] svg {
  animation: gs-spin 1s linear infinite;
}

.gs-tool:disabled {
  color: var(--dsw-alias-label-dimmed);
  cursor: default;
}

@keyframes gs-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .gs-tool[data-turning] svg {
    animation: none;
    opacity: 0.5;
  }
}

.gs-body {
  display: flex;
  flex: 0 1 auto;
  flex-direction: column;
  min-height: 0;
  padding: 4px 6px 0;
  overflow: auto;
  overscroll-behavior: contain;
}

.gs-group {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  margin: 2px 0 6px;
}

.gs-group-head {
  display: flex;
  gap: 6px;
  align-items: center;
  min-height: 28px;
  padding: 2px 4px 2px 8px;
}

/* A headless group keeps only its actions, which still need to sit at the end. */
.gs-group-head-actions {
  justify-content: flex-end;
  padding: 2px 4px;
}

/*
 * The three lists as a strip rather than a stack: a reader works in one of them
 * at a time, and the two they are not in were taking the height the one they
 * are in needed.
 */
.gs-tabs {
  display: flex;
  flex: none;
  gap: 2px;
  align-items: stretch;
  padding: 4px 4px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l3);
}

.gs-tab {
  display: inline-flex;
  flex: 1 1 auto;
  gap: 5px;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 5px 6px;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-sm) var(--dsw-radius-sm) 0 0;
  cursor: pointer;
}

.gs-tab[data-active] {
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
  background: var(--dsw-alias-interactive-bg-hover);
  box-shadow: inset 0 -2px 0 var(--dsw-alias-brand-primary);
}

.gs-tab:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -1px;
}

.gs-tab-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-group-title {
  flex: none;
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  font-weight: 600;
}

.gs-group[data-tone='error'] .gs-group-title {
  color: var(--dsw-alias-state-error-primary);
}

.gs-count {
  flex: none;
  min-width: 16px;
  padding: 0 5px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 16px;
  text-align: center;
  background: color-mix(in srgb, var(--dsw-alias-label-secondary) 12%, transparent);
  border-radius: var(--dsw-radius-xs);
}

.gs-group-actions {
  display: flex;
  flex: none;
  gap: 2px;
  margin-left: auto;
}

.gs-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.gs-row {
  display: flex;
  align-items: center;
  gap: 2px;
  box-sizing: border-box;
  min-height: 30px;
  padding: 0 4px 0 0;
  border-radius: var(--dsw-radius-sm);
}

.gs-open {
  display: flex;
  flex: 1 1 auto;
  gap: 6px;
  align-items: center;
  min-width: 0;
  min-height: 28px;
  padding: 3px 4px 3px 6px;
  color: inherit;
  font: inherit;
  text-align: start;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
}

.gs-open:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -1px;
}

.gs-letter {
  flex: none;
  width: 12px;
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}

.gs-letter[data-status='added'] {
  color: var(--dsw-alias-state-success-primary);
}

.gs-letter[data-status='untracked'] {
  color: var(--dsw-alias-label-tertiary);
}

.gs-letter[data-status='modified'] {
  color: var(--dsw-alias-state-warn-primary);
}

.gs-letter[data-status='deleted'],
.gs-letter[data-status='conflicted'] {
  color: var(--dsw-alias-state-error-primary);
}

.gs-letter[data-status='renamed'] {
  color: var(--dsw-alias-state-business-primary);
}

.gs-name,
.gs-dir {
  display: flex;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.gs-name {
  flex: 0 1 auto;
}

.gs-dir {
  flex: 1 1 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.gs-head {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gs-tail {
  flex: none;
}

.gs-row[data-status='deleted'] .gs-name {
  color: var(--dsw-alias-label-secondary);
}

.gs-row[data-status='conflicted'] .gs-name {
  color: var(--dsw-alias-state-error-primary);
}

.gs-actions {
  display: flex;
  flex: none;
  gap: 1px;
  opacity: 0;
}

.gs-row:hover .gs-actions,
.gs-row:focus-within .gs-actions {
  opacity: 1;
}

/*
 * A pointer that cannot hover leaves the controls hidden, and a reader who does
 * not know they exist never reaches them. A dimmed always-on state keeps the
 * row quiet while still showing that the row can act.
 */
@media (hover: none) {
  .gs-actions {
    opacity: 0.55;
  }

  .gs-row:hover .gs-actions,
  .gs-row:focus-within .gs-actions {
    opacity: 1;
  }
}

.gs-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 2px;
  color: var(--dsw-alias-label-secondary);
  line-height: 1;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-xs);
  cursor: pointer;
}

.gs-action svg {
  width: 20px;
  height: 20px;
}

.gs-action:disabled {
  color: var(--dsw-alias-label-dimmed);
  cursor: default;
}

.gs-action:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}

@media (hover: hover) {
  .gs-row:hover {
    background: var(--dsw-alias-interactive-bg-hover);
  }

  .gs-tool:hover:not(:disabled),
  .gs-action:hover:not(:disabled) {
    color: var(--dsw-alias-label-primary);
    background: var(--dsw-alias-interactive-bg-hover);
  }

  .gs-action[data-danger]:hover:not(:disabled) {
    color: var(--dsw-alias-state-error-primary);
    background: var(--dsw-alias-interactive-bg-hover-danger);
  }

  .gs-commit-submit:hover:not(:disabled) {
    background: var(--dsw-alias-button-primary-hover);
  }
}

/* A touch screen has no hover to reveal the row controls, so they stay shown. */
@media (hover: none) {
  .gs-actions {
    opacity: 1;
  }
}

@media (pointer: coarse) {
  .gs-row,
  .gs-open {
    min-height: 44px;
  }

  .gs-action {
    width: 32px;
    height: 32px;
  }
}

.gs-commit {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  padding: 8px 8px 10px;
  overflow: auto;
  border-top: 0.5px solid var(--dsw-alias-border-l3);
}

/* The message field is the one control that gives way when the reader shrinks
   the region: the amend row and the buttons keep their height, and the field
   shrinks to a single line before anything else is cut. */
.gs-commit-input {
  box-sizing: border-box;
  flex: 1 1 auto;
  width: 100%;
  min-height: 24px;
  max-height: 40vh;
  padding: 6px 8px;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  resize: none;
  background: var(--dsw-alias-bg-layer-1);
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-md);
  outline: none;
}

.gs-commit-input:focus {
  border-color: var(--dsw-alias-state-business-primary);
}

.gs-commit-input::placeholder {
  color: var(--dsw-alias-label-dimmed);
}

.gs-commit-input:disabled {
  color: var(--dsw-alias-label-secondary);
  cursor: default;
}

/* The amend row and the buttons keep their height: only the message field gives
   way, and it stops at a single line before anything is clipped. */
.gs-commit-head,
.gs-commit-foot {
  flex: none;
}

.gs-commit-foot {
  display: flex;
  gap: 8px;
  align-items: center;
}

/*
 * The amend row sits above the field and the buttons below it, which is the
 * order JetBrains uses: the toggle changes what the buttons will do, so it is
 * read before them, and the two send actions close the block.
 */
.gs-commit-head {
  position: relative;
  display: flex;
  flex: none;
  gap: 6px;
  align-items: center;
}

.gs-commit-recent,
.gs-commit-draft {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 22px;
  height: 22px;
  padding: 0;
  color: var(--dsw-alias-label-tertiary);
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
}

/* The draft button reads as the notable one in this row: it is the only
   control there that writes something on the reader's behalf. */
.gs-commit-draft {
  margin-left: auto;
  color: var(--dsw-alias-brand-primary);
}

.gs-commit-draft[data-turning] svg {
  animation: gs-spin 1s linear infinite;
}

.gs-commit-recent:disabled,
.gs-commit-draft:disabled {
  cursor: default;
  opacity: 0.5;
}

.gs-commit-recent-menu {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  min-width: 220px;
  max-width: 100%;
  padding: 4px;
  margin-top: 2px;
  background: var(--dsw-alias-bg-layer-2);
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-md);
  box-shadow: var(--dsw-shadow-md, 0 6px 18px rgb(0 0 0 / 24%));
}

.gs-commit-recent-item {
  padding: 5px 8px;
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  text-align: start;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
}

.gs-commit-push {
  flex: none;
  box-sizing: border-box;
  height: 28px;
  padding: 0 12px;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  background: var(--dsw-alias-bg-layer-1);
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-md);
  cursor: pointer;
}

.gs-commit-push:disabled {
  color: var(--dsw-alias-label-tertiary);
  cursor: default;
}

.gs-commit-push:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}

.gs-commit-hint {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  text-align: end;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.gs-commit-hint[data-warn] {
  color: var(--dsw-alias-state-warn-primary);
}

.gs-commit-submit {
  flex: none;
  box-sizing: border-box;
  min-width: 72px;
  height: 28px;
  padding: 0 14px;
  color: var(--dsw-alias-label-primary-foreground);
  font: inherit;
  font-weight: 600;
  background: var(--dsw-alias-button-primary-fill);
  border: 0;
  border-radius: var(--dsw-radius-md);
  cursor: pointer;
}

/*
 * A disabled control keeps its shape: without a border the fill of the resting
 * button disappears against the panel, and the action stops reading as one.
 */
.gs-commit-submit:disabled {
  color: var(--dsw-alias-label-tertiary);
  background: var(--dsw-alias-bg-layer-1);
  border: 0.5px solid var(--dsw-alias-border-l3);
  cursor: default;
}

.gs-commit-submit:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}

.gs-row[data-selected] {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);
}

.gs-selection {
  display: flex;
  flex: none;
  gap: 8px;
  align-items: center;
  margin: 4px 0 0;
  padding: 4px 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent);
  border-radius: var(--dsw-radius-sm);
}

.gs-selection-clear {
  margin-left: auto;
  padding: 0;
  color: var(--dsw-alias-brand-primary);
  font: inherit;
  font-size: 11px;
  background: transparent;
  border: 0;
  cursor: pointer;
}

/*
 * The filter and the list's actions share one row: they are two halves of the
 * same job, and the group used to spend a whole line on the second half.
 */
.gs-toolbar {
  display: flex;
  flex: none;
  gap: 6px;
  align-items: center;
  padding: 6px 4px 2px;
}

.gs-toolbar .gs-filter {
  flex: 1 1 auto;
  min-width: 0;
}

.gs-toolbar-fill {
  flex: 1 1 auto;
}

.gs-filter {
  flex: none;
  box-sizing: border-box;
  width: 100%;
  margin: 4px 0 6px;
  padding: 4px 8px;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  background: var(--dsw-alias-bg-layer-1);
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-sm);
  outline: none;
}

.gs-filter:focus {
  border-color: var(--dsw-alias-state-business-primary);
}

.gs-notice {
  margin: 4px 8px 0;
  padding: 6px 8px;
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);
  border-radius: var(--dsw-radius-sm);
  white-space: pre-wrap;
  word-break: break-word;
}

.gs-state {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 6px;
  padding: 16px 12px;
}

.gs-state-title {
  margin: 0;
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}

.gs-state-line {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.gs-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 12px 0;
}

.gs-skeleton-bar {
  height: 10px;
  background: var(--dsw-alias-bg-skeleton);
  border-radius: var(--dsw-radius-xs);
}

/* Branch header: the wrap holds the row and the operation bar under it. */
.gs-header-wrap {
  position: relative;
  flex: 0 0 auto;
}

.gs-branch-btn {
  display: inline-flex;
  flex: 0 1 auto;
  gap: 2px;
  align-items: center;
  min-width: 0;
  padding: 2px 4px 2px 6px;
  margin-left: -6px;
  color: var(--dsw-alias-brand-primary);
  font: inherit;
  font-weight: 600;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-xs);
  cursor: pointer;
}

.gs-branch-btn[data-detached] {
  color: var(--dsw-alias-state-warn-primary);
}

.gs-branch-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-branch-btn:focus-visible,
.gs-branch-option:focus-visible,
.gs-repo:focus-visible,
.gs-repo-option:focus-visible,
.gs-menu-item:focus-visible,
.gs-history-title:focus-visible,
.gs-history-more:focus-visible,
.gs-commit-open:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -1px;
}

.gs-upstream {
  display: inline-flex;
  flex: none;
  gap: 4px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.gs-ahead {
  color: var(--dsw-alias-state-success-primary);
}

.gs-behind {
  color: var(--dsw-alias-state-warn-primary);
}

.gs-operation {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
  align-items: center;
  padding: 5px 12px;
  color: var(--dsw-alias-state-warn-primary);
  font-size: 12px;
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent);
}

.gs-operation-text {
  flex: 1 1 auto;
  min-width: 0;
}

.gs-operation-abort {
  flex: none;
  padding: 2px 8px;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  background: transparent;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-xs);
  cursor: pointer;
}

.gs-operation-abort:disabled {
  color: var(--dsw-alias-label-dimmed);
  border-color: var(--dsw-alias-border-l3);
  cursor: default;
}

/* Dropdowns: a full-window backdrop closes them, so no node needs a ref. */

.gs-backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
}

.gs-menu {
  position: fixed;
  z-index: 21;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  min-width: 180px;
  max-width: min(300px, calc(100vw - 24px));
  max-height: 60vh;
  padding: 4px;
  overflow: auto;
  color: var(--dsw-alias-label-primary);
  /* The shell's own menu surface: translucent over the panel in both palettes,
     where bg-layer-2 equals the panel fill in the light theme. */
  background: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-2));
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-md);
  box-shadow: var(--dsw-elevation-panel, 0 3px 8px rgb(0 0 0 / 12%));
  backdrop-filter: var(--dsw-menu-backdrop-filter, none);
}

.gs-branch-menu {
  /*
   * The picker is placed under the branch button by measurement, so it keeps
   * the shared menu width: stretching it edge to edge was what the absolute
   * positioning needed, and that is gone.
   */
  min-width: 220px;
}

.gs-menu-title {
  margin: 2px 6px 4px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-weight: 600;
}

.gs-menu-note {
  margin: 2px 6px 6px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}

.gs-menu-sep {
  height: 0.5px;
  margin: 4px 2px;
  background: var(--dsw-alias-border-l3);
}

.gs-branch-list {
  display: flex;
  flex-direction: column;
  margin: 0 0 4px;
  padding: 0;
  list-style: none;
}

.gs-branch-option {
  display: flex;
  gap: 6px;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  min-height: 28px;
  padding: 3px 8px 3px 4px;
  color: inherit;
  font: inherit;
  text-align: start;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-xs);
  cursor: pointer;
}

.gs-branch-option[data-current] {
  color: var(--dsw-alias-brand-primary);
  font-weight: 600;
}

.gs-branch-option-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-branch-space {
  flex: none;
  width: 16px;
}

.gs-new-branch {
  display: flex;
  flex: none;
  gap: 4px;
  align-items: center;
  padding: 4px 2px 2px;
  border-top: 0.5px solid var(--dsw-alias-border-l3);
}

.gs-new-branch-input {
  box-sizing: border-box;
  flex: 1 1 auto;
  min-width: 0;
  height: 26px;
  padding: 2px 6px;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  background: var(--dsw-alias-bg-layer-1);
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-xs);
  outline: none;
}

.gs-new-branch-input:focus {
  border-color: var(--dsw-alias-state-business-primary);
}

.gs-new-branch-input::placeholder {
  color: var(--dsw-alias-label-dimmed);
}

.gs-new-branch-create {
  flex: none;
  height: 26px;
  padding: 0 10px;
  color: var(--dsw-alias-label-primary-foreground);
  font: inherit;
  font-size: 12px;
  background: var(--dsw-alias-button-primary-fill);
  border: 0;
  border-radius: var(--dsw-radius-xs);
  cursor: pointer;
}

.gs-new-branch-create:disabled {
  color: var(--dsw-alias-label-tertiary);
  background: var(--dsw-alias-bg-layer-1);
  border: 0.5px solid var(--dsw-alias-border-l3);
  cursor: default;
}

.gs-more-menu {
  min-width: 190px;
}

.gs-menu-item {
  display: flex;
  gap: 8px;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  min-height: 30px;
  padding: 4px 8px;
  color: inherit;
  font: inherit;
  text-align: start;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-xs);
  cursor: pointer;
}

.gs-menu-item svg {
  flex: none;
  width: 18px;
  height: 18px;
  color: var(--dsw-alias-label-secondary);
}

.gs-menu-item:disabled {
  color: var(--dsw-alias-label-dimmed);
  cursor: default;
}

/* History: the header, the graph gutter, and the rows it stacks. */

.gs-history {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  border-top: 0.5px solid var(--dsw-alias-border-l3);
}

.gs-history-head {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
  align-items: center;
  min-height: 30px;
  padding: 2px 8px 2px 4px;
}

.gs-history-title {
  display: inline-flex;
  flex: none;
  gap: 2px;
  align-items: center;
  padding: 2px 4px;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-xs);
  cursor: pointer;
}

.gs-history-title svg {
  width: 16px;
  height: 16px;
}

.gs-history-count {
  flex: none;
  min-width: 16px;
  padding: 0 5px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  line-height: 16px;
  text-align: center;
  background: color-mix(in srgb, var(--dsw-alias-label-secondary) 12%, transparent);
  border-radius: var(--dsw-radius-xs);
}

.gs-history-refresh {
  width: 24px;
  height: 24px;
  margin-left: auto;
  padding: 2px;
}

.gs-history-refresh svg {
  width: 16px;
  height: 16px;
}

.gs-history-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  /*
   * Rows are a fixed height and the region is sized in whole rows, so snapping
   * keeps a wheel gesture from parking the list between two of them: a row cut
   * at the top edge reads as a broken list even when it is only a scroll offset.
   */
  scroll-snap-type: y mandatory;
}

/*
 * The graph wraps the list so one node carries the lane count the whole column
 * shares: every row's slice is drawn at the widest row's width, which is what
 * keeps the gutters aligned while a reader scrolls.
 */
.gs-graph {
  display: flex;
  flex-direction: column;
}

.gs-commits {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0 0 4px;
  list-style: none;
}

.gs-commit-row {
  display: flex;
  flex: none;
  height: 26px;
  padding: 0 6px 0 0;
  border-radius: var(--dsw-radius-sm);
  scroll-snap-align: start;
}

/*
 * The menu button is hidden until the row is hovered or holds the focus, so a
 * long history reads as a list of commits rather than a grid of controls. It
 * still occupies its width, which is what keeps the rows from shifting as the
 * pointer moves down them.
 */
.gs-commit-more {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 20px;
  height: 20px;
  align-self: center;
  padding: 0;
  color: var(--dsw-alias-label-tertiary);
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  opacity: 0;
  cursor: pointer;
}

.gs-commit-row:hover .gs-commit-more,
.gs-commit-row:focus-within .gs-commit-more,
.gs-commit-more[aria-expanded='true'] {
  opacity: 1;
}

.gs-commit-more:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -1px;
  opacity: 1;
}

/* Placed by the row's own measurement, so it escapes the list's scroller. */
.gs-commit-menu {
  position: fixed;
  z-index: 21;
  display: flex;
  flex-direction: column;
  min-width: 190px;
  padding: 4px;
  background: var(--dsw-alias-bg-layer-2);
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-md);
  box-shadow: var(--dsw-shadow-md, 0 6px 18px rgb(0 0 0 / 24%));
}

.gs-commit-menu-item {
  padding: 5px 8px;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  text-align: start;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
}

.gs-commit-menu-item:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -1px;
}

.gs-commit-open {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: auto auto minmax(0, 1fr) auto auto;
  gap: 0 6px;
  align-items: center;
  box-sizing: border-box;
  height: 26px;
  min-width: 0;
  padding: 0;
  color: inherit;
  font: inherit;
  text-align: start;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
}

/*
 * The slice is exactly one row tall and as wide as the graph, so the stroke that
 * ends at its bottom edge continues as the stroke that starts at the next row's
 * top edge. It may not be clipped: a cubic that leaves the row would show a cut.
 */
.gs-graph-row {
  display: block;
  flex: none;
  overflow: visible;
}

.gs-graph-line {
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.gs-graph-node {
  stroke: none;
}

.gs-sha {
  grid-column: 2;
  color: var(--dsw-alias-label-secondary);
  font-family: var(--dsh-font-family-code, ui-monospace, monospace);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.2px;
}

.gs-subject {
  grid-column: 3;
  min-width: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-refs {
  display: flex;
  grid-column: 4;
  flex-wrap: nowrap;
  gap: 3px;
  justify-content: flex-end;
  min-width: 0;
  overflow: hidden;
}

/*
 * A capsule's ink says what it names: the checked-out branch and the local
 * branches share the brand colour, a remote-tracking branch stays quiet, and a
 * tag takes the warning ink so it cannot be mistaken for a branch.
 */
.gs-ref {
  max-width: 120px;
  overflow: hidden;
  padding: 0 5px;
  font-size: 10px;
  font-weight: 600;
  line-height: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-radius: var(--dsw-radius-xs);
}

.gs-ref[data-git-ref-kind='head'] {
  color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent);
  box-shadow: inset 0 0 0 0.5px color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent);
}

.gs-ref[data-git-ref-kind='local'] {
  color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent);
}

.gs-ref[data-git-ref-kind='remote'] {
  color: var(--dsw-alias-label-secondary);
  background: color-mix(in srgb, var(--dsw-alias-label-secondary) 14%, transparent);
}

.gs-ref[data-git-ref-kind='tag'] {
  color: var(--dsw-alias-state-warn-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 14%, transparent);
}

.gs-commit-meta {
  display: flex;
  grid-column: 5;
  gap: 6px;
  align-items: baseline;
  min-width: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.gs-author {
  min-width: 0;
  max-width: 14ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-when {
  flex: none;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.gs-history-note,
.gs-history-end {
  margin: 0;
  padding: 8px 12px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.gs-history-more {
  display: block;
  width: calc(100% - 16px);
  margin: 2px 8px 8px;
  padding: 5px 8px;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  background: transparent;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
}

.gs-history-more:disabled {
  color: var(--dsw-alias-label-dimmed);
  cursor: default;
}

/* The panel's own modal: a layer over the panel, not the browser's chrome. */
.gs-dialog-layer {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.gs-dialog-backdrop {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 40%, rgb(0 0 0 / 45%));
}

.gs-dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
  width: min(420px, 100%);
  max-height: 80vh;
  padding: 16px;
  overflow: auto;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-2);
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-lg, 12px);
  box-shadow: 0 16px 48px rgb(0 0 0 / 32%);
}

.gs-dialog-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.gs-dialog-body {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.gs-dialog-list {
  max-height: 180px;
  margin: 0;
  padding: 6px 8px;
  overflow: auto;
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsh-font-family-code, ui-monospace, monospace);
  font-size: 11px;
  list-style: none;
  background: var(--dsw-alias-bg-layer-1);
  border-radius: var(--dsw-radius-sm);
}

.gs-dialog-warning {
  margin: 0;
  color: var(--dsw-alias-state-warn-primary);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-line;
}

.gs-dialog-input {
  box-sizing: border-box;
  width: 100%;
  height: 30px;
  padding: 0 8px;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  background: var(--dsw-alias-bg-layer-1);
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-md);
  outline: none;
}

.gs-dialog-input:focus {
  border-color: var(--dsw-alias-state-business-primary);
}

.gs-dialog-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;
}

.gs-dialog-confirm,
.gs-dialog-cancel {
  box-sizing: border-box;
  min-width: 72px;
  height: 28px;
  padding: 0 14px;
  font: inherit;
  border-radius: var(--dsw-radius-md);
  cursor: pointer;
}

.gs-dialog-confirm {
  color: var(--dsw-alias-label-primary-foreground);
  font-weight: 600;
  background: var(--dsw-alias-button-primary-fill);
  border: 0;
}

.gs-dialog-confirm[data-danger] {
  color: var(--dsw-alias-label-primary-foreground);
  background: var(--dsw-alias-state-error-primary);
}

.gs-dialog-confirm:disabled {
  color: var(--dsw-alias-label-tertiary);
  background: var(--dsw-alias-bg-layer-1);
  border: 0.5px solid var(--dsw-alias-border-l3);
  cursor: default;
}

.gs-dialog-cancel {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1);
  border: 0.5px solid var(--dsw-alias-border-l3);
}

.gs-dialog-confirm:focus-visible,
.gs-dialog-cancel:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}
/* Stashes */

.gs-stash-group {
  margin-bottom: 4px;
}

.gs-group-note {
  margin: 0;
  padding: 2px 8px 6px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.gs-stash-open {
  display: flex;
  flex: 1 1 auto;
  gap: 8px;
  align-items: baseline;
  min-width: 0;
  padding: 3px 4px 3px 6px;
}

.gs-stash-subject {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary);
}

.gs-stash-row .gs-actions {
  opacity: 1;
}

@media (hover: hover) {
  .gs-branch-btn:hover:not(:disabled),
  .gs-history-title:hover,
  .gs-menu-item:hover:not(:disabled),
  .gs-branch-option:hover:not(:disabled),
  .gs-history-more:hover:not(:disabled) {
    background: var(--dsw-alias-interactive-bg-hover);
  }

  .gs-commit-row:hover {
    background: var(--dsw-alias-interactive-bg-hover);
  }

  .gs-tab:hover:not([data-active]),
  .gs-commit-more:hover,
  .gs-commit-menu-item:hover {
    background: var(--dsw-alias-interactive-bg-hover);
  }

  .gs-branch-option[data-current]:hover:not(:disabled) {
    background: transparent;
  }
}

@media (pointer: coarse) {
  .gs-menu-item,
  .gs-branch-option {
    min-height: 40px;
  }
}
/* The conflict view: two sides per region, each with a choice. */
.gs-conflict {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  padding: 8px;
  gap: 8px;
}

.gs-conflict-head {
  display: flex;
  flex: none;
  gap: 6px;
  align-items: center;
}

.gs-conflict-path {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-conflict-list {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow: auto;
}

.gs-conflict-region {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-md);
}

.gs-conflict-side {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 6px;
  border-radius: var(--dsw-radius-sm);
}

.gs-conflict-side[data-side='ours'] {
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 8%, transparent);
}

.gs-conflict-side[data-side='theirs'] {
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent);
}

.gs-conflict-label {
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-weight: 600;
}

.gs-conflict-text {
  margin: 0;
  overflow-x: auto;
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsh-font-family-code, ui-monospace, monospace);
  font-size: 12px;
  white-space: pre;
}

.gs-conflict-choices {
  display: flex;
  flex: none;
  gap: 4px;
}

.gs-conflict-choice {
  padding: 3px 8px;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  background: var(--dsw-alias-bg-layer-1);
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
}

.gs-conflict-choice[data-active] {
  color: var(--dsw-alias-label-primary-foreground);
  background: var(--dsw-alias-button-primary-fill);
  border-color: transparent;
}

.gs-conflict-choice:disabled {
  cursor: default;
  opacity: 0.6;
}

.gs-conflict-actions {
  display: flex;
  flex: none;
  justify-content: flex-end;
}

/* The commit box at the start of a change row: it names what the next commit holds. */
.gs-pick {
  flex: none;
  margin: 0 0 0 6px;
  accent-color: var(--dsw-alias-button-primary-fill);
  cursor: pointer;
}

/*
 * The three regions of the body: the change list, the commit box, and the
 * history. Each takes exactly the height the reader set for it, so what one
 * holds never decides how much room the others get. The column scrolls when the
 * three heights do not fit, which is the one thing that keeps a short window
 * from hiding a region outright.
 */
.gs-panes {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.gs-pane {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border-top: 0.5px solid var(--dsw-alias-border-l3);
}

.gs-pane[data-collapsed] {
  flex: 0 0 auto;
}

/*
 * The grab strip on the region's top edge. It is 8px of padding over the whole
 * width rather than a visible bar, so the panel reads as three blocks of
 * content until the pointer finds it. It sits above the region's own content in
 * the stacking order: a body that overflows would otherwise paint over the strip
 * and take the pointer, which turns a resize into a scroll.
 */
.gs-pane-resize {
  position: relative;
  z-index: 2;
  flex: none;
  height: 8px;
  cursor: row-resize;
  background: transparent;
}

.gs-pane-resize:hover,
.gs-pane-resize:focus-visible {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent);
  outline: none;
}

.gs-pane-head {
  display: flex;
  flex: none;
  gap: 4px;
  align-items: center;
  min-height: 26px;
  padding: 2px 8px 2px 4px;
}

.gs-pane-toggle {
  display: inline-flex;
  flex: none;
  gap: 2px;
  align-items: center;
  min-width: 0;
  padding: 2px 4px;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  background: transparent;
  border: 0;
  border-radius: var(--dsw-radius-xs);
  cursor: pointer;
}

.gs-pane-toggle:hover {
  color: var(--dsw-alias-label-primary);
}

.gs-pane-toggle:focus-visible {
  outline: 1px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}

.gs-pane-toggle svg {
  width: 16px;
  height: 16px;
}

.gs-pane-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.gs-pane[data-collapsed] .gs-pane-body {
  display: none;
}

/* The commit box is a stack of controls rather than a list: the region is a flex
   column so the message field can give way while the amend row and the buttons
   keep their height, and the box scrolls only when the reader drags the region
   below what those controls need. */
.gs-pane[data-git-pane='commit'] .gs-pane-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0 2px 10px;
  overflow: hidden;
}

/* The change list keeps the same clearance at its foot, so the last row is not
   cut by the border of the region below it. */
.gs-pane[data-git-pane='changes'] .gs-pane-body {
  padding-bottom: 8px;
  overflow: auto;
  overscroll-behavior: contain;
}

/*
 * The history's own title button folds the same state as the region's head, so
 * two switches for one list would sit on top of each other. The region's head
 * carries the title and the fold; the history keeps the count and the refresh.
 */
.gs-pane[data-git-pane='history'] .gs-history-title {
  display: none;
}

/*
 * A drag must not select the labels it passes over: the pointer is moving the
 * divider, and the browser's default would paint a selection instead.
 */
body.gs-dragging {
  cursor: row-resize;
  user-select: none;
}
`
