/**
 * Thinking summaries, from Claude Code's own `showThinkingSummaries` setting.
 *
 * A terminal user turns the setting on to see a readable summary of Claude's
 * thinking. The CLI reads it only in its interactive REPL, where it asks the API
 * for `summarized` thinking; the SDK's subprocess takes a different path that
 * never reads it, so without help the thinking block stays empty. The flag the
 * REPL's decision amounts to is `--thinking-display summarized`, passed through
 * the SDK's documented `extraArgs` so the thinking budget this plugin already
 * sets (`maxThinkingTokens`, `effort`) is left exactly as it was. Nothing is
 * passed when the setting is off, as in the REPL, which then leaves the API's
 * default.
 *
 * Ported from the Swttch plugin, which passes the same flag (#496 there).
 */

export const THINKING_DISPLAY_FLAG = 'thinking-display';

/**
 * @param {object|null|undefined} settings - Parsed Claude settings.json
 * @returns {Record<string, string>|null} the SDK `extraArgs`, or null for none
 */
export function resolveThinkingDisplayArgs(settings) {
  return settings?.showThinkingSummaries === true ? { [THINKING_DISPLAY_FLAG]: 'summarized' } : null;
}
