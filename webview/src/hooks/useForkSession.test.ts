import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaudeMessage } from '../types';
import type { ChatInputBoxHandle } from '../components/ChatInputBox/types';

const forkSession = vi.fn();
const copyToClipboard = vi.fn(async (_text: string) => true);

vi.mock('../utils/bridge', () => ({
  forkSession: (...args: unknown[]) => forkSession(...args),
}));
vi.mock('../utils/copyUtils', () => ({
  copyToClipboard: (text: string) => copyToClipboard(text),
}));

import { FORK_TIMEOUT_MS, messageUuid, useForkSession } from './useForkSession';
import type { UseForkSessionOptions } from './useForkSession';

const t = ((key: string) => (key === 'fork.errors.UNKNOWN_CODE' ? key : `t:${key}`)) as unknown as UseForkSessionOptions['t'];

function makeInput(initial = ''): ChatInputBoxHandle & { value: string } {
  const input = {
    value: initial,
    getValue: () => input.value,
    setValue: vi.fn((v: string) => { input.value = v; }),
    focus: vi.fn(),
    clear: vi.fn(() => { input.value = ''; }),
    hasContent: () => input.value.trim().length > 0,
    getFileTags: () => [],
  };
  return input;
}

const message: ClaudeMessage = {
  type: 'user',
  content: 'Rename the helper',
  raw: { uuid: 'u-2', message: { content: 'Rename the helper' } },
};

function setup(overrides: Partial<UseForkSessionOptions> = {}, input = makeInput()) {
  const options: UseForkSessionOptions = {
    t,
    addToast: vi.fn(),
    currentSessionId: 'session-1',
    currentProvider: 'claude',
    loading: false,
    getMessageText: (m) => m.content ?? '',
    loadHistorySession: vi.fn(),
    chatInputRef: { current: input },
    ...overrides,
  };
  const hook = renderHook((props: UseForkSessionOptions) => useForkSession(props), { initialProps: options });
  return { ...hook, options, input };
}

beforeEach(() => {
  forkSession.mockClear();
  copyToClipboard.mockClear();
  window.__pendingSessionTransitionToast = undefined;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('messageUuid', () => {
  it('reads the transcript uuid and nothing else', () => {
    expect(messageUuid(message)).toBe('u-2');
    expect(messageUuid({ type: 'user', content: 'x' })).toBeNull();
    expect(messageUuid({ type: 'user', content: 'x', raw: 'text' })).toBeNull();
    expect(messageUuid({ type: 'user', content: 'x', raw: { uuid: 7 } as never })).toBeNull();
  });
});

describe('useForkSession', () => {
  it('is only offered for a saved Claude session that is not answering', () => {
    expect(setup().result.current.forkFromMessage).toBeTypeOf('function');
    expect(setup({ currentProvider: 'codex' }).result.current.forkFromMessage).toBeNull();
    expect(setup({ currentSessionId: null }).result.current.forkFromMessage).toBeNull();
    expect(setup({ loading: true }).result.current.forkFromMessage).toBeNull();
  });

  it('asks Java to fork at the message, then opens the fork with the message back in the input', () => {
    const { result, options, input } = setup();

    act(() => result.current.forkFromMessage?.(message));
    expect(forkSession).toHaveBeenCalledWith('session-1', 'u-2');
    // One fork at a time.
    expect(result.current.forkFromMessage).toBeNull();

    act(() => window.onSessionForked?.(JSON.stringify({ success: true, sessionId: 'forked-1' })));

    expect(options.loadHistorySession).toHaveBeenCalledWith('forked-1', 'claude');
    expect(input.setValue).toHaveBeenCalledWith('Rename the helper');
    expect(input.focus).toHaveBeenCalled();
    expect(window.__pendingSessionTransitionToast).toEqual({ message: 't:fork.done', type: 'success' });
    expect(result.current.forkFromMessage).toBeTypeOf('function');
  });

  it('keeps a draft and puts the message on the clipboard instead', () => {
    const { result, input } = setup({}, makeInput('half a thought'));

    act(() => result.current.forkFromMessage?.(message));
    act(() => window.onSessionForked?.(JSON.stringify({ success: true, sessionId: 'forked-1' })));

    expect(input.setValue).not.toHaveBeenCalled();
    expect(input.value).toBe('half a thought');
    expect(copyToClipboard).toHaveBeenCalledWith('Rename the helper');
    expect(window.__pendingSessionTransitionToast).toEqual({ message: 't:fork.doneDraftKept', type: 'info' });
  });

  it('explains a failure by its code', () => {
    const { result, options } = setup();

    act(() => result.current.forkFromMessage?.(message));
    act(() => window.onSessionForked?.(JSON.stringify({ success: false, errorCode: 'NOTHING_BEFORE' })));

    expect(options.addToast).toHaveBeenCalledWith('t:fork.errors.NOTHING_BEFORE', 'error');
    expect(options.loadHistorySession).not.toHaveBeenCalled();
  });

  it('falls back to a general message for a code it does not know', () => {
    const { result, options } = setup();

    act(() => result.current.forkFromMessage?.(message));
    act(() => window.onSessionForked?.(JSON.stringify({ success: false, errorCode: 'UNKNOWN_CODE' })));

    expect(options.addToast).toHaveBeenCalledWith('t:fork.failed', 'error');
  });

  it('does not ask Java about a message Claude has not recorded yet', () => {
    const { result, options } = setup();

    act(() => result.current.forkFromMessage?.({ type: 'user', content: 'just sent', raw: {} }));

    expect(forkSession).not.toHaveBeenCalled();
    expect(options.addToast).toHaveBeenCalledWith('t:fork.notAvailable', 'warning');
  });

  it('gives up when no answer comes', () => {
    vi.useFakeTimers();
    const { result, options } = setup();

    act(() => result.current.forkFromMessage?.(message));
    act(() => { vi.advanceTimersByTime(FORK_TIMEOUT_MS); });

    expect(options.addToast).toHaveBeenCalledWith('t:fork.failed', 'error');
    expect(result.current.forkFromMessage).toBeTypeOf('function');
  });

  it('stops listening when unmounted', () => {
    const { unmount } = setup();
    expect(window.onSessionForked).toBeTypeOf('function');
    unmount();
    expect(window.onSessionForked).toBeUndefined();
  });
});
