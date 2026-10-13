/**
 * Which way the interface reads: left to right, or mirrored for right-to-left languages
 * (ported from Swttch's RTL support). Applied as the `dir` attribute of the document root,
 * the mechanism the browser and JCEF use for bidi text and layout.
 *
 * Picking Persian or Arabic turns it on, picking a left-to-right language turns it off; in
 * between, the toggle in Settings is the user's to set either way.
 */

export type UiDirection = 'ltr' | 'rtl';

const STORAGE_KEY = 'uiDirection';
export const UI_DIRECTION_EVENT = 'ui-direction-changed';

/** Interface languages written right to left. */
export const RTL_LANGUAGES: ReadonlySet<string> = new Set(['fa', 'ar']);

export function directionOfLanguage(language: string | null | undefined): UiDirection {
  return language && RTL_LANGUAGES.has(language.split('-')[0]) ? 'rtl' : 'ltr';
}

function storedLanguage(): string | null {
  try {
    return localStorage.getItem('language');
  } catch {
    return null;
  }
}

/** The saved direction, or the one the interface language implies when none is saved. */
export function readUiDirection(): UiDirection {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'ltr' || saved === 'rtl') return saved;
  } catch {
    // Storage unavailable: fall back to the language.
  }
  return directionOfLanguage(storedLanguage());
}

/** Put the direction on the document root. */
export function applyUiDirection(direction: UiDirection): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('dir', direction);
}

/** Save, apply and announce a direction. */
export function setUiDirection(direction: UiDirection): void {
  try {
    localStorage.setItem(STORAGE_KEY, direction);
  } catch {
    // Not persisted; it still applies to this view.
  }
  applyUiDirection(direction);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(UI_DIRECTION_EVENT, { detail: direction }));
  }
}

/**
 * Follow a change of interface language: only when the language's reading direction
 * changes, so a direction the user chose by hand survives a switch between two languages
 * of the same direction.
 */
export function followLanguageChange(previous: string | null | undefined, next: string): void {
  const before = directionOfLanguage(previous);
  const after = directionOfLanguage(next);
  if (before !== after) setUiDirection(after);
}
