// Single source of truth for the chat font-size level (1-6). The level table,
// valid range and default used to be duplicated across useThemeInit,
// useSettingsThemeSync and main.tsx getExpectedScale(), which let the default
// drift apart between them.
//
// The level is one of two factors of the `--font-scale` that `#app` is zoomed
// by; the other is the interface zoom (uiZoom.ts, Ctrl/Cmd + "+"/"-"). Every
// writer of `--font-scale` goes through chatScale() so the two never drift.

import { getUiZoom } from './uiZoom';

export const FONT_SIZE_LEVEL_STORAGE_KEY = 'fontSizeLevel';

export const MIN_FONT_SIZE_LEVEL = 1;
export const MAX_FONT_SIZE_LEVEL = 6;
export const DEFAULT_FONT_SIZE_LEVEL = 3; // 100%

export const FONT_SIZE_LEVEL_MAP: Record<number, number> = {
  1: 0.8,
  2: 0.9,
  3: 1.0,
  4: 1.1,
  5: 1.2,
  6: 1.4,
};

export function isValidFontSizeLevel(level: number): boolean {
  return Number.isInteger(level)
    && level >= MIN_FONT_SIZE_LEVEL
    && level <= MAX_FONT_SIZE_LEVEL;
}

export function fontSizeLevelToScale(level: number): number {
  return FONT_SIZE_LEVEL_MAP[level] ?? 1.0;
}

/**
 * The scale `#app` is zoomed by: the font size level times the interface
 * zoom, rounded so a product such as 1.1 × 1.25 does not carry float noise
 * into the CSS variable.
 */
export function chatScale(level: number, uiZoom: number): number {
  return Math.round(fontSizeLevelToScale(level) * uiZoom * 10000) / 10000;
}

/** chatScale() of the stored font size level and the stored interface zoom. */
export function storedChatScale(): number {
  let rawLevel: string | null = null;
  try {
    rawLevel = localStorage.getItem(FONT_SIZE_LEVEL_STORAGE_KEY);
  } catch {
    // Storage unavailable: the default level.
  }
  return chatScale(parseFontSizeLevel(rawLevel), getUiZoom());
}

export function parseFontSizeLevel(rawLevel: string | null): number {
  if (!rawLevel) {
    return DEFAULT_FONT_SIZE_LEVEL;
  }
  const parsed = parseInt(rawLevel, 10);
  return isValidFontSizeLevel(parsed) ? parsed : DEFAULT_FONT_SIZE_LEVEL;
}
