import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { openShortcutsHelp, ShortcutsHelpHost } from './ShortcutsHelpHost';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// The tests run on a non-Mac user agent, where Ctrl is the primary modifier.
const ctrlSlash = () => fireEvent.keyDown(document, { key: '/', code: 'Slash', ctrlKey: true });

describe('ShortcutsHelpHost', () => {
  afterEach(cleanup);

  it('opens and closes with Ctrl+/', () => {
    render(<ShortcutsHelpHost sendShortcut="enter" />);
    expect(screen.queryByRole('dialog')).toBeNull();

    act(() => {
      ctrlSlash();
    });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('shortcutsHelp.rows.searchConversation')).toBeTruthy();

    act(() => {
      ctrlSlash();
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens from a button and stays open when asked again', () => {
    render(<ShortcutsHelpHost sendShortcut="enter" />);
    act(() => openShortcutsHelp());
    act(() => openShortcutsHelp());
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('closes on Escape without letting it reach the chat underneath', () => {
    const underneath = vi.fn();
    window.addEventListener('keydown', underneath);
    render(<ShortcutsHelpHost sendShortcut="enter" />);
    act(() => openShortcutsHelp());

    act(() => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(underneath).not.toHaveBeenCalled();
    window.removeEventListener('keydown', underneath);
  });

  it('closes on a click outside the window, not inside it', () => {
    render(<ShortcutsHelpHost sendShortcut="enter" />);
    act(() => openShortcutsHelp());
    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByTestId('shortcuts-help-overlay'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the send key the user chose', () => {
    render(<ShortcutsHelpHost sendShortcut="cmdEnter" />);
    act(() => openShortcutsHelp());
    const send = document.querySelector('[data-shortcut-id="sendMessage"]');
    expect(Array.from(send?.querySelectorAll('kbd') ?? []).map((k) => k.textContent)).toEqual(['Ctrl', 'Enter']);
  });
});
