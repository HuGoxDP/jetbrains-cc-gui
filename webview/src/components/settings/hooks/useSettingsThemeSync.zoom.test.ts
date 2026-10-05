import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSettingsThemeSync } from './useSettingsThemeSync';
import { setUiZoom } from '../../../utils/uiZoom';

vi.mock('../../../utils/forceWebviewRepaint', () => ({ forceWebviewRepaint: vi.fn() }));

describe('font size with an interface zoom set', () => {
  afterEach(() => {
    setUiZoom(1);
    localStorage.clear();
  });

  it('keeps the zoom when the font size changes', () => {
    setUiZoom(1.25);
    const { result } = renderHook(() => useSettingsThemeSync());
    act(() => result.current.setFontSizeLevel(4));
    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('1.375');
  });
});
