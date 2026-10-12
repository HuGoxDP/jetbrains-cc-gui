import type { DropdownItemData } from '../types';
import { sendBridgeEvent } from '../../../utils/bridge';
import i18n from '../../../i18n/config';

/**
 * The other Claude sessions running on this machine, for the composer's `@@` mention
 * (ported from Swttch). The IDE answers `get_active_sessions` with what the official
 * `claude agents --json` prints, plus the title History shows for each session.
 */

/** One entry of `claude agents --json`, as the CLI spells it. */
export interface ActiveSessionAgent {
  pid?: number;
  cwd?: string;
  kind?: string;
  startedAt?: number;
  sessionId?: string;
  /** The address a message is sent to. */
  name?: string;
  status?: string;
  [key: string]: unknown;
}

/** A session the `@@` list offers. */
export interface SessionMentionItem {
  kind: 'session';
  /** The address; for the placeholder rows, an id such as `__loading__`. */
  name: string;
  sessionId: string;
  title: string;
  cwd?: string;
  status?: string;
  /** Last activity (transcript), else when the process started; for ordering. */
  activeAt: number;
}

export function isSessionMentionItem(value: unknown): value is SessionMentionItem {
  return !!value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'session';
}

export const SESSION_LOADING_ID = '__loading__';
export const SESSION_EMPTY_ID = '__empty_state__';

interface Payload {
  agents?: ActiveSessionAgent[];
  entries?: Record<string, { title?: string | null; lastTimestamp?: number }>;
  selfSessionId?: string | null;
  error?: string;
}

/** A session name as the CLI prints it: what `@@name` in a message may address. */
const NAME = /^[A-Za-z0-9._-]{1,200}$/;

/** Every session name seen in a list this webview was given; `@@name` addresses only these. */
const knownNames = new Set<string>();
let lastList: SessionMentionItem[] = [];
let lastError: string | null = null;
let lastFetch = 0;
let waiters: Array<() => void> = [];
let registered = false;

const REFRESH_MS = 3000;
const WAIT_MS = 12_000;

/** Turn the IDE's answer into the rows, most recently active first, without this session. */
export function toSessionItems(payload: Payload): SessionMentionItem[] {
  const agents = Array.isArray(payload.agents) ? payload.agents : [];
  const entries = payload.entries ?? {};
  const items: SessionMentionItem[] = [];
  for (const agent of agents) {
    const name = typeof agent.name === 'string' ? agent.name : '';
    const sessionId = typeof agent.sessionId === 'string' ? agent.sessionId : '';
    if (!NAME.test(name) || !sessionId || sessionId === payload.selfSessionId) continue;
    const entry = entries[sessionId];
    const title = (entry?.title ?? '').trim();
    items.push({
      kind: 'session',
      name,
      sessionId,
      title: title || name,
      cwd: typeof agent.cwd === 'string' ? agent.cwd : undefined,
      status: typeof agent.status === 'string' ? agent.status : undefined,
      activeAt: Math.max(entry?.lastTimestamp ?? 0, typeof agent.startedAt === 'number' ? agent.startedAt : 0),
    });
  }
  return items.sort((a, b) => b.activeAt - a.activeAt);
}

/** Rows whose title or name contains `query`, ignoring case. */
export function filterSessionItems(items: SessionMentionItem[], query: string): SessionMentionItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => item.title.toLowerCase().includes(q) || item.name.toLowerCase().includes(q));
}

function register(): void {
  if (registered || typeof window === 'undefined') return;
  registered = true;
  window.updateActiveSessions = (json: string) => {
    try {
      const payload = JSON.parse(json) as Payload;
      lastError = typeof payload.error === 'string' ? payload.error : null;
      lastList = lastError ? [] : toSessionItems(payload);
      lastList.forEach((item) => knownNames.add(item.name));
    } catch {
      lastError = 'failed';
      lastList = [];
    }
    const pending = waiters;
    waiters = [];
    pending.forEach((resolve) => resolve());
  };
}

function placeholder(id: string, title: string): SessionMentionItem {
  return { kind: 'session', name: id, sessionId: id, title, activeAt: 0 };
}

/**
 * The `@@` rows for `query`. The list is read again each time it is older than a few
 * seconds, since sessions come and go; until it answers, the last one is not trusted.
 */
export async function sessionMentionProvider(query: string, signal: AbortSignal): Promise<SessionMentionItem[]> {
  register();
  const now = Date.now();
  if (now - lastFetch > REFRESH_MS) {
    lastFetch = now;
    const answered = new Promise<void>((resolve) => {
      waiters.push(resolve);
      window.setTimeout(resolve, WAIT_MS);
    });
    sendBridgeEvent('get_active_sessions');
    await answered;
  }
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  if (lastError) {
    return [placeholder(SESSION_EMPTY_ID, i18n.t('chat.sessionMention.errors.' + lastError, {
      defaultValue: i18n.t('chat.sessionMention.errors.failed'),
    }))];
  }
  const rows = filterSessionItems(lastList, query);
  if (rows.length === 0) {
    return [placeholder(SESSION_EMPTY_ID, i18n.t(lastList.length === 0
      ? 'chat.sessionMention.none'
      : 'chat.sessionMention.noMatch'))];
  }
  return rows;
}

export function sessionToDropdownItem(item: SessionMentionItem): DropdownItemData {
  if (item.sessionId === SESSION_EMPTY_ID || item.sessionId === SESSION_LOADING_ID) {
    return { id: item.sessionId, label: item.title, icon: 'codicon-info', type: 'info', data: { session: item } };
  }
  return {
    id: `session:${item.sessionId}`,
    label: item.title,
    description: item.name,
    icon: 'codicon-comment-discussion',
    type: 'session',
    data: { session: item },
  };
}

/** Remember a name the user picked, so the message is addressed even if the list changes. */
export function rememberSessionName(name: string): void {
  if (NAME.test(name)) knownNames.add(name);
}

/** The `@@name` that addresses another session in `text`, and the words without it. */
export function findSessionMention(text: string): { name: string; body: string } | null {
  const pattern = /(^|\s)@@([A-Za-z0-9._-]{1,200})(?=\s|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const name = match[2];
    if (!knownNames.has(name)) continue;
    const start = match.index + match[1].length;
    const after = text.slice(start + 2 + name.length);
    const body = (text.slice(0, start) + (after.startsWith(' ') ? after.slice(1) : after)).trim();
    return body ? { name, body } : null;
  }
  return null;
}

/** For tests. */
export function resetSessionMentions(): void {
  knownNames.clear();
  lastList = [];
  lastError = null;
  lastFetch = 0;
  waiters = [];
  registered = false;
}
