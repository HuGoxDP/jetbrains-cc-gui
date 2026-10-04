/**
 * Reasoning effort selection shared by the per-process and daemon send paths.
 *
 * The webview sends one of the real SDK effort levels, or the synthetic top
 * step `ultracode`. Ultracode is not an effort level: it is the session-scoped
 * `ultracode` settings key (standing dynamic-workflow orchestration) layered on
 * top of `xhigh` effort. This module decomposes the webview value into the two
 * things the SDK actually understands.
 */

export const SUPPORTED_EFFORT_LEVELS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

/** Synthetic effort step sent by the webview for "xhigh + workflows". */
export const ULTRACODE_EFFORT = 'ultracode';

/** The real effort level ultracode runs at. */
export const ULTRACODE_BASE_EFFORT = 'xhigh';

/**
 * Resolve the webview's reasoning-effort value.
 *
 * `ultracode` in the result is tri-state on purpose:
 *   - `true`  — the user picked the ultracode step; turn the flag on.
 *   - `false` — the user picked a plain level while their own settings.json has
 *               `ultracode: true`; the selector is the per-request source of
 *               truth, so the stale value must be switched off.
 *   - `null`  — nothing to say; the key is left out of the settings override so
 *               CLIs that predate it never see it.
 *
 * @param {unknown} rawEffort - `low|medium|high|xhigh|max|ultracode`, anything else means "unset"
 * @param {object|null} [settings] - Parsed Claude settings.json, if available
 * @returns {{ effort: string|null, ultracode: boolean|null }}
 */
export function resolveEffortSelection(rawEffort, settings = null) {
  const value = typeof rawEffort === 'string' ? rawEffort.trim() : '';

  if (value === ULTRACODE_EFFORT) {
    // Ultracode needs the Workflows feature. With workflows disabled the CLI
    // would ignore the flag, so run at the effort it would have used anyway.
    const workflowsDisabled = settings?.disableWorkflows === true;
    return { effort: ULTRACODE_BASE_EFFORT, ultracode: workflowsDisabled ? null : true };
  }

  if (SUPPORTED_EFFORT_LEVELS.has(value)) {
    return { effort: value, ultracode: settings?.ultracode === true ? false : null };
  }

  return { effort: null, ultracode: null };
}
