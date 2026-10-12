import { act, renderHook } from '@testing-library/react';
import { useMessageSender } from './useMessageSender';
import type { UseMessageSenderOptions } from './useMessageSender';
import {
  rememberSessionName,
  resetSessionMentions,
} from '../components/ChatInputBox/providers/sessionMentionProvider';

describe('useMessageSender - @@ mention of another session', () => {
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

  const sentPayload = () => {
    const calls = (window.sendToJava as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0] as string);
    const sendCall = calls.find((call) => call.startsWith('send_message:'));
    expect(sendCall).toBeTruthy();
    return JSON.parse(sendCall!.substring('send_message:'.length));
  };

  beforeEach(() => {
    window.sendToJava = vi.fn();
    resetSessionMentions();
  });

  it('sends the text as written and names the session and the words to pass on', () => {
    rememberSessionName('docs-7');
    const { result } = renderHook(() => useMessageSender(createOptions()));
    act(() => {
      result.current.handleSubmit('@@docs-7 what did you verify?');
    });
    const payload = sentPayload();
    expect(payload.text).toBe('@@docs-7 what did you verify?');
    expect(payload.sessionMention).toEqual({ name: 'docs-7', body: 'what did you verify?' });
  });

  it('adds nothing for a name no list offered, or outside a Claude conversation', () => {
    const { result } = renderHook(() => useMessageSender(createOptions()));
    act(() => {
      result.current.handleSubmit('@@docs-7 hello');
    });
    expect(sentPayload().sessionMention).toBeUndefined();

    rememberSessionName('docs-7');
    window.sendToJava = vi.fn();
    const codex = renderHook(() => useMessageSender(createOptions({ currentProvider: 'codex' })));
    act(() => {
      codex.result.current.handleSubmit('@@docs-7 hello');
    });
    expect(sentPayload().sessionMention).toBeUndefined();
  });
});
