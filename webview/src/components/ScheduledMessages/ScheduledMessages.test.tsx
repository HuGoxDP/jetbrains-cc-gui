import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScheduledMessagesDialog } from './ScheduledMessagesDialog';
import { ChatHeader } from '../ChatHeader/ChatHeader';
import { useScheduledMessages, type ScheduledMessagesApi } from './useScheduledMessages';
import type { ScheduledMessage } from './scheduledMessages';
import en from '../../i18n/locales/en.json';
import es from '../../i18n/locales/es.json';
import fr from '../../i18n/locales/fr.json';
import hi from '../../i18n/locales/hi.json';
import ja from '../../i18n/locales/ja.json';
import ko from '../../i18n/locales/ko.json';
import ptBR from '../../i18n/locales/pt-BR.json';
import ru from '../../i18n/locales/ru.json';
import zh from '../../i18n/locales/zh.json';
import zhTW from '../../i18n/locales/zh-TW.json';

const mocks = vi.hoisted(() => ({ sendToJava: vi.fn() }));
vi.mock('../../utils/bridge', () => ({ sendToJava: mocks.sendToJava }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params && 'n' in params ? `${key}:${String(params.n)}` : key),
    i18n: { language: 'en' },
  }),
}));

beforeEach(() => {
  mocks.sendToJava.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

function reservation(over: Partial<ScheduledMessage> = {}): ScheduledMessage {
  return {
    id: 'r1',
    sessionId: 's1',
    sendAt: new Date(Date.now() + 90 * 60_000).toISOString(),
    message: 'Run the tests again',
    kind: 'USER_SCHEDULED',
    ...over,
  };
}

function api(schedules: ScheduledMessage[] = []): ScheduledMessagesApi {
  return { sessionId: 's1', schedules, schedule: vi.fn(), update: vi.fn(), cancel: vi.fn() };
}

describe('useScheduledMessages', () => {
  it('asks for the conversation\'s list, and shows only that conversation\'s', () => {
    const send = vi.fn();
    const onError = vi.fn();
    const { result, rerender } = renderHook(
      ({ id }) => useScheduledMessages({ currentSessionId: id, send, onError }),
      { initialProps: { id: 's1' as string | null } },
    );
    expect(mocks.sendToJava).toHaveBeenCalledWith('get_scheduled_messages', { sessionId: 's1' });

    act(() => window.updateScheduledMessages?.(JSON.stringify({ sessionId: 's2', schedules: [reservation({ sessionId: 's2' })] })));
    expect(result.current.schedules).toEqual([]);

    act(() => window.updateScheduledMessages?.(JSON.stringify({ sessionId: 's1', schedules: [reservation()] })));
    expect(result.current.schedules).toHaveLength(1);

    act(() => window.updateScheduledMessages?.(JSON.stringify({ sessionId: 's1', schedules: [reservation()], error: 'time_invalid' })));
    expect(onError).toHaveBeenCalledWith('time_invalid');

    // A new conversation has no session yet: nothing to ask for, and the old list is gone.
    mocks.sendToJava.mockReset();
    rerender({ id: null });
    expect(result.current.schedules).toEqual([]);
    expect(mocks.sendToJava).not.toHaveBeenCalled();
  });

  it('sends a due message through the chat, then confirms it', () => {
    const send = vi.fn();
    renderHook(() => useScheduledMessages({ currentSessionId: 's1', send, onError: vi.fn() }));

    act(() => window.deliverScheduledMessage?.(JSON.stringify(reservation({ sessionId: 'other' }))));
    expect(send).not.toHaveBeenCalled();

    act(() => window.deliverScheduledMessage?.(JSON.stringify(reservation())));
    expect(send).toHaveBeenCalledWith('Run the tests again');
    expect(mocks.sendToJava).toHaveBeenCalledWith('scheduled_message_delivered', { id: 'r1', sessionId: 's1' });

    // Handed again before the IDE heard back: confirmed again, not sent twice.
    mocks.sendToJava.mockReset();
    act(() => window.deliverScheduledMessage?.(JSON.stringify(reservation())));
    expect(send).toHaveBeenCalledTimes(1);
    expect(mocks.sendToJava).toHaveBeenCalledWith('scheduled_message_delivered', { id: 'r1', sessionId: 's1' });
  });

  it('asks the IDE to schedule, change and cancel, with the time as an instant', () => {
    const { result } = renderHook(() => useScheduledMessages({ currentSessionId: 's1', send: vi.fn(), onError: vi.fn() }));
    const at = new Date('2026-10-13T07:00:00Z');
    result.current.schedule(at, 'hi');
    result.current.update('r1', at, 'bye');
    result.current.cancel('r1');
    expect(mocks.sendToJava).toHaveBeenCalledWith('schedule_message', { sessionId: 's1', sendAt: '2026-10-13T07:00:00.000Z', message: 'hi' });
    expect(mocks.sendToJava).toHaveBeenCalledWith('update_scheduled_message', { id: 'r1', sessionId: 's1', sendAt: '2026-10-13T07:00:00.000Z', message: 'bye' });
    expect(mocks.sendToJava).toHaveBeenCalledWith('cancel_scheduled_message', { id: 'r1', sessionId: 's1' });
  });

  it('stops listening when it goes away', () => {
    const { unmount } = renderHook(() => useScheduledMessages({ currentSessionId: 's1', send: vi.fn(), onError: vi.fn() }));
    unmount();
    expect(window.updateScheduledMessages).toBeUndefined();
    expect(window.deliverScheduledMessage).toBeUndefined();
  });
});

describe('ScheduledMessagesDialog', () => {
  it('opens on the form with the typed draft when nothing is scheduled, and schedules it', () => {
    const a = api();
    const onClose = vi.fn();
    render(<ScheduledMessagesDialog api={a} getDraft={() => 'half a thought'} onClose={onClose} />);

    expect(screen.getByText('chat.scheduled.createTitle')).toBeTruthy();
    const box = screen.getByPlaceholderText('chat.scheduled.messagePlaceholder') as HTMLTextAreaElement;
    expect(box.value).toBe('half a thought');
    fireEvent.change(box, { target: { value: '  finish the thought  ' } });

    const before = Date.now();
    fireEvent.click(screen.getByText('chat.scheduled.schedule'));
    expect(a.schedule).toHaveBeenCalledTimes(1);
    const [sendAt, message] = (a.schedule as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(message).toBe('finish the thought');
    // The default choice is "In 1 hour".
    expect((sendAt as Date).getTime()).toBeGreaterThanOrEqual(before + 60 * 60_000);
    expect((sendAt as Date).getTime()).toBeLessThan(before + 61 * 60_000);
    // Then the list, where the new reservation appears once the IDE answers.
    expect(screen.getByText('chat.scheduled.title')).toBeTruthy();
  });

  it('will not schedule an empty message or an empty duration; Cmd/Ctrl+Enter submits', () => {
    const a = api();
    render(<ScheduledMessagesDialog api={a} getDraft={() => ''} onClose={vi.fn()} />);
    const submit = screen.getByText('chat.scheduled.schedule') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    const box = screen.getByPlaceholderText('chat.scheduled.messagePlaceholder');
    fireEvent.change(box, { target: { value: 'later' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'afterDuration' } });
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('chat.scheduled.duration.minutes'), { target: { value: '90' } });
    expect((screen.getByLabelText('chat.scheduled.duration.minutes') as HTMLInputElement).value).toBe('59');
    expect(submit.disabled).toBe(false);

    const before = Date.now();
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    const [sendAt] = (a.schedule as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((sendAt as Date).getTime() - before).toBeGreaterThanOrEqual(59 * 60_000);
    expect((sendAt as Date).getTime() - before).toBeLessThan(60 * 60_000);
  });

  it('lists what is scheduled with a countdown and the exact time, and edits and cancels', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date(2026, 9, 12, 9, 0, 0));
    const r = reservation({ sendAt: new Date(2026, 9, 12, 9, 2, 0).toISOString() });
    const a = api([r]);
    render(<ScheduledMessagesDialog api={a} getDraft={() => 'draft'} onClose={vi.fn()} />);

    const row = screen.getByTestId('scheduled-row');
    expect(within(row).getByText('Run the tests again')).toBeTruthy();
    expect(within(row).getByText('chat.scheduled.relative.minute:2')).toBeTruthy();
    expect(within(row).getByText('2026-10-12 09:02:00')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(within(row).getByText('chat.scheduled.relative.second:59')).toBeTruthy();

    fireEvent.click(within(row).getByText('chat.scheduled.cancel'));
    expect(a.cancel).toHaveBeenCalledWith('r1');

    fireEvent.click(within(row).getByText('chat.scheduled.edit'));
    expect(screen.getByText('chat.scheduled.editTitle')).toBeTruthy();
    const box = screen.getByPlaceholderText('chat.scheduled.messagePlaceholder') as HTMLTextAreaElement;
    expect(box.value).toBe('Run the tests again');
    // The date field opens on the exact time (a field may drop ":00" seconds when it normalizes).
    const field = screen.getByLabelText('chat.scheduled.customLabel') as HTMLInputElement;
    expect(new Date(field.value)).toEqual(new Date(2026, 9, 12, 9, 2, 0));
    fireEvent.change(screen.getByLabelText('chat.scheduled.customLabel'), { target: { value: '2026-10-12T18:30:00' } });
    fireEvent.click(screen.getByText('chat.scheduled.save'));
    expect(a.update).toHaveBeenCalledWith('r1', new Date(2026, 9, 12, 18, 30, 0), 'Run the tests again');
  });

  it('closes on Escape without letting it reach the chat', () => {
    const onClose = vi.fn();
    const outside = vi.fn();
    window.addEventListener('keydown', outside);
    render(<ScheduledMessagesDialog api={api([reservation()])} getDraft={() => ''} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(outside).not.toHaveBeenCalled();
    window.removeEventListener('keydown', outside);
  });
});

describe('the clock button', () => {
  const header = (extra: Record<string, unknown>) => (
    <ChatHeader
      currentView="chat"
      sessionTitle="Title"
      t={((key: string, params?: Record<string, unknown>) => (params && 'n' in params ? `${key}:${String(params.n)}` : key)) as never}
      onBack={vi.fn()}
      onNewSession={vi.fn()}
      onNewTab={vi.fn()}
      onHistory={vi.fn()}
      onSettings={vi.fn()}
      {...extra}
    />
  );

  it('is there once the conversation has started, with how many messages wait', () => {
    const { rerender } = render(header({}));
    expect(screen.queryByLabelText('chat.scheduled.openTooltip')).toBeNull();

    const open = vi.fn();
    rerender(header({ onOpenScheduled: open, scheduledCount: 0 }));
    fireEvent.click(screen.getByLabelText('chat.scheduled.openTooltip'));
    expect(open).toHaveBeenCalled();
    expect(screen.queryByTestId('scheduled-badge')).toBeNull();

    rerender(header({ onOpenScheduled: open, scheduledCount: 2 }));
    expect(screen.getByTestId('scheduled-badge').textContent).toBe('2');
    expect(screen.getByLabelText('chat.scheduled.openTooltipCount:2')).toBeTruthy();
  });
});

describe('scheduled messages strings', () => {
  function leaves(value: unknown, prefix = ''): string[] {
    if (value === null || typeof value !== 'object') return [prefix];
    return Object.entries(value).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
  }

  it('exist in every language, with the same keys', () => {
    const keys = leaves(en.chat.scheduled).sort();
    for (const locale of [es, fr, hi, ja, ko, ptBR, ru, zh, zhTW]) {
      expect(leaves(locale.chat.scheduled).sort()).toEqual(keys);
    }
  });
});
