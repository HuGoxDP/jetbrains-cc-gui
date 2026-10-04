/**
 * Claude plan usage (the data behind `/usage`), asked of the CLI itself.
 *
 * The Agent SDK exposes the CLI's `get_usage` control request: the 5-hour and
 * weekly rate-limit windows for a claude.ai subscription login, plus an
 * optional breakdown of what has been contributing to them. This service starts
 * a short-lived, isolated SDK session, asks that one question and closes it —
 * no prompt is ever sent, so the lookup itself costs no plan usage.
 *
 * Passing `configDir` points the CLI at another Claude config directory, which
 * is how a saved (inactive) account is queried without touching the live login.
 */

import { existsSync } from 'fs';
import { loadClaudeSdk } from '../../utils/sdk-loader.js';
import { AsyncStream } from '../../utils/async-stream.js';
import { buildCliEnv } from '../../config/api-config.js';
import { getClaudeCliPathOverride } from '../../utils/claude-cli-path.js';
import { getRealHomeDir } from '../../utils/path-utils.js';
import { redactSecrets, truncateString } from './message-output-filter.js';

// The method name says it all: guard every use so an SDK that renames or drops
// it degrades to "unsupported" instead of crashing.
const USAGE_METHOD = 'usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET';

export const USAGE_MARKER = '[CLAUDE_USAGE]';

const DEFAULT_TIMEOUT_MS = 45_000;
const ACCOUNT_INFO_TIMEOUT_MS = 8_000;

/**
 * Env vars that make the CLI authenticate as something other than the stored
 * subscription login, or route it away from Anthropic. A usage lookup answers
 * for the OAuth account, so none of these may leak in from the host process —
 * a managed provider's API key would otherwise turn every answer into
 * "rate limits not available".
 */
const AUTH_OVERRIDE_ENV_VARS = new Set([
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_API_URL',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST',
]);

/**
 * Build the child env for a usage lookup.
 *
 * @param {Record<string, string|undefined>} baseEnv - Usually buildCliEnv()
 * @param {string|null} [configDir] - Claude config dir to read credentials from
 * @returns {Record<string, string>}
 */
export function buildUsageQueryEnv(baseEnv, configDir = null) {
  const env = {};
  for (const [key, value] of Object.entries(baseEnv || {})) {
    if (value === undefined || value === null) continue;
    if (AUTH_OVERRIDE_ENV_VARS.has(key.toUpperCase())) continue;
    env[key] = value;
  }
  const normalizedConfigDir = typeof configDir === 'string' ? configDir.trim() : '';
  if (normalizedConfigDir) {
    env.CLAUDE_CONFIG_DIR = normalizedConfigDir;
  }
  return env;
}

/**
 * Classify a failure so the UI can say something more useful than "error".
 *
 * @param {unknown} error
 * @returns {'unsupported'|'sdk_missing'|'timeout'|'auth'|'network'|'unknown'}
 */
export function classifyUsageError(error) {
  const code = error && typeof error === 'object' ? error.code : undefined;
  if (code === 'unsupported' || code === 'sdk_missing' || code === 'timeout') {
    return code;
  }
  const message = String(error?.message || error || '');
  if (/timed out|timeout/i.test(message)) return 'timeout';
  if (/not logged in|login|unauthori[sz]ed|\b401\b|\b403\b|oauth|credential|authenticat/i.test(message)) return 'auth';
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|getaddrinfo|network|fetch failed|socket/i.test(message)) {
    return 'network';
  }
  return 'unknown';
}

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function withTimeout(promise, timeoutMs, label) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(codedError('timeout', `${label} timed out after ${Math.round(timeoutMs / 1000)}s`)),
      timeoutMs
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function resolveWorkingDirectory(cwd) {
  const candidate = typeof cwd === 'string' ? cwd.trim() : '';
  if (candidate && existsSync(candidate)) return candidate;
  return getRealHomeDir();
}

