import { describe, expect, it } from 'vitest';
import { isShortcutsHelpKey, keyCapsFor, parseCombo } from './keyCombo';

const keydown = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

describe('parseCombo', () => {
  it('reads Mod as Command on macOS and Ctrl elsewhere', () => {
    expect(parseCombo('Mod+Shift+Q', true)).toEqual({ ctrl: false, alt: false, shift: true, meta: true, key: 'Q' });
    expect(parseCombo('Mod+Shift+Q', false)).toEqual({ ctrl: true, alt: false, shift: true, meta: false, key: 'Q' });
  });

  it('reads a plus key written last', () => {
    expect(parseCombo('Mod++', false)).toEqual({ ctrl: true, alt: false, shift: false, meta: false, key: '+' });
  });

  it('refuses a modifier it does not know', () => {
    expect(parseCombo('Hyper+K', false)).toBeNull();
    expect(keyCapsFor('Hyper+K', false)).toEqual([]);
  });
});

describe('keyCapsFor', () => {
  it('uses symbols in Apple order on macOS', () => {
    expect(keyCapsFor('Mod+Alt+K', true)).toEqual(['⌥', '⌘', 'K']);
    expect(keyCapsFor('Shift+Enter', true)).toEqual(['⇧', '↩']);
    expect(keyCapsFor('Mod+Backspace', true)).toEqual(['⌘', '⌫']);
  });

  it('uses words elsewhere', () => {
    expect(keyCapsFor('Mod+Alt+K', false)).toEqual(['Ctrl', 'Alt', 'K']);
    expect(keyCapsFor('Shift+Escape', false)).toEqual(['Shift', 'Esc']);
    expect(keyCapsFor('ArrowUp', false)).toEqual(['↑']);
  });
});

describe('isShortcutsHelpKey', () => {
  it('is Ctrl+/ off macOS and Cmd+/ on macOS', () => {
    expect(isShortcutsHelpKey(keydown({ key: '/', ctrlKey: true }), false)).toBe(true);
    expect(isShortcutsHelpKey(keydown({ key: '/', metaKey: true }), false)).toBe(false);
    expect(isShortcutsHelpKey(keydown({ key: '/', metaKey: true }), true)).toBe(true);
    expect(isShortcutsHelpKey(keydown({ key: '/', ctrlKey: true }), true)).toBe(false);
  });

  it('follows the physical key on a layout that puts / elsewhere', () => {
    expect(isShortcutsHelpKey(keydown({ key: '.', code: 'Slash', ctrlKey: true }), false)).toBe(true);
  });

  it('ignores Shift, Alt and a held key', () => {
    expect(isShortcutsHelpKey(keydown({ key: '?', code: 'Slash', ctrlKey: true, shiftKey: true }), false)).toBe(false);
    expect(isShortcutsHelpKey(keydown({ key: '/', ctrlKey: true, altKey: true }), false)).toBe(false);
    expect(isShortcutsHelpKey(keydown({ key: '/', ctrlKey: true, repeat: true }), false)).toBe(false);
  });
});
