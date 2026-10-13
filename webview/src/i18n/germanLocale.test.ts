import { describe, expect, it } from 'vitest';
import i18n from './config';
import en from './locales/en.json';
import de from './locales/de.json';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

const placeholders = (text: string) => (text.match(/\{\{[^}]+\}\}/g) ?? []).sort();

const EN = flatten(en as Tree);
const DE = flatten(de as Tree);

describe('de locale', () => {
  it('is registered', () => {
    expect(i18n.hasResourceBundle('de', 'translation')).toBe(true);
  });

  it('has every key English has, and no others', () => {
    // German plurals use the same _one / _other keys as English, so the key sets match exactly.
    expect(Object.keys(DE).filter((key) => !(key in EN))).toEqual([]);
    expect(Object.keys(EN).filter((key) => !(key in DE))).toEqual([]);
  });

  it('keeps every placeholder of the English text', () => {
    const mismatched = Object.keys(DE).filter(
      (key) => placeholders(DE[key]).join() !== placeholders(EN[key]).join(),
    );
    expect(mismatched).toEqual([]);
  });

  it('names German in its own language in every locale', () => {
    expect(EN['settings.basic.language.german']).toBe('Deutsch');
    expect(DE['settings.basic.language.german']).toBe('Deutsch');
  });

  it('renders German text when switched to it', async () => {
    const previous = i18n.language;
    try {
      await i18n.changeLanguage('de');
      expect(i18n.t('settings.basic.language.label')).toBe('Sprache');
      expect(i18n.t('settings.other.historyCompletion.timeAgo.daysAgo', { count: 3 })).toBe('vor 3 Tagen');
      expect(i18n.t('settings.other.historyCompletion.timeAgo.daysAgo', { count: 1 })).toBe('vor 1 Tag');
    } finally {
      await i18n.changeLanguage(previous);
    }
  });
});
