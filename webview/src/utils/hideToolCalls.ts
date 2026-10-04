import { useSyncExternalStore } from 'react';
import { FILE_MODIFY_TOOL_NAMES, normalizeToolName } from './toolConstants';

/**
 * "Hide tool calls": keep the chat to the prompt, the answer and what the turn
 * changed, the way the Claude Code CLI's focus view (`/focus`) does.
 *
 * Display only. Nothing is removed from the session, the agent works exactly as
 * before, and switching the setting off shows every card again, including the
 * ones from turns that ran while it was on.
 */

const STORAGE_KEY = 'hideToolCalls';
const CHANGE_EVENT = 'cc-gui:hide-tool-calls-changed';

/**
 * Tools that stay on screen while hiding.
 *
 * The line is between a tool that CHANGES something or ASKS something and one
 * that only looks or runs: the first is what the turn produced, the second is
 * how it got there. `sendusermessage` (legacy `brief`) is kept because in the
 * CLI's brief mode that call IS the reply, and hiding it would leave a blank
 * turn. Names are compared normalized, so every provider's edit tools
 * (FILE_MODIFY_TOOL_NAMES) count as changes.
 */
const ALWAYS_VISIBLE_TOOL_NAMES = new Set([
  ...FILE_MODIFY_TOOL_NAMES,
  'askuserquestion',
  'enterplanmode',
  'exitplanmode',
  'sendusermessage',
  'brief',
]);

export function isAlwaysVisibleTool(name: string | undefined): boolean {
  return ALWAYS_VISIBLE_TOOL_NAMES.has(normalizeToolName(name ?? ''));
}

/** Whether this block disappears while tool calls are hidden. */
export function isHiddenToolCall(block: { type?: string; name?: string }): boolean {
  return block.type === 'tool_use' && !isAlwaysVisibleTool(block.name);
}

export function getHideToolCalls(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setHideToolCalls(hide: boolean): void {
  try {
    if (hide) localStorage.setItem(STORAGE_KEY, 'true');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: the setting still applies until the page reloads.
  }
  current = hide;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

let current: boolean | null = null;

function snapshot(): boolean {
  if (current === null) current = getHideToolCalls();
  return current;
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      current = getHideToolCalls();
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
export function useHideToolCalls(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
