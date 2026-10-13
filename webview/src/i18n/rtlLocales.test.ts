import { describe, expect, it } from 'vitest';
import i18n from './config';
import en from './locales/en.json';
import fa from './locales/fa.json';
import ar from './locales/ar.json';

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

/** Arabic has more plural forms than English; each comes from the English `_other` key. */
const ARABIC_ONLY_PLURAL = /_(zero|two|few|many)$/;

function englishKeyOf(key: string): string {
  return key.replace(ARABIC_ONLY_PLURAL, '_other');
}

describe.each([
  ['fa', fa as Tree],
  ['ar', ar as Tree],
])('%s locale', (lang, tree) => {
  const strings = flatten(tree);

  it('is registered', () => {
    expect(i18n.hasResourceBundle(lang, 'translation')).toBe(true);
  });

  it('only has keys English has', () => {
    const unknown = Object.keys(strings).filter((key) => !(englishKeyOf(key) in EN));
    expect(unknown).toEqual([]);
  });

  it('keeps every placeholder of the English text', () => {
    const mismatched = Object.entries(strings)
      .filter(([key, value]) => placeholders(value).join() !== placeholders(EN[englishKeyOf(key)]).join())
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });

  it('translates the direction toggle and its own language name', () => {
    expect(strings['settings.basic.rtl.label']).toBeTruthy();
    expect(strings['settings.basic.language.persian']).toBe('فارسی');
    expect(strings['settings.basic.language.arabic']).toBe('العربية');
  });
});

describe('ar plurals', () => {
  it('gives every plural every Arabic form', () => {
    const strings = flatten(ar as Tree);
    const missing: string[] = [];
    for (const key of Object.keys(strings)) {
      if (!key.endsWith('_other')) continue;
      const base = key.slice(0, -'_other'.length);
      for (const form of ['zero', 'two', 'few', 'many']) {
        if (!(`${base}_${form}` in strings)) missing.push(`${base}_${form}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('picks the right string for counts Arabic treats as few', () => {
    const t = i18n.getFixedT('ar');
    const text = t('tools.reportFindings.findingsCount', { count: 3 });
    expect(text).toContain('3');
    expect(text).not.toMatch(/finding/);
  });
});
