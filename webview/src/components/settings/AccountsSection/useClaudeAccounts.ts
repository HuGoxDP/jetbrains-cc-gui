import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { sendToJava } from '../../../utils/bridge';
import {
  type ClaudeAccountsState,
  type ClaudeAccountUsageEvent,
  type ClaudeLoginEvent,
  parseAccountsPayload,
  parseActionEvent,
  parseLoginEvent,
  parseUsageEvent,
  staleUsageIds,
  usageKey,
  LIVE_USAGE_KEY,
} from './claudeAccounts';

type ToastType = 'info' | 'success' | 'warning' | 'error';

export type LoginMethod = 'claudeai' | 'console';

export interface ClaudeLoginState {
  phase: 'idle' | 'running';
  url: string | null;
  error: string | null;
}

/** A usage lookup spawns a CLI process per account; give up waiting after this. */
const REFRESH_TIMEOUT_MS = 100_000;
/** Java may not answer get_claude_accounts (handler absent) — stop spinning. */
const LOAD_TIMEOUT_MS = 15_000;

const IDLE_LOGIN: ClaudeLoginState = { phase: 'idle', url: null, error: null };

/**
 * State and actions for the Claude accounts tab, bridged to the Java
 * AccountHandler. Registers the four window callbacks while mounted and
 * restores whatever was there before on unmount.
 */
