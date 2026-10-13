import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendBridgeEventMock = vi.hoisted(() => vi.fn(() => true));
vi.mock('./bridge', () => ({ sendBridgeEvent: sendBridgeEventMock }));

import {
  askSideQuestion,
  dismissSideQuestion,
  getSideQuestion,
  reloadPlugins,
  resetSideCommandsForTests,
} from './sideCommands';

function lastPayload(type: string): Record<string, unknown> {
  const call = [...sendBridgeEventMock.mock.calls].reverse().find((c) => c[0] === type);
  expect(call).toBeTruthy();
  return JSON.parse(call![1] as string);
}

beforeEach(() => {
  sendBridgeEventMock.mockClear();
  sendBridgeEventMock.mockImplementation(() => true);
  resetSideCommandsForTests();
});

afterEach(() => {
  vi.useRealTimers();
  resetSideCommandsForTests();
});

describe('side questions (/btw)', () => {
  it('asks the IDE and shows the question as pending', () => {
    askSideQuestion('what does the retry flag do?');

    const payload = lastPayload('ask_side_question');
    expect(payload.question).toBe('what does the retry flag do?');
    expect(getSideQuestion()).toMatchObject({ question: 'what does the retry flag do?', status: 'pending' });
  });

  it('shows the answer that matches the question on show', () => {
    askSideQuestion('why?');
    const { requestId } = lastPayload('ask_side_question');

    act(() => {
      window.onSideQuestionResult?.(JSON.stringify({ requestId: 'stale', ok: true, answer: { response: 'old' } }));
    });
    expect(getSideQuestion()?.status).toBe('pending');

    act(() => {
      window.onSideQuestionResult?.(JSON.stringify({ requestId, ok: true, answer: { response: 'Because.', synthetic: false } }));
    });
    expect(getSideQuestion()).toMatchObject({ status: 'answered', answer: { response: 'Because.', synthetic: false } });
  });

  it('says why when there is no answer', () => {
    askSideQuestion('why?');
    const { requestId } = lastPayload('ask_side_question');

    act(() => {
      window.onSideQuestionResult?.(JSON.stringify({ requestId, ok: false, reason: 'unsupported' }));
    });

    expect(getSideQuestion()).toMatchObject({ status: 'failed', reason: 'unsupported' });
  });

  it('a new question replaces the one shown, and close puts it away', () => {
    askSideQuestion('first');
    askSideQuestion('second');
    expect(getSideQuestion()?.question).toBe('second');

    dismissSideQuestion();
    expect(getSideQuestion()).toBeNull();
  });

  it('gives up when no answer comes', () => {
    vi.useFakeTimers();
    askSideQuestion('why?');

    act(() => {
      vi.advanceTimersByTime(240_000);
    });

    expect(getSideQuestion()).toMatchObject({ status: 'failed', reason: 'timeout' });
  });

  it('fails at once when the bridge is not there', () => {
    sendBridgeEventMock.mockImplementation(() => false);
    askSideQuestion('why?');
    expect(getSideQuestion()).toMatchObject({ status: 'failed', reason: 'failed' });
  });
});

describe('reloadPlugins (/reload-plugins)', () => {
  it('resolves with the SDK answer for its own request', async () => {
    const reload = reloadPlugins();
    const { requestId } = lastPayload('reload_plugins');

    window.onReloadPluginsResult?.(JSON.stringify({ requestId: 'other', ok: false, reason: 'failed' }));
    window.onReloadPluginsResult?.(JSON.stringify({ requestId, ok: true, result: { plugins: [{ name: 'p' }], error_count: 0 } }));

    await expect(reload).resolves.toEqual({ ok: true, result: { plugins: [{ name: 'p' }], error_count: 0 } });
  });

  it('passes on why nothing was reloaded', async () => {
    const reload = reloadPlugins();
    const { requestId } = lastPayload('reload_plugins');

    window.onReloadPluginsResult?.(JSON.stringify({ requestId, ok: false, reason: 'no-runtime' }));

    await expect(reload).resolves.toEqual({ ok: false, reason: 'no-runtime' });
  });
});
