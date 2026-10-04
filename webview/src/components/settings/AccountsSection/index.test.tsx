import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AccountsSection from './index';
import en from '../../../i18n/locales/en.json';
import es from '../../../i18n/locales/es.json';
import fr from '../../../i18n/locales/fr.json';
import hi from '../../../i18n/locales/hi.json';
import ja from '../../../i18n/locales/ja.json';
import ko from '../../../i18n/locales/ko.json';
import ptBR from '../../../i18n/locales/pt-BR.json';
import ru from '../../../i18n/locales/ru.json';
import zh from '../../../i18n/locales/zh.json';
import zhTW from '../../../i18n/locales/zh-TW.json';

const mocks = vi.hoisted(() => ({
  sendToJava: vi.fn(),
  openBrowserExternal: vi.fn(),
}));

vi.mock('../../../utils/bridge', () => ({
  sendToJava: mocks.sendToJava,
  openBrowserExternal: mocks.openBrowserExternal,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params && 'email' in params ? `${key}:${String(params.email)}` : key,
    i18n: { language: 'en' },
  }),
}));

function collectLeaves(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => collectLeaves(child, prefix ? `${prefix}.${key}` : key));
}

const NOW = Date.now();

function accountsPayload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    accounts: [
      {
        id: 'acc-1',
        emailAddress: 'one@example.com',
        subscriptionType: 'max',
        rateLimitTier: 'default_claude_max_20x',
        active: true,
        hasSnapshot: true,
        rotationEnabled: true,
        usage: { five_hour: { utilization: 42 }, seven_day: { utilization: 10 } },
        usageUpdatedAt: NOW,
      },
      {
        id: 'acc-2',
        emailAddress: 'two@example.com',
        subscriptionType: 'pro',
        active: false,
        hasSnapshot: true,
        rotationEnabled: false,
        usage: null,
        usageUpdatedAt: 0,
      },
    ],
    activeEmail: 'one@example.com',
    liveLoggedIn: true,
    liveSaved: true,
    autoRotate: false,
    isolatedUsageSupported: true,
    ...overrides,
  });
}

function sentTypes() {
  return mocks.sendToJava.mock.calls.map((call) => call[0]);
}

