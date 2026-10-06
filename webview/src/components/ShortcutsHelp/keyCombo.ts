/**
 * Key combinations as the shortcuts window writes them: `Mod+Shift+Q`, `Shift+Enter`,
 * `Mod++`. `Mod` is the platform's primary modifier: Command on macOS, Ctrl elsewhere.
 * Every other modifier name is taken literally, so `Ctrl` stays Control on a Mac.
 */

export interface ComboParts {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  key: string;
}

const ARROW_SYMBOLS: Readonly<Record<string, string>> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

/**
 * Read a combo into its modifiers and key, or null when a segment is not a
 * modifier this file knows. A `+` key is written as the last character (`Mod++`).
 */
export function parseCombo(combo: string, mac: boolean): ComboParts | null {
  const plusKey = combo.endsWith('++');
  const segments = (plusKey ? combo.slice(0, -2) : combo).split('+');
  const key = plusKey ? '+' : segments.pop() ?? '';
  if (!key) return null;

  const parts: ComboParts = { ctrl: false, alt: false, shift: false, meta: false, key };
  for (const segment of segments) {
    if (segment === 'Mod') {
      if (mac) parts.meta = true;
      else parts.ctrl = true;
    } else if (segment === 'Ctrl') parts.ctrl = true;
    else if (segment === 'Alt') parts.alt = true;
    else if (segment === 'Shift') parts.shift = true;
    else if (segment === 'Meta') parts.meta = true;
    else return null;
  }
  return parts;
}

function keyLabel(key: string, mac: boolean): string {
  const arrow = ARROW_SYMBOLS[key];
  if (arrow) return arrow;
  if (key === 'Enter') return mac ? '↩' : 'Enter';
  if (key === 'Tab') return mac ? '⇥' : 'Tab';
  if (key === 'Escape') return 'Esc';
  if (key === 'Backspace') return mac ? '⌫' : 'Backspace';
  return key.length === 1 ? key.toUpperCase() : key;
}

/**
 * The key caps of one combination, in the order they are read: macOS symbols in
 * Apple's order (Control, Option, Shift, Command), words elsewhere.
 */
export function keyCapsOfParts(parts: ComboParts, mac: boolean): string[] {
  const caps: string[] = [];
  if (parts.ctrl) caps.push(mac ? '⌃' : 'Ctrl');
  if (parts.alt) caps.push(mac ? '⌥' : 'Alt');
  if (parts.shift) caps.push(mac ? '⇧' : 'Shift');
  if (parts.meta) caps.push(mac ? '⌘' : 'Win');
  caps.push(keyLabel(parts.key, mac));
  return caps;
}

/** The key caps for a combo, or an empty list when it cannot be read. */
export function keyCapsFor(combo: string, mac: boolean): string[] {
  const parts = parseCombo(combo, mac);
  return parts ? keyCapsOfParts(parts, mac) : [];
}

/** macOS, read the same way the zoom and the find keys read it. */
export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  return /mac|iphone|ipad|ipod/i.test(uaData?.platform ?? navigator.userAgent ?? '');
}

/**
 * Is this keydown the one that opens and closes the shortcuts window? Cmd+/ on
 * macOS, Ctrl+/ elsewhere, nothing else held (Shift makes it '?', and Alt types a
 * character on some layouts). Matched on the character or the physical key, so a
 * layout that puts '/' elsewhere still reaches it. A held key does not repeat it.
 */
export function isShortcutsHelpKey(e: KeyboardEvent, mac = isMacPlatform()): boolean {
  const primary = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  return primary && !e.shiftKey && !e.altKey && !e.repeat && (e.key === '/' || e.code === 'Slash');
}
