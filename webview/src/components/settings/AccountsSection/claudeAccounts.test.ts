import { describe, expect, it } from 'vitest';
import {
  formatResetIn,
  moveAccount,
  parseAccountsPayload,
  parseActionEvent,
  parseLoginEvent,
  parseUsageEvent,
  peakUsage,
  planLabel,
  staleUsageIds,
  usageKey,
  usageLevel,
  usageWindows,
  LIVE_USAGE_KEY,
} from './claudeAccounts';

describe('parseAccountsPayload', () => {
  it('reads the Java list() payload and drops malformed accounts', () => {
    const parsed = parseAccountsPayload(JSON.stringify({
      accounts: [
        { id: 'a1', emailAddress: 'one@example.com', active: true, rotationEnabled: true },
        { id: 'broken' },
        { id: 'a2', emailAddress: 'two@example.com', rotationEnabled: false },
      ],
      activeEmail: 'one@example.com',
      liveLoggedIn: true,
      liveSaved: true,
      autoRotate: true,
      isolatedUsageSupported: false,
    }));
    expect(parsed?.accounts.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(parsed?.activeEmail).toBe('one@example.com');
    expect(parsed?.autoRotate).toBe(true);
    expect(parsed?.isolatedUsageSupported).toBe(false);
  });

  it('rejects payloads without an accounts array', () => {
    expect(parseAccountsPayload('{"error":true}')).toBeNull();
    expect(parseAccountsPayload('not json')).toBeNull();
  });

  it('treats a missing isolatedUsageSupported as supported', () => {
    expect(parseAccountsPayload({ accounts: [] })?.isolatedUsageSupported).toBe(true);
  });
});

describe('usage events', () => {
  it('parses a successful reading', () => {
    const event = parseUsageEvent(JSON.stringify({
      accountId: 'a1',
      active: true,
      updatedAt: 123,
      success: true,
      rateLimits: { five_hour: { utilization: 40, resets_at: '2026-10-04T18:00:00Z' } },
      rateLimitsAvailable: true,
    }));
    expect(event?.success).toBe(true);
    expect(event?.rateLimits?.five_hour?.utilization).toBe(40);
    expect(usageKey(event?.accountId)).toBe('a1');
  });

  it('keys a reading for an unsaved live login separately', () => {
    const event = parseUsageEvent({ active: true, success: false, error: 'boom', errorKind: 'auth' });
    expect(usageKey(event?.accountId)).toBe(LIVE_USAGE_KEY);
    expect(event?.errorKind).toBe('auth');
  });

  it('parses action and login events', () => {
    expect(parseActionEvent('{"action":"switch_claude_account","success":true,"emailAddress":"x@y"}'))
      .toEqual({ action: 'switch_claude_account', success: true, error: undefined, emailAddress: 'x@y' });
    expect(parseLoginEvent('{"type":"url","url":"https://claude.ai/oauth/authorize?x=1"}'))
      .toEqual({ type: 'url', url: 'https://claude.ai/oauth/authorize?x=1' });
    expect(parseLoginEvent('{"type":"finished","success":false,"error":"nope"}'))
      .toEqual({ type: 'finished', success: false, emailAddress: undefined, error: 'nope' });
    expect(parseLoginEvent('{"type":"other"}')).toBeNull();
  });
});

describe('usageWindows', () => {
  it('lists fixed windows in order, then model-scoped ones', () => {
    const windows = usageWindows({
      seven_day: { utilization: 12.5, resets_at: '2026-10-08T00:00:00Z' },
      five_hour: { utilization: 130 },
      seven_day_opus: null,
      model_scoped: [{ display_name: 'Fable', utilization: 3 }, { utilization: 'x' as unknown as number }],
    });
    expect(windows.map((w) => w.key)).toEqual(['five_hour', 'seven_day', 'model_scoped:0']);
    expect(windows[0].pct).toBe(100);
    expect(windows[1].resetsAt?.toISOString()).toBe('2026-10-08T00:00:00.000Z');
    expect(windows[2].label).toBe('Fable');
    expect(peakUsage({ five_hour: { utilization: 20 }, seven_day: { utilization: 70 } })).toBe(70);
    expect(peakUsage(null)).toBeNull();
  });

  it('classifies usage levels', () => {
    expect(usageLevel(10)).toBe('ok');
    expect(usageLevel(85)).toBe('warn');
    expect(usageLevel(100)).toBe('full');
  });
});

describe('helpers', () => {
  it('finds stale or missing usage', () => {
    const now = 1_000_000_000;
    expect(staleUsageIds([
      { id: 'fresh', emailAddress: 'a', usage: {}, usageUpdatedAt: now - 1000 },
      { id: 'old', emailAddress: 'b', usage: {}, usageUpdatedAt: now - 10 * 60 * 1000 },
      { id: 'never', emailAddress: 'c' },
    ], now)).toEqual(['old', 'never']);
  });

  it('moves accounts up and down within bounds', () => {
    expect(moveAccount(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveAccount(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    const ids = ['a', 'b'];
    expect(moveAccount(ids, 'a', -1)).toBe(ids);
    expect(moveAccount(ids, 'zzz', 1)).toBe(ids);
  });

  it('formats a reset countdown', () => {
    const now = new Date('2026-10-04T12:00:00Z');
    expect(formatResetIn(new Date('2026-10-04T12:30:00Z'), now, 'en')).toBe('in 30 minutes');
    expect(formatResetIn(new Date('2026-10-04T15:00:00Z'), now, 'en')).toBe('in 3 hours');
    expect(formatResetIn(new Date('2026-10-08T12:00:00Z'), now, 'en')).toBe('in 4 days');
  });

  it('labels the plan', () => {
    expect(planLabel({ subscriptionType: 'max', rateLimitTier: 'default_claude_max_20x' })).toBe('Max 20x');
    expect(planLabel({ subscriptionType: 'pro', rateLimitTier: null })).toBe('Pro');
    expect(planLabel({ subscriptionType: null })).toBeNull();
  });
});
