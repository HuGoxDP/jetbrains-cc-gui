import { useSyncExternalStore } from 'react';
import { sendBridgeEvent } from './bridge.js';

/**
 * What the open chat tabs are doing, by session id. Ported from the Claude Code
 * GUI ("Swttch") plugin's session activity markers.
 *
 * The plugin pushes the whole map whenever a tab's status changes, and when the
 * history list asks, through `window.onSessionActivity(json)`. A session that
 * is not open in any tab is absent from it.
 */
export type SessionActivity = 'running' | 'awaiting' | 'done' | 'open';

export type SessionActivityMap = Readonly<Record<string, SessionActivity>>;

const KNOWN: ReadonlySet<string> = new Set(['running', 'awaiting', 'done', 'open']);
const EMPTY: SessionActivityMap = Object.freeze({});

let current: SessionActivityMap = EMPTY;
const listeners = new Set<() => void>();

/** Read the plugin's push, keeping only known states, so a bad payload changes nothing. */
export function parseSessionActivity(json: string): SessionActivityMap | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const map: Record<string, SessionActivity> = {};
  for (const [sessionId, state] of Object.entries(raw as Record<string, unknown>)) {
    if (sessionId && typeof state === 'string' && KNOWN.has(state)) map[sessionId] = state as SessionActivity;
  }
  return map;
}

function receive(json: string): void {
  const next = parseSessionActivity(json);
  if (!next) return;
  current = next;
  listeners.forEach((listener) => listener());
}

if (typeof window !== 'undefined') {
  window.onSessionActivity = receive;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The latest map, re-rendering on every push. */
export function useSessionActivity(): SessionActivityMap {
  return useSyncExternalStore(subscribe, () => current, () => EMPTY);
}

/** Ask the plugin for the map now, as the history list does when it opens. */
export function requestSessionActivity(): void {
  sendBridgeEvent('get_session_activity');
}

/** Test hook. */
export function resetSessionActivityForTests(): void {
  current = EMPTY;
  listeners.clear();
  window.onSessionActivity = receive;
}
