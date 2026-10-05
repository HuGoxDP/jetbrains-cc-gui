import { useEffect, useSyncExternalStore } from 'react';

/**
 * "Wrap long lines": code blocks and edit diffs fold a long line at the box's
 * edge instead of hiding the rest of it behind a horizontal scroll. Ported
 * from the Claude Code GUI ("Swttch") plugin, where it is off by default, as
 * here: wrapping changes where the eye finds indentation.
 *
 * The setting does not reach the components one by one. It puts a `soft-wrap`
 * class on `<html>`, and the styles of every block it concerns read that class
 * (see "Soft wrap" in message.less), so a block added later only needs a rule.
 *
 * Off by default, so only "on" is stored.
 */
const STORAGE_KEY = 'softWrap';
const CHANGE_EVENT = 'cc-gui:soft-wrap-changed';
export const SOFT_WRAP_CLASS = 'soft-wrap';

export function getSoftWrap(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setSoftWrap(on: boolean): void {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, 'true');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: the setting still applies until the page reloads.
  }
  current = on;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

let current: boolean | null = null;

function snapshot(): boolean {
  if (current === null) current = getSoftWrap();
  return current;
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      current = getSoftWrap();
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

/** The setting, re-rendering the caller the moment it is switched anywhere. */
export function useSoftWrap(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

/** Keep the `soft-wrap` class on `<html>` in step with the setting. Mounted once, at the app's root. */
export function useSoftWrapClass(): void {
  const on = useSoftWrap();
  useEffect(() => {
    document.documentElement.classList.toggle(SOFT_WRAP_CLASS, on);
  }, [on]);
}
