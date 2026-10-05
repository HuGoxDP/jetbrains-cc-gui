import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { UiZoomControls, UI_ZOOM_INDICATOR_HOLD_MS } from './UiZoomControls';
import { setUiZoom } from '../utils/uiZoom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../utils/forceWebviewRepaint', () => ({ forceWebviewRepaint: vi.fn() }));

const ctrl = (key: string, code?: string) => {
  // The tests run on a non-Mac user agent, where Ctrl is the zoom modifier.
  fireEvent.keyDown(document, { key, code, ctrlKey: true });
};
const scale = () => document.documentElement.style.getPropertyValue('--font-scale');

describe('UiZoomControls', () => {
  afterEach(() => {
    act(() => setUiZoom(1));
    localStorage.clear();
    vi.useRealTimers();
  });

  it('zooms the chat with Ctrl + "+", "-" and "0", keeping the font size factor', () => {
    localStorage.setItem('fontSizeLevel', '4'); // 110%
    render(<UiZoomControls />);
    expect(scale()).toBe('1.1');

    act(() => ctrl('='));
    expect(scale()).toBe('1.21');
    expect(screen.getByRole('dialog').textContent).toContain('110%');

    act(() => ctrl('-'));
    act(() => ctrl('-'));
    expect(screen.getByRole('dialog').textContent).toContain('90%');

    act(() => ctrl('0'));
    expect(scale()).toBe('1.1');
    expect(localStorage.getItem('uiZoom')).toBeNull();
  });

  it('shows one indicator that goes away on its own, but not under the pointer', () => {
    vi.useFakeTimers();
    render(<UiZoomControls />);
    expect(screen.queryByRole('dialog')).toBeNull();

    act(() => ctrl('='));
    act(() => ctrl('='));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    fireEvent.mouseEnter(screen.getByRole('dialog'));
    act(() => vi.advanceTimersByTime(UI_ZOOM_INDICATOR_HOLD_MS + 100));
    expect(screen.queryByRole('dialog')).not.toBeNull();

    fireEvent.mouseLeave(screen.getByRole('dialog'));
    act(() => vi.advanceTimersByTime(UI_ZOOM_INDICATOR_HOLD_MS + 100));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers the same steps as buttons', () => {
    render(<UiZoomControls />);
    act(() => ctrl('='));
    fireEvent.click(screen.getByRole('button', { name: 'uiZoom.zoomIn' }));
    expect(screen.getByRole('dialog').textContent).toContain('125%');
    fireEvent.click(screen.getByRole('button', { name: 'uiZoom.reset' }));
    expect(screen.getByRole('dialog').textContent).toContain('100%');
  });

  it('leaves keys without the modifier to the page', () => {
    render(<UiZoomControls />);
    const event = new KeyboardEvent('keydown', { key: '=', cancelable: true });
    act(() => {
      document.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
