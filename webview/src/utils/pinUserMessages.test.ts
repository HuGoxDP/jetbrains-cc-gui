import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { getPinUserMessages, setPinUserMessages, usePinUserMessages } from './pinUserMessages';

afterEach(() => {
  setPinUserMessages(true);
  localStorage.clear();
});

describe('pinUserMessages', () => {
  it('is on until switched off, and stores only "off"', () => {
    expect(getPinUserMessages()).toBe(true);
    setPinUserMessages(false);
    expect(localStorage.getItem('pinUserMessages')).toBe('false');
    setPinUserMessages(true);
    expect(localStorage.getItem('pinUserMessages')).toBeNull();
  });

  it('updates every reader at once', () => {
    const { result } = renderHook(() => usePinUserMessages());
    expect(result.current).toBe(true);
    act(() => setPinUserMessages(false));
    expect(result.current).toBe(false);
  });
});
