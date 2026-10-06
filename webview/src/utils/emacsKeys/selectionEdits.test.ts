import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  breaksLinesWithElements,
  insertAtSelection,
  killAtSelection,
  openLineAtSelection,
  transposeAtSelection,
  yankAtSelection,
} from './selectionEdits.js';
import { applyEmacsTextKey } from './emacsTextEdit.js';
import { EmacsTextKey } from './emacsTextKeys.js';
import { killRing } from './killRing.js';

/**
 * The chat input breaks lines with elements, where text offsets cannot tell
 * lines apart, so Ctrl+K/Y/O/T work on the live selection there. The test DOM
 * has no editing engine, so `document.execCommand` and `Selection.modify` are
 * recorded rather than performed.
 */

type Call = { command: string; value?: string };
let calls: Call[];
const originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand');

function stubExecCommand(result = true) {
  calls = [];
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    writable: true,
    value: (command: string, _ui?: boolean, value?: string) => {
      calls.push(value === undefined ? { command } : { command, value });
      return result;
    },
  });
}

/** A stand-in selection: what the engine would select after each `modify`, in order. */
function fakeSelection(steps: { collapsed: boolean; text: string }[]) {
  let index = 0;
  const modify = vi.fn(() => {
    index = Math.min(index + 1, steps.length - 1);
  });
  const selection = {
    rangeCount: 1,
    get isCollapsed() {
      return steps[index].collapsed;
    },
    modify,
    toString: () => steps[index].text,
  };
  vi.spyOn(window, 'getSelection').mockReturnValue(selection as unknown as Selection);
  return { modify };
}

let root: HTMLElement;

beforeEach(() => {
  killRing.clear();
  stubExecCommand();
  root = document.createElement('div');
  root.setAttribute('contenteditable', 'true');
  root.innerHTML = 'first line<br>second line';
  document.body.appendChild(root);
});

afterEach(() => {
  vi.restoreAllMocks();
  root.remove();
  if (originalExecCommand) {
    Object.defineProperty(document, 'execCommand', originalExecCommand);
  } else {
    delete (document as { execCommand?: Document['execCommand'] }).execCommand;
  }
});

describe('breaksLinesWithElements', () => {
  it('is true for a rich editable with a <br> or a block inside', () => {
    expect(breaksLinesWithElements(root)).toBe(true);
    const withDiv = document.createElement('div');
    withDiv.innerHTML = 'a<div>b</div>';
    expect(breaksLinesWithElements(withDiv)).toBe(true);
  });

  it('is false for text alone, and for a plaintext-only editable', () => {
    const plain = document.createElement('div');
    plain.textContent = 'a\nb';
    expect(breaksLinesWithElements(plain)).toBe(false);
    plain.setAttribute('contenteditable', 'plaintext-only');
    plain.innerHTML = 'a<br>b';
    expect(breaksLinesWithElements(plain)).toBe(false);
  });
});

describe('killAtSelection', () => {
  it('cuts from the caret to the end of the paragraph into the kill ring', () => {
    const { modify } = fakeSelection([
      { collapsed: true, text: '' },
      { collapsed: false, text: 'line' },
    ]);

    killAtSelection(root);

    expect(modify).toHaveBeenCalledWith('extend', 'forward', 'paragraphboundary');
    expect(modify).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([{ command: 'delete' }]);
    expect(killRing.text()).toBe('line');
  });

  it('takes the line break at the end of a paragraph, joining the next line on', () => {
    const { modify } = fakeSelection([
      { collapsed: true, text: '' },
      { collapsed: true, text: '' },
      { collapsed: false, text: '\n' },
    ]);

    killAtSelection(root);

    expect(modify).toHaveBeenLastCalledWith('extend', 'forward', 'character');
    expect(killRing.text()).toBe('\n');
  });

  it('cuts a selection as it stands', () => {
    const { modify } = fakeSelection([{ collapsed: false, text: 'marked' }]);

    killAtSelection(root);

    expect(modify).not.toHaveBeenCalled();
    expect(killRing.text()).toBe('marked');
  });

  it('does nothing at the very end, and keeps the ring when the delete is refused', () => {
    fakeSelection([{ collapsed: true, text: '' }]);
    killAtSelection(root);
    expect(calls).toEqual([]);

    stubExecCommand(false);
    fakeSelection([{ collapsed: false, text: 'kept out' }]);
    killAtSelection(root);
    expect(killRing.text()).toBe('');
  });
});

describe('insertAtSelection and yankAtSelection', () => {
  it('inserts each line as text, with a line break command between lines', () => {
    expect(insertAtSelection('one\n\ntwo')).toBe(true);
    expect(calls).toEqual([
      { command: 'insertText', value: 'one' },
      { command: 'insertLineBreak' },
      { command: 'insertLineBreak' },
      { command: 'insertText', value: 'two' },
    ]);
  });

  it('yanks what was last cut, and nothing before the first cut', () => {
    yankAtSelection();
    expect(calls).toEqual([]);

    killRing.recordKill(root, 'cut text', 0, 'x', 'y');
    yankAtSelection();
    expect(calls).toEqual([{ command: 'insertText', value: 'cut text' }]);
  });
});

describe('openLineAtSelection', () => {
  it('breaks the line and leaves the caret in front of the break', () => {
    const { modify } = fakeSelection([{ collapsed: true, text: '' }]);

    openLineAtSelection();

    expect(calls).toEqual([{ command: 'insertLineBreak' }]);
    expect(modify).toHaveBeenCalledWith('move', 'backward', 'character');
  });
});

describe('transposeAtSelection', () => {
  it('swaps the characters around the caret within its text node', () => {
    const text = root.firstChild as Text;
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    const caret = document.createRange();
    caret.setStart(text, 2);
    caret.collapse(true);
    selection.addRange(caret);
    const selected: string[] = [];
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      writable: true,
      value: (command: string, _ui?: boolean, value?: string) => {
        selected.push(window.getSelection()!.toString());
        calls.push({ command, value });
        return true;
      },
    });
    calls = [];

    transposeAtSelection();

    expect(selected).toEqual(['ir']);
    expect(calls).toEqual([{ command: 'insertText', value: 'ri' }]);
  });
});

describe('applyEmacsTextKey on an editable that breaks lines with elements', () => {
  it('kills through the selection rather than by text offsets', () => {
    const { modify } = fakeSelection([
      { collapsed: true, text: '' },
      { collapsed: false, text: 'line' },
    ]);

    applyEmacsTextKey(root, EmacsTextKey.K, false);

    expect(modify).toHaveBeenCalledWith('extend', 'forward', 'paragraphboundary');
    expect(killRing.text()).toBe('line');
  });
});
