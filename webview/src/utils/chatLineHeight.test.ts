import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  CHAT_LINE_HEIGHT_DEFAULT,
  CHAT_LINE_HEIGHT_VAR,
  getChatLineHeight,
  normalizeChatLineHeight,
  setChatLineHeight,
  useChatLineHeightVar,
} from './chatLineHeight';
import { readFileSync } from 'node:fs';

// The test environment does not load styles, so the source is read as text.
const messageStyles = readFileSync('src/styles/less/components/message.less', 'utf-8');

describe('chat line spacing', () => {
  afterEach(() => {
    setChatLineHeight(CHAT_LINE_HEIGHT_DEFAULT);
    localStorage.clear();
  });

  it('keeps values in range and on the 0.1 grid', () => {
    expect(normalizeChatLineHeight(2.04)).toBe(2);
    expect(normalizeChatLineHeight(0.1)).toBe(0.5);
    expect(normalizeChatLineHeight(50)).toBe(10);
    expect(normalizeChatLineHeight(Number('x'))).toBeNull();
  });

  it('stores only a value other than the default', () => {
    setChatLineHeight(2);
    expect(localStorage.getItem('chatLineHeight')).toBe('2');
    expect(getChatLineHeight()).toBe(2);
    setChatLineHeight(CHAT_LINE_HEIGHT_DEFAULT);
    expect(localStorage.getItem('chatLineHeight')).toBeNull();
  });

  it('puts the value on <html>, where the message styles read it', () => {
    renderHook(() => useChatLineHeightVar());
    expect(document.documentElement.style.getPropertyValue(CHAT_LINE_HEIGHT_VAR)).toBe('1.6');
    act(() => setChatLineHeight(2.2));
    expect(document.documentElement.style.getPropertyValue(CHAT_LINE_HEIGHT_VAR)).toBe('2.2');
  });

  it('is read by both message text rules', () => {
    const uses = messageStyles.match(/line-height: var\(--chat-line-height, 1\.6\)/g) ?? [];
    expect(uses).toHaveLength(2);
  });
});
