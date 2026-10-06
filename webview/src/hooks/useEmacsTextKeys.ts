import { useEffect } from 'react';
import { parseEmacsTextKey } from '../utils/emacsKeys/emacsTextKeys.js';
import { applyEmacsTextKey } from '../utils/emacsKeys/emacsTextEdit.js';
import { emacsTextKeyFromKeydown } from '../utils/emacsKeys/emacsTextKey.js';
import { focusedTypingTarget, typingTargetOf } from '../utils/emacsKeys/typingTarget.js';

function isMacPlatform(): boolean {
  const platform = typeof navigator !== 'undefined' ? navigator.platform ?? '' : '';
  if (platform) return platform.toUpperCase().includes('MAC');
  return typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent);
}

/**
 * The macOS Emacs-style text keys (Ctrl+A/B/D/E/F/H/K/L/N/O/P/T/V/Y) for every
 * text field in the webview, as macOS gives them to its native text fields.
 * Ported from the Swttch plugin.
 *
 * Two entry points, one per way the keys get lost:
 *
 * From the IDE, through `window.onEmacsTextKey(letter, shift)`. Under JCEF
 * off-screen rendering, which out-of-process JCEF forces on macOS, these keys do
 * nothing on their own: macOS delivers them as NSResponder selectors that OSR
 * never receives, and every Ctrl+letter reaches the page as Ctrl+A. The IDE
 * still sees the real key, so EmacsTextKeyShortcutGuard consumes it before the
 * page does and names the letter here; this performs the binding.
 *
 * From a browser keydown under a non-Latin input source. There `key` carries the
 * layout's character and `code` the physical key, and the browser does nothing,
 * so the letter is read from `code` (emacsTextKeyFromKeydown). A keydown whose
 * `key` is an ASCII letter is left to the browser, which performs it itself.
 *
 * The key lands in the focused editable (an input, a textarea or a
 * contentEditable such as the chat input); with none focused it is ignored.
 */
export function useEmacsTextKeys(): void {
  useEffect(() => {
    // These are macOS bindings; elsewhere Ctrl+letter means something else.
    if (!isMacPlatform()) return;

    const previous = window.onEmacsTextKey;
    window.onEmacsTextKey = (raw: string, shift?: string | boolean) => {
      const key = typeof raw === 'string' ? parseEmacsTextKey(raw) : null;
      if (!key) return;
      const target = focusedTypingTarget();
      if (!target) return;
      // The IDE passes its arguments as strings.
      applyEmacsTextKey(target, key, shift === true || shift === 'true');
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const press = emacsTextKeyFromKeydown(event);
      if (!press) return;
      const target = typingTargetOf(event);
      if (!target) return;
      event.preventDefault();
      applyEmacsTextKey(target, press.key, press.shift);
    };
    window.addEventListener('keydown', onKeyDown, true);

    return () => {
      window.onEmacsTextKey = previous;
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);
}
