import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  UI_DIRECTION_EVENT,
  applyUiDirection,
  directionOfLanguage,
  followLanguageChange,
  readUiDirection,
  setUiDirection,
} from './uiDirection';

describe('uiDirection', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('dir');
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('dir');
  });

  it('reads Persian and Arabic right to left, everything else left to right', () => {
    expect(directionOfLanguage('fa')).toBe('rtl');
    expect(directionOfLanguage('ar')).toBe('rtl');
    expect(directionOfLanguage('ar-EG')).toBe('rtl');
    expect(directionOfLanguage('en')).toBe('ltr');
    expect(directionOfLanguage('zh-TW')).toBe('ltr');
    expect(directionOfLanguage(null)).toBe('ltr');
    expect(directionOfLanguage(undefined)).toBe('ltr');
  });

  it('follows the saved language when no direction is saved', () => {
    expect(readUiDirection()).toBe('ltr');
    localStorage.setItem('language', 'fa');
    expect(readUiDirection()).toBe('rtl');
  });

  it('prefers a saved direction over the language', () => {
    localStorage.setItem('language', 'ar');
    localStorage.setItem('uiDirection', 'ltr');
    expect(readUiDirection()).toBe('ltr');
    localStorage.setItem('language', 'en');
    localStorage.setItem('uiDirection', 'rtl');
    expect(readUiDirection()).toBe('rtl');
  });

  it('ignores a saved value that is not a direction', () => {
    localStorage.setItem('uiDirection', 'sideways');
    localStorage.setItem('language', 'fa');
    expect(readUiDirection()).toBe('rtl');
  });

  it('puts the direction on the document root', () => {
    applyUiDirection('rtl');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    applyUiDirection('ltr');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  });

  it('saves, applies and announces a direction', () => {
    const listener = vi.fn();
    window.addEventListener(UI_DIRECTION_EVENT, listener);
    try {
      setUiDirection('rtl');
      expect(localStorage.getItem('uiDirection')).toBe('rtl');
      expect(document.documentElement.getAttribute('dir')).toBe('rtl');
      expect(listener).toHaveBeenCalledTimes(1);
      expect((listener.mock.calls[0][0] as CustomEvent).detail).toBe('rtl');
    } finally {
      window.removeEventListener(UI_DIRECTION_EVENT, listener);
    }
  });

  it('flips when the language changes reading direction', () => {
    followLanguageChange('en', 'fa');
    expect(readUiDirection()).toBe('rtl');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    followLanguageChange('fa', 'ja');
    expect(readUiDirection()).toBe('ltr');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  });

  it('keeps a hand-picked direction across languages of the same direction', () => {
    setUiDirection('rtl');
    followLanguageChange('en', 'fr');
    expect(readUiDirection()).toBe('rtl');

    setUiDirection('ltr');
    followLanguageChange('fa', 'ar');
    expect(readUiDirection()).toBe('ltr');
  });
});
