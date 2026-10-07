import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendBridgeEventMock = vi.hoisted(() => vi.fn());
vi.mock('./bridge.js', () => ({ sendBridgeEvent: sendBridgeEventMock }));

import { resetBackgroundTaskStopForTests, stopBackgroundTask, stopFailureKey } from './backgroundTaskStop.js';

beforeEach(() => {
  sendBridgeEventMock.mockClear();
  resetBackgroundTaskStopForTests();
});

afterEach(() => {
  vi.useRealTimers();
  resetBackgroundTaskStopForTests();
});

function answer(result: object) {
  window.onBackgroundTaskStopResult?.(JSON.stringify(result));
}

describe('stopBackgroundTask', () => {
  it('asks the plugin to stop the task, by its tool call and agent id', () => {
    void stopBackgroundTask('toolu_1', 'a1b2c3d');

    expect(sendBridgeEventMock).toHaveBeenCalledWith(
      'stop_background_task',
      JSON.stringify({ toolUseId: 'toolu_1', agentId: 'a1b2c3d' }),
    );
  });

  it('resolves with the answer for that tool call', async () => {
    const stop = stopBackgroundTask('toolu_1');
    answer({ toolUseId: 'toolu_other', stopped: true });
    answer({ toolUseId: 'toolu_1', stopped: false, error: 'unsupported' });

    await expect(stop).resolves.toEqual({ stopped: false, error: 'unsupported' });
  });

  it('gives up when no answer comes', async () => {
    vi.useFakeTimers();
    const stop = stopBackgroundTask('toolu_1');
    vi.advanceTimersByTime(15_000);

    await expect(stop).resolves.toEqual({ stopped: false, error: 'timeout' });
  });

  it('answers a second click and the first with the one answer', async () => {
    const first = stopBackgroundTask('toolu_1');
    const second = stopBackgroundTask('toolu_1');
    answer({ toolUseId: 'toolu_1', stopped: true });

    await expect(first).resolves.toEqual({ stopped: true });
    await expect(second).resolves.toEqual({ stopped: true });
  });
});

describe('stopFailureKey', () => {
  it('explains each reason, and falls back to the error itself', () => {
    expect(stopFailureKey('unsupported')).toBe('statusPanel.stopAgentUnsupported');
    expect(stopFailureKey('no-runtime')).toBe('statusPanel.stopAgentNoRuntime');
    expect(stopFailureKey('unknown-task')).toBe('statusPanel.stopAgentUnknown');
    expect(stopFailureKey('timeout')).toBe('statusPanel.stopAgentFailed');
    expect(stopFailureKey(undefined)).toBe('statusPanel.stopAgentFailed');
  });
});
