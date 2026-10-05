import { useEffect, useSyncExternalStore } from 'react';

/**
 * Line spacing of the text in chat messages: paragraphs, lists, headings,
 * quotes and tables. Ported from the Claude Code GUI ("Swttch") plugin, with
 * the same range and default.
 *
 * The value reaches the styles as `--chat-line-height` on `<html>`, which
 * `.message-content` and `.markdown-content` read (message.less). Code blocks
 * keep the editor's own line spacing.
 *
 * Only a value other than the default is stored.
 */
const STORAGE_KEY = 'chatLineHeight';
const CHANGE_EVENT = 'cc-gui:chat-line-height-changed';
export const CHAT_LINE_HEIGHT_VAR = '--chat-line-height';

export const CHAT_LINE_HEIGHT_DEFAULT = 1.6;
export const CHAT_LINE_HEIGHT_MIN = 0.5;
export const CHAT_LINE_HEIGHT_MAX = 10;
export const CHAT_LINE_HEIGHT_STEP = 0.1;

/** [value] within the range and on the 0.1 grid, or null when it is not a number. */
export function normalizeChatLineHeight(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const clamped = Math.min(CHAT_LINE_HEIGHT_MAX, Math.max(CHAT_LINE_HEIGHT_MIN, value));
  return Math.round(clamped * 10) / 10;
}

export function getChatLineHeight(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return CHAT_LINE_HEIGHT_DEFAULT;
    return normalizeChatLineHeight(Number(raw)) ?? CHAT_LINE_HEIGHT_DEFAULT;
  } catch {
    return CHAT_LINE_HEIGHT_DEFAULT;
  }
}

let current: number | null = null;

export function setChatLineHeight(value: number): void {
  const next = normalizeChatLineHeight(value);
  if (next === null) return;
  try {
    if (next === CHAT_LINE_HEIGHT_DEFAULT) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    // Storage unavailable: the spacing still applies until the page reloads.
  }
  current = next;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function snapshot(): number {
  if (current === null) current = getChatLineHeight();
  return current;
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      current = getChatLineHeight();
      onChange();
    }
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function useChatLineHeight(): number {
  return useSyncExternalStore(subscribe, snapshot, () => CHAT_LINE_HEIGHT_DEFAULT);
}

/** Keep `--chat-line-height` on `<html>` in step with the setting. Mounted once, at the app's root. */
export function useChatLineHeightVar(): void {
  const value = useChatLineHeight();
  useEffect(() => {
    document.documentElement.style.setProperty(CHAT_LINE_HEIGHT_VAR, String(value));
  }, [value]);
}
