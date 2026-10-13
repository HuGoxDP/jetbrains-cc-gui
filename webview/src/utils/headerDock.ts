/**
 * Which chat header actions sit in the header and in what order (ported from Swttch's
 * customizable header dock). Every action is always in the ⋮ menu; the header shows the
 * docked ones, in the menu's order.
 *
 * With nothing saved, every action is docked in the order the header has always had,
 * so the header looks as before. An action added in a later version, and so missing from
 * a saved arrangement, joins the end of the list undocked: a saved arrangement never
 * gains an icon the user has not chosen.
 */

export type HeaderActionId = 'newSession' | 'newTab' | 'search' | 'scheduled' | 'history' | 'settings';

/** The header's order before the dock existed. */
export const DEFAULT_HEADER_ORDER: readonly HeaderActionId[] = [
  'newSession', 'newTab', 'search', 'scheduled', 'history', 'settings',
];

export interface HeaderDockState {
  /** Every action, in the menu's (and the header's) order. */
  order: HeaderActionId[];
  /** The actions shown in the header. */
  docked: HeaderActionId[];
}

const STORAGE_KEY = 'headerDock';
const KNOWN = new Set<string>(DEFAULT_HEADER_ORDER);

function isAction(value: unknown): value is HeaderActionId {
  return typeof value === 'string' && KNOWN.has(value);
}

/** A saved arrangement made whole: unknown ids dropped, new actions appended undocked. */
export function normalizeHeaderDock(saved: unknown): HeaderDockState {
  const raw = saved && typeof saved === 'object' ? saved as { order?: unknown; docked?: unknown } : null;
  if (!raw || !Array.isArray(raw.order)) {
    return { order: [...DEFAULT_HEADER_ORDER], docked: [...DEFAULT_HEADER_ORDER] };
  }
  const order: HeaderActionId[] = [];
  for (const id of raw.order) {
    if (isAction(id) && !order.includes(id)) order.push(id);
  }
  for (const id of DEFAULT_HEADER_ORDER) {
    if (!order.includes(id)) order.push(id);
  }
  const savedDocked = Array.isArray(raw.docked) ? raw.docked.filter(isAction) : [];
  return { order, docked: order.filter((id) => savedDocked.includes(id)) };
}

export function readHeaderDock(): HeaderDockState {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    return normalizeHeaderDock(text ? JSON.parse(text) : null);
  } catch {
    return normalizeHeaderDock(null);
  }
}

export function saveHeaderDock(state: HeaderDockState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Not kept; it still applies until the view reloads.
  }
}

/** Show `id` in the header, or take it out. */
export function toggleDocked(state: HeaderDockState, id: HeaderActionId): HeaderDockState {
  const docked = state.docked.includes(id)
    ? state.docked.filter((d) => d !== id)
    : state.order.filter((o) => o === id || state.docked.includes(o));
  return { order: state.order, docked };
}

/** Move the action at `from` to `to` in the order. */
export function moveAction(state: HeaderDockState, from: number, to: number): HeaderDockState {
  const order = [...state.order];
  if (from < 0 || from >= order.length || to < 0 || to >= order.length || from === to) return state;
  const [item] = order.splice(from, 1);
  order.splice(to, 0, item);
  return { order, docked: order.filter((id) => state.docked.includes(id)) };
}

/**
 * Put the actions the menu shows (`visible`, in their new order) into the slots they held
 * in the full order; actions the menu does not show right now keep their places.
 */
export function reorderVisible(state: HeaderDockState, visible: HeaderActionId[]): HeaderDockState {
  const shown = new Set(visible);
  const queue = [...visible];
  const order = state.order.map((id) => (shown.has(id) ? queue.shift() ?? id : id));
  return { order, docked: order.filter((id) => state.docked.includes(id)) };
}
