import { useSyncExternalStore } from 'react';

/**
 * "Pin your last message": while Claude works through a long reply, the message
 * that started it stays at the top of the chat until the next one takes over.
 * Ported from the Claude Code GUI ("Swttch") plugin, where it is always on; here
 * it can be switched off, because it changes how the chat scrolls.
 *
 * On by default, so only "off" is stored.
 */
const STORAGE_KEY = 'pinUserMessages';
const CHANGE_EVENT = 'cc-gui:pin-user-messages-changed';

export function getPinUserMessages(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setPinUserMessages(pin: boolean): void {
  try {
    if (pin) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, 'false');
  } catch {
    // Storage unavailable: the setting still applies until the page reloads.
  }
  current = pin;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

let current: boolean | null = null;

function snapshot(): boolean {
  if (current === null) current = getPinUserMessages();
  return current;
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      current = getPinUserMessages();
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
export function usePinUserMessages(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}
