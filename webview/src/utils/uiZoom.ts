import { useSyncExternalStore } from 'react';

/**
 * Interface zoom: Ctrl/Cmd + "+", "-" and "0" scale the whole chat (text, icons,
 * padding) the way a browser's page zoom does. Ported from the Claude Code GUI
 * ("Swttch") plugin.
 *
 * It does not replace the "Font size" setting; the two multiply into the one
 * `--font-scale` the layout already zooms `#app` by (see fontScale.ts), so a
 * user who set 110% there and zooms to 125% here sees 137.5%.
 *
 * Stored in localStorage like the other appearance settings. 100% is not
 * stored, so a reset leaves nothing behind.
 */
const STORAGE_KEY = 'uiZoom';
const CHANGE_EVENT = 'cc-gui:ui-zoom-changed';

/** 100%: what a fresh install shows, and what reset returns to. */
export const UI_ZOOM_DEFAULT = 1;
/** Below this the input box and the header start clipping. */
export const UI_ZOOM_MIN = 0.5;
/** Above this one message fills a laptop screen. */
export const UI_ZOOM_MAX = 3;

/**
 * The stops each step lands on, the browser's own ladder. Walking a fixed
 * ladder rather than multiplying keeps every stop a round number, so zooming
 * out and back in returns exactly to 100%.
 */
export const UI_ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

export function clampUiZoom(level: number): number {
  if (!Number.isFinite(level)) return UI_ZOOM_DEFAULT;
  return Math.min(UI_ZOOM_MAX, Math.max(UI_ZOOM_MIN, level));
}

/** The next stop above [level]; a value between two stops goes to the next one up. */
export function stepUiZoomIn(level: number): number {
  const current = clampUiZoom(level);
  return UI_ZOOM_STEPS.find((step) => step > current + 1e-6) ?? UI_ZOOM_MAX;
}

/** The next stop below [level]. */
export function stepUiZoomOut(level: number): number {
  const current = clampUiZoom(level);
  return [...UI_ZOOM_STEPS].reverse().find((step) => step < current - 1e-6) ?? UI_ZOOM_MIN;
}

export function parseUiZoom(raw: string | null): number {
  if (!raw) return UI_ZOOM_DEFAULT;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? clampUiZoom(parsed) : UI_ZOOM_DEFAULT;
}

export function getUiZoom(): number {
  try {
    return parseUiZoom(localStorage.getItem(STORAGE_KEY));
  } catch {
    return UI_ZOOM_DEFAULT;
  }
}

let current: number | null = null;

export function setUiZoom(level: number): void {
  const next = clampUiZoom(level);
  try {
    if (next === UI_ZOOM_DEFAULT) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    // Storage unavailable: the zoom still applies until the page reloads.
  }
  current = next;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function snapshot(): number {
  if (current === null) current = getUiZoom();
  return current;
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      current = getUiZoom();
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

/** The zoom level, re-rendering the caller whenever it changes. */
export function useUiZoom(): number {
  return useSyncExternalStore(subscribe, snapshot, () => UI_ZOOM_DEFAULT);
}

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  return /mac|iphone|ipad|ipod/i.test(uaData?.platform ?? navigator.userAgent ?? '');
}

/**
 * Command on macOS, Ctrl elsewhere. On Windows and Linux `metaKey` is the
 * Super key, which belongs to the desktop, so it is not read there.
 */
function hasZoomModifier(e: KeyboardEvent, mac: boolean): boolean {
  if (e.altKey) return false;
  return mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
}

export type UiZoomGesture = 'in' | 'out' | 'reset';

/**
 * What a keydown asks of the zoom, or null. The number-row plus reads '=' or
 * '+' depending on Shift; the numpad keys are matched by their physical code,
 * since their `key` turns into 'Insert' and the like when NumLock is off, and
 * Ctrl+Insert is a copy.
 */
export function uiZoomGestureOf(e: KeyboardEvent, mac = isMacPlatform()): UiZoomGesture | null {
  if (!hasZoomModifier(e, mac)) return null;
  if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') return 'in';
  if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') return 'out';
  if (e.key === '0' || e.code === 'Numpad0') return 'reset';
  return null;
}
