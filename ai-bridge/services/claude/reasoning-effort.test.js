import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEffortSelection } from './reasoning-effort.js';

test('real effort levels pass through and leave ultracode untouched', () => {
  for (const level of ['low', 'medium', 'high', 'xhigh', 'max']) {
    assert.deepEqual(resolveEffortSelection(level), { effort: level, ultracode: null });
  }
});

test('ultracode runs at xhigh effort with the flag on', () => {
  assert.deepEqual(resolveEffortSelection('ultracode'), { effort: 'xhigh', ultracode: true });
  assert.deepEqual(resolveEffortSelection('  ultracode '), { effort: 'xhigh', ultracode: true });
});

test('ultracode degrades to plain xhigh when workflows are disabled', () => {
  assert.deepEqual(
    resolveEffortSelection('ultracode', { disableWorkflows: true }),
    { effort: 'xhigh', ultracode: null }
  );
});

test('a plain level switches off a stale ultracode from settings.json', () => {
  assert.deepEqual(
    resolveEffortSelection('high', { ultracode: true }),
    { effort: 'high', ultracode: false }
  );
  // Only an explicit `true` counts as stale; anything else leaves the key out.
  assert.deepEqual(
    resolveEffortSelection('high', { ultracode: false }),
    { effort: 'high', ultracode: null }
  );
});

test('unset or unknown values request nothing', () => {
  for (const value of [null, undefined, '', '   ', 'turbo', 42, {}]) {
    assert.deepEqual(resolveEffortSelection(value, { ultracode: true }), { effort: null, ultracode: null });
  }
});
