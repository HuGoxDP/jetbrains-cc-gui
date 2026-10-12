import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LimitResumeNotice, formatResumeTime, parseResumeAt } from './index';

const mocks = vi.hoisted(() => ({ sendToJava: vi.fn() }));
vi.mock('../../utils/bridge', () => ({ sendToJava: mocks.sendToJava }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params?.time ? `${key}:${String(params.time)}` : key),
    i18n: { language: 'en-US' },
  }),
}));

beforeEach(() => {
  mocks.sendToJava.mockReset();
});

describe('LimitResumeNotice', () => {
  it('asks for a wait already running, then shows the time it continues and cancels on request', () => {
    render(<LimitResumeNotice />);
    expect(mocks.sendToJava).toHaveBeenCalledWith('get_limit_resume', {});
    expect(screen.queryByRole('status')).toBeNull();

    const at = new Date();
    at.setHours(at.getHours() + 1, 5, 0, 0);
    act(() => window.updateLimitResume?.(JSON.stringify({ at: at.getTime() })));
    expect(screen.getByRole('status').textContent).toContain(`chat.limitResume.waiting:${formatResumeTime(at.getTime(), 'en-US')}`);

    fireEvent.click(screen.getByText('chat.limitResume.cancel'));
    expect(mocks.sendToJava).toHaveBeenCalledWith('cancel_limit_resume', {});

    // The IDE answers a cancel (or the continuation being sent) with no time.
    act(() => window.updateLimitResume?.(JSON.stringify({ at: null })));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('stops listening when it goes away', () => {
    const { unmount } = render(<LimitResumeNotice />);
    expect(window.updateLimitResume).toBeTypeOf('function');
    unmount();
    expect(window.updateLimitResume).toBeUndefined();
  });
});

describe('formatResumeTime / parseResumeAt', () => {
  it('names the hour today and the day as well otherwise', () => {
    const now = new Date(2026, 9, 12, 14, 0);
    expect(formatResumeTime(new Date(2026, 9, 12, 15, 1).getTime(), 'en-US', now)).toBe('3:01 PM');
    expect(formatResumeTime(new Date(2026, 9, 15, 9, 30).getTime(), 'en-US', now)).toBe('Thu, Oct 15, 9:30 AM');
  });

  it('reads a time, and anything else as none', () => {
    expect(parseResumeAt('{"at":1800000000000}')).toBe(1800000000000);
    expect(parseResumeAt('{"at":null}')).toBeNull();
    expect(parseResumeAt('not json')).toBeNull();
  });
});
