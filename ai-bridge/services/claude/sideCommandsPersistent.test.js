import test from 'node:test';
import assert from 'node:assert/strict';

import { askSideQuestionPersistent, reloadPluginsPersistent, __testing } from './persistent-query-service.js';

/**
 * /btw and /reload-plugins act on the conversation's live runtime, beside a turn
 * in progress if there is one (ported from Swttch).
 */

function createFakeRuntime(query) {
  return {
    closed: false,
    sessionId: 'sess-1',
    runtimeSessionEpoch: 'epoch-1',
    inputStream: { done() {} },
    query,
  };
}

test.beforeEach(async () => {
  await __testing.resetState();
});

test.after(async () => {
  await __testing.resetState();
});

test('asks the live runtime and returns its whole answer', async () => {
  const questions = [];
  const runtime = createFakeRuntime({
    askSideQuestion: async (question) => {
      questions.push(question);
      return { response: 'It retries three times.', synthetic: false };
    },
  });
  __testing.setActiveTurnRuntime(runtime);

  const result = await askSideQuestionPersistent({ sessionId: 'sess-1', question: '  how often does it retry?  ' });

  assert.deepEqual(questions, ['how often does it retry?']);
  assert.deepEqual(result, { ok: true, answer: { response: 'It retries three times.', synthetic: false } });
});

test('a side question needs words', async () => {
  const result = await askSideQuestionPersistent({ sessionId: 'sess-1', question: '   ' });
  assert.deepEqual(result, { ok: false, reason: 'empty' });
});

test('a side question needs a live runtime of that conversation', async () => {
  __testing.setActiveTurnRuntime({ ...createFakeRuntime({ askSideQuestion: async () => ({ response: 'x' }) }), sessionId: 'other' });

  const result = await askSideQuestionPersistent({ sessionId: 'sess-1', question: 'why?' });

  assert.deepEqual(result, { ok: false, reason: 'no-runtime' });
});

test('says so when the SDK in use cannot ask a side question', async () => {
  __testing.setActiveTurnRuntime(createFakeRuntime({}));

  const result = await askSideQuestionPersistent({ sessionId: 'sess-1', question: 'why?' });

  assert.deepEqual(result, { ok: false, reason: 'unsupported' });
});

test('an empty answer is reported, not shown as text', async () => {
  __testing.setActiveTurnRuntime(createFakeRuntime({ askSideQuestion: async () => null }));

  const result = await askSideQuestionPersistent({ sessionId: 'sess-1', question: 'why?' });

  assert.deepEqual(result, { ok: false, reason: 'no-answer' });
});

test('reloads plugins on the live runtime and returns what the SDK answered', async () => {
  const answer = { commands: [], agents: [], plugins: [{ name: 'p', path: '/p' }], mcpServers: [], error_count: 0 };
  let calls = 0;
  __testing.setActiveTurnRuntime(createFakeRuntime({ reloadPlugins: async () => { calls += 1; return answer; } }));

  const result = await reloadPluginsPersistent({ sessionId: 'sess-1' });

  assert.equal(calls, 1);
  assert.deepEqual(result, { ok: true, result: answer });
});

test('a reload without a live runtime does nothing', async () => {
  const result = await reloadPluginsPersistent({ sessionId: 'sess-1' });
  assert.deepEqual(result, { ok: false, reason: 'no-runtime' });
});

test('a runtime of another epoch is not used', async () => {
  __testing.setActiveTurnRuntime(createFakeRuntime({ reloadPlugins: async () => ({}) }));

  const result = await reloadPluginsPersistent({ sessionId: 'sess-1', runtimeSessionEpoch: 'epoch-2' });

  assert.deepEqual(result, { ok: false, reason: 'no-runtime' });
});
