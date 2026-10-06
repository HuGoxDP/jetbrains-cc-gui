import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveThinkingDisplayArgs } from './thinking-display.js';

test('showThinkingSummaries: true asks for summarized thinking', () => {
  assert.deepEqual(resolveThinkingDisplayArgs({ showThinkingSummaries: true }), { 'thinking-display': 'summarized' });
});

test('anything else passes nothing and leaves the API default', () => {
  for (const settings of [null, undefined, {}, { showThinkingSummaries: false }, { showThinkingSummaries: 'true' }]) {
    assert.equal(resolveThinkingDisplayArgs(settings), null);
  }
});
