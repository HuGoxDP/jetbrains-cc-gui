import test from 'node:test';
import assert from 'node:assert/strict';

import { stopTaskPersistent, __testing } from './persistent-query-service.js';
import { updateBackgroundTaskState } from './runtime-lifecycle.js';

/**
 * Stopping one background task from the status panel: the webview knows the
 * task by its tool call, the SDK's Query.stopTask() wants the task id the CLI
 * announced in task_started, and nothing else about the conversation stops.
 */

function createFakeRuntime(overrides = {}) {
  const stopTaskCalls = [];
  return {
    closed: false,
    sessionId: 'sess-1',
    runtimeSessionEpoch: 'epoch-1',
    inputStream: { done() {} },
    query: overrides.query ?? {
      stopTask: async (taskId) => { stopTaskCalls.push(taskId); },
    },
    __stopTaskCalls: stopTaskCalls,
  };
}

test.beforeEach(async () => {
  await __testing.resetState();
});

test.after(async () => {
  await __testing.resetState();
});

test('stops the task the CLI announced for that tool call', async () => {
  const runtime = createFakeRuntime();
  __testing.setActiveTurnRuntime(runtime);
  updateBackgroundTaskState(runtime, { type: 'system', subtype: 'task_started', tool_use_id: 'toolu_1', task_id: 'a1b2c3d' });

  const result = await stopTaskPersistent({ sessionId: 'sess-1', toolUseId: 'toolu_1', taskId: 'fallback' });

  assert.deepEqual(result, { stopped: true });
  assert.deepEqual(runtime.__stopTaskCalls, ['a1b2c3d']);
});

test('falls back to the agent id the caller knows when task_started was never seen', async () => {
  const runtime = createFakeRuntime();
  __testing.setActiveTurnRuntime(runtime);

  const result = await stopTaskPersistent({ sessionId: 'sess-1', toolUseId: 'toolu_9', taskId: 'agent-9' });

  assert.equal(result.stopped, true);
  assert.deepEqual(runtime.__stopTaskCalls, ['agent-9']);
});

test('forgets the mapping once the task has finished', async () => {
  const runtime = createFakeRuntime();
  __testing.setActiveTurnRuntime(runtime);
  updateBackgroundTaskState(runtime, { type: 'system', subtype: 'task_started', tool_use_id: 'toolu_1', task_id: 'a1b2c3d' });
  updateBackgroundTaskState(runtime, { type: 'system', subtype: 'task_notification', tool_use_id: 'toolu_1', task_id: 'a1b2c3d', status: 'completed' });

  const result = await stopTaskPersistent({ sessionId: 'sess-1', toolUseId: 'toolu_1' });

  assert.deepEqual(result, { stopped: false, reason: 'unknown-task' });
  assert.deepEqual(runtime.__stopTaskCalls, []);
});

test('says so when the SDK in use has no stopTask', async () => {
  const runtime = createFakeRuntime({ query: {} });
  __testing.setActiveTurnRuntime(runtime);

  const result = await stopTaskPersistent({ sessionId: 'sess-1', toolUseId: 'toolu_1', taskId: 'a1' });

  assert.deepEqual(result, { stopped: false, reason: 'unsupported' });
});

test('does nothing without a live runtime for the session', async () => {
  const result = await stopTaskPersistent({ sessionId: 'sess-1', toolUseId: 'toolu_1', taskId: 'a1' });

  assert.deepEqual(result, { stopped: false, reason: 'no-runtime' });
});
