// Claude's folder moved with CLAUDE_CONFIG_DIR (Settings sets it per request, as a
// terminal user would export it): every reader in the bridge follows it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { getClaudeDir, getClaudeGlobalConfigPath, getRealHomeDir } from './path-utils.js';
import { isDangerousPath } from '../permission-safety.js';
import { buildRuntimeSignature } from '../services/claude/runtime-lifecycle.js';

function withConfigDir(value, fn) {
  const saved = process.env.CLAUDE_CONFIG_DIR;
  if (value === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = value;
  try {
    return fn();
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = saved;
  }
}

test('getClaudeDir is ~/.claude when CLAUDE_CONFIG_DIR is unset or blank', () => {
  withConfigDir(undefined, () => assert.equal(getClaudeDir(), join(getRealHomeDir(), '.claude')));
  withConfigDir('  ', () => assert.equal(getClaudeDir(), join(getRealHomeDir(), '.claude')));
});

test('getClaudeDir follows CLAUDE_CONFIG_DIR, read on every call', () => {
  withConfigDir('/claude/app', () => assert.equal(getClaudeDir(), '/claude/app'));
  withConfigDir('/claude/other', () => assert.equal(getClaudeDir(), '/claude/other'));
});

test('.claude.json sits in the home, or inside CLAUDE_CONFIG_DIR', () => {
  withConfigDir(undefined, () => assert.equal(getClaudeGlobalConfigPath(), join(getRealHomeDir(), '.claude.json')));
  withConfigDir('/claude/app', () => assert.equal(getClaudeGlobalConfigPath(), join('/claude/app', '.claude.json')));
});

test('the login in a moved folder is protected like ~/.claude/.credentials.json', () => {
  withConfigDir('/claude/app/', () => {
    assert.equal(isDangerousPath('/claude/app/.credentials.json'), true);
    assert.equal(isDangerousPath('/claude/app/settings.json'), false);
  });
  withConfigDir(undefined, () => assert.equal(isDangerousPath('/claude/app/.credentials.json'), false));
});

test('a different CLAUDE_CONFIG_DIR rebuilds the runtime', () => {
  const options = (dir) => ({ cwd: '/work/app', model: 'm', env: dir ? { CLAUDE_CONFIG_DIR: dir } : {} });
  const sig = (dir) => buildRuntimeSignature(options(dir), '', true, 'epoch', 'm');
  assert.notEqual(sig('/claude/a'), sig('/claude/b'));
  assert.notEqual(sig('/claude/a'), sig(undefined));
  assert.equal(sig('/claude/a'), sig('/claude/a'));
});
