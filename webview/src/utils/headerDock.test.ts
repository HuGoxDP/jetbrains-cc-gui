import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_HEADER_ORDER,
  moveAction,
  normalizeHeaderDock,
  readHeaderDock,
  reorderVisible,
  saveHeaderDock,
  toggleDocked,
} from './headerDock';

afterEach(() => localStorage.clear());

describe('headerDock', () => {
  it('keeps the header as it was when nothing is saved', () => {
    expect(normalizeHeaderDock(null)).toEqual({
      order: [...DEFAULT_HEADER_ORDER],
      docked: [...DEFAULT_HEADER_ORDER],
    });
  });

  it('adds an action a saved arrangement does not know, at the end and not docked', () => {
    const state = normalizeHeaderDock({ order: ['settings', 'history'], docked: ['settings'] });
    expect(state.order).toEqual(['settings', 'history', 'newSession', 'newTab', 'search', 'scheduled']);
    expect(state.docked).toEqual(['settings']);
  });

  it('drops ids it does not know and duplicates', () => {
    const state = normalizeHeaderDock({ order: ['history', 'tunnel', 'history'], docked: ['tunnel', 'history'] });
    expect(state.order[0]).toBe('history');
    expect(state.order.filter((id) => id === 'history')).toHaveLength(1);
    expect(state.docked).toEqual(['history']);
  });

  it('docks and undocks, keeping the menu order for the header', () => {
    let state = normalizeHeaderDock({ order: [...DEFAULT_HEADER_ORDER], docked: ['settings'] });
    state = toggleDocked(state, 'newSession');
    expect(state.docked).toEqual(['newSession', 'settings']);
    state = toggleDocked(state, 'settings');
    expect(state.docked).toEqual(['newSession']);
  });

  it('reorders the menu and the header together', () => {
    const state = moveAction(normalizeHeaderDock(null), 5, 0);
    expect(state.order[0]).toBe('settings');
    expect(state.docked[0]).toBe('settings');
    expect(moveAction(state, 0, 99)).toBe(state);
  });

  it('saves and reads back', () => {
    const state = toggleDocked(normalizeHeaderDock(null), 'search');
    saveHeaderDock(state);
    expect(readHeaderDock()).toEqual(state);
  });
});

describe('reorderVisible', () => {
  it('moves the shown actions and leaves the others in place', () => {
    const state = normalizeHeaderDock(null);
    // search and scheduled are not shown (a conversation that has not started)
    const next = reorderVisible(state, ['settings', 'newSession', 'newTab', 'history']);
    expect(next.order).toEqual(['settings', 'newSession', 'search', 'scheduled', 'newTab', 'history']);
    expect(next.docked).toEqual(next.order);
  });
});
