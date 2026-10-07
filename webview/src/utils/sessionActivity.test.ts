import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendBridgeEventMock = vi.hoisted(() => vi.fn());
vi.mock('./bridge.js', () => ({ sendBridgeEvent: sendBridgeEventMock }));

import {
  parseSessionActivity,
  requestSessionActivity,
  resetSessionActivityForTests,
  useSessionActivity,
} from './sessionActivity.js';

beforeEach(() => {
  sendBridgeEventMock.mockClear();
  resetSessionActivityForTests();
});

describe('parseSessionActivity', () => {
  it('keeps known states only', () => {
    expect(parseSessionActivity(JSON.stringify({ a: 'running', b: 'awaiting', c: 'done', d: 'open', e: 'weird', f: 3 })))
      .toEqual({ a: 'running', b: 'awaiting', c: 'done', d: 'open' });
  });

  it('refuses what is not a map', () => {
    expect(parseSessionActivity('nope')).toBeNull();
    expect(parseSessionActivity('[1]')).toBeNull();
    expect(parseSessionActivity('null')).toBeNull();
  });
});

describe('useSessionActivity', () => {
  it('follows the plugin pushes, and ignores a bad one', () => {
    const { result } = renderHook(() => useSessionActivity());
    expect(result.current).toEqual({});

    act(() => window.onSessionActivity?.(JSON.stringify({ s1: 'running' })));
    expect(result.current).toEqual({ s1: 'running' });

    act(() => window.onSessionActivity?.('not json'));
    expect(result.current).toEqual({ s1: 'running' });

    act(() => window.onSessionActivity?.(JSON.stringify({})));
    expect(result.current).toEqual({});
  });
});

describe('requestSessionActivity', () => {
  it('asks the plugin for the map', () => {
    requestSessionActivity();
    expect(sendBridgeEventMock).toHaveBeenCalledWith('get_session_activity');
  });
});
