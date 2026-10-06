import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const sendBridgeEvent = vi.fn();
vi.mock('../../../utils/bridge', () => ({ sendBridgeEvent: (...args: unknown[]) => sendBridgeEvent(...args) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const { ThinkingSummariesSection } = await import('./ThinkingSummariesSection');

describe('ThinkingSummariesSection', () => {
  afterEach(() => {
    cleanup();
    sendBridgeEvent.mockReset();
  });

  it('asks the IDE for the setting and shows what it answers', () => {
    render(<ThinkingSummariesSection />);
    expect(sendBridgeEvent).toHaveBeenCalledWith('get_show_thinking_summaries');
    const toggle = screen.getByRole('checkbox') as HTMLInputElement;
    expect(toggle.checked).toBe(false);

    act(() => window.updateShowThinkingSummaries?.(JSON.stringify({ showThinkingSummaries: true })));
    expect(toggle.checked).toBe(true);
  });

  it('writes the new value when toggled', () => {
    render(<ThinkingSummariesSection />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(sendBridgeEvent).toHaveBeenLastCalledWith(
      'set_show_thinking_summaries',
      JSON.stringify({ showThinkingSummaries: true }),
    );
  });

  it('gives the callback back when it goes away', () => {
    const previous = vi.fn();
    window.updateShowThinkingSummaries = previous;
    const { unmount } = render(<ThinkingSummariesSection />);
    expect(window.updateShowThinkingSummaries).not.toBe(previous);
    unmount();
    expect(window.updateShowThinkingSummaries).toBe(previous);
    window.updateShowThinkingSummaries = undefined;
  });
});
