import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMessageSender } from './useMessageSender';
import type { UseMessageSenderOptions } from './useMessageSender';
import { getSideQuestion, resetSideCommandsForTests } from '../utils/sideCommands';

describe('useMessageSender - /btw and /reload-plugins', () => {
  const t = ((key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key) as never;

  const createOptions = (overrides: Partial<UseMessageSenderOptions> = {}): UseMessageSenderOptions => ({
    t,
    addToast: vi.fn(),
    currentProvider: 'claude',
    selectedModel: 'default',
    permissionMode: 'default',
    reasoningEffort: 'high',
    codexFastMode: 'normal',
    codexNativeAutoReviewAvailable: true,
    selectedAgent: null,
    sdkStatusLoading: false,
    currentSdkInstalled: true,
    sentAttachmentsRef: { current: new Map() },
    chatInputRef: { current: null },
    messagesContainerRef: { current: null },
    isUserAtBottomRef: { current: true },
    userPausedRef: { current: false },
    isStreamingRef: { current: false },
    setMessages: vi.fn(),
    setLoading: vi.fn(),
    setLoadingStartTime: vi.fn(),
    setStreamingActive: vi.fn(),
    setSettingsInitialTab: vi.fn(),
    setCurrentView: vi.fn(),
    forceCreateNewSession: vi.fn(),
    handleModeSelect: vi.fn(),
    longContextEnabled: false,
    openContextUsageDialog: vi.fn(),
    closeContextUsageDialog: vi.fn().mockReturnValue(true),
    ...overrides,
  });

  const sentTypes = () => (window.sendToJava as ReturnType<typeof vi.fn>).mock.calls
    .map((call: unknown[]) => String(call[0]).split(':')[0]);

  beforeEach(() => {
    window.sendToJava = vi.fn();
    resetSideCommandsForTests();
  });

  afterEach(() => {
    resetSideCommandsForTests();
  });

  it('asks a side question instead of sending a message', () => {
    const setMessages = vi.fn();
    const { result } = renderHook(() => useMessageSender(createOptions({ setMessages })));

    act(() => {
      result.current.handleSubmit('/btw  what does --force skip? ');
    });

    expect(sentTypes()).toEqual(['ask_side_question']);
    expect(getSideQuestion()?.question).toBe('what does --force skip?');
    expect(setMessages).not.toHaveBeenCalled();
  });

  it('wants a question after /btw', () => {
    const addToast = vi.fn();
    const { result } = renderHook(() => useMessageSender(createOptions({ addToast })));

    act(() => {
      result.current.handleSubmit('/btw');
    });

    expect(sentTypes()).toEqual([]);
    expect(addToast).toHaveBeenCalledWith('chat.sideQuestion.empty', 'warning');
  });

  it('reloads plugins instead of sending a message', () => {
    const { result } = renderHook(() => useMessageSender(createOptions()));

    act(() => {
      result.current.handleSubmit('/reload-plugins');
    });

    expect(sentTypes()).toEqual(['reload_plugins']);
  });

  it('tells other providers the commands are Claude only', () => {
    const addToast = vi.fn();
    const { result } = renderHook(() => useMessageSender(createOptions({ currentProvider: 'codex', addToast })));

    act(() => {
      result.current.handleSubmit('/btw why?');
    });

    expect(sentTypes()).toEqual([]);
    expect(addToast).toHaveBeenCalledWith('/btw is only available for Claude provider', 'warning');
  });
});