/**
 * Ask the CLI for the plan usage of whichever account `configDir` (or the live
 * login when omitted) is signed in as.
 *
 * @param {object} [params]
 * @param {string} [params.cwd]
 * @param {string} [params.configDir] - Claude config dir holding the credentials to use
 * @param {boolean} [params.includeBehaviors] - Also scan local transcripts for the "what's contributing" breakdown
 * @param {number} [params.timeoutMs]
 * @param {Function} [params.queryFn] - SDK query() override, for tests
 * @returns {Promise<{ usage: object, account: object|null }>}
 */
export async function fetchPlanUsage(params = {}) {
  const {
    cwd = null,
    configDir = null,
    includeBehaviors = false,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = params || {};

  let queryFn = params?.queryFn;
  if (typeof queryFn !== 'function') {
    const sdk = await loadClaudeSdk().catch((error) => {
      throw codedError('sdk_missing', error?.message || 'Claude Code SDK is not installed');
    });
    queryFn = sdk?.query;
  }
  if (typeof queryFn !== 'function') {
    throw codedError('sdk_missing', 'Claude Code SDK is not installed');
  }

  const inputStream = new AsyncStream();
  const stderrLines = [];
  const cliOverride = getClaudeCliPathOverride();

  const query = queryFn({
    prompt: inputStream,
    options: {
      cwd: resolveWorkingDirectory(cwd),
      env: buildUsageQueryEnv(buildCliEnv(), configDir),
      // Isolation: no user/project settings means no hooks, no MCP servers and
      // no settings.json env — only the stored login is consulted.
      settingSources: [],
      permissionMode: 'default',
      persistSession: false,
      maxTurns: 1,
      stderr: (data) => {
        const text = (data ?? '').toString().trim();
        if (!text) return;
        stderrLines.push(text);
        if (stderrLines.length > 40) stderrLines.shift();
      },
      ...(cliOverride && { pathToClaudeCodeExecutable: cliOverride }),
    },
  });

  try {
    if (typeof query?.[USAGE_METHOD] !== 'function') {
      throw codedError('unsupported', 'The installed Claude Code SDK cannot report plan usage. Update it in Settings > Dependencies.');
    }

    let usage;
    try {
      usage = await withTimeout(
        query[USAGE_METHOD]({ skipBehaviors: !includeBehaviors }),
        timeoutMs,
        'Usage lookup'
      );
    } catch (error) {
      // The CLI's own explanation (expired login, proxy refusal, ...) lands on
      // stderr rather than in the rejected control request.
      if (stderrLines.length > 0 && error?.code !== 'timeout') {
        const detail = redactSecrets(truncateString(stderrLines.slice(-5).join('\n'), 600));
        const wrapped = codedError(error?.code, `${error?.message || 'Usage lookup failed'}\n${detail}`);
        throw wrapped;
      }
      throw error;
    }

    let account = null;
    if (typeof query.accountInfo === 'function') {
      try {
        account = await withTimeout(query.accountInfo(), ACCOUNT_INFO_TIMEOUT_MS, 'Account lookup');
      } catch {
        // Identity is a nice-to-have here: the caller already knows which
        // account it asked about.
      }
    }

    return { usage: usage ?? null, account: account ?? null };
  } finally {
    try {
      inputStream.done();
    } catch {
      // already closed
    }
    try {
      query?.close?.();
    } catch {
      // already closed
    }
  }
}

/**
 * Channel command: print the usage payload as a single marker line.
 * Never throws — failures are reported inside the payload so the Java side can
 * tell "lookup failed" apart from "bridge crashed".
 *
 * @param {object|null} stdinData - { cwd?, configDir?, includeBehaviors? }
 */
export async function getPlanUsage(stdinData = {}) {
  const params = stdinData || {};
  let payload;
  try {
    const { usage, account } = await fetchPlanUsage({
      cwd: params.cwd,
      configDir: params.configDir,
      includeBehaviors: params.includeBehaviors === true,
    });
    payload = { success: true, usage, account };
  } catch (error) {
    payload = {
      success: false,
      error: redactSecrets(truncateString(String(error?.message || error), 800)),
      errorKind: classifyUsageError(error),
    };
  }
  console.log(USAGE_MARKER, JSON.stringify(payload));
}