export function useClaudeAccounts(addToast?: (message: string, type?: ToastType) => void) {
  const { t } = useTranslation();
  const [state, setState] = useState<ClaudeAccountsState | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [usage, setUsage] = useState<Record<string, ClaudeAccountUsageEvent>>({});
  const [refreshing, setRefreshing] = useState<Set<string>>(() => new Set());
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [login, setLogin] = useState<ClaudeLoginState>(IDLE_LOGIN);

  const addToastRef = useRef(addToast);
  const tRef = useRef(t);
  const stateRef = useRef<ClaudeAccountsState | null>(null);
  const initialRefreshDone = useRef(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    addToastRef.current = addToast;
    tRef.current = t;
  }, [addToast, t]);

  const toast = useCallback((message: string, type: ToastType) => {
    addToastRef.current?.(message, type);
  }, []);

  const clearRefreshTimer = () => {
    if (refreshTimer.current) {
      clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    }
  };

  /** Ask for usage of `ids` (every saved account, plus an unsaved live login, when empty). */
  const refreshUsage = useCallback((ids: string[] = []) => {
    const current = stateRef.current;
    const keys = ids.length > 0
      ? ids
      : [
          ...(current?.accounts.map((a) => a.id) ?? []),
          ...(current && current.liveLoggedIn && !current.liveSaved ? [LIVE_USAGE_KEY] : []),
        ];
    if (keys.length === 0) return;
    setRefreshing((prev) => new Set([...prev, ...keys]));
    sendToJava('refresh_claude_account_usage', { ids });
    clearRefreshTimer();
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      setRefreshing(new Set());
    }, REFRESH_TIMEOUT_MS);
  }, []);

  const requestAccounts = useCallback(() => {
    sendToJava('get_claude_accounts', { autoCapture: true });
    if (loadTimer.current) clearTimeout(loadTimer.current);
    loadTimer.current = setTimeout(() => {
      loadTimer.current = null;
      if (!stateRef.current) setLoadFailed(true);
    }, LOAD_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    const previous = {
      updateClaudeAccounts: window.updateClaudeAccounts,
      onClaudeAccountUsage: window.onClaudeAccountUsage,
      onClaudeAccountAction: window.onClaudeAccountAction,
      onClaudeLoginEvent: window.onClaudeLoginEvent,
    };

    window.updateClaudeAccounts = (json: string) => {
      const parsed = parseAccountsPayload(json);
      if (!parsed) return;
      if (loadTimer.current) {
        clearTimeout(loadTimer.current);
        loadTimer.current = null;
      }
      stateRef.current = parsed;
      setState(parsed);
      setLoadFailed(false);
      if (!initialRefreshDone.current) {
        initialRefreshDone.current = true;
        const stale = staleUsageIds(parsed.accounts, Date.now());
        const unsavedLive = parsed.liveLoggedIn && !parsed.liveSaved;
        if (unsavedLive || (stale.length > 0 && stale.length === parsed.accounts.length)) {
          refreshUsage([]);
        } else if (stale.length > 0) {
          refreshUsage(stale);
        }
      }
    };

    window.onClaudeAccountUsage = (json: string) => {
      const event = parseUsageEvent(json);
      if (!event) return;
      const key = usageKey(event.accountId);
      setUsage((prev) => ({ ...prev, [key]: event }));
      setRefreshing((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        if (next.size === 0) clearRefreshTimer();
        return next;
      });
    };

    window.onClaudeAccountAction = (json: string) => {
      const event = parseActionEvent(json);
      if (!event) return;
      setPendingAction((prev) => (prev === event.action ? null : prev));
      const tr = tRef.current;
      if (!event.success) {
        toast(event.error || tr('settings.accounts.toast.failed'), 'error');
        return;
      }
      switch (event.action) {
        case 'switch_claude_account':
          toast(tr('settings.accounts.toast.switched', { email: event.emailAddress ?? '' }), 'success');
          break;
        case 'save_current_claude_account':
          toast(tr('settings.accounts.toast.saved', { email: event.emailAddress ?? '' }), 'success');
          break;
        case 'delete_claude_account':
          toast(tr('settings.accounts.toast.deleted'), 'success');
          break;
        default:
          break;
      }
    };

    window.onClaudeLoginEvent = (json: string) => {
      const event: ClaudeLoginEvent | null = parseLoginEvent(json);
      if (!event) return;
      if (event.type === 'started') {
        setLogin({ phase: 'running', url: null, error: null });
      } else if (event.type === 'url') {
        setLogin((prev) => ({ ...prev, phase: 'running', url: event.url }));
      } else {
        if (event.success) {
          setLogin(IDLE_LOGIN);
          toast(tRef.current('settings.accounts.toast.loggedIn', { email: event.emailAddress ?? '' }), 'success');
        } else {
          setLogin({ phase: 'idle', url: null, error: event.error ?? tRef.current('settings.accounts.toast.failed') });
        }
      }
    };

    requestAccounts();

    return () => {
      window.updateClaudeAccounts = previous.updateClaudeAccounts;
      window.onClaudeAccountUsage = previous.onClaudeAccountUsage;
      window.onClaudeAccountAction = previous.onClaudeAccountAction;
      window.onClaudeLoginEvent = previous.onClaudeLoginEvent;
      clearRefreshTimer();
      if (loadTimer.current) clearTimeout(loadTimer.current);
    };
  }, [refreshUsage, requestAccounts, toast]);

  const runAction = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    setPendingAction(type);
    sendToJava(type, payload);
  }, []);

  const switchTo = useCallback((id: string) => runAction('switch_claude_account', { id }), [runAction]);
  const saveCurrent = useCallback(() => runAction('save_current_claude_account'), [runAction]);
  const remove = useCallback((id: string) => runAction('delete_claude_account', { id }), [runAction]);

  const reorder = useCallback((ids: string[]) => {
    setState((prev) => {
      if (!prev) return prev;
      const byId = new Map(prev.accounts.map((a) => [a.id, a]));
      const accounts = ids.map((id) => byId.get(id)).filter((a): a is NonNullable<typeof a> => !!a);
      const next = { ...prev, accounts };
      stateRef.current = next;
      return next;
    });
    sendToJava('reorder_claude_accounts', { ids });
  }, []);

  const setRotation = useCallback((id: string, enabled: boolean) => {
    setState((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        accounts: prev.accounts.map((a) => (a.id === id ? { ...a, rotationEnabled: enabled } : a)),
      };
      stateRef.current = next;
      return next;
    });
    sendToJava('set_claude_account_rotation', { id, enabled });
  }, []);

  const setAutoRotate = useCallback((enabled: boolean) => {
    setState((prev) => {
      if (!prev) return prev;
      const next = { ...prev, autoRotate: enabled };
      stateRef.current = next;
      return next;
    });
    sendToJava('set_claude_auto_rotate', { enabled });
  }, []);

  const startLogin = useCallback((method: LoginMethod) => {
    setLogin({ phase: 'running', url: null, error: null });
    sendToJava('start_claude_login', { method });
  }, []);

  const submitLoginCode = useCallback((code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    sendToJava('submit_claude_login_code', { code: trimmed });
  }, []);

  const cancelLogin = useCallback(() => {
    sendToJava('cancel_claude_login');
    setLogin(IDLE_LOGIN);
  }, []);

  const dismissLoginError = useCallback(() => setLogin(IDLE_LOGIN), []);

  return {
    state,
    loading: state === null && !loadFailed,
    loadFailed,
    usage,
    refreshing,
    pendingAction,
    login,
    reload: requestAccounts,
    refreshUsage,
    switchTo,
    saveCurrent,
    remove,
    reorder,
    setRotation,
    setAutoRotate,
    startLogin,
    submitLoginCode,
    cancelLogin,
    dismissLoginError,
  };
}

export type UseClaudeAccountsReturn = ReturnType<typeof useClaudeAccounts>;