describe('AccountsSection', () => {
  beforeEach(() => {
    mocks.sendToJava.mockReset();
    mocks.openBrowserExternal.mockReset();
  });

  afterEach(() => {
    delete window.updateClaudeAccounts;
    delete window.onClaudeAccountUsage;
    delete window.onClaudeAccountAction;
    delete window.onClaudeLoginEvent;
  });

  it('asks Java for the account list on mount', () => {
    render(<AccountsSection />);
    expect(mocks.sendToJava).toHaveBeenCalledWith('get_claude_accounts', { autoCapture: true });
    expect(screen.getByText('settings.accounts.loading')).toBeTruthy();
  });

  it('renders accounts with stored usage and refreshes only the stale ones', () => {
    render(<AccountsSection />);
    act(() => window.updateClaudeAccounts?.(accountsPayload()));

    const cards = screen.getAllByTestId('claude-account-card');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText('one@example.com')).toBeTruthy();
    expect(within(cards[0]).getByText('Max 20x')).toBeTruthy();
    expect(within(cards[0]).getByText('42%')).toBeTruthy();
    expect(within(cards[0]).queryByText('settings.accounts.switch')).toBeNull();
    expect(mocks.sendToJava).toHaveBeenCalledWith('refresh_claude_account_usage', { ids: ['acc-2'] });
  });

  it('shows a fresh usage reading pushed for an account', () => {
    render(<AccountsSection />);
    act(() => window.updateClaudeAccounts?.(accountsPayload()));
    act(() => window.onClaudeAccountUsage?.(JSON.stringify({
      accountId: 'acc-2',
      active: false,
      updatedAt: NOW,
      success: true,
      rateLimits: { five_hour: { utilization: 97 } },
      rateLimitsAvailable: true,
    })));
    const second = screen.getAllByTestId('claude-account-card')[1];
    expect(within(second).getByText('97%')).toBeTruthy();
  });

  it('switches, reorders, toggles rotation and auto-rotate', () => {
    render(<AccountsSection />);
    act(() => window.updateClaudeAccounts?.(accountsPayload()));
    const second = screen.getAllByTestId('claude-account-card')[1];

    fireEvent.click(within(second).getByText('settings.accounts.switch'));
    expect(mocks.sendToJava).toHaveBeenCalledWith('switch_claude_account', { id: 'acc-2' });

    fireEvent.click(within(second).getByLabelText('settings.accounts.moveUp'));
    expect(mocks.sendToJava).toHaveBeenCalledWith('reorder_claude_accounts', { ids: ['acc-2', 'acc-1'] });
    expect(screen.getAllByTestId('claude-account-card')[0].textContent).toContain('two@example.com');

    const rotation = within(screen.getAllByTestId('claude-account-card')[0]).getByRole('checkbox');
    fireEvent.click(rotation);
    expect(mocks.sendToJava).toHaveBeenCalledWith('set_claude_account_rotation', { id: 'acc-2', enabled: true });

    fireEvent.click(screen.getByText('settings.accounts.autoRotate'));
    expect(mocks.sendToJava).toHaveBeenCalledWith('set_claude_auto_rotate', { enabled: true });
  });

  it('confirms before removing an account', () => {
    render(<AccountsSection />);
    act(() => window.updateClaudeAccounts?.(accountsPayload()));
    const second = screen.getAllByTestId('claude-account-card')[1];
    fireEvent.click(within(second).getByLabelText('settings.accounts.delete'));
    expect(sentTypes()).not.toContain('delete_claude_account');
    fireEvent.click(screen.getByText('common.delete'));
    expect(mocks.sendToJava).toHaveBeenCalledWith('delete_claude_account', { id: 'acc-2' });
  });

  it('runs the login flow: URL, code, result toast', () => {
    const addToast = vi.fn();
    render(<AccountsSection addToast={addToast} />);
    act(() => window.updateClaudeAccounts?.(accountsPayload()));

    fireEvent.click(screen.getByText('settings.accounts.add'));
    fireEvent.click(screen.getByText('settings.accounts.loginClaudeAi'));
    expect(mocks.sendToJava).toHaveBeenCalledWith('start_claude_login', { method: 'claudeai' });

    act(() => window.onClaudeLoginEvent?.(JSON.stringify({ type: 'url', url: 'https://claude.ai/oauth/authorize?a=1' })));
    fireEvent.click(screen.getByText('settings.accounts.openLink'));
    expect(mocks.openBrowserExternal).toHaveBeenCalledWith('https://claude.ai/oauth/authorize?a=1');

    fireEvent.change(screen.getByLabelText('settings.accounts.codePlaceholder'), { target: { value: '  abc#123 ' } });
    fireEvent.click(screen.getByText('settings.accounts.submitCode'));
    expect(mocks.sendToJava).toHaveBeenCalledWith('submit_claude_login_code', { code: 'abc#123' });

    act(() => window.onClaudeLoginEvent?.(JSON.stringify({ type: 'finished', success: true, emailAddress: 'new@example.com' })));
    expect(addToast).toHaveBeenCalledWith('settings.accounts.toast.loggedIn:new@example.com', 'success');
    expect(screen.queryByText('settings.accounts.loginWaiting')).toBeNull();
  });

  it('offers to save an unsaved live login', () => {
    render(<AccountsSection />);
    act(() => window.updateClaudeAccounts?.(JSON.stringify({
      accounts: [],
      activeEmail: 'live@example.com',
      liveLoggedIn: true,
      liveSaved: false,
      autoRotate: false,
      isolatedUsageSupported: true,
    })));
    expect(screen.getByText('settings.accounts.unsavedLive:live@example.com')).toBeTruthy();
    // An unsaved live login is only reachable through the "all accounts" refresh.
    expect(mocks.sendToJava).toHaveBeenCalledWith('refresh_claude_account_usage', { ids: [] });
  });

  it('reports failed actions through a toast', () => {
    const addToast = vi.fn();
    render(<AccountsSection addToast={addToast} />);
    act(() => window.onClaudeAccountAction?.(JSON.stringify({ action: 'switch_claude_account', success: false, error: 'No snapshot' })));
    expect(addToast).toHaveBeenCalledWith('No snapshot', 'error');
  });

  it('restores the previous window callbacks on unmount', () => {
    const previous = vi.fn();
    window.updateClaudeAccounts = previous;
    const { unmount } = render(<AccountsSection />);
    expect(window.updateClaudeAccounts).not.toBe(previous);
    unmount();
    expect(window.updateClaudeAccounts).toBe(previous);
  });

  it('has every settings.accounts key in every locale', () => {
    const expected = collectLeaves((en as { settings: { accounts: unknown } }).settings.accounts).sort();
    for (const [name, locale] of Object.entries({ es, fr, hi, ja, ko, ptBR, ru, zh, zhTW })) {
      const actual = collectLeaves((locale as { settings: { accounts: unknown } }).settings.accounts).sort();
      expect({ name, keys: actual }).toEqual({ name, keys: expected });
    }
  });
});
