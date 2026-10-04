import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUsageQueryEnv,
  classifyUsageError,
  fetchPlanUsage,
} from './usage-service.js';

const USAGE_METHOD = 'usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET';

function fakeQueryFn(overrides = {}) {
  const calls = { options: null, usageOpts: null, closed: false };
  const queryFn = ({ options }) => {
    calls.options = options;
    return {
      [USAGE_METHOD]: async (opts) => {
        calls.usageOpts = opts;
        return { rate_limits_available: true, rate_limits: { five_hour: { utilization: 12, resets_at: null } } };
      },
      accountInfo: async () => ({ email: 'a@example.com', subscriptionType: 'Claude Max' }),
      close: () => { calls.closed = true; },
      ...overrides,
    };
  };
  return { queryFn, calls };
}

test('buildUsageQueryEnv strips every credential that would shadow the stored login', () => {
  const env = buildUsageQueryEnv({
    PATH: '/usr/bin',
    ANTHROPIC_API_KEY: 'sk-ant-secret',
    ANTHROPIC_AUTH_TOKEN: 'token',
    ANTHROPIC_BASE_URL: 'https://proxy.example.com',
    anthropic_api_url: 'https://proxy.example.com',
    CLAUDE_CODE_OAUTH_TOKEN: 'oauth',
    CLAUDE_CODE_USE_BEDROCK: '1',
    CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: '1',
    HTTPS_PROXY: 'http://corp-proxy:8080',
    UNSET: undefined,
  });

  assert.deepEqual(env, { PATH: '/usr/bin', HTTPS_PROXY: 'http://corp-proxy:8080' });
});

test('buildUsageQueryEnv points the CLI at a saved account only when asked', () => {
  assert.equal(buildUsageQueryEnv({ PATH: 'x' }).CLAUDE_CONFIG_DIR, undefined);
  assert.equal(buildUsageQueryEnv({ PATH: 'x' }, '   ').CLAUDE_CONFIG_DIR, undefined);
  assert.equal(
    buildUsageQueryEnv({ PATH: 'x', CLAUDE_CONFIG_DIR: '/live' }, ' /sandbox/acc ').CLAUDE_CONFIG_DIR,
    '/sandbox/acc'
  );
});

test('classifyUsageError recognises the failures the UI treats differently', () => {
  assert.equal(classifyUsageError(Object.assign(new Error('x'), { code: 'unsupported' })), 'unsupported');
  assert.equal(classifyUsageError(Object.assign(new Error('x'), { code: 'sdk_missing' })), 'sdk_missing');
  assert.equal(classifyUsageError(new Error('Usage lookup timed out after 45s')), 'timeout');
  assert.equal(classifyUsageError(new Error('Not logged in. Please run /login')), 'auth');
  assert.equal(classifyUsageError(new Error('getaddrinfo ENOTFOUND api.anthropic.com')), 'network');
  assert.equal(classifyUsageError(new Error('something else')), 'unknown');
});

test('fetchPlanUsage asks an isolated session and always closes it', async () => {
  const { queryFn, calls } = fakeQueryFn();

  const result = await fetchPlanUsage({ queryFn, configDir: '/sandbox/acc' });

  assert.equal(result.usage.rate_limits.five_hour.utilization, 12);
  assert.deepEqual(result.account, { email: 'a@example.com', subscriptionType: 'Claude Max' });
  // No user/project settings: no hooks, MCP servers or settings.json env.
  assert.deepEqual(calls.options.settingSources, []);
  assert.equal(calls.options.persistSession, false);
  assert.equal(calls.options.env.CLAUDE_CONFIG_DIR, '/sandbox/acc');
  // The transcript scan is opt-in.
  assert.deepEqual(calls.usageOpts, { skipBehaviors: true });
  assert.equal(calls.closed, true);
});

test('fetchPlanUsage scans behaviors only on request', async () => {
  const { queryFn, calls } = fakeQueryFn();
  await fetchPlanUsage({ queryFn, includeBehaviors: true });
  assert.deepEqual(calls.usageOpts, { skipBehaviors: false });
});

test('fetchPlanUsage reports an SDK without the usage API as unsupported', async () => {
  const { queryFn, calls } = fakeQueryFn({ [USAGE_METHOD]: undefined });

  await assert.rejects(
    () => fetchPlanUsage({ queryFn }),
    (error) => error.code === 'unsupported'
  );
  assert.equal(calls.closed, true);
});

test('fetchPlanUsage survives a failing account lookup', async () => {
  const { queryFn } = fakeQueryFn({ accountInfo: async () => { throw new Error('nope'); } });
  const result = await fetchPlanUsage({ queryFn });
  assert.equal(result.account, null);
  assert.equal(result.usage.rate_limits_available, true);
});

test('fetchPlanUsage gives up after the timeout and still closes the session', async () => {
  const { queryFn, calls } = fakeQueryFn({ [USAGE_METHOD]: () => new Promise(() => {}) });

  await assert.rejects(
    () => fetchPlanUsage({ queryFn, timeoutMs: 20 }),
    (error) => error.code === 'timeout'
  );
  assert.equal(calls.closed, true);
});
