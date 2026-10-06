import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SHORTCUT_CATALOG, SHORTCUT_GROUPS, ShortcutId, visibleShortcuts } from './shortcutCatalog';

const row = (rows: ReturnType<typeof visibleShortcuts>, id: ShortcutId) => rows.find((r) => r.id === id);

describe('visibleShortcuts', () => {
  it('names the send and newline keys the user chose', () => {
    const enter = visibleShortcuts({ mac: false, sendShortcut: 'enter' });
    expect(row(enter, ShortcutId.SendMessage)?.combos).toEqual([['Enter']]);
    expect(row(enter, ShortcutId.InsertNewline)?.combos).toEqual([['Shift', 'Enter']]);

    const modEnter = visibleShortcuts({ mac: true, sendShortcut: 'cmdEnter' });
    expect(row(modEnter, ShortcutId.SendMessage)?.combos).toEqual([['⌘', '↩']]);
    expect(row(modEnter, ShortcutId.InsertNewline)?.combos).toEqual([['↩'], ['⇧', '↩']]);
  });

  it('lists the Cmd text-editing keys on macOS only', () => {
    const mac = visibleShortcuts({ mac: true, sendShortcut: 'enter' });
    const other = visibleShortcuts({ mac: false, sendShortcut: 'enter' });
    for (const id of [ShortcutId.LineEdges, ShortcutId.TextEdges, ShortcutId.DeleteToLineStart]) {
      expect(row(mac, id)).toBeDefined();
      expect(row(other, id)).toBeUndefined();
    }
  });

  it('names the primary modifier of the platform', () => {
    expect(row(visibleShortcuts({ mac: false, sendShortcut: 'enter' }), ShortcutId.OpenHelp)?.combos).toEqual([['Ctrl', '/']]);
    expect(row(visibleShortcuts({ mac: true, sendShortcut: 'enter' }), ShortcutId.OpenHelp)?.combos).toEqual([['⌘', '/']]);
  });
});

describe('translations', () => {
  const dir = 'src/i18n/locales';
  const locales = readdirSync(dir).filter((f) => f.endsWith('.json'));

  it.each(locales)('%s has a text for every row, group and note', (file) => {
    const help = JSON.parse(readFileSync(`${dir}/${file}`, 'utf-8')).shortcutsHelp;
    for (const entry of SHORTCUT_CATALOG) expect(help.rows[entry.id], `${file} rows.${entry.id}`).toBeTruthy();
    for (const meta of SHORTCUT_GROUPS) {
      const [, section, name] = meta.titleKey.split('.');
      expect(help[section][name], `${file} ${meta.titleKey}`).toBeTruthy();
      if (meta.noteKey) {
        const [, noteSection, noteName] = meta.noteKey.split('.');
        expect(help[noteSection][noteName], `${file} ${meta.noteKey}`).toBeTruthy();
      }
    }
  });
});
