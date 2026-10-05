import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { getSoftWrap, setSoftWrap, SOFT_WRAP_CLASS, useSoftWrap, useSoftWrapClass } from './softWrap';

describe('soft wrap setting', () => {
  afterEach(() => {
    setSoftWrap(false);
    localStorage.clear();
  });

  it('is off until switched on, and stores only "on"', () => {
    expect(getSoftWrap()).toBe(false);
    setSoftWrap(true);
    expect(localStorage.getItem('softWrap')).toBe('true');
    setSoftWrap(false);
    expect(localStorage.getItem('softWrap')).toBeNull();
  });

  it('re-renders whoever reads it the moment it is switched', () => {
    const { result } = renderHook(() => useSoftWrap());
    expect(result.current).toBe(false);
    act(() => setSoftWrap(true));
    expect(result.current).toBe(true);
  });

  it('keeps the class on <html> in step, which is what the styles read', () => {
    renderHook(() => useSoftWrapClass());
    expect(document.documentElement.classList.contains(SOFT_WRAP_CLASS)).toBe(false);
    act(() => setSoftWrap(true));
    expect(document.documentElement.classList.contains(SOFT_WRAP_CLASS)).toBe(true);
    act(() => setSoftWrap(false));
    expect(document.documentElement.classList.contains(SOFT_WRAP_CLASS)).toBe(false);
  });
});
