import { sendBridgeEvent } from './bridge.js';

/**
 * Stop one background task (an Agent or Bash call run in the background)
 * without stopping the conversation. Ported from the Claude Code GUI ("Swttch")
 * plugin's background tasks panel.
 *
 * The plugin hands the request to the live runtime's SDK query
 * (Query.stopTask) and answers through `window.onBackgroundTaskStopResult`.
 * The answer is matched to the request by the task's tool call, so it lands
 * even if the status panel was closed in the meantime.
 */

/** Why nothing was stopped, as the plugin reports it. */
export type StopFailure = 'unsupported' | 'no-runtime' | 'unknown-task' | 'timeout' | string;

export interface StopResult {
  stopped: boolean;
  error?: StopFailure;
}

/** How long to wait for the plugin's answer: the daemon gives up after 10 s. */
const ANSWER_TIMEOUT_MS = 15_000;

const pending = new Map<string, (result: StopResult) => void>();

function ensureCallback(): void {
  if (window.onBackgroundTaskStopResult) return;
  window.onBackgroundTaskStopResult = (json: string) => {
    let result: { toolUseId?: string; stopped?: boolean; error?: string };
    try {
      result = JSON.parse(json);
    } catch {
      return;
    }
    const toolUseId = result.toolUseId;
    if (!toolUseId) return;
    const resolve = pending.get(toolUseId);
    if (!resolve) return;
    pending.delete(toolUseId);
    resolve({ stopped: result.stopped === true, ...(result.error ? { error: result.error } : {}) });
  };
}

/** Ask the plugin to stop the task launched by tool call [toolUseId]. */
export function stopBackgroundTask(toolUseId: string, agentId?: string): Promise<StopResult> {
  ensureCallback();
  // A second click while the first is out supersedes it; both get the one answer.
  const earlier = pending.get(toolUseId);
  return new Promise<StopResult>((resolve) => {
    const timer = window.setTimeout(() => {
      if (pending.get(toolUseId) === settle) pending.delete(toolUseId);
      resolve({ stopped: false, error: 'timeout' });
    }, ANSWER_TIMEOUT_MS);
    const settle = (result: StopResult) => {
      window.clearTimeout(timer);
      earlier?.(result);
      resolve(result);
    };
    pending.set(toolUseId, settle);
    sendBridgeEvent('stop_background_task', JSON.stringify({ toolUseId, ...(agentId ? { agentId } : {}) }));
  });
}

/** The i18n key that explains a failed stop to the user. */
export function stopFailureKey(error: StopFailure | undefined): string {
  switch (error) {
    case 'unsupported':
      return 'statusPanel.stopAgentUnsupported';
    case 'no-runtime':
      return 'statusPanel.stopAgentNoRuntime';
    case 'unknown-task':
      return 'statusPanel.stopAgentUnknown';
    default:
      return 'statusPanel.stopAgentFailed';
  }
}

/** Test hook: forget the requests that are out. */
export function resetBackgroundTaskStopForTests(): void {
  pending.clear();
  delete window.onBackgroundTaskStopResult;
}
