import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TFunction } from 'i18next';
import { ChatHeader } from './ChatHeader';

const t = ((key: string, opts?: { name?: string; defaultValue?: string }) => {
  if (key === 'chat.headerDock.move') return `move ${opts?.name}`;
  return opts?.defaultValue ?? key;
}) as unknown as TFunction;

function renderHeader(overrides: Partial<Parameters<typeof ChatHeader>[0]> = {}) {
  const props = {
    currentView: 'chat' as const,
    sessionTitle: 'A chat',
    t,
    onBack: vi.fn(),
    onNewSession: vi.fn(),
    onNewTab: vi.fn(),
    onHistory: vi.fn(),
    onSettings: vi.fn(),
    onOpenSearch: vi.fn(),
    onOpenScheduled: vi.fn(),
    scheduledCount: 2,
    ...overrides,
  };
  render(<ChatHeader {...props} />);
  return props;
}

/** The header's own icons, left to right, by label (the ⋮ button excluded). */
function headerIcons(): string[] {
  const right = document.querySelector('.header-right') as HTMLElement;
  return Array.from(right.querySelectorAll(':scope > .icon-button'))
    .map((button) => button.getAttribute('aria-label') ?? '');
}

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'chat.headerDock.menu' }));
  return screen.getByRole('dialog', { name: 'chat.headerDock.menu' });
}

describe('ChatHeader dock', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('shows every action in the header as before, then the ⋮ menu', () => {
    renderHeader();
    expect(headerIcons()).toEqual([
      'common.newSession', 'common.newTab', 'Search in conversation',
      'chat.scheduled.openTooltipCount', 'common.history', 'common.settings',
    ]);
    expect(screen.getByRole('button', { name: 'chat.headerDock.menu' })).toBeTruthy();
  });

  it('lists every action in the menu, with the scheduled count, and runs one on click', () => {
    const props = renderHeader();
    const menu = openMenu();

    expect(within(menu).getByText('chat.scheduled.openTooltip')).toBeTruthy();
    expect(within(menu).getByText('2')).toBeTruthy();

    fireEvent.click(within(menu).getByText('common.history'));
    expect(props.onHistory).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'chat.headerDock.menu' })).toBeNull();
  });

  it('takes an action out of the header with the eye, keeps it in the menu, and remembers', () => {
    renderHeader();
    const menu = openMenu();

    fireEvent.click(within(menu).getByRole('button', { name: 'chat.headerDock.hide: common.newTab' }));

    expect(headerIcons()).not.toContain('common.newTab');
    expect(within(menu).getByText('common.newTab')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('headerDock')!).docked).not.toContain('newTab');

    fireEvent.click(within(menu).getByRole('button', { name: 'chat.headerDock.show: common.newTab' }));
    expect(headerIcons()).toContain('common.newTab');
  });

  it('reorders with the keyboard: Space picks up, arrows move, Space drops', () => {
    renderHeader();
    const menu = openMenu();
    const handle = within(menu).getByRole('button', { name: 'move common.settings' });

    fireEvent.keyDown(handle, { key: ' ' });
    for (let i = 0; i < 5; i++) fireEvent.keyDown(handle, { key: 'ArrowUp' });
    fireEvent.keyDown(handle, { key: ' ' });

    expect(headerIcons()[0]).toBe('common.settings');
  });

  it('Escape while moving puts the row back and keeps the menu open', () => {
    renderHeader();
    const menu = openMenu();
    const handle = within(menu).getByRole('button', { name: 'move common.settings' });

    fireEvent.keyDown(handle, { key: ' ' });
    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(headerIcons()[5]).toBe('common.settings');
    expect(screen.getByRole('dialog', { name: 'chat.headerDock.menu' })).toBeTruthy();
    expect(localStorage.getItem('headerDock')).toBeNull();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'chat.headerDock.menu' })).toBeNull();
  });

  it('leaves out of the menu what this conversation does not have', () => {
    renderHeader({ onOpenSearch: undefined, onOpenScheduled: undefined });
    const menu = openMenu();
    expect(within(menu).queryByText('chat.scheduled.openTooltip')).toBeNull();
    expect(headerIcons()).toHaveLength(4);
  });
});
