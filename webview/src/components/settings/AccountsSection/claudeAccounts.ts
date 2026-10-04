/**
 * Data model and pure helpers for the Claude accounts settings tab.
 *
 * Payloads come from the Java AccountHandler:
 * - window.updateClaudeAccounts  → {@link ClaudeAccountsState}
 * - window.onClaudeAccountUsage  → {@link ClaudeAccountUsageEvent}
 * - window.onClaudeAccountAction → {@link ClaudeAccountActionEvent}
 * - window.onClaudeLoginEvent    → {@link ClaudeLoginEvent}
 *
 * Usage buckets are the CLI's own get_usage `rate_limits` object, passed
 * through unchanged (`five_hour`, `seven_day`, `seven_day_opus`, ...).
 */

export interface ClaudeUsageBucket {
  /** Percent of the window used, 0-100 (get_usage already reports a percent). */
  utilization?: number | null;
  /** ISO timestamp of the next reset. */
  resets_at?: string | null;
  display_name?: string | null;
}

export interface ClaudeRateLimits {
  five_hour?: ClaudeUsageBucket | null;
  seven_day?: ClaudeUsageBucket | null;
  seven_day_opus?: ClaudeUsageBucket | null;
  seven_day_sonnet?: ClaudeUsageBucket | null;
  model_scoped?: ClaudeUsageBucket[] | null;
  [key: string]: unknown;
}

export interface ClaudeAccount {
  id: string;
  emailAddress: string;
  displayName?: string | null;
  organizationName?: string | null;
  subscriptionType?: string | null;
  rateLimitTier?: string | null;
  createdAt?: number;
  updatedAt?: number;
  usage?: ClaudeRateLimits | null;
  usageUpdatedAt?: number;
  rotationEnabled?: boolean;
  active?: boolean;
  hasSnapshot?: boolean;
}

export interface ClaudeAccountsState {
  accounts: ClaudeAccount[];
  activeEmail: string | null;
  liveLoggedIn: boolean;
  liveSaved: boolean;
  autoRotate: boolean;
  isolatedUsageSupported: boolean;
}

export type UsageErrorKind = 'unsupported' | 'sdk_missing' | 'timeout' | 'auth' | 'network' | 'unknown';

export interface ClaudeAccountUsageEvent {
  /** Missing when the live login is not saved yet. */
  accountId?: string;
  active: boolean;
  updatedAt: number;
  success: boolean;
  rateLimits?: ClaudeRateLimits | null;
  /** false for logins without plan limits (API key, Bedrock, ...). */
  rateLimitsAvailable?: boolean | null;
  subscriptionType?: string | null;
  error?: string | null;
  errorKind?: UsageErrorKind | null;
}

export interface ClaudeAccountActionEvent {
  action: string;
  success: boolean;
  error?: string;
  emailAddress?: string;
}

export type ClaudeLoginEvent =
  | { type: 'started' }
  | { type: 'url'; url: string }
  | { type: 'finished'; success: boolean; emailAddress?: string; error?: string };

/** Key under which usage for an unsaved live login is kept. */
export const LIVE_USAGE_KEY = '__live__';

/** Usage older than this is refreshed when the tab opens. */
export const USAGE_STALE_MS = 5 * 60 * 1000;

