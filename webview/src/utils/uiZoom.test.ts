import { afterEach, describe, expect, it } from 'vitest';
import {
  UI_ZOOM_DEFAULT,
  UI_ZOOM_MAX,
  UI_ZOOM_MIN,
  getUiZoom,
  parseUiZoom,
  setUiZoom,
  stepUiZoomIn,
  stepUiZoomOut,
  uiZoomGestureOf,
} from './uiZoom';
import { chatScale, storedChatScale } from './fontScale';

const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

describe('interface zoom ladder', () => {
  it('walks the browser stops and comes back to exactly 100%', () => {
    let level = UI_ZOOM_DEFAULT;
    level = stepUiZoomIn(level);
    level = stepUiZoomIn(level);
    expect(level).toBe(1.25);
    level = stepUiZoomOut(stepUiZoomOut(level));
    expect(level).toBe(1);
  });

  it('stops at both ends', () => {
    expect(stepUiZoomIn(UI_ZOOM_MAX)).toBe(UI_ZOOM_MAX);
    expect(stepUiZoomOut(UI_ZOOM_MIN)).toBe(UI_ZOOM_MIN);
  });

  it('moves a value between two stops to the next stop', () => {
    expect(stepUiZoomIn(1.05)).toBe(1.1);
    expect(stepUiZoomOut(1.05)).toBe(1);
  });

  it('reads a stored value and falls back to 100% on anything else', () => {
    expect(parseUiZoom('1.5')).toBe(1.5);
    expect(parseUiZoom('9')).toBe(UI_ZOOM_MAX);
    expect(parseUiZoom('abc')).toBe(UI_ZOOM_DEFAULT);
    expect(parseUiZoom(null)).toBe(UI_ZOOM_DEFAULT);
  });
});

describe('storing the zoom', () => {
  afterEach(() => {
    setUiZoom(UI_ZOOM_DEFAULT);
    localStorage.clear();
  });

  it('keeps nothing at 100%', () => {
    setUiZoom(1.25);
    expect(localStorage.getItem('uiZoom')).toBe('1.25');
    setUiZoom(1);
    expect(localStorage.getItem('uiZoom')).toBeNull();
    expect(getUiZoom()).toBe(1);
  });

  it('multiplies with the font size level into the one scale #app is zoomed by', () => {
    expect(chatScale(4, 1.25)).toBe(1.375);
    localStorage.setItem('fontSizeLevel', '4');
    setUiZoom(1.25);
    expect(storedChatScale()).toBe(1.375);
  });
});

describe('zoom keys', () => {
  it('reads Ctrl on Windows and Linux', () => {
    expect(uiZoomGestureOf(key({ key: '=', ctrlKey: true }), false)).toBe('in');
    expect(uiZoomGestureOf(key({ key: '+', ctrlKey: true, shiftKey: true }), false)).toBe('in');
    expect(uiZoomGestureOf(key({ key: '-', ctrlKey: true }), false)).toBe('out');
    expect(uiZoomGestureOf(key({ key: '0', ctrlKey: true }), false)).toBe('reset');
    expect(uiZoomGestureOf(key({ key: '=', metaKey: true }), false)).toBeNull();
  });

  it('reads Command on macOS and leaves Ctrl alone there', () => {
    expect(uiZoomGestureOf(key({ key: '=', metaKey: true }), true)).toBe('in');
    expect(uiZoomGestureOf(key({ key: '=', ctrlKey: true }), true)).toBeNull();
  });

  it('matches the numpad by its key, and leaves Ctrl+Insert a copy', () => {
    expect(uiZoomGestureOf(key({ key: 'Insert', code: 'Numpad0', ctrlKey: true }), false)).toBe('reset');
    expect(uiZoomGestureOf(key({ key: '+', code: 'NumpadAdd', ctrlKey: true }), false)).toBe('in');
    expect(uiZoomGestureOf(key({ key: 'Insert', code: 'Insert', ctrlKey: true }), false)).toBeNull();
  });

  it('ignores the keys without the modifier, or with Alt', () => {
    expect(uiZoomGestureOf(key({ key: '=' }), false)).toBeNull();
    expect(uiZoomGestureOf(key({ key: '=', ctrlKey: true, altKey: true }), false)).toBeNull();
  });
});
