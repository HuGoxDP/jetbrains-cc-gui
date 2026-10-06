import { getSelectionRange } from './domSelection.js';
import { transposeReplacement } from './emacsTextRange.js';
import { killRing } from './killRing.js';

/**
 * The Emacs edits for a contentEditable that breaks lines with elements.
 *
 * The rest of this folder works in `textContent` offsets, which is exact for a
 * `plaintext-only` editable whose line breaks are "\n" characters (Swttch's
 * composer, where it comes from). This chat's input is a rich contentEditable:
 * Shift+Enter leaves a `<br>` or a `<div>`, and `textContent` holds no line
 * break at all, so an offset cannot say which line it is on and an edit across
 * lines would land on the wrong one. These edits work on the live selection
 * instead and let the engine find the paragraph's end, the same way the caret
 * moves already do with `Selection.modify`.
 */

/** `document.execCommand`, or false when it is missing or throws. */
function exec(command: string, value?: string): boolean {
  try {
    return document.execCommand(command, false, value);
  } catch {
    return false;
  }
}

/** Whether `root` breaks lines with elements rather than with "\n" characters in its text. */
export function breaksLinesWithElements(root: HTMLElement): boolean {
  if (root.getAttribute('contenteditable') === 'plaintext-only') return false;
  return root.querySelector('br, div, p') !== null;
}

/**
 * Insert `text` at the selection through the browser's editing pipeline, so it
 * can be undone, with a line break command for each "\n" (`insertText` would
 * drop or mangle one in a contentEditable).
 */
export function insertAtSelection(text: string): boolean {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (i > 0 && !exec('insertLineBreak')) return false;
    if (lines[i] !== '' && !exec('insertText', lines[i])) return false;
  }
  return true;
}

/**
 * Ctrl+K: cut from the caret to the end of its paragraph into the kill ring;
 * at the paragraph's end, the line break after it, so the next line joins on.
 * A selection is cut as it stands.
 */
export function killAtSelection(root: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || typeof selection.modify !== 'function') return;
  if (selection.isCollapsed) {
    selection.modify('extend', 'forward', 'paragraphboundary');
    if (selection.isCollapsed) selection.modify('extend', 'forward', 'character');
  }
  // The engine renders a line break inside the selection as "\n", which is
  // what Ctrl+Y must give back.
  const killed = selection.toString();
  if (!killed) return;
  const textBefore = root.textContent ?? '';
  if (!exec('delete')) return;
  killRing.recordKill(root, killed, getSelectionRange(root).start, textBefore, root.textContent ?? '');
}

/** Ctrl+Y: the last cut text replaces the selection, caret after it. */
export function yankAtSelection(): void {
  const text = killRing.text();
  if (text) insertAtSelection(text);
}

/** Ctrl+O: a line break replaces the selection and the caret stays in front of it. */
export function openLineAtSelection(): void {
  if (!exec('insertLineBreak')) return;
  window.getSelection()?.modify?.('move', 'backward', 'character');
}

/**
 * Ctrl+T: swap the characters around the caret, by the same rule as a plain
 * field (transposeReplacement), within the text node the caret is in. A line
 * edge in this editable is an element, so the pair never spans one; at the
 * very start of a line there is nothing to swap, as in macOS.
 */
export function transposeAtSelection(): void {
  const selection = window.getSelection();
  if (!selection || !selection.isCollapsed) return;
  const node = selection.focusNode;
  if (!node || node.nodeType !== Node.TEXT_NODE) return;
  const text = (node as Text).data;
  const caret = selection.focusOffset;
  const replacement = transposeReplacement(text, { start: caret, end: caret });
  if (!replacement) return;
  const range = document.createRange();
  range.setStart(node, replacement.start);
  range.setEnd(node, replacement.end);
  selection.removeAllRanges();
  selection.addRange(range);
  exec('insertText', replacement.text);
}
