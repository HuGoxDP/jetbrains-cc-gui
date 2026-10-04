import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { TFunction } from 'i18next';
import type { ClaudeMessage } from '../types';
import type { ChatInputBoxHandle } from '../components/ChatInputBox/types';
import type { ForkMessageFn } from '../contexts/ForkMessageContext';
import { forkSession } from '../utils/bridge';
import { copyToClipboard } from '../utils/copyUtils';

export interface UseForkSessionOptions {
  t: TFunction;
  addToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  currentSessionId: string | null;
  currentProvider: string;
  /** A reply is streaming; opening another session now would interrupt it. */
  loading: boolean;
  getMessageText: (message: ClaudeMessage) => string;
  loadHistorySession: (sessionId: string, provider?: string) => void;
  chatInputRef: RefObject<ChatInputBoxHandle | null>;
}

export interface UseForkSessionReturn {
  /** Null while a fork is not possible, which hides the button. */
  forkFromMessage: ForkMessageFn | null;
  isForking: boolean;
}

/** Forking copies a file; if no answer comes by then, something went wrong on the way. */
export const FORK_TIMEOUT_MS = 30000;

interface ForkResult {
  success?: boolean;
  sessionId?: string;
  errorCode?: string;
}

/** The transcript uuid of a message: the id the fork is cut at. */
export function messageUuid(message: ClaudeMessage): string | null {
  const raw = message.raw;
  if (!raw || typeof raw !== 'object') return null;
  const uuid = (raw as { uuid?: unknown }).uuid;
  return typeof uuid === 'string' && uuid.length > 0 ? uuid : null;
}

/**
 * Fork the conversation at one of the user's messages, like Esc Esc → "Restore
 * conversation" in the terminal, but without losing the original: Java writes a new
 * session holding everything before the message, this opens it, and the message goes
 * back in the composer to be reworded.
 */
export function useForkSession({
  t,
  addToast,
  currentSessionId,
  currentProvider,
  loading,
  getMessageText,
  loadHistorySession,
  chatInputRef,
}: UseForkSessionOptions): UseForkSessionReturn {
  const [isForking, setIsForking] = useState(false);
  // The text to put back once the fork opens. A ref, because the reply arrives in a
  // window callback registered once.
  const pendingTextRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearForkTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const tRef = useRef(t);
  const addToastRef = useRef(addToast);
  const loadHistorySessionRef = useRef(loadHistorySession);
  useEffect(() => {
    tRef.current = t;
    addToastRef.current = addToast;
    loadHistorySessionRef.current = loadHistorySession;
  }, [t, addToast, loadHistorySession]);

  useEffect(() => {
    window.onSessionForked = (json: string) => {
      clearForkTimeout();
      const text = pendingTextRef.current ?? '';
      pendingTextRef.current = null;
      setIsForking(false);

      let result: ForkResult;
      try {
        result = JSON.parse(json) as ForkResult;
      } catch {
        addToastRef.current(tRef.current('fork.failed'), 'error');
        return;
      }
      if (!result.success || !result.sessionId) {
        const code = result.errorCode;
        const key = code ? `fork.errors.${code}` : '';
        const message = key && tRef.current(key) !== key ? tRef.current(key) : tRef.current('fork.failed');
        addToastRef.current(message, 'error');
        return;
      }

      loadHistorySessionRef.current(result.sessionId, 'claude');

      // Opening a session resets the toasts, so the confirmation waits for the load.
      const input = chatInputRef.current;
      if (input && !input.hasContent()) {
        if (text) {
          input.setValue(text);
          input.focus();
        }
        window.__pendingSessionTransitionToast = { message: tRef.current('fork.done'), type: 'success' };
      } else {
        // Never overwrite a draft. The message is still one paste away.
        if (text) void copyToClipboard(text);
        window.__pendingSessionTransitionToast = { message: tRef.current('fork.doneDraftKept'), type: 'info' };
      }
    };
    return () => {
      window.onSessionForked = undefined;
      clearForkTimeout();
    };
  }, [chatInputRef, clearForkTimeout]);

  const fork = useCallback((message: ClaudeMessage) => {
    if (!currentSessionId || pendingTextRef.current !== null) return;
    const uuid = messageUuid(message);
    if (!uuid) {
      addToast(t('fork.notAvailable'), 'warning');
      return;
    }
    pendingTextRef.current = message.content || getMessageText(message);
    setIsForking(true);
    clearForkTimeout();
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      pendingTextRef.current = null;
      setIsForking(false);
      addToastRef.current(tRef.current('fork.failed'), 'error');
    }, FORK_TIMEOUT_MS);
    forkSession(currentSessionId, uuid);
  }, [currentSessionId, getMessageText, addToast, t, clearForkTimeout]);

  const forkFromMessage = useMemo(
    () => (currentProvider === 'claude' && currentSessionId && !loading && !isForking ? fork : null),
    [currentProvider, currentSessionId, loading, isForking, fork],
  );

  return { forkFromMessage, isForking };
}
