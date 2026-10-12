import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SESSION_EMPTY_ID,
  filterSessionItems,
  findSessionMention,
  rememberSessionName,
  resetSessionMentions,
  sessionMentionProvider,
  sessionToDropdownItem,
  toSessionItems,
} from './sessionMentionProvider';

const mocks = vi.hoisted(() => ({ sendBridgeEvent: vi.fn() }));
vi.mock('../../../utils/bridge', () => ({ sendBridgeEvent: mocks.sendBridgeEvent }));
vi.mock('../../../i18n/config', () => ({ default: { t: (key: string) => key } }));

const payload = {
  agents: [
    { pid: 1, cwd: '/work/app', kind: 'interactive', startedAt: 100, sessionId: 'self', name: 'app-1', status: 'busy' },
    { pid: 2, cwd: '/work/app', kind: 'interactive', startedAt: 200, sessionId: 's-review', name: 'app-2' },
    { pid: 3, cwd: '/work/docs', kind: 'interactive', startedAt: 300, sessionId: 's-notes', name: 'docs-7' },
    { pid: 4, cwd: '/work/x', kind: 'interactive', startedAt: 999, sessionId: 's-bad', name: 'bad name' },
  ],
  entries: {
    's-review': { title: 'Review the pull request on this branch', lastTimestamp: 5000 },
    's-notes': { title: '', lastTimestamp: 400 },
  },
  selfSessionId: 'self',
};

beforeEach(() => {
  resetSessionMentions();
  mocks.sendBridgeEvent.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('session mention list', () => {
  it('lists the other sessions, most recently active first, titled as History titles them', () => {
    const items = toSessionItems(payload);
    expect(items.map((i) => i.name)).toEqual(['app-2', 'docs-7']);
    expect(items[0]).toMatchObject({ sessionId: 's-review', title: 'Review the pull request on this branch', cwd: '/work/app' });
    // No title: the name stands in.
    expect(items[1].title).toBe('docs-7');
    expect(sessionToDropdownItem(items[0])).toMatchObject({
      label: 'Review the pull request on this branch', description: 'app-2', type: 'session',
    });
    expect(sessionToDropdownItem(items[1])).toMatchObject({ label: 'docs-7', description: 'docs-7' });
  });

  it('narrows by title or name', () => {
    const items = toSessionItems(payload);
    expect(filterSessionItems(items, 'REVIEW').map((i) => i.name)).toEqual(['app-2']);
    expect(filterSessionItems(items, 'docs').map((i) => i.name)).toEqual(['docs-7']);
    expect(filterSessionItems(items, '')).toHaveLength(2);
  });

  it('asks the IDE each time the list is stale, and waits for its answer', async () => {
    mocks.sendBridgeEvent.mockImplementation(() => {
      setTimeout(() => window.updateActiveSessions?.(JSON.stringify(payload)), 0);
      return true;
    });
    const rows = await sessionMentionProvider('', new AbortController().signal);
    expect(mocks.sendBridgeEvent).toHaveBeenCalledWith('get_active_sessions');
    expect(rows.map((r) => r.name)).toEqual(['app-2', 'docs-7']);

    // Within a few seconds the same answer is reused for the next keystrokes.
    const narrowed = await sessionMentionProvider('notes', new AbortController().signal);
    expect(mocks.sendBridgeEvent).toHaveBeenCalledTimes(1);
    expect(narrowed[0].sessionId).toBe(SESSION_EMPTY_ID);
    expect(narrowed[0].title).toBe('chat.sessionMention.noMatch');
  });

  it('says why when there is nothing to list', async () => {
    mocks.sendBridgeEvent.mockImplementation(() => {
      setTimeout(() => window.updateActiveSessions?.(JSON.stringify({ error: 'cli_not_found' })), 0);
      return true;
    });
    const rows = await sessionMentionProvider('', new AbortController().signal);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('chat.sessionMention.errors.cli_not_found');
  });
});

describe('finding the @@ mention in a message', () => {
  it('addresses only a session the list named or the user picked', async () => {
    expect(findSessionMention('@@app-2 what did you verify?')).toBeNull();
    mocks.sendBridgeEvent.mockImplementation(() => {
      setTimeout(() => window.updateActiveSessions?.(JSON.stringify(payload)), 0);
      return true;
    });
    await sessionMentionProvider('', new AbortController().signal);
    expect(findSessionMention('@@app-2 what did you verify?')).toEqual({ name: 'app-2', body: 'what did you verify?' });
    // This session itself is never in the list, so it cannot be addressed.
    expect(findSessionMention('@@app-1 hi')).toBeNull();
  });

  it('cuts the mention out of the words, wherever it is', () => {
    rememberSessionName('app-2');
    expect(findSessionMention('@@app-2 what did you verify?')).toEqual({ name: 'app-2', body: 'what did you verify?' });
    expect(findSessionMention('tests pass here, @@app-2 what did you verify?'))
      .toEqual({ name: 'app-2', body: 'tests pass here, what did you verify?' });
    expect(findSessionMention('first line\n@@app-2 second')).toEqual({ name: 'app-2', body: 'first line\nsecond' });
    // A mention with nothing to say, an unknown name, or "@@" inside a word addresses nobody.
    expect(findSessionMention('@@app-2   ')).toBeNull();
    expect(findSessionMention('@@other hi')).toBeNull();
    expect(findSessionMention('mail@@app-2 hi')).toBeNull();
  });
});