function parseJson(input: unknown): unknown {
  if (typeof input !== 'string') return input;
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function parseAccountsPayload(input: unknown): ClaudeAccountsState | null {
  const data = parseJson(input);
  if (!isRecord(data) || !Array.isArray(data.accounts)) return null;
  const accounts = data.accounts.filter(
    (a): a is ClaudeAccount => isRecord(a) && typeof a.id === 'string' && typeof a.emailAddress === 'string',
  );
  return {
    accounts,
    activeEmail: typeof data.activeEmail === 'string' ? data.activeEmail : null,
    liveLoggedIn: data.liveLoggedIn === true,
    liveSaved: data.liveSaved === true,
    autoRotate: data.autoRotate === true,
    isolatedUsageSupported: data.isolatedUsageSupported !== false,
  };
}

export function parseUsageEvent(input: unknown): ClaudeAccountUsageEvent | null {
  const data = parseJson(input);
  if (!isRecord(data) || typeof data.success !== 'boolean') return null;
  return {
    accountId: typeof data.accountId === 'string' ? data.accountId : undefined,
    active: data.active === true,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
    success: data.success,
    rateLimits: isRecord(data.rateLimits) ? (data.rateLimits as ClaudeRateLimits) : null,
    rateLimitsAvailable: typeof data.rateLimitsAvailable === 'boolean' ? data.rateLimitsAvailable : null,
    subscriptionType: typeof data.subscriptionType === 'string' ? data.subscriptionType : null,
    error: typeof data.error === 'string' ? data.error : null,
    errorKind: typeof data.errorKind === 'string' ? (data.errorKind as UsageErrorKind) : null,
  };
}

export function parseActionEvent(input: unknown): ClaudeAccountActionEvent | null {
  const data = parseJson(input);
  if (!isRecord(data) || typeof data.action !== 'string') return null;
  return {
    action: data.action,
    success: data.success === true,
    error: typeof data.error === 'string' ? data.error : undefined,
    emailAddress: typeof data.emailAddress === 'string' ? data.emailAddress : undefined,
  };
}

export function parseLoginEvent(input: unknown): ClaudeLoginEvent | null {
  const data = parseJson(input);
  if (!isRecord(data)) return null;
  switch (data.type) {
    case 'started':
      return { type: 'started' };
    case 'url':
      return typeof data.url === 'string' ? { type: 'url', url: data.url } : null;
    case 'finished':
      return {
        type: 'finished',
        success: data.success === true,
        emailAddress: typeof data.emailAddress === 'string' ? data.emailAddress : undefined,
        error: typeof data.error === 'string' ? data.error : undefined,
      };
    default:
      return null;
  }
}

/** Usage key for an account, or for the unsaved live login. */
export function usageKey(accountId: string | undefined | null): string {
  return accountId || LIVE_USAGE_KEY;
}

export interface UsageWindowView {
  key: string;
  /** i18n key for fixed windows. */
  labelKey?: string;
  /** Raw label for model-scoped windows (`display_name` from the CLI). */
  label?: string;
  pct: number;
  resetsAt: Date | null;
}

const FIXED_WINDOWS: Array<{ key: keyof ClaudeRateLimits & string; labelKey: string }> = [
  { key: 'five_hour', labelKey: 'settings.accounts.window.fiveHour' },
  { key: 'seven_day', labelKey: 'settings.accounts.window.sevenDay' },
  { key: 'seven_day_opus', labelKey: 'settings.accounts.window.sevenDayOpus' },
  { key: 'seven_day_sonnet', labelKey: 'settings.accounts.window.sevenDaySonnet' },
];

function toPct(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

function toDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** Every window the CLI reported, in a stable order. */
export function usageWindows(limits: ClaudeRateLimits | null | undefined): UsageWindowView[] {
  if (!limits) return [];
  const out: UsageWindowView[] = [];
  for (const { key, labelKey } of FIXED_WINDOWS) {
    const bucket = limits[key];
    if (!isRecord(bucket)) continue;
    const pct = toPct(bucket.utilization);
    if (pct === null) continue;
    out.push({ key, labelKey, pct, resetsAt: toDate(bucket.resets_at) });
  }
  if (Array.isArray(limits.model_scoped)) {
    limits.model_scoped.forEach((bucket, index) => {
      if (!isRecord(bucket)) return;
      const pct = toPct(bucket.utilization);
      if (pct === null) return;
      const name = typeof bucket.display_name === 'string' && bucket.display_name ? bucket.display_name : null;
      out.push({
        key: `model_scoped:${index}`,
        labelKey: name ? undefined : 'settings.accounts.window.model',
        label: name ?? undefined,
        pct,
        resetsAt: toDate(bucket.resets_at),
      });
    });
  }
  return out;
}

/** Highest usage across every window; null when nothing was reported. */
export function peakUsage(limits: ClaudeRateLimits | null | undefined): number | null {
  const windows = usageWindows(limits);
  if (windows.length === 0) return null;
  return windows.reduce((max, w) => Math.max(max, w.pct), 0);
}

export type UsageLevel = 'ok' | 'warn' | 'full';

export function usageLevel(pct: number): UsageLevel {
  if (pct >= 100) return 'full';
  if (pct >= 80) return 'warn';
  return 'ok';
}

/** Ids whose stored usage is missing or older than {@link USAGE_STALE_MS}. */
export function staleUsageIds(accounts: ClaudeAccount[], now: number, maxAgeMs = USAGE_STALE_MS): string[] {
  return accounts
    .filter((a) => !a.usage || !a.usageUpdatedAt || now - a.usageUpdatedAt > maxAgeMs)
    .map((a) => a.id);
}

/** Move `id` one step up (-1) or down (+1); returns the same array when it cannot move. */
export function moveAccount(ids: string[], id: string, delta: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  const next = ids.slice();
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

/** "in 2 h 5 min" style countdown, localized through Intl when available. */
export function formatResetIn(resetsAt: Date, now: Date, locale?: string): string {
  const diffMs = resetsAt.getTime() - now.getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60_000));
  let value: number;
  let unit: Intl.RelativeTimeFormatUnit;
  if (minutes < 60) {
    value = minutes;
    unit = 'minute';
  } else if (minutes < 48 * 60) {
    value = Math.round(minutes / 60);
    unit = 'hour';
  } else {
    value = Math.round(minutes / (60 * 24));
    unit = 'day';
  }
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(value, unit);
  } catch {
    return `${value} ${unit}${value === 1 ? '' : 's'}`;
  }
}

/** A friendly plan name from `subscriptionType` (max / pro / team / enterprise). */
export function planLabel(account: Pick<ClaudeAccount, 'subscriptionType' | 'rateLimitTier'>): string | null {
  const type = (account.subscriptionType || '').trim();
  if (!type) return null;
  const tier = (account.rateLimitTier || '').match(/(\d+)x/i);
  const name = type.charAt(0).toUpperCase() + type.slice(1);
  return tier ? `${name} ${tier[1]}x` : name;
}
